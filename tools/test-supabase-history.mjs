// Base PostgreSQL embarquée neuve pour chaque scénario, aucune URL/clé Supabase.
const modulePath = Deno.args[0];
if (!modulePath?.startsWith('./') || modulePath.includes('..')) throw new Error('Module local requis');
const { PGlite } = await import(new URL(modulePath, `file://${Deno.cwd()}/`));
const fixture = await Deno.readTextFile('tests/fixtures/supabase-schema.sql');
const foundation = await Deno.readTextFile('docs/supabase/migrations/001-fondation-v19.BROUILLON.sql');
const history = await Deno.readTextFile('docs/supabase/migrations/002-historique-v19.BROUILLON.sql');
const assert = (value, message) => { if (!value) throw new Error(message); };
const eid = n => `md5('emission-${n}')::uuid`;
const sid = n => `md5('sequence-1-${n}')::uuid`;
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
};
const equal = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const business = doc => { const copy=structuredClone(doc); delete copy?.emission?.v19_revision; return copy; };
let count = 0;
async function test(name, fn) {
  const db = await PGlite.create('memory://');
  const q = async (sql, args=[]) => (await db.query(sql,args)).rows;
  const one = async (sql,args=[]) => (await q(sql,args))[0];
  const doc = async (n=1) => (await one(`SELECT radio_v19_private.document(${eid(n)}) AS value`)).value;
  const state = async (n=1) => (await one(`SELECT public.radio_v19_history(${eid(n)}) AS value`)).value;
  const restore = async (version, revision, n=1) => (await one(`SELECT public.radio_v19_restore(${eid(n)},$1,$2) AS value`, [version,revision])).value;
  const error = async (fn, code) => {
    try { await fn(); } catch (e) { assert(e.code === code, `Erreur ${e.code}, attendu ${code} : ${e.message}`); return; }
    throw new Error(`Erreur attendue ${code} absente`);
  };
  try {
    await db.exec(fixture);
    await db.exec(foundation);
    const original = (await one(`SELECT snapshot FROM radio_v19_private.emission_history WHERE emission_id=${eid(1)}`)).snapshot;
    await db.exec(history);
    for(const path of ['003-corbeille-v19.BROUILLON.sql','004-transactions-v19.BROUILLON.sql','005-conflits-http-v19.sql'])await db.exec(await Deno.readTextFile('docs/supabase/migrations/'+path));
    await fn({db,q,one,doc,state,restore,error,original});
    count++;
    console.log(`OK ${count} — ${name}`);
  } finally { await db.close(); }
}

