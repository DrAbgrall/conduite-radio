// Banc isolé : nécessite PGlite installé séparément après autorisation.
// Le module doit être fourni par chemin local, jamais par URL ni connexion DB.
// Exemple : deno run --no-config --no-lock --allow-read=. tools/test-supabase-foundation.mjs ./chemin/pglite/dist/index.js
const modulePath = Deno.args[0];
if (!modulePath || !modulePath.startsWith('./') || modulePath.includes('..')) {
  throw new Error('Fournir le chemin relatif local du module PGlite installé dans le projet.');
}
const { PGlite } = await import(new URL(modulePath, `file://${Deno.cwd()}/`));
const db = await PGlite.create('memory://');
let checks = 0;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await query(sql, params))[0];
const id = (kind, number) => `md5('${kind}-${number}')::uuid`;
const rev = async n => Number((await one(`SELECT v19_revision AS r FROM public.emissions WHERE id=${id('emission', n)}`)).r);
const test = async (name, fn) => { await fn(); checks++; console.log(`OK ${checks} — ${name}`); };
const isolated = async fn => {
  await db.exec('BEGIN');
  try { await fn(); } finally { await db.exec('ROLLBACK'); }
};
const denied = async sql => {
  try { await db.exec(sql); } catch (error) {
    assert(error.code === '42501', `Refus inattendu : ${error.code} ${error.message}`);
    return;
  }
  throw new Error(`Accès privé autorisé : ${sql}`);
};
const business = async () => JSON.stringify(await one(`SELECT
  (SELECT jsonb_agg(to_jsonb(e) - 'v19_revision' ORDER BY id) FROM public.emissions e) AS emissions,
  (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.blocks b) AS blocks,
  (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.sequences s) AS sequences,
  (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.spaces p) AS spaces`));
