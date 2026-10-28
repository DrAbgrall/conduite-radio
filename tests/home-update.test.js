import vm from 'node:vm';
const source=await Deno.readTextFile(new URL('../js/home-update.js',import.meta.url));
function assert(value){if(!value)throw Error('Assertion échouée');}
async function app({waiting=false,exists=true,search='',editing=false}={}){
 const link={hidden:true},events=new Map(),workerEvents=new Map(),calls=[];
 const worker={state:'installing',addEventListener:(name,fn)=>workerEvents.set(name,fn)};
 const registration={waiting:waiting?{postMessage(){calls.push('activate');}}:null,installing:worker,addEventListener:(name,fn)=>events.set(name,fn),async update(){calls.push('check');}};
 const navigator={serviceWorker:{controller:{},async getRegistration(){calls.push('get');return exists?registration:null;}}};
 vm.runInNewContext(source,{document:{getElementById:()=>link,querySelector:()=>editing?{}:null},navigator,location:{search},URLSearchParams});
 for(let i=0;i<8;i++)await Promise.resolve();return {link,calls,worker,workerEvents,events};
}
Deno.test('accueil : active une mise à jour en attente sans recharger le conducteur',async()=>{
 const a=await app({waiting:true});assert(!a.link.hidden);assert(a.calls.join(',')==='get,activate,check');
});
Deno.test('accueil : détecte une mise à jour qui finit de télécharger',async()=>{
 const a=await app();assert(a.link.hidden);a.worker.state='installed';a.workerEvents.get('statechange')();assert(!a.link.hidden);
});
Deno.test('accueil : aucune installation automatique pour un visiteur sans PWA',async()=>{
 const a=await app({exists:false});assert(a.link.hidden&&a.calls.join(',')==='get');
});
Deno.test('conducteur : ne propose pas de quitter une édition pour une mise à jour',async()=>{
 const a=await app({search:'?emission=demo'});assert(a.link.hidden&&a.calls.length===0);
});

Deno.test('accueil : une boîte de dialogue ouverte diffère l’activation automatique',async()=>{
 const a=await app({waiting:true,editing:true});assert(!a.link.hidden);assert(!a.calls.includes('activate'));
});
