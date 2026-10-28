import {application,tick} from './collaboration-harness.js';
function equal(a,b){if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);}
Deno.test('application complète désactivée : aucune création de client ni requête',async()=>{
 const app=await application(false);equal(app.clients(),0);equal(app.db.calls.length,0);app.close();
});
Deno.test('application complète : chargement, saisie, écriture ciblée et rafraîchissement',async()=>{
 const app=await application();equal(app.get('#theme').value,'Radio test');equal(app.get('#rundownApp').inert,false);
 const row=app.get('#rows').children.find(x=>x.dataset.i===0),field=row.querySelector('.direct');
 field.onfocus();field.value='Texte saisi';field.oninput();await field.onblur();await tick();
 equal(app.db.tables.sequences[0].direct,'Texte saisi');equal(app.db.tables.sequences[0].who,'Équipe');
 equal(app.sync.failures.size,0);equal(app.get('#syncStatus').textContent,'Conducteur à jour');app.close();
});
Deno.test('application complète : erreur conservée, export de la copie locale, réessai explicite',async()=>{
 const app=await application();app.db.failWrite=true;
 const field=app.get('#rows').children.find(x=>x.dataset.i===0).querySelector('.direct');field.onfocus();field.value='À préserver';field.oninput();
 await field.onblur();await tick();equal(app.sync.failures.size,1);equal(app.db.tables.sequences[0].direct,'Bonjour');
 await app.context.exportNative();const data=JSON.parse(await app.blob().text());equal(data.sequences[0].direct,'À préserver');
 equal(JSON.parse(app.memory.get('conduite-radio-v19-draft:emission-a')).sequences[0].direct,'À préserver');
 app.db.failWrite=false;await app.get('#retrySync').onclick();await tick();equal(app.db.tables.sequences[0].direct,'À préserver');equal(app.sync.failures.size,0);app.close();
});
Deno.test('application complète : modification du thème sans réécriture des autres métadonnées',async()=>{
 const app=await application(),theme=app.get('#theme');theme.value='Nouveau thème';theme.listeners.get('input')[0]();await theme.listeners.get('blur')[0]();await tick();
 const writes=app.db.calls.filter(c=>c.table==='emissions'&&c.action==='update');equal(writes.length,1);equal(writes[0].payload,{theme:'Nouveau thème'});equal(app.db.tables.emissions[0].start_time,'23:59:30');app.close();
});
Deno.test('application complète : lecture des blocs refusée sans remplacer le conducteur affiché',async()=>{
 const app=await application();app.db.failRead='blocks';app.db.tables.emissions[0].theme='Ne pas appliquer partiellement';
 await app.context.pullRemote();equal(app.get('#theme').value,'Radio test');equal(app.get('#syncStatus').textContent.startsWith('Chargement impossible'),true);app.close();
});
Deno.test('application complète : un événement Realtime ne remplace pas une saisie active',async()=>{
 const app=await application(),field=app.get('#rows').children.find(x=>x.dataset.i===0).querySelector('.direct');
 field.onfocus();field.value='En cours';field.oninput();const calls=app.db.calls.length;
 app.db.events[1].callback({eventType:'UPDATE'});await tick();equal(app.db.calls.length,calls);equal(field.value,'En cours');
 await field.onblur();await tick();equal(app.db.tables.sequences[0].direct,'En cours');app.close();
});

