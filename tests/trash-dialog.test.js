import vm from 'node:vm';
const source=await Deno.readTextFile(new URL('../js/trash-dialog.js',import.meta.url));
const tick=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
function assert(value){if(!value)throw Error('Assertion échouée');}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
const item={emission_id:'deleted-a',theme:'Émission supprimée',deleted_at:'2026-10-27T10:00:00Z',is_template:false,sequence_count:2};
async function setup(spaceId=null){
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.textContent='';this.disabled=false;}
  append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
  setAttribute(){}addEventListener(name,fn){this.listeners[name]=fn;}
  showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}remove(){this.removed=true;}
  set innerHTML(_value){throw Error('HTML injecté');}
 }
 const body=new Element('body'),calls=[],state={data:{items:[{...item}],next_cursor:null},outcome:{restored:false}};
 const repository={
  async trash(space,cursor){calls.push(['trash',space,cursor]);if(state.readError)throw state.readError;return state.readHandler?state.readHandler():state.data;},
  async restoreVersion(...args){calls.push(['restore',...args]);return {space_missing:false};}
 };
 const context=vm.createContext({document:{createElement:tag=>new Element(tag),body},Date,
  RadioCollaborationHistory:{async open(options){calls.push(['history',options.emissionId]);return state.openHandler?state.openHandler(options):state.outcome;}}
 });vm.runInContext(source,context);
 const result=context.RadioTrashDialog.open({repository,spaceId});await tick();const dialog=body.children[0];
 const all=(node=dialog)=>[node,...node.children.flatMap(all)];
 const byText=text=>all().find(n=>n.tagName==='button'&&n.textContent===text);
 return {state,calls,result,dialog,all,list:all().find(n=>n.className==='trashList'),refresh:byText('Actualiser'),more:byText('Voir la suite'),close:byText('Fermer')};
}
Deno.test('corbeille UI : liste racine sans écriture et titres échappés',async()=>{
 const ui=await setup();ui.state.data.items[0].theme='<img src=x onerror=alert(1)>';await ui.refresh.onclick();
 assert(ui.list.children[0].textContent.includes('<img src=x onerror=alert(1)>'));
 assert(ui.calls.every(c=>c[0]==='trash')&&ui.calls[0][1]===null);ui.close.onclick();assert((await ui.result).restored===0);
});
Deno.test('corbeille UI : filtre espace et chargement des pages suivantes',async()=>{
 const ui=await setup('space-a'),cursor={deleted_at:item.deleted_at,emission_id:item.emission_id};
 ui.state.data={items:[item],next_cursor:cursor};await ui.refresh.onclick();assert(!ui.more.hidden);
 ui.state.data={items:[{...item,emission_id:'deleted-b'}],next_cursor:null};await ui.more.onclick();
 assert(ui.list.children.length===2&&ui.more.hidden&&ui.calls.at(-1)[1]==='space-a'&&ui.calls.at(-1)[2]===cursor);
 ui.close.onclick();await ui.result;
});
Deno.test('corbeille UI : récupération cible l’émission choisie et actualise la liste',async()=>{
 const ui=await setup();ui.state.openHandler=async options=>{
  await options.restore('version-2','4');ui.state.data={items:[],next_cursor:null};return {restored:true,result:{space_missing:false}};
 };
 await ui.list.children[0].onclick();assert(JSON.stringify(ui.calls.find(c=>c[0]==='restore'))===JSON.stringify(['restore','deleted-a','version-2','4']));
 assert(ui.list.children.length===0);ui.close.onclick();assert((await ui.result).restored===1);
});
Deno.test('corbeille UI : annulation n’invoque aucune restauration',async()=>{
 const ui=await setup();await ui.list.children[0].onclick();assert(!ui.calls.some(c=>c[0]==='restore'));
 ui.close.onclick();assert((await ui.result).restored===0);
});
Deno.test('corbeille UI : double ouverture et fermeture bloquées pendant l’aperçu',async()=>{
 const ui=await setup(),pending=deferred();ui.state.openHandler=()=>pending.promise;
 const first=ui.list.children[0].onclick();await ui.list.children[0].onclick();let prevented=false;
 ui.dialog.listeners.cancel({preventDefault(){prevented=true;}});ui.close.onclick();
 assert(prevented&&ui.close.disabled&&ui.calls.filter(c=>c[0]==='history').length===1);
 pending.resolve({restored:false});await first;ui.close.onclick();await ui.result;
});
Deno.test('corbeille UI : erreur de lecture et reprise sans écriture',async()=>{
 const ui=await setup();ui.state.readError=Error('Indisponible');await ui.refresh.onclick();assert(ui.list.children.length===0&&!ui.refresh.disabled);
 ui.state.readError=null;await ui.refresh.onclick();assert(ui.list.children.length===1&&!ui.calls.some(c=>c[0]==='restore'));
 ui.close.onclick();await ui.result;
});
Deno.test('corbeille UI : réponse tardive après fermeture ignorée',async()=>{
 const ui=await setup(),pending=deferred();ui.state.readHandler=()=>pending.promise;
 const reading=ui.refresh.onclick();ui.close.onclick();await ui.result;
 pending.resolve({items:[item],next_cursor:null});await reading;assert(ui.dialog.removed&&ui.list.children.length===0);
});
Deno.test('corbeille UI : espace disparu signalé après récupération',async()=>{
 const ui=await setup();ui.state.outcome={restored:true,result:{space_missing:true}};
 await ui.list.children[0].onclick();assert(ui.all().some(n=>n.textContent.includes('sans espace')));
 ui.close.onclick();assert((await ui.result).restored===1);
});