try {
  console.log('PostgreSQL embarqué :', (await one('SHOW server_version')).server_version);
  await db.exec(await Deno.readTextFile('tests/fixtures/supabase-schema.sql'));
  await test('export de sauvegarde : quatre tables complètes et textes conservés', async () => {
    const rows=await query(await Deno.readTextFile('docs/supabase/03-sauvegarde-donnees-lecture-seule.sql'));
    const backup=rows[0].backup_v19;
    assert(backup.format==='conduite-radio-db-backup'&&backup.is_full_database_backup===false,'Format de sauvegarde incorrect');
    for(const [table,expected] of Object.entries({spaces:5,emissions:12,blocks:12,sequences:132})){
      assert(backup.counts[table]===expected&&backup.tables[table].length===expected,'Table incomplète : '+table);
      const live=await query(`SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY id`);
      assert(JSON.stringify(live.map(x=>x.row))===JSON.stringify(backup.tables[table]),'Contenu de sauvegarde différent : '+table);
    }
  });
  const before = await business();
  await db.exec(await Deno.readTextFile('docs/supabase/migrations/001-fondation-v19.BROUILLON.sql'));
  await test('migration exécutée sans changement des données métier', async () => {
    assert(before === await business(), 'Données métier modifiées par la migration');
  });
  await test('12 photographies complètes et 4 émissions sans espace', async () => {
    const row = await one(`SELECT count(*)::int AS total,
      sum(jsonb_array_length(snapshot->'sequences'))::int AS sequences,
      sum(jsonb_array_length(snapshot->'blocks'))::int AS blocks,
      count(*) FILTER (WHERE snapshot->'emission'->>'space_id' IS NULL)::int AS unassigned
      FROM radio_v19_private.emission_history`);
    assert(row.total === 12 && row.sequences === 132 && row.blocks === 12 && row.unassigned === 4,
      'Photographies initiales incomplètes');
    assert((await query('SELECT 1 FROM public.emissions WHERE v19_revision <> 0')).length === 0,
      'Révisions initiales incorrectes');
    const invalid = await query(`SELECT h.emission_id FROM radio_v19_private.emission_history h
      JOIN public.emissions e ON e.id=h.emission_id
      WHERE h.snapshot->'emission' <> to_jsonb(e)
      OR h.snapshot->'blocks' <> (SELECT jsonb_agg(to_jsonb(b) ORDER BY position,id) FROM public.blocks b WHERE b.emission_id=e.id)
      OR h.snapshot->'sequences' <> (SELECT jsonb_agg(to_jsonb(s) ORDER BY position,id) FROM public.sequences s WHERE s.emission_id=e.id)`);
    assert(invalid.length === 0, 'Contenu initial des photographies différent');
  });
  for (const role of ['anon', 'authenticated']) {
    await test(`${role} : privilèges privés effectivement révoqués`, async () => {
      const row = await one(`SELECT
        has_schema_privilege($1, 'radio_v19_private', 'USAGE') AS schema_usage,
        has_schema_privilege($1, 'radio_v19_private', 'CREATE') AS schema_create,
        has_table_privilege($1, 'radio_v19_private.emission_history',
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS table_access,
        has_sequence_privilege($1, 'radio_v19_private.emission_history_history_id_seq',
          'USAGE,SELECT,UPDATE') AS sequence_access,
        has_function_privilege($1, 'radio_v19_private.assign_revision()', 'EXECUTE') AS assign_access,
        has_function_privilege($1, 'radio_v19_private.touch_parent_revision()', 'EXECUTE') AS touch_access`, [role]);
      assert(Object.values(row).every(value => value === false), 'Privilège privé conservé');
    });
    await test(`${role} : CRUD ouvert et compteur non falsifiable`, () => isolated(async () => {
      await db.exec(`SET LOCAL ROLE ${role}`);
      const start = await rev(1);
      await db.exec(`UPDATE public.emissions SET theme='Essai', v19_revision=999999 WHERE id=${id('emission',1)}`);
      assert(await rev(1) === start + 1, 'Révision falsifiée');
      const emission = (await query("INSERT INTO public.emissions (theme,v19_revision) VALUES ('Fictive',88) RETURNING id,v19_revision"))[0];
      assert(Number(emission.v19_revision) === 0, 'Révision initiale falsifiée');
      const seq = (await query('INSERT INTO public.sequences (emission_id) VALUES ($1) RETURNING id', [emission.id]))[0];
      await db.query('UPDATE public.sequences SET who=$1 WHERE id=$2', ['Test',seq.id]);
      await db.query('DELETE FROM public.sequences WHERE id=$1', [seq.id]);
      assert(Number((await one('SELECT v19_revision FROM public.emissions WHERE id=$1',[emission.id])).v19_revision) === 3,
        'Révision enfant insert/update/delete incorrecte');
      await db.query('DELETE FROM public.emissions WHERE id=$1',[emission.id]);
    }));
    for (const sql of [
      'SELECT * FROM radio_v19_private.emission_history',
      "INSERT INTO radio_v19_private.emission_history (emission_id,revision,reason,snapshot) VALUES (gen_random_uuid(),0,'attaque','{}')",
      "UPDATE radio_v19_private.emission_history SET reason='attaque'",
      'DELETE FROM radio_v19_private.emission_history',
      'TRUNCATE radio_v19_private.emission_history',
      "SELECT nextval('radio_v19_private.emission_history_history_id_seq')",
      'SELECT radio_v19_private.assign_revision()',
      'SELECT radio_v19_private.touch_parent_revision()',
    ]) await test(`${role} : refus ${sql.split(' ')[0]} privé`, () => isolated(async () => {
      await db.exec(`SET LOCAL ROLE ${role}`);
      await denied(sql);
    }));
  }
  await test('changement de parent : les deux révisions avancent', () => isolated(async () => {
    const a = await rev(1), b = await rev(2), other = await rev(3);
    await db.exec(`UPDATE public.sequences SET emission_id=${id('emission',2)}, block_id=NULL WHERE id=md5('sequence-1-1')::uuid`);
    assert(await rev(1) === a+1 && await rev(2) === b+1 && await rev(3) === other,
      'Parents incorrectement invalidés');
  }));
  await test('bloc supprimé : séquences préservées et détachées', () => isolated(async () => {
    const start = await rev(1);
    await db.exec(`DELETE FROM public.blocks WHERE id=${id('block',1)}`);
    const row = await one(`SELECT count(*)::int AS total, count(block_id)::int AS attached
      FROM public.sequences WHERE emission_id=${id('emission',1)}`);
    assert(row.total === 11 && row.attached === 0 && await rev(1) > start, 'SET NULL ou révision incorrect');
  }));
  await test('cascade émission : enfants supprimés, photographie conservée', () => isolated(async () => {
    await db.exec(`DELETE FROM public.emissions WHERE id=${id('emission',1)}`);
    assert((await query(`SELECT 1 FROM public.sequences WHERE emission_id=${id('emission',1)}`)).length === 0, 'Séquences orphelines');
    assert((await query(`SELECT 1 FROM public.blocks WHERE emission_id=${id('emission',1)}`)).length === 0, 'Blocs orphelins');
    assert((await query(`SELECT 1 FROM radio_v19_private.emission_history WHERE emission_id=${id('emission',1)}`)).length === 1, 'Historique perdu');
  }));
  await test('suppression espace : émissions conservées sans espace', () => isolated(async () => {
    await db.exec(`DELETE FROM public.spaces WHERE id=${id('space',1)}`);
    const row = await one('SELECT count(*)::int AS total, count(*) FILTER (WHERE space_id IS NULL)::int AS unassigned FROM public.emissions');
    assert(row.total === 12 && row.unassigned === 6, 'SET NULL espace incorrect');
  }));
  await test('positions négatives héritées encore autorisées', () => isolated(async () => {
    await db.exec("UPDATE public.sequences SET position=-1 WHERE id=md5('sequence-1-1')::uuid");
    await db.exec(`UPDATE public.blocks SET position=-1 WHERE id=${id('block',1)}`);
  }));
  await test('bloc : insert, modification, changement de parent et suppression', () => isolated(async () => {
    const a = await rev(1), b = await rev(2), c = await rev(3);
    const block = await one(`INSERT INTO public.blocks (emission_id,title)
      VALUES (${id('emission',1)},'Bloc temporaire') RETURNING id`);
    assert(await rev(1) === a+1, 'Insertion bloc non suivie');
    await db.query("UPDATE public.blocks SET title='Modifié' WHERE id=$1", [block.id]);
    assert(await rev(1) === a+2, 'Modification bloc non suivie');
    await db.query(`UPDATE public.blocks SET emission_id=${id('emission',2)} WHERE id=$1`, [block.id]);
    assert(await rev(1) === a+3 && await rev(2) === b+1, 'Changement de parent bloc non suivi');
    await db.query('DELETE FROM public.blocks WHERE id=$1', [block.id]);
    assert(await rev(2) === b+2 && await rev(3) === c, 'Suppression bloc incorrectement suivie');
  }));
  await test('erreur de déclencheur : écriture et révision annulées ensemble', async () => {
    const start = await rev(1), original = await business();
    await isolated(async () => {
      await db.exec(`CREATE FUNCTION radio_v19_private.fail_test() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'erreur fictive'; END $$;
        CREATE TRIGGER zz_fail_test AFTER UPDATE ON public.sequences
        FOR EACH ROW EXECUTE FUNCTION radio_v19_private.fail_test();`);
      let failed = false;
      try {
        await db.exec("UPDATE public.sequences SET who='Ne doit pas être conservé' WHERE id=md5('sequence-1-1')::uuid");
      } catch (error) {
        assert(error.code === 'P0001', 'Erreur différente de celle provoquée');
        failed = true;
      }
      assert(failed, 'Erreur de déclencheur non propagée');
    });
    assert(await rev(1) === start && await business() === original,
      'Écriture ou révision partiellement conservée');
  });
  await test('retour : désactivation ciblée, conservation des données', () => isolated(async () => {
    const start = await rev(1);
    await db.exec(`ALTER TABLE public.emissions DISABLE TRIGGER v19_assign_revision;
      ALTER TABLE public.blocks DISABLE TRIGGER v19_blocks_touch_parent;
      ALTER TABLE public.sequences DISABLE TRIGGER v19_sequences_touch_parent;`);
    await db.exec(`UPDATE public.emissions SET theme='Retour fictif' WHERE id=${id('emission',1)}`);
    assert(await rev(1) === start, 'Déclencheur encore actif');
    assert((await one('SELECT count(*)::int AS n FROM radio_v19_private.emission_history')).n === 12,
      'Photographies perdues');
  }));
  await test('transactions de test annulées sans altérer le jeu initial', async () => {
    assert(before === await business(), 'Données fictives non rétablies après les essais');
  });
  console.log(`${checks} contrôles réussis. Aucune connexion Supabase. Concurrence/Realtime non testés.`);
} finally {
  await db.close();
}
