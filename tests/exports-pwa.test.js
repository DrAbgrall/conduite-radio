import vm from 'node:vm';
import '../js/core.js';
import '../js/document-model.js';
import '../js/exports.js';
import '../js/visualizations.js';
const root = new URL('../', import.meta.url);
const data = JSON.parse(await Deno.readTextFile(new URL('fixtures/blocs.conduite.json', import.meta.url)));
function equal(a,b){if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);}
function assert(value,message='Assertion échouée'){if(!value)throw Error(message);}
Deno.test('exports : blocs vides, ordre des séquences, minuit et total',()=>{
  const rows=RadioExports.rows(data);
  equal(rows.map(r=>r.kind),['block','sequence','sequence','block','end']);
  equal(rows[1].cells[0],'23:59:30');equal(rows[2].cells[0],'00:00:00');equal(rows.at(-1).cells[0],'00:01:30');
  equal(rows[3].cells[2],'Bloc vide');equal(rows.at(-1).cells[4],'02:00');
});
Deno.test('HTML autonome : textes échappés, sauts de ligne et aucune dépendance distante',()=>{
  const html=RadioExports.html(data);
  assert(html.includes('Bonjour &amp; bienvenue\nDeuxième ligne &lt;test&gt;'));
  assert(html.includes('white-space:pre-wrap'));assert(!html.includes('<script'));assert(!html.includes('src="http'));
});
Deno.test('Excel XLSX : archive ZIP et cellules textuelles sans formules actives',()=>{
  const d=structuredClone(data);d.sequences[0].direct='=HYPERLINK("test")';
  const bytes=RadioExports.xlsx(d), view=new DataView(bytes.buffer);equal(view.getUint32(0,true),0x04034b50);
  const files=new Map();let cursor=0;
  while(view.getUint32(cursor,true)===0x04034b50){
    const size=view.getUint32(cursor+18,true), n=view.getUint16(cursor+26,true), extra=view.getUint16(cursor+28,true);
    const name=new TextDecoder().decode(bytes.slice(cursor+30,cursor+30+n)), begin=cursor+30+n+extra;
    files.set(name,new TextDecoder().decode(bytes.slice(begin,begin+size)));cursor=begin+size;
  }
  equal(files.size,6);assert(files.has('[Content_Types].xml'));assert(files.has('xl/workbook.xml'));
  const sheet=files.get('xl/worksheets/sheet1.xml');assert(sheet.includes('t="inlineStr"'));assert(!sheet.includes('<f>'));assert(sheet.includes('=HYPERLINK(&quot;test&quot;)'));
  assert(sheet.includes('Bloc vide'));assert(sheet.includes('&lt;test&gt;')===false); // Texte remplacé dans cette variante.
});
Deno.test('visualisation : total, répartition et cas du cercle complet',()=>{
  equal(RadioViews.summarize(data).total,120);equal(RadioViews.summarize(data).byType.PAD,90);
  const single=RadioDocument.blank();single.sequences=[RadioDocument.row()];
  const html=RadioViews.html(single);assert(html.includes('<circle'));assert(!html.includes('NaN'));assert(html.includes('100 %'));
  assert(RadioViews.html(RadioDocument.blank()).includes('Aucune durée'));
});
Deno.test('JSON : limite commune de taille incluant UTF-8 et date d’export',()=>{
  const d=structuredClone(data);d.sequences[0].direct='é'.repeat(1024*1024);
  let failed=false;try{RadioCore.validateNative(d);}catch{failed=true;}assert(failed);
  const text=RadioCore.nativeText(data);assert(new TextEncoder().encode(text).length<=RadioCore.MAX_NATIVE_BYTES);
  RadioCore.validateNative(JSON.parse(text));
});
const assetsSource=await Deno.readTextFile(new URL('pwa-assets.js',root));
const workerSource=await Deno.readTextFile(new URL('sw.js',root));
function worker(){
  const events={}, self={registration:{scope:'http://127.0.0.1:8765/'},location:{origin:'http://127.0.0.1:8765'},clients:{async claim(){}},skipWaiting(){self.activated=true;},addEventListener(name,fn){events[name]=fn;}};
  const requested=[], cached={async match(url){return {offline:true,url};},async addAll(urls){requested.push(...urls);}};
  const context=vm.createContext({self,URL,Set,Request,caches:{async open(){return cached;}},fetch(){throw Error('Réseau appelé pendant le test hors ligne');},importScripts(){vm.runInContext(assetsSource,context);}});
  vm.runInContext(workerSource,context);return {self,events,requested};
}
Deno.test('PWA : tous les fichiers précachés existent dans le projet',async()=>{
  const w=worker();for(const path of w.self.RADIO_ASSETS){assert(!path.startsWith('http'));await Deno.stat(new URL(path.split('?')[0],root));}
  const m=JSON.parse(await Deno.readTextFile(new URL('manifest.webmanifest',root)));equal(m.start_url,'./local.html');equal(m.display,'standalone');
});
Deno.test('PWA : installation sans activation forcée, cache limité à la liste locale',async()=>{
  const w=worker();let task;w.events.install({waitUntil(p){task=p;}});await task;
  equal(w.requested.length,w.self.RADIO_ASSETS.length);assert(!w.self.activated);
});
Deno.test('PWA : aucune interception de Supabase, du POST ou de la page collaborative',()=>{
  const w=worker();
  for(const request of [{url:'https://exemple.supabase.co/rest/v1/sequences',method:'GET'},{url:'http://127.0.0.1:8765/local.html',method:'POST'},{url:'http://127.0.0.1:8765/index.html',method:'GET',mode:'navigate'}]){
    let intercepted=false;w.events.fetch({request,respondWith(){intercepted=true;}});equal(intercepted,false);
  }
});
Deno.test('PWA : navigation locale hors ligne, même avec paramètres',async()=>{
  const w=worker();let response;
  w.events.fetch({request:{url:'http://127.0.0.1:8765/local.html?test=1',method:'GET',mode:'navigate'},respondWith(p){response=p;}});
  equal(await response,{offline:true,url:'http://127.0.0.1:8765/local.html'});
});
Deno.test('PWA : activation seulement sur message prévu',()=>{
  const w=worker();w.events.message({data:{type:'autre'}});assert(!w.self.activated);
  w.events.message({data:{type:'ACTIVATE_UPDATE'}});equal(w.self.activated,true);
});

