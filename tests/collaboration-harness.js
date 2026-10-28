// Exécution de l'application collaborative complète avec DOM et serveur simulés.
import vm from 'node:vm';
import '../js/core.js';
import '../js/remote-sync.js';
import '../js/supabase-repository.js';
import '../js/document-model.js';
import '../js/atomic-document.js';
import '../js/exports.js';
import {mockSupabase,serverFixture} from './mock-supabase.js';
const source=await Deno.readTextFile(new URL('../js/app.js',import.meta.url));
const actionsSource=await Deno.readTextFile(new URL('../js/atomic-app-actions.js',import.meta.url));
export const tick=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
function equal(a,b){if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);}
export async function application(enabled=true,historyHandler=async()=>({restored:false}),trashHandler=async()=>({restored:0}),options={}){
 const elements=new Map(),memory=new Map(),db=options.db||mockSupabase(serverFixture());let clients=0,blob,sync;
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.dataset={};this.style={};this.value='';this.listeners=new Map();this.nodes=new Map();this.children=[];this.classList={add(){},remove(){},toggle(){}};this.className='';}
  set innerHTML(value){this.html=value;this.children=[];this.nodes.clear();}
  get innerHTML(){return this.html||'';}get rows(){return this.children;}
  querySelector(selector){
   if(selector.startsWith('tr[data-i=')){const i=selector.match(/data-i="(\d+)"/)[1];return this.children.find(x=>String(x.dataset.i)===i)?.querySelector('.time')||null;}
   if(selector==='.endrow .time')return this.children.find(x=>x.className==='endrow')?.querySelector('.time')||null;
   if(!this.nodes.has(selector))this.nodes.set(selector,new Element());return this.nodes.get(selector);
  }
  querySelectorAll(selector){return selector==='tr[data-block]'?this.children.filter(c=>c.dataset.block):[];}
  appendChild(child){this.children.push(child);}insertBefore(child){this.children.push(child);}remove(){}
  addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn);}
  matches(){return ['INPUT','TEXTAREA','SELECT'].includes(this.tagName);}setCustomValidity(value){this.validationMessage=value;}
  click(){}
  setAttribute(name,value){this[name]=value;}
 }
 const get=selector=>{if(!elements.has(selector)){const e=new Element(['#start','#theme','#date'].includes(selector)?'input':'div');e.id=selector.startsWith('#')?selector.slice(1):'';elements.set(selector,e);}return elements.get(selector);};
 const document={querySelector:get,querySelectorAll:()=>[],getElementById:id=>get('#'+id),createElement:tag=>new Element(tag),addEventListener(){},activeElement:null,documentElement:new Element(),body:new Element()};
 const window={CONDUITE_CONFIG:{collaborationEnabled:enabled,atomicCollaboration:!!options.atomic,appName:'Test',supabaseUrl:'https://example.invalid',supabasePublishableKey:'public-test'},addEventListener(){}};window.self=window;window.top=window;
 class TestSync extends RadioRemoteSync{constructor(options){super({...options,schedule:()=>1,cancel:()=>{}});sync=this;}}
 const context=vm.createContext({window,document,RadioCore,RadioDocument,RadioAtomicDocument,RadioExports,RadioRemoteSync:TestSync,RadioSupabaseRepository,RadioDialogs:{text:async()=>null,confirm:async()=>false,...options.dialogs},RadioCollaborationHistory:{open:historyHandler},RadioTrashDialog:{open:trashHandler},
  location:{search:options.search||'?emission=emission-a&space=space-a',pathname:'/index.html',href:''},
  supabase:{createClient(){clients++;return db;}},URLSearchParams,URL:{createObjectURL(value){blob=value;return 'blob:test';},revokeObjectURL(){}},
  Blob,structuredClone,console,alert(){},confirm:()=>false,setTimeout:()=>1,clearTimeout(){},
  localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)},navigator:{clipboard:{writeText:async()=>{}}}
 });
 vm.runInContext(actionsSource,context);vm.runInContext(source,context);await tick();
 return {get,document,db,memory,context,sync,clients:()=>clients,blob:()=>blob,close:()=>sync.close()};
}
