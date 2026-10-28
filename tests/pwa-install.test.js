import vm from 'node:vm';
const source=await Deno.readTextFile(new URL('../js/pwa.js',import.meta.url));
function assert(value){if(!value)throw Error('Assertion échouée');}
function app(ua='',standalone=false){
 const elements=new Map(),events=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{hidden:false,dataset:{},showModal(){this.open=true;}});return elements.get(id);};
 vm.runInNewContext(source,{document:{getElementById:get},window:{isSecureContext:true,matchMedia:()=>({matches:standalone}),addEventListener:(name,fn)=>events.set(name,fn)},navigator:{userAgent:ua,maxTouchPoints:0}});
 return {get,events};
}
Deno.test('installation : Safari iPhone propose les étapes sans événement Chromium',async()=>{
 const a=app('iPhone Safari');await a.get('installApp').onclick();assert(a.get('installDialog').open);assert(a.get('installSteps').textContent.includes('Sur l’écran d’accueil'));
});
Deno.test('installation : une application déjà ouverte en autonome masque la proposition',()=>{
 const a=app('',true);assert(a.get('installApp').hidden&&a.get('installationPanel').hidden);
});
Deno.test('installation : un refus laisse les instructions accessibles',async()=>{
 const a=app();let prompted=0;a.events.get('beforeinstallprompt')({preventDefault(){},async prompt(){prompted++;},userChoice:Promise.resolve({outcome:'dismissed'})});await a.get('installApp').onclick();assert(prompted===1&&!a.get('installApp').hidden);await a.get('installApp').onclick();assert(a.get('installDialog').open);
});
Deno.test('installation : acceptation masque la proposition sans toucher au stockage',async()=>{
 const a=app();a.events.get('beforeinstallprompt')({preventDefault(){},async prompt(){},userChoice:Promise.resolve({outcome:'accepted'})});await a.get('installApp').onclick();assert(a.get('installationPanel').hidden);
});
