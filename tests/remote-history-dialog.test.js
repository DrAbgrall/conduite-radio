import vm from 'node:vm';
import '../js/core.js';
import '../js/supabase-repository.js';
import {historyFixture} from './history-fixture.js';
const source=await Deno.readTextFile(new URL('../js/collaboration-history.js',import.meta.url));
const tick=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
function equal(a,b){if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function setup(){
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.listeners={};this.disabled=false;this.textContent='';}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(key,value){this.attrs[key]=value;}
  addEventListener(key,fn){this.listeners[key]=fn;}
  showModal(){this.open=true;}
  close(){this.open=false;this.listeners.close?.();}
  remove(){this.removed=true;}
  set innerHTML(_value){throw Error('HTML non échappé interdit');}
 }
 const fixture=historyFixture(),calls=[],body=new Element('body');
 const state={confirm:true,history:fixture.info,readError:null,versionError:null,restoreError:null};
 const repository={
  async history(){calls.push('history');if(state.readError)throw state.readError;return state.history;},
  async version(id,version){
   calls.push(['version',id,version]);if(state.versionError)throw state.versionError;
   if(state.versionHandler)return state.versionHandler(id,version);
   const snapshot=structuredClone(fixture.snapshot);snapshot.emission.theme=version==='2'?'Ancienne émission':'Départ';
   return {snapshot,document:RadioSupabaseRepository.native(snapshot)};
  }
 };
 const context=vm.createContext({document:{createElement:tag=>new Element(tag),body},RadioCore,
  RadioDialogs:{confirm:async()=>state.confirmHandler?state.confirmHandler():state.confirm},Date,console});
 vm.runInContext(source,context);
 const result=context.RadioCollaborationHistory.open({repository,emissionId:'emission-a',restore:async(version,revision)=>{
  calls.push(['restore',version,revision]);if(state.restoreError)throw state.restoreError;
  return {emission_id:'emission-a',restored_from:version,revision:'8',space_missing:false};
 }});
 await tick();const dialog=body.children[0];
 const all=(node=dialog)=>[node,...node.children.flatMap(child=>all(child))];
 const text=()=>all().map(node=>node.textContent).join('\n');
 const byText=value=>all().find(node=>node.tagName==='button'&&node.textContent===value);
 const list=()=>all().find(node=>node.className==='historyList');
 const restore=byText('Restaurer cette version'),refresh=byText('Actualiser'),close=byText('Fermer');
 return {fixture,state,repository,result,dialog,calls,list,text,restore,refresh,close,all};
}
Deno.test('historique UI : ouverture sans écriture ni sélection implicite',async()=>{
 const ui=await setup();equal(ui.calls,['history']);equal(ui.list().children.length,2);equal(ui.restore.disabled,true);
 ui.close.onclick();equal(await ui.result,{restored:false});
});
Deno.test('historique UI : aperçu textuel, horaires et aucun HTML injecté',async()=>{
 const ui=await setup();ui.fixture.snapshot.sequences[0].direct='<img src=x onerror=alert(1)>';
 await ui.list().children[0].onclick();equal(ui.restore.disabled,false);
 equal(ui.text().includes('<img src=x onerror=alert(1)>'),true);equal(ui.text().includes('Fin 00:00:00'),true);
 equal(ui.calls.filter(c=>c[0]==='restore').length,0);ui.close.onclick();await ui.result;
});
Deno.test('historique UI : annuler la confirmation ne restaure rien',async()=>{
 const ui=await setup();await ui.list().children[0].onclick();ui.state.confirm=false;
 await ui.restore.onclick();equal(ui.restore.disabled,false);equal(ui.calls.filter(c=>c[0]==='restore').length,0);
 ui.close.onclick();equal(await ui.result,{restored:false});
});
Deno.test('historique UI : restauration explicite avec révision affichée',async()=>{
 const ui=await setup();await ui.list().children[0].onclick();await ui.restore.onclick();
 const result=await ui.result;equal(result.restored,true);equal(result.attempted,true);equal(ui.dialog.removed,true);
 equal(ui.calls.at(-1),['restore','2','4']);
});
Deno.test('historique UI : conflit impose une nouvelle lecture et un nouvel aperçu',async()=>{
 const ui=await setup();await ui.list().children[0].onclick();ui.state.restoreError={code:'PT409',message:'Périmé'};
 await ui.restore.onclick();equal(ui.text().includes('L’émission a changé'),true);equal(ui.restore.disabled,true);
 await ui.list().children[0].onclick();equal(ui.restore.disabled,true);equal(ui.list().children.every(b=>b.disabled),true);
 await ui.restore.onclick();equal(ui.calls.filter(c=>c[0]==='restore').length,1);
 await ui.refresh.onclick();equal(ui.restore.disabled,true);equal(ui.calls.filter(c=>c==='history').length,2);
 ui.close.onclick();equal((await ui.result).attempted,true);
});
Deno.test('historique UI : réponse incertaine ne déclenche aucun réessai automatique',async()=>{
 const ui=await setup();await ui.list().children[0].onclick();ui.state.restoreError=Error('Réseau coupé');
 await ui.restore.onclick();await tick();equal(ui.restore.disabled,true);equal(ui.calls.filter(c=>c[0]==='restore').length,1);
 equal(ui.text().includes('Restauration non confirmée'),true);ui.close.onclick();equal((await ui.result).attempted,true);
});
Deno.test('historique UI : erreur d’aperçu retire l’ancienne sélection',async()=>{
 const ui=await setup();await ui.list().children[0].onclick();ui.state.versionError=Error('Version indisponible');
 await ui.list().children[1].onclick();equal(ui.restore.disabled,true);equal(ui.text().includes('Version indisponible'),true);
 await ui.restore.onclick();equal(ui.calls.filter(c=>c[0]==='restore').length,0);ui.close.onclick();await ui.result;
});
Deno.test('historique UI : réponse tardive d’un ancien aperçu ignorée',async()=>{
 const ui=await setup(),pending=deferred();
 ui.state.versionHandler=async(_id,version)=>version==='2'?pending.promise:
  {document:{...RadioSupabaseRepository.native(ui.fixture.snapshot),emission:{...ui.fixture.snapshot.emission,theme:'Deuxième sélection'}}};
 const first=ui.list().children[0].onclick();await ui.list().children[1].onclick();
 pending.resolve({document:RadioSupabaseRepository.native(ui.fixture.snapshot)});await first;
 equal(ui.text().includes('Deuxième sélection'),true);equal(ui.restore.disabled,false);
 ui.close.onclick();await ui.result;
});
Deno.test('historique UI : fermer pendant une lecture ignore son résultat',async()=>{
 const ui=await setup(),pending=deferred();ui.state.versionHandler=()=>pending.promise;
 const reading=ui.list().children[0].onclick();ui.close.onclick();await ui.result;
 pending.resolve({document:RadioSupabaseRepository.native(ui.fixture.snapshot)});await reading;
 equal(ui.dialog.removed,true);equal(ui.restore.disabled,true);
});
Deno.test('historique UI : historique absent ou lecture refusée reste sans action d’écriture',async()=>{
 const ui=await setup();ui.state.history=null;await ui.refresh.onclick();equal(ui.restore.disabled,true);equal(ui.list().children.length,0);
 ui.state.readError=Error('Accès refusé');await ui.refresh.onclick();equal(ui.text().includes('Accès refusé'),true);
 equal(ui.calls.filter(c=>c[0]==='restore').length,0);ui.close.onclick();await ui.result;
});
Deno.test('historique UI : fermeture bloquée pendant la confirmation puis rétablie après annulation',async()=>{
 const ui=await setup(),confirmation=deferred();await ui.list().children[0].onclick();ui.state.confirmHandler=()=>confirmation.promise;
 const restoring=ui.restore.onclick();equal(ui.close.disabled,true);let prevented=false;
 ui.dialog.listeners.cancel({preventDefault(){prevented=true;}});ui.close.onclick();equal(prevented,true);equal(ui.dialog.open,true);
 confirmation.resolve(false);await restoring;equal(ui.close.disabled,false);equal(ui.restore.disabled,false);
 ui.close.onclick();await ui.result;
});
