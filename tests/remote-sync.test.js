import '../js/remote-sync.js';
function equal(a,b){if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);}
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function make(options){return new RadioRemoteSync({schedule:()=>1,cancel:()=>{},...options});}
Deno.test('réponse distante arrivée après le début d’une saisie : rejet puis relecture',async()=>{
 const first=deferred(),applied=[];let reads=0,editing=false;
 const sync=make({load:()=>++reads===1?first.promise:Promise.resolve('récent'),apply:x=>applied.push(x),isEditing:()=>editing});
 const pending=sync.requestRefresh();editing=true;sync.changed();first.resolve('ancien');await pending;equal(applied,[]);
 editing=false;await sync.resume();equal(applied,['récent']);sync.close();
});
Deno.test('événements Realtime regroupés : une seule lecture active et dernière réponse appliquée',async()=>{
 const first=deferred(),applied=[];let reads=0;
 const sync=make({load:()=>++reads===1?first.promise:Promise.resolve('dernier'),apply:x=>applied.push(x)});
 const pending=sync.requestRefresh();for(let i=0;i<15;i++)sync.requestRefresh();
 equal(reads,1);first.resolve('périmé');await pending;await tick();equal(reads,2);equal(applied,['dernier']);sync.close();
});
Deno.test('écriture invalide la lecture commencée avant elle',async()=>{
 const first=deferred(),applied=[];let reads=0;
 const sync=make({load:()=>++reads===1?first.promise:Promise.resolve('après écriture'),apply:x=>applied.push(x)});
 const pending=sync.requestRefresh();await sync.write('champ',async()=>{});first.resolve('avant');await pending;await tick();equal(applied,['après écriture']);sync.close();
});
Deno.test('écritures sérialisées : aucune seconde requête avant la première',async()=>{
 const first=deferred(),calls=[];
 const sync=make({load:async()=>0,apply:()=>{}});
 const a=sync.write('a',async()=>{calls.push('a');await first.promise;});
 const b=sync.write('b',async()=>{calls.push('b');});await tick();equal(calls,['a']);first.resolve();await a;await b;equal(calls,['a','b']);sync.close();
});
Deno.test('échec de sauvegarde : pas de réessai automatique et aucun écrasement distant',async()=>{
 let attempts=0,reads=0;const applied=[];
 const sync=make({load:async()=>{reads++;return 'serveur';},apply:x=>applied.push(x)});
 await sync.write('champ',async()=>{attempts++;throw Error('Réseau coupé');}).catch(()=>{});
 await sync.requestRefresh();await sync.resume();equal(attempts,1);equal(reads,0);equal(applied,[]);equal(sync.failures.size,1);
 let refused=false;try{await sync.flush();}catch{refused=true;}equal(refused,true);sync.close();
});
Deno.test('réessai explicite : applique la modification avant de relire',async()=>{
 let attempts=0,value='ancien';const applied=[];
 const sync=make({load:async()=>value,apply:x=>applied.push(x)});
 const write=async()=>{if(++attempts===1)throw Error('Indisponible');value='saisie';};
 await sync.write('champ',write).catch(()=>{});await sync.retryFailed();await tick();equal(attempts,2);equal(sync.failures.size,0);equal(applied.at(-1),'saisie');sync.close();
});
Deno.test('nouvelle valeur du même champ remplace un ancien échec',async()=>{
 const first=deferred();let value='initial';const sync=make({load:async()=>value,apply:()=>{}});
 const a=sync.write('champ',async()=>{await first.promise;throw Error('Ancienne valeur refusée');}).catch(()=>{});
 const b=sync.write('champ',async()=>{value='nouvelle valeur';});first.resolve();await a;await b;equal(sync.failures.size,0);equal(value,'nouvelle valeur');sync.close();
});
Deno.test('erreur de lecture : copie affichée conservée, aucune boucle de requêtes',async()=>{
 const statuses=[];let reads=0,applied='copie';
 const sync=make({load:async()=>{reads++;throw Error('Lecture des blocs refusée');},apply:x=>{applied=x;},onStatus:(s)=>statuses.push(s)});
 await sync.requestRefresh();await tick();equal(reads,1);equal(applied,'copie');equal(statuses.at(-1),'read-error');sync.close();
});
Deno.test('fermeture pendant une lecture : aucun rendu tardif',async()=>{
 const first=deferred();let applied=0;const sync=make({load:()=>first.promise,apply:()=>{applied++;}});
 const pending=sync.requestRefresh();sync.close();first.resolve('tardif');await pending;equal(applied,0);
});
