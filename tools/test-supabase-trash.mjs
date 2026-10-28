// Scénarios uniquement sur base mémoire neuve avec données entièrement fictives.
const modulePath=Deno.args[0];
if(!modulePath?.startsWith('./')||modulePath.includes('..'))throw Error('Module local requis');
const {PGlite}=await import(new URL(modulePath,`file://${Deno.cwd()}/`));
const sources=await Promise.all(['tests/fixtures/supabase-schema.sql',
 'docs/supabase/migrations/001-fondation-v19.BROUILLON.sql',
 'docs/supabase/migrations/002-historique-v19.BROUILLON.sql',
 'docs/supabase/migrations/003-corbeille-v19.BROUILLON.sql'].map(p=>Deno.readTextFile(p)));
const eid=n=>`md5('emission-${n}')::uuid`,space=n=>`md5('space-${n}')::uuid`;
const assert=(value,message)=>{if(!value)throw Error(message);};let count=0;
async function test(name,fn){
 const db=await PGlite.create('memory://');
 const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const trash=async(sid=null,cursor=null,limit=50)=>(await one('SELECT public.radio_v19_trash($1,$2,$3,$4) AS data',[sid,cursor?.deleted_at||null,cursor?.emission_id||null,limit])).data;
 const error=async(fn,code)=>{try{await fn();}catch(e){assert(e.code===code,'Erreur différente : '+e.code);return;}throw Error('Erreur attendue absente');};
 try{
  for(const sql of sources)await db.exec(sql);
  await fn({db,one,trash,error});count++;console.log(`OK ${count} — ${name}`);
 }finally{await db.close();}
}
await test('aucune émission active dans la corbeille',async({trash})=>{
 const result=await trash();assert(result.items.length===0&&result.next_cursor===null,'Émissions actives retournées');
});
await test('suppression : thème, révision et espace d’origine retrouvés',async({db,one,trash})=>{
 const before=await one(`SELECT * FROM public.emissions WHERE id=${eid(1)}`);
 await db.exec(`DELETE FROM public.emissions WHERE id=${eid(1)}`);
 const result=await trash();assert(result.items.length===1,'Émission supprimée absente');
 const item=result.items[0];assert(item.emission_id===before.id&&item.space_id===before.space_id&&item.theme===before.theme&&item.sequence_count===11&&item.deleted_at,'Métadonnées perdues');
 assert(typeof item.revision==='string','Révision bigint non textuelle');
});
await test('filtre d’espace et émissions sans espace préservés',async({db,one,trash})=>{
 const target=(await one(`SELECT id FROM public.spaces WHERE id=${space(1)}`)).id;
 await db.exec(`DELETE FROM public.emissions WHERE id IN (${eid(1)},${eid(2)},${eid(9)})`);
 assert((await trash(target)).items.length===1,'Autre espace inclus');
 assert((await trash()).items.length===3,'Émission sans espace omise');
});
await test('pagination stable avec dates identiques et précision microseconde',async({db,trash})=>{
 await db.exec(`DELETE FROM public.emissions;
  UPDATE radio_v19_private.emission_heads SET deleted_at='2026-10-27T10:00:00.123456Z';`);
 const all=(await trash(null,null,100)).items.map(x=>x.emission_id),seen=[];let cursor=null;
 do{const page=await trash(null,cursor,2);seen.push(...page.items.map(x=>x.emission_id));cursor=page.next_cursor;}while(cursor);
 assert(JSON.stringify(all)===JSON.stringify(seen)&&new Set(seen).size===12,'Saut ou doublon de pagination');
});
await test('pagination invalide refusée',async({one,error})=>{
 for(const params of [[null,null,null,0],[null,null,null,101],[null,'2026-10-27',null,2],[null,null,'00000000-0000-0000-0000-000000000001',2]]){
  await error(()=>one('SELECT public.radio_v19_trash($1,$2,$3,$4)',params),'22023');
 }
});
for(const role of ['anon','authenticated'])await test(`${role} : récupération retire l’émission de la corbeille`,async({db,one,trash})=>{
 await db.exec(`DELETE FROM public.emissions WHERE id=${eid(1)}; SET ROLE ${role};`);
 const item=(await trash()).items[0];
 const history=(await one('SELECT public.radio_v19_history($1) AS data',[item.emission_id])).data;
 await one('SELECT public.radio_v19_restore($1,$2,$3)',[item.emission_id,history.versions[0].history_id,item.revision]);
 assert((await trash()).items.length===0,'Émission restaurée encore listée');
 assert((await one(`SELECT count(*)::int AS n FROM public.sequences WHERE emission_id=${eid(1)}`)).n===11,'Enfants non récupérés');
});
await test('relevé privé de corbeille conserve les versions, aucune purge',async({db,one,trash})=>{
 await db.exec(`DELETE FROM public.emissions WHERE id=${eid(1)}`);
 const before=await one('SELECT count(*)::int AS n FROM radio_v19_private.emission_history');
 await trash();await trash();
 assert((await one('SELECT count(*)::int AS n FROM radio_v19_private.emission_history')).n===before.n,'Lecture a supprimé des versions');
});
console.log(`${count} scénarios corbeille réussis. Aucun accès Supabase.`);