await test('activation : données intactes et douze têtes protégées', async ({one,doc,state,original}) => {
  assert(equal(await doc(),original), 'Activation a modifié les données');
  assert((await one('SELECT count(*)::int AS n FROM radio_v19_private.emission_heads')).n === 12, 'Têtes manquantes');
  assert((await state()).versions.length === 1, 'Version initiale dupliquée');
});
await test('saisie : dernier état capturé dès validation sans multiplier les versions', async ({db,one,state}) => {
  await db.exec(`UPDATE public.emissions SET theme='Nouvelle saisie' WHERE id=${eid(1)}`);
  const head=await one(`SELECT snapshot,revision FROM radio_v19_private.emission_heads WHERE emission_id=${eid(1)}`);
  assert(head.snapshot.emission.theme === 'Nouvelle saisie' && Number(head.revision)===1, 'Dernier état non sauvegardé');
  assert((await state()).versions.length === 1, 'Version par frappe');
});
await test('transaction multi-lignes : photographie finale, sans ordre intermédiaire', async ({db,one,doc,state}) => {
  await db.exec(`BEGIN;
    UPDATE public.sequences SET position=-position-1 WHERE emission_id=${eid(1)};
    UPDATE public.sequences SET position=-position-1 WHERE emission_id=${eid(1)};
    UPDATE public.sequences SET who='Équipe finale' WHERE emission_id=${eid(1)};
    COMMIT;`);
  const head=await one(`SELECT snapshot FROM radio_v19_private.emission_heads WHERE emission_id=${eid(1)}`);
  assert(equal(head.snapshot,await doc()), 'État intermédiaire capturé');
  assert(head.snapshot.sequences.every(s=>s.position>=0 && s.who==='Équipe finale'), 'Transaction incomplète');
  assert((await state()).versions.length===1, 'Photographies intermédiaires ajoutées');
});
await test('nouvelle émission et enfants dans une transaction unique', async ({db,one}) => {
  await db.exec(`BEGIN;
    INSERT INTO public.emissions(id,theme) VALUES (md5('new')::uuid,'Création complète');
    INSERT INTO public.sequences(emission_id,position) SELECT md5('new')::uuid,n FROM generate_series(0,2) n;
    COMMIT;`);
  const head=await one("SELECT snapshot FROM radio_v19_private.emission_heads WHERE emission_id=md5('new')::uuid");
  assert(head.snapshot.sequences.length===3, 'Nouvelle émission capturée avant ses enfants');
});
await test('conducteur vide automatiquement sauvegardé', async ({db,one}) => {
  const row=(await db.query("INSERT INTO public.emissions(theme) VALUES ('Vide') RETURNING id")).rows[0];
  const head=await one('SELECT snapshot FROM radio_v19_private.emission_heads WHERE emission_id=$1',[row.id]);
  assert(head.snapshot.sequences.length===0 && head.snapshot.blocks.length===0, 'Document vide perdu');
});
await test('regroupement de deux minutes sans attente artificielle', async ({db,state,one}) => {
  await db.exec(`UPDATE public.emissions SET theme='Premier état' WHERE id=${eid(1)}`);
  await db.exec(`UPDATE radio_v19_private.emission_heads SET last_version_at=clock_timestamp()-interval '3 minutes' WHERE emission_id=${eid(1)};
    UPDATE public.emissions SET theme='Deuxième état' WHERE id=${eid(1)};`);
  const versions=(await state()).versions;
  assert(versions.length===2 && versions[0].theme==='Premier état', 'Point de retour périodique incorrect');
  assert((await one(`SELECT snapshot->'emission'->>'theme' AS theme FROM radio_v19_private.emission_heads WHERE emission_id=${eid(1)}`)).theme==='Deuxième état', 'Dernier état perdu');
});
await test('suppression de plusieurs séquences : un état antérieur complet', async ({db,state,one,doc}) => {
  await db.exec(`UPDATE public.emissions SET theme='Avant retrait' WHERE id=${eid(1)}`);
  const before=await doc();
  await db.exec(`DELETE FROM public.sequences WHERE emission_id=${eid(1)} AND position<3`);
  const versions=(await state()).versions;
  const snap=(await one('SELECT public.radio_v19_version($1,$2) AS value',[before.emission.id,versions[0].history_id])).value;
  assert(equal(snap,before), 'Sauvegarde du retrait partiellement vidée');
  assert((await doc()).sequences.length===8, 'Retrait incorrect');
});
await test('suppression de bloc : sauvegarde avant détachement', async ({db,state,one,doc}) => {
  const before=await doc();
  await db.exec("DELETE FROM public.blocks WHERE id=md5('block-1')::uuid");
  assert((await doc()).sequences.every(s=>s.block_id===null), 'Séquences non détachées');
  const snap=(await one(`SELECT public.radio_v19_version(${eid(1)},$1) AS value`,[(await state()).versions[0].history_id])).value;
  assert(equal(snap,before), 'Rattachements antérieurs perdus');
});
for (const role of ['anon','authenticated']) {
  await test(`${role} : restauration complète et conservation de l'état remplacé`, async ({db,state,restore,doc}) => {
    const baseline=(await state()).versions[0].history_id, before=await doc();
    await db.exec(`UPDATE public.emissions SET theme='À préserver',created_at='2025-01-01T00:00:00Z' WHERE id=${eid(1)};
      UPDATE public.sequences SET direct='Nouvelle rédaction' WHERE id=${sid(1)};`);
    const replaced=await doc();
    await db.exec(`SET ROLE ${role}`);
    const result=await restore(baseline,(await state()).current_revision);
    await db.exec('RESET ROLE');
    assert(equal(business(await doc()),business(before)), 'Restauration incomplète');
    assert(Number(result.revision)>replaced.emission.v19_revision, 'Compteur non monotone');
    const versions=(await state()).versions;
    const saved=versions.find(v=>v.reason==='before_restore');
    assert(saved, 'État remplacé absent');
    await restore(saved.history_id,(await state()).current_revision);
    assert(equal(business(await doc()),business(replaced)), 'Annulation de restauration impossible');
  });
}
await test('émission supprimée : récupération, UUID conservés et compteur monotone', async ({db,state,restore,doc}) => {
  await db.exec(`UPDATE public.emissions SET theme='Juste avant suppression' WHERE id=${eid(1)}`);
  const before=await doc();
  await db.exec(`DELETE FROM public.emissions WHERE id=${eid(1)}`);
  const deleted=await state();
  assert(deleted.deleted_at && Number(deleted.current_revision)>before.emission.v19_revision, 'Suppression non signalée');
  assert(await doc()===null, 'Émission non supprimée');
  await restore(deleted.versions[0].history_id,deleted.current_revision);
  assert(equal(business(await doc()),business(before)), 'Récupération incomplète');
  assert((await state()).deleted_at===null, 'Émission encore marquée supprimée');
});
await test('espace disparu : récupération sans recréer l’organisation', async ({db,state,restore,doc}) => {
  await db.exec(`DELETE FROM public.emissions WHERE id=${eid(1)};
    DELETE FROM public.spaces WHERE id=md5('space-1')::uuid;`);
  const deleted=await state();
  const result=await restore(deleted.versions[0].history_id,deleted.current_revision);
  assert(result.space_missing===true && (await doc()).emission.space_id===null, 'Espace manquant non signalé');
});
await test('révision périmée : aucun écrasement ni historique ajouté', async ({db,state,restore,error,doc}) => {
  const initial=await state();
  await db.exec(`UPDATE public.emissions SET theme='Édition plus récente' WHERE id=${eid(1)}`);
  const before=await doc(), versions=await state();
  await error(()=>restore(initial.versions[0].history_id,initial.current_revision),'PT409');
  assert(equal(await doc(),before) && equal(await state(),versions), 'Conflit a modifié le document');
});
await test('version d’une autre émission : lecture et restauration ciblées', async ({one,state,restore,error,doc}) => {
  const foreign=(await state(2)).versions[0].history_id, before=await doc();
  assert((await one(`SELECT public.radio_v19_version(${eid(1)},$1) AS value`,[foreign])).value===null, 'Version étrangère retournée');
  await error(()=>restore(foreign,(before.emission.v19_revision)),'22023');
  assert(equal(await doc(),before), 'Document modifié malgré version étrangère');
});
await test('version corrompue : rattachement étranger refusé', async ({db,state,restore,error,doc}) => {
  const version=(await state()).versions[0].history_id;
  await db.query(`UPDATE radio_v19_private.emission_history
    SET snapshot=jsonb_set(snapshot,'{sequences,0,block_id}',to_jsonb(md5('block-2')::uuid)) WHERE history_id=$1`,[version]);
  const before=await doc();
  await error(()=>restore(version,before.emission.v19_revision),'22023');
  assert(equal(before,await doc()), 'Version corrompue partiellement restaurée');
});
await test('erreur de contrainte pendant restauration : annulation intégrale', async ({db,state,restore,error,doc}) => {
  const version=(await state()).versions[0].history_id;
  await db.query(`UPDATE radio_v19_private.emission_history
    SET snapshot=jsonb_set(snapshot,'{sequences,0,duration_seconds}','-1') WHERE history_id=$1`,[version]);
  const before=await doc(), hist=await state();
  await error(()=>restore(version,before.emission.v19_revision),'23514');
  assert(equal(before,await doc()) && equal(hist,await state()), 'Restauration partiellement validée');
});
await test('collision UUID avec autre émission : aucune donnée écrasée', async ({db,state,restore,error,doc}) => {
  const version=(await state()).versions[0].history_id;
  await db.exec(`DELETE FROM public.blocks WHERE id=md5('block-1')::uuid;
    INSERT INTO public.blocks(id,emission_id,title) VALUES(md5('block-1')::uuid,${eid(2)},'Autre propriétaire');`);
  const before=await doc(), foreign=await doc(2), hist=await state();
  await error(async ()=>restore(version,(await state()).current_revision),'23505');
  assert(equal(await doc(),before) && equal(await doc(2),foreign) && equal(await state(),hist), 'Collision a modifié une émission');
});
await test('référence étrangère existante : restauration refusée sans détachement ailleurs', async ({db,state,restore,error,doc}) => {
  const version=(await state()).versions[0].history_id;
  await db.exec("UPDATE public.sequences SET block_id=md5('block-1')::uuid WHERE id=md5('sequence-2-1')::uuid");
  const before=await doc(), foreign=await doc(2), hist=await state();
  await error(()=>restore(version,before.emission.v19_revision),'22023');
  assert(equal(await doc(),before) && equal(await doc(2),foreign) && equal(await state(),hist), 'Référence étrangère silencieusement détachée');
});
await test('version absente et révision NULL : aucun effet', async ({doc,state,restore,error}) => {
  const before=await doc(), hist=await state();
  await error(()=>restore(-1,hist.current_revision),'22023');
  await error(()=>restore(hist.versions[0].history_id,null),'PT409');
  assert(equal(await doc(),before) && equal(await state(),hist), 'Entrée invalide a modifié le conducteur');
});
await test('identifiant d’émission immuable sans perte de sauvegarde', async ({db,doc,state,error}) => {
  const before=await doc(), hist=await state();
  await error(()=>db.exec(`UPDATE public.emissions SET id=gen_random_uuid() WHERE id=${eid(1)}`),'22023');
  assert(equal(await doc(),before) && equal(await state(),hist), 'Changement d’identité partiellement conservé');
});
await test('rétention : vingt points de retour et dernier état intact', async ({db,state,one,doc}) => {
  for(let n=0;n<25;n++) {
    await db.exec(`UPDATE radio_v19_private.emission_heads SET last_version_at=clock_timestamp()-interval '3 minutes' WHERE emission_id=${eid(1)};
      UPDATE public.emissions SET theme='Version ${n}' WHERE id=${eid(1)};`);
  }
  assert((await state()).versions.length===20, 'Rétention non bornée');
  const head=await one(`SELECT snapshot FROM radio_v19_private.emission_heads WHERE emission_id=${eid(1)}`);
  assert(equal(head.snapshot,await doc()) && head.snapshot.emission.theme==='Version 24', 'Dernier état tronqué');
});
await test('réserve privée : nouveaux objets inaccessibles aux deux rôles', async ({db,error,one}) => {
  for(const role of ['anon','authenticated']) {
    const permissions=await one(`SELECT has_table_privilege($1,'radio_v19_private.emission_heads','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS table_access,
      has_function_privilege($1,'radio_v19_private.checkpoint(uuid,jsonb,text)','EXECUTE') AS checkpoint_access,
      has_function_privilege($1,'radio_v19_private.document(uuid)','EXECUTE') AS document_access`,[role]);
    assert(Object.values(permissions).every(v=>v===false), 'Droits privés hérités');
    await db.exec(`SET ROLE ${role}`);
    await error(()=>db.exec('SELECT * FROM radio_v19_private.emission_heads'),'42501');
    await db.exec('RESET ROLE');
  }
});
await test('transaction annulée : documents et points de retour inchangés', async ({db,doc,state}) => {
  const before=await doc(), versions=await state();
  await db.exec(`BEGIN; UPDATE public.emissions SET theme='Annulée' WHERE id=${eid(1)};
    DELETE FROM public.sequences WHERE emission_id=${eid(1)}; ROLLBACK;`);
  assert(equal(before,await doc()) && equal(versions,await state()), 'Sauvegarde d’une transaction annulée');
});
console.log(`${count} scénarios réussis. Bases mémoire fermées ; concurrence/Data API/Realtime non testés.`);
