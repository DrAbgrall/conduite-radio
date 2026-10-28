// Vrai app.js + DOM simulé + vrais RPC PostgreSQL en mémoire. Aucun réseau.
import {application,tick} from '../tests/collaboration-harness.js';
import {mockSupabase} from '../tests/mock-supabase.js';
const {PGlite}=await import('../.test-tools/pglite-0.3.14/dist/index.js');
const scripts=await Promise.all(['tests/fixtures/supabase-schema.sql',...['001-fondation','002-historique','003-corbeille','004-transactions','005-conflits-http'].map(x=>'docs/supabase/migrations/'+x+(x.startsWith('005')?'-v19.sql':'-v19.BROUILLON.sql'))].map(p=>Deno.readTextFile(p)));
const assert=(x,message)=>{if(!x)throw Error(message);};let count=0;
async function scenario(name,fn){
 const pg=await PGlite.create('memory://'),apps=[];
 try{
  for(const sql of scripts)await pg.exec(sql);
  const tables={};for(const table of ['spaces','emissions','blocks','sequences'])tables[table]=(await pg.query('SELECT * FROM public.'+table)).rows;
  const e=tables.emissions[0],sid=e.space_id;
  const params={radio_v19_read:['p_emission_id'],radio_v19_commit:['p_emission_id','p_expected_revision','p_document','p_checkpoint'],radio_v19_delete:['p_emission_id','p_expected_revision'],radio_v19_list:['p_space_id'],radio_v19_space:['p_name']};
  async function open(options={}){
   const db=mockSupabase(tables);
   db.rpcHandler=async(name,args)=>{
    const keys=params[name];if(!keys)return {data:null,error:Error('RPC inattendu : '+name)};
    try{const result=await pg.query('SELECT public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') AS data',keys.map(k=>typeof args[k]==='object'&&args[k]!==null?JSON.stringify(args[k]):args[k]));return {data:result.rows[0].data,error:null};}
    catch(error){return {data:null,error};}
   };
   const app=await application(true,undefined,undefined,{atomic:true,db,search:'?emission='+e.id+'&space='+sid,...options});
   for(let n=0;n<30&&app.get('#rundownApp').inert;n++){await new Promise(r=>setTimeout(r,5));await tick();}
   assert(app.get('#rundownApp').inert===false,'Chargement initial atomique échoué');apps.push(app);return app;
  }
  const read=async()=> (await pg.query('SELECT public.radio_v19_read($1) AS data',[e.id])).rows[0].data;
  await fn({open,read,pg,e});count++;console.log(`OK ${count} — ${name}`);
 }finally{for(const app of apps)app.close();await pg.close();}
}
await scenario('édition du champ : un commit RPC, aucun UPDATE REST',async({open,read})=>{
 const app=await open(),field=app.get('#rows').children.find(x=>x.dataset.i===0).querySelector('.direct');
 field.onfocus();field.value='Saisie atomique';field.oninput();await field.onblur();
 for(let n=0;n<10;n++){await new Promise(r=>setTimeout(r,5));await tick();}
 assert((await read()).sequences[0].direct==='Saisie atomique','Champ non enregistré');
 assert(app.db.calls.filter(c=>c.rpc==='radio_v19_commit').length===1&&!app.db.calls.some(c=>c.action==='update'),'Ancien chemin utilisé');
});
await scenario('duplication puis suppression : contenu, ordre et identités conservés',async({open,read})=>{
 const app=await open({dialogs:{confirm:async()=>true}}),before=await read();
 await app.context.duplicateSequence(0);await tick();const duplicated=await read();
 assert(duplicated.sequences.length===12&&duplicated.sequences[0].id===before.sequences[0].id&&duplicated.sequences[1].id!==before.sequences[0].id,'Duplication incorrecte');
 await app.context.deleteSequence(1);const after=await read();assert(after.sequences.map(r=>r.id).join()===before.sequences.map(r=>r.id).join(),'Séquences voisines altérées');
});
await scenario('création et suppression de bloc : séquences conservées et bloc vide visible',async({open,read})=>{
 const app=await open({dialogs:{text:async()=> 'Nouveau bloc',confirm:async()=>true}}),before=await read();
 await app.context.createBlock();const created=await read();assert(created.blocks.length===2,'Bloc non créé');
 assert(app.get('#rows').children.filter(x=>x.dataset.block).length===2,'Bloc vide invisible');
 await app.context.deleteBlock(before.blocks[0].id);const after=await read();assert(after.sequences.length===11&&after.sequences.every(s=>s.block_id===null),'Séquences supprimées avec le bloc');
});
await scenario('deux interfaces : conflit conserve copie locale et empêche l’écrasement',async({open,read})=>{
 const a=await open(),b=await open();
 async function type(app,text){const field=app.get('#rows').children.find(x=>x.dataset.i===0).querySelector('.direct');field.onfocus();field.value=text;field.oninput();await field.onblur();}
 await type(a,'Premier auteur');await type(b,'Copie du second');
 assert((await read()).sequences[0].direct==='Premier auteur','Écrasement de la première version');
 assert(b.sync.failures.size===1,'Conflit ignoré');await b.context.exportNative();
 const exported=JSON.parse(await b.blob().text());assert(exported.sequences[0].direct==='Copie du second','Brouillon perdu');
});
await scenario('nouvelle émission entièrement vide créée en une transaction',async({open,pg})=>{
 const answers=['Création vierge','','17:00'],app=await open({dialogs:{text:async()=>answers.shift()}});
 await app.context.createBlankEmission();
 const created=(await pg.query("SELECT id FROM public.emissions WHERE theme='Création vierge'")).rows;
 assert(created.length===1,'Émission non créée');
 assert((await pg.query('SELECT count(*)::int AS n FROM public.sequences WHERE emission_id=$1',[created[0].id])).rows[0].n===0,'Exemples ajoutés implicitement');
});
await scenario('export HTML/Excel commun : blocs présents et aucune dépendance XLSX distante',async({open})=>{
 const app=await open();app.context.fixedHtmlExport();assert((await app.blob().text()).includes('Bloc fictif'),'Blocs absents du HTML');
 app.context.excelExport();assert(app.blob().type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Export Excel incorrect');
});
await scenario('import depuis un espace vide : modèle et blocs conservés, nouvelle émission complète',async({open,pg})=>{
 const app=await open({dialogs:{text:async initial=>'Import de recette',confirm:async()=>true}});
 const space=(await pg.query("SELECT public.radio_v19_space('Espace vide de recette') AS data")).rows[0].data;
 app.context.location.search='?space='+space.id;
 const data=JSON.parse(await Deno.readTextFile('tests/fixtures/blocs.conduite.json'));data.emission.is_template=true;
 app.context.importNativeFile();const input=app.document.body.children.at(-1);
 const text=JSON.stringify(data);input.files=[{size:new TextEncoder().encode(text).length,text:async()=>text}];await input.onchange();
 const rows=(await pg.query('SELECT public.radio_v19_list($1) AS data',[space.id])).rows[0].data;
 assert(rows.length===1&&rows[0].is_template===true,'Import absent ou statut modèle perdu');
 const snapshot=(await pg.query('SELECT public.radio_v19_read($1) AS data',[rows[0].id])).rows[0].data;
 assert(snapshot.blocks.length===2&&snapshot.sequences.length===2&&snapshot.sequences.every(s=>s.block_id===snapshot.blocks[0].id),'Contenu importé incomplet');
 assert(app.db.calls.filter(c=>c.rpc==='radio_v19_commit').length===1&&!app.db.calls.some(c=>c.action==='insert'),'Import multi-requêtes');
});
await scenario('copie en modèle et création depuis modèle : identités renouvelées et contenu conservé',async({open,pg,e,read})=>{
 const answers=['Modèle de recette','Émission issue du modèle','','18:30'];
 const app=await open({dialogs:{text:async()=>answers.shift()}}),before=await read();
 await app.context.duplicateEmission(e,true);
 const template=(await pg.query("SELECT * FROM public.emissions WHERE theme='Modèle de recette'")).rows[0];
 assert(template?.is_template&&template.emission_date===null,'Modèle non créé');
 await app.context.createFromTemplate(template);
 const created=(await pg.query("SELECT * FROM public.emissions WHERE theme='Émission issue du modèle'")).rows[0];
 assert(created&&!created.is_template&&created.start_time==='18:30:00','Émission depuis modèle incorrecte');
 const snapshot=(await pg.query('SELECT public.radio_v19_read($1) AS data',[created.id])).rows[0].data;
 assert(snapshot.sequences.length===before.sequences.length&&snapshot.blocks.length===before.blocks.length,'Copie incomplète');
 assert(snapshot.sequences.every(s=>!before.sequences.some(old=>old.id===s.id)),'Identifiants non renouvelés');
});
await scenario('conflit pendant une action structurelle : aucune duplication et erreur encore visible',async({open,pg,e,read})=>{
 const app=await open(),before=await read();
 await pg.query("UPDATE public.emissions SET theme=theme||' autre auteur' WHERE id=$1",[e.id]);
 await app.context.duplicateSequence(0);
 assert((await read()).sequences.length===before.sequences.length,'Duplication périmée acceptée');
 assert(app.get('#syncStatus').textContent.includes('Conflit de version'),'Erreur effacée par la relecture');
});
console.log(`${count} scénarios client + PostgreSQL réussis. DOM simulé, pas de transport PostgREST ni de sessions simultanées.`);