const pwaSource=await Deno.readTextFile(new URL('js/pwa.js',root));
async function updateHarness(prepareUpdate,canAutoUpdate=()=>false){
  const elements=new Map(), events={}, windowEvents={},activated=[];let reloads=0;
  const get=id=>{if(!elements.has(id))elements.set(id,{hidden:true});return elements.get(id);};
  const reg={waiting:{postMessage(message){activated.push(message);}},addEventListener(){}};
  vm.runInNewContext(pwaSource,{
    document:{getElementById:get},window:{isSecureContext:true,addEventListener(name,fn){windowEvents[name]=fn;}},
    navigator:{onLine:true,serviceWorker:{ready:Promise.resolve(reg),register:async()=>reg,addEventListener(name,fn){events[name]=fn;}}},
    RadioLocalApp:{prepareUpdate,canAutoUpdate},location:{reload(){reloads++;}}
  });
  for(let i=0;i<10;i++)await Promise.resolve();
  return {get,activated,events,windowEvents,reloads:()=>reloads};
}
Deno.test('mise à jour refusée si la sauvegarde échoue : aucune activation ni recharge',async()=>{
  const h=await updateHarness(async()=>{throw Error('Conflit de sauvegarde');});
  await h.get('updateApp').onclick();equal(h.activated.length,0);equal(h.reloads(),0);assert(h.get('offlineStatus').textContent.includes('différée'));
});
Deno.test('mise à jour validée après sauvegarde : activation puis recharge contrôlée',async()=>{
  let saved=false;const h=await updateHarness(async()=>{saved=true;return true;});
  await h.get('updateApp').onclick();equal(saved,true);equal(h.activated[0].type,'ACTIVATE_UPDATE');equal(h.reloads(),0);
  h.events.controllerchange();equal(h.reloads(),1);
});
Deno.test('mise à jour automatique : activation à l’accueil après contrôle de sauvegarde',async()=>{
 let saved=false;const h=await updateHarness(async()=>{saved=true;return true;},()=>true);
 equal(saved,true);equal(h.activated.length,1);h.events.controllerchange();equal(h.reloads(),1);
});
Deno.test('mise à jour automatique : attend la fermeture du conducteur',async()=>{
 let idle=false;const h=await updateHarness(async()=>true,()=>idle);equal(h.activated.length,0);
 idle=true;await h.windowEvents['radio:idle']();equal(h.activated.length,1);
});
Deno.test('mise à jour activée par un autre onglet : aucun rechargement pendant une édition',async()=>{
 let idle=false;const h=await updateHarness(async()=>true,()=>idle);h.events.controllerchange();equal(h.reloads(),0);
 idle=true;await h.windowEvents['radio:idle']();equal(h.reloads(),1);
});
