const modulePath=Deno.args[0];if(!modulePath?.startsWith('./')||modulePath.includes('..'))throw Error('Module local requis');
const {PGlite}=await import(new URL(modulePath,`file://${Deno.cwd()}/`));
const files=['tests/fixtures/supabase-schema.sql',...['001-fondation','002-historique','003-corbeille','004-transactions','005-conflits-http'].map(x=>'docs/supabase/migrations/'+x+(x.startsWith('005')?'-v19.sql':'-v19.BROUILLON.sql'))];
const sources=await Promise.all(files.map(p=>Deno.readTextFile(p)));
const eid=n=>`md5('emission-${n}')::uuid`;
const assert=(value,message)=>{if(!value)throw Error(message);};let total=0;
async function test(name,fn){
 const db=await PGlite.create('memory://');
 const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const read=async(n=1)=>(await one(`SELECT public.radio_v19_read(${eid(n)}) AS data`)).data;
 const commit=async(doc,revision=doc.revision,checkpoint=true)=>(await one('SELECT public.radio_v19_commit($1,$2,$3,$4) AS data',[doc.emission.id,revision,JSON.stringify(doc),checkpoint])).data;
 const fail=async(fn,code)=>{try{await fn();}catch(e){assert(e.code===code,`Code ${e.code} au lieu de ${code} : ${e.message}`);return;}throw Error('Erreur attendue absente');};
 try{for(const sql of sources)await db.exec(sql);await fn({db,one,read,commit,fail});total++;console.log(`OK ${total} — ${name}`);}finally{await db.close();}
}
await test('lecture complète cohérente, révision textuelle et quatre écritures protégées',async({db,one,read})=>{
 const doc=await read();assert(doc.sequences.length===11&&doc.blocks.length===1&&doc.revision==='0','Lecture incorrecte');
 assert((await one("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='v19_write_gate'")).n===4,'Verrou hérité absent');
 await db.exec('BEGIN');await db.exec(`UPDATE public.sequences SET who='Héritage V18' WHERE emission_id=${eid(1)}`);
 assert((await one("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND granted")).n>0,'Verrou non acquis');await db.exec('ROLLBACK');
});
await test('écriture atomique : ordre, contenu, UUID et horodatages préservés',async({read,commit})=>{
 const original=await read(),doc=structuredClone(original);doc.sequences.reverse().forEach((s,i)=>s.position=i);doc.emission.theme='Réorganisation';
 const result=await commit(doc);assert(result.sequences.map(s=>s.id).join()===doc.sequences.map(s=>s.id).join(),'Ordre perdu');
 assert(result.sequences.every(s=>s.created_at===original.sequences.find(x=>x.id===s.id).created_at),'Horodatages écrasés');
 assert(BigInt(result.revision)>BigInt(original.revision),'Révision non avancée');
});
await test('deux collaborateurs : seconde copie périmée refusée sans écrasement',async({read,commit,fail})=>{
 const a=await read(),b=await read();a.emission.theme='Premier collaborateur';await commit(a);
 b.emission.theme='Seconde copie périmée';await fail(()=>commit(b),'PT409');assert((await read()).emission.theme===a.emission.theme,'Écrasement concurrent');
});
await test('champ modifié après un client V18 : révision périmée refusée',async({db,read,commit,fail})=>{
 const doc=await read();await db.exec(`UPDATE public.sequences SET who='Modification héritée' WHERE emission_id=${eid(1)}`);
 await fail(()=>commit(doc),'PT409');assert((await read()).sequences.every(s=>s.who==='Modification héritée'),'Héritage écrasé');
});
await test('erreur de contrainte tardive : aucun ordre ni métadonnée partiellement enregistré',async({read,commit,fail})=>{
 const before=await read(),doc=structuredClone(before);doc.emission.theme='À annuler';doc.sequences[0].type='Invalide';
 await fail(()=>commit(doc),'23514');assert(JSON.stringify(await read())===JSON.stringify(before),'État partiel conservé');
});
await test('document incomplet, positions et bloc fragmenté refusés',async({read,commit,fail})=>{
 for(const mutate of [d=>delete d.blocks,d=>d.sequences[0].position=-1,d=>d.sequences[0].duration_seconds=90000,d=>d.sequences[5].block_id=null]){
  const doc=await read();mutate(doc);await fail(()=>commit(doc),'22023');
 }
});
await test('collision d’identifiant étranger refusée sans toucher l’autre émission',async({read,commit,fail})=>{
 const doc=await read(),foreign=await read(2),before=JSON.stringify(foreign);doc.sequences[0].id=foreign.sequences[0].id;
 await fail(()=>commit(doc),'22023');assert(JSON.stringify(await read(2))===before,'Autre émission modifiée');
});
await test('suppression bloc conserve séquences et point de retour complet',async({one,read,commit})=>{
 const doc=await read();doc.blocks=[];doc.sequences.forEach(s=>s.block_id=null);await commit(doc);
 const result=await read();assert(result.blocks.length===0&&result.sequences.length===11&&result.sequences.every(s=>s.block_id===null),'Séquences perdues');
 const history=(await one('SELECT public.radio_v19_history($1) AS data',[doc.emission.id])).data;assert(history.versions.length>0,'Historique perdu');
});
await test('création complète et import vide sont transactionnels',async({one,read,commit})=>{
 const source=await read(),id=(await one('SELECT gen_random_uuid() AS id')).id;
 const doc={format:'conduite-radio-db',version:1,emission:{...source.emission,id,theme:'Import vide'},blocks:[],sequences:[]};
 const result=await commit(doc,null);assert(result.revision==='0'&&result.sequences.length===0,'Création vide invalide');
 const history=(await one('SELECT public.radio_v19_history($1) AS data',[id])).data;assert(history.versions.length===1,'Création non historisée');
});
await test('création erronée ne laisse pas une émission vide',async({one,read,commit,fail})=>{
 const doc=await read(),id=(await one('SELECT gen_random_uuid() AS id')).id;doc.emission.id=id;
 doc.blocks=[];doc.sequences=[{...doc.sequences[0],id:(await one('SELECT gen_random_uuid() AS id')).id,emission_id:id,block_id:null,position:0,type:'Invalide'}];
 await fail(()=>commit(doc,null),'23514');assert((await one('SELECT count(*)::int AS n FROM public.emissions WHERE id=$1',[id])).n===0,'Création partielle');
});
for(const role of ['anon','authenticated'])await test(`${role} : édition et suppression récupérable avec contrôle de révision`,async({db,one,read,commit,fail})=>{
 await db.exec('SET ROLE '+role);const doc=await read();doc.sequences[0].direct='Texte du rôle';const result=await commit(doc);
 await fail(()=>one('SELECT public.radio_v19_delete($1,$2)',[doc.emission.id,doc.revision]),'PT409');
 await one('SELECT public.radio_v19_delete($1,$2)',[doc.emission.id,result.revision]);
 const trash=(await one('SELECT public.radio_v19_trash() AS data')).data;assert(trash.items.length===1,'Suppression non récupérable');
});
await test('création d’espace : nom unique, position et absence de login imposé',async({one,fail})=>{
 const space=(await one("SELECT public.radio_v19_space(' RadioPanik fictif ') AS data")).data;assert(space.position===5&&space.name==='RadioPanik fictif','Espace incorrect');
 await fail(()=>one("SELECT public.radio_v19_space('RadioPanik fictif')"),'23505');
});
await test('liste des émissions sans espace : les quatre documents existants visibles',async({one})=>{
 const rows=(await one('SELECT public.radio_v19_list(NULL) AS data')).data;assert(rows.length===4&&rows.every(e=>e.space_id===null&&typeof e.revision==='string'),'Documents sans espace cachés');
});
console.log(`${total} scénarios transactions réussis. Concurrence de transactions simultanées non simulable avec une seule connexion PGlite.`);