Deno.test('application complète : ajout structurel suivi d’une relecture avant réactivation',async()=>{
 const app=await application();await app.get('#add').onclick();await tick();
 equal(app.db.tables.sequences.length,2);equal(app.get('#rows').children.filter(x=>x.dataset.i!==undefined).length,2);equal(app.get('#rundownApp').inert,false);app.close();
});
Deno.test('application complète : double activation pendant un ajout ne crée pas deux séquences',async()=>{
 const app=await application();await Promise.all([app.get('#add').onclick(),app.get('#add').onclick()]);await tick();
 equal(app.db.tables.sequences.length,2);equal(app.db.tables.sequences.map(r=>r.position),[0,1]);app.close();
});
Deno.test('application complète : une erreur de champ bloque les opérations structurelles',async()=>{
 const app=await application();app.db.failWrite=true;
 const field=app.get('#rows').children.find(x=>x.dataset.i===0).querySelector('.direct');field.onfocus();field.value='À sauver';field.oninput();await field.onblur();
 await app.get('#add').onclick();await tick();equal(app.db.calls.some(c=>c.action==='insert'),false);equal(app.get('#rundownApp').inert,false);app.close();
});
Deno.test('application complète : historique désactivé sans Supabase',async()=>{
 let opened=0;const app=await application(false,async()=>{opened++;return {restored:false};});
 equal(app.get('#remoteHistory').disabled,true);await app.get('#remoteHistory').onclick();equal(opened,0);equal(app.db.calls.length,0);app.close();
});
Deno.test('application complète : erreur de sauvegarde empêche l’ouverture de l’historique',async()=>{
 let opened=0;const app=await application(true,async()=>{opened++;return {restored:false};});app.db.failWrite=true;
 const field=app.get('#rows').children.find(x=>x.dataset.i===0).querySelector('.direct');field.onfocus();field.value='Copie à préserver';field.oninput();await field.onblur();
 await app.get('#remoteHistory').onclick();equal(opened,0);equal(app.get('#rundownApp').inert,false);equal(app.sync.failures.size,1);app.close();
});
Deno.test('application complète : historique bloque Realtime jusqu’à fermeture',async()=>{
 let finish;const result=new Promise(resolve=>{finish=resolve;});const app=await application(true,()=>result);
 const opening=app.get('#remoteHistory').onclick();await tick();equal(app.get('#rundownApp').inert,true);
 const before=app.db.calls.length;app.db.events[0].callback();await tick();equal(app.db.calls.length,before);
 finish({restored:false});await opening;equal(app.get('#rundownApp').inert,false);app.close();
});
Deno.test('application complète : restauration confirmée puis relecture du conducteur',async()=>{
 let app;app=await application(true,async options=>{
  app.db.rpcHandler=(_name,params)=>{app.db.tables.emissions[0].theme='Version restaurée';return {data:{emission_id:'emission-a',restored_from:params.p_history_id,revision:'5',space_missing:false},error:null};};
  const result=await options.restore('2','4');return {restored:true,attempted:true,result};
 });
 await app.get('#remoteHistory').onclick();await tick();equal(app.get('#theme').value,'Version restaurée');equal(app.get('#rundownApp').inert,false);
 equal(app.db.calls.find(c=>c.rpc)?.params,{p_emission_id:'emission-a',p_history_id:'2',p_expected_revision:'4'});app.close();
});
Deno.test('application complète : restauration non relançable par le réessai générique',async()=>{
 let app;app=await application(true,async options=>{
  app.db.rpcHandler=()=>({data:null,error:{code:'PT409',message:'Conflit'}});
  try{await options.restore('2','4');}catch{}
  return {restored:false,attempted:true};
 });
 await app.get('#remoteHistory').onclick();await app.get('#retrySync').onclick();
 equal(app.db.calls.filter(c=>c.rpc).length,1);equal(app.sync.failures.size,0);app.close();
});
Deno.test('application complète : après restauration sans relecture, éditeur bloqué',async()=>{
 let app;app=await application(true,async()=>{app.db.failRead='blocks';return {restored:true,attempted:true,result:{space_missing:true}};});
 await app.get('#remoteHistory').onclick();equal(app.get('#rundownApp').inert,true);equal(app.get('#backupStatus').textContent.includes('sans espace'),true);app.close();
});
Deno.test('application complète : accès corbeille depuis la liste des espaces',async()=>{
 const calls=[],app=await application(true,undefined,async options=>{calls.push(options.spaceId);return {restored:0};});
 await app.context.showSpacesHome();
 const button=app.get('#homeSupportActions').children.find(x=>x.textContent==='Émissions supprimées');
 await button.onclick();equal(calls,[null]);app.close();
});
Deno.test('application complète : accès corbeille filtré dans un espace',async()=>{
 const calls=[],app=await application(true,undefined,async options=>{calls.push(options.spaceId);return {restored:0};});
 await app.context.showHome();
 const button=app.get('#homeSupportActions').children.find(x=>x.textContent==='Émissions supprimées');
 await button.onclick();equal(calls,['space-a']);app.close();
});

Deno.test('ancien HTML : les emplacements de pied de page absents sont recréés sans bloquer le chargement',async()=>{
 const app=await application();const footer=app.get('.appSupport'),lookup=app.document.getElementById;
 app.document.getElementById=id=>['homeSupportActions','supportContact'].includes(id)?footer.children.find(e=>e.id===id)||null:lookup(id);
 await app.context.showSpacesHome();
 equal(footer.children.map(e=>e.id).sort(),['homeSupportActions','supportContact']);
 await app.context.showHome();
 equal(footer.children.length,2);
 equal(footer.children.find(e=>e.id==='homeSupportActions').children.some(e=>e.textContent==='Émissions supprimées'),true);
 app.close();
});
