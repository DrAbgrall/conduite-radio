// Recette PostgreSQL embarquée sur données fictives uniquement.
const modulePath=Deno.args[0];if(!modulePath?.startsWith('./')||modulePath.includes('..'))throw Error('Module local requis');
const {PGlite}=await import(new URL(modulePath,`file://${Deno.cwd()}/`));
const files=['tests/fixtures/supabase-schema.sql',...['001-fondation-v19.BROUILLON.sql','002-historique-v19.BROUILLON.sql','003-corbeille-v19.BROUILLON.sql','004-transactions-v19.BROUILLON.sql','005-conflits-http-v19.sql','006-suppression-espace-admin-v19.BROUILLON.sql'].map(p=>'docs/supabase/migrations/'+p)];
const sources=await Promise.all(files.map(p=>Deno.readTextFile(p)));
const assert=(value,message)=>{if(!value)throw Error(message);};let passed=0;
async function test(name,run){
 const db=await PGlite.create('memory://');const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 try{
  await db.exec(sources[0]);
  await db.exec(`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   INSERT INTO auth.users VALUES(md5('admin')::uuid,'admin@example.org',now()),(md5('other')::uuid,'autre@example.org',now());`);
  for(const sql of sources.slice(1))await db.exec(sql);
  await db.exec("INSERT INTO radio_v19_private.admin_users(user_id) VALUES(md5('admin')::uuid)");
  const target=await one("SELECT id,name FROM public.spaces WHERE id=md5('space-1')::uuid");
  const expected=(await one('SELECT public.radio_v19_list($1) AS data',[target.id])).data.map(e=>({id:e.id,revision:e.revision}));
  const remove=async(list=expected)=>(await one('SELECT public.radio_v19_delete_space($1,$2,$3) AS data',[target.id,target.name,JSON.stringify(list)])).data;
  const error=async(fn,code)=>{try{await fn();}catch(e){assert(e.code===code,'Code inattendu '+e.code+': '+e.message);return;}throw Error('Erreur attendue absente');};
  const admin=()=>db.exec("SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub',md5('admin')::uuid::text,false);");
  await run({db,one,target,expected,remove,error,admin});passed++;console.log('OK '+passed+' — '+name);
 }finally{await db.close();}
}
await test('anon et autre compte refusés sans modification',async({db,one,remove,error})=>{
 await db.exec('SET ROLE anon');await error(remove,'42501');await db.exec("SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub',md5('other')::uuid::text,false)");await error(remove,'42501');assert((await one('SELECT count(*)::int AS n FROM public.spaces')).n===5,'Espaces modifiés');
});
await test('espace occupé supprimé : conducteurs complets dans la corbeille, autres espaces intacts',async({db,one,target,expected,remove,admin})=>{
 await admin();const result=await remove();assert(result.deleted&&result.emissions_trashed===2,'Résultat invalide');assert((await one('SELECT count(*)::int AS n FROM public.spaces')).n===4,'Mauvais nombre espaces');
 const trash=(await one('SELECT public.radio_v19_trash() AS data')).data;assert(trash.items.length===2,'Corbeille incomplète');
 for(const e of expected){const history=(await one('SELECT public.radio_v19_history($1) AS data',[e.id])).data;assert(history.versions.length>0,'Historique absent');}
 assert((await one('SELECT count(*)::int AS n FROM public.emissions')).n===10,'Autres émissions touchées');
});
await test('révision périmée : espace et tous les conducteurs conservés',async({db,one,target,remove,error,admin})=>{
 await admin();await db.query('UPDATE public.emissions SET theme=theme||$1 WHERE space_id=$2',[' modifié',target.id]);await error(remove,'PT409');assert((await one('SELECT count(*)::int AS n FROM public.emissions')).n===12,'Suppression partielle');assert((await one('SELECT public.radio_v19_trash() AS data')).data.items.length===0,'Corbeille modifiée');
});
await test('nouvelle émission arrivée après prévisualisation : refus de toute suppression',async({db,one,target,remove,error,admin})=>{
 await admin();await db.query('INSERT INTO public.emissions(theme,space_id) VALUES($1,$2)',['Arrivée concurrente',target.id]);await error(remove,'PT409');assert((await one('SELECT count(*)::int AS n FROM public.emissions')).n===13,'Données perdues');
});
await test('erreur tardive : toutes les suppressions annulées',async({db,one,remove,error,admin})=>{
 await db.exec("CREATE FUNCTION public.fail_space_delete() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Erreur simulée';END$$;CREATE TRIGGER fail_delete BEFORE DELETE ON public.spaces FOR EACH ROW EXECUTE FUNCTION public.fail_space_delete();");
 await admin();await error(remove,'P0001');assert((await one('SELECT count(*)::int AS n FROM public.emissions')).n===12,'Suppression partielle');assert((await one('SELECT public.radio_v19_trash() AS data')).data.items.length===0,'Corbeille modifiée malgré annulation');
});
await test('restauration après retrait de l’espace : émission récupérée sans espace',async({one,expected,remove,admin})=>{
 await admin();await remove();const history=(await one('SELECT public.radio_v19_history($1) AS data',[expected[0].id])).data;
 const version=history.versions[0];const result=(await one('SELECT public.radio_v19_restore($1,$2,$3) AS data',[expected[0].id,version.history_id,history.current_revision])).data;
 assert(result.space_missing===true,'Espace disparu non signalé');assert((await one('SELECT space_id FROM public.emissions WHERE id=$1',[expected[0].id])).space_id===null,'Restauration incorrecte');
});
console.log(passed+' scénarios SQL réussis. Aucun accès Supabase.');
