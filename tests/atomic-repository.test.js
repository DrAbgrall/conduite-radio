import '../js/core.js';import '../js/atomic-document.js';import '../js/supabase-repository.js';
import {historyFixture} from './history-fixture.js';
const assert=x=>{if(!x)throw Error('Assertion échouée');};
async function refused(fn){let failed=false;try{await fn();}catch{failed=true;}assert(failed);}
function setup(){
 const initial={...historyFixture().snapshot,revision:'4'},calls=[];
 const db={fail:false,malformed:false,from(){throw Error('Ancien accès REST interdit');},async rpc(name,args){
  calls.push({name,args:structuredClone(args)});
  if(name==='radio_v19_read')return {data:structuredClone(initial),error:null};
  if(db.fail)return {data:null,error:{code:'PT409',message:'Conflit'}};
  if(name==='radio_v19_commit')return {data:{...structuredClone(args.p_document),revision:db.malformed?'4':String(BigInt(args.p_expected_revision||'0')+1n)},error:null};
  if(name==='radio_v19_list')return {data:[{...initial.emission,space_id:args.p_space_id,revision:'4'}],error:null};
  if(name==='radio_v19_space')return {data:{id:'space-b',name:args.p_name,position:1},error:null};
  return {data:null,error:Error('Appel inattendu')};
 }};return {db,calls,repo:new RadioSupabaseRepository.Repository(db,{atomic:true})};
}
Deno.test('adaptateur atomique : lecture unique, aucun cache d’écriture avant application à l’écran',async()=>{
 const {repo,calls}=setup(),snapshot=await repo.read('emission-a');assert(calls.length===1&&calls[0].name==='radio_v19_read');
 await refused(()=>repo.updateSequence('emission-a','row-a',{who:'Équipe'}));assert(calls.length===1);
 repo.accept(snapshot);await repo.updateSequence('emission-a','row-a',{who:'Équipe'});assert(calls.at(-1).args.p_expected_revision==='4'&&calls.at(-1).args.p_checkpoint===false);
});
Deno.test('adaptateur atomique : une lecture rejetée par l’interface ne remplace pas la révision d’écriture',async()=>{
 const {repo,calls}=setup();repo.accept(await repo.read('emission-a'));await repo.updateEmission('emission-a',{theme:'Premier'});
 await repo.read('emission-a');await repo.updateSequence('emission-a','row-a',{direct:'Second'});
 assert(calls.at(-1).args.p_expected_revision==='5'&&calls.at(-1).args.p_document.emission.theme==='Premier');
});
Deno.test('adaptateur atomique : conflit propagé sans rafraîchissement ou réessai implicite',async()=>{
 const {repo,db,calls}=setup();repo.accept(await repo.read('emission-a'));db.fail=true;
 let code;try{await repo.structure('emission-a','remove',{id:'row-a'});}catch(e){code=e.code;}
 assert(code==='PT409'&&calls.length===2&&repo.snapshots.get('emission-a').revision==='4');
});
Deno.test('adaptateur atomique : réponse de commit non confirmée ne remplace pas le cache',async()=>{
 const {repo,db}=setup();repo.accept(await repo.read('emission-a'));db.malformed=true;
 await refused(()=>repo.updateEmission('emission-a',{theme:'À confirmer'}));assert(repo.snapshots.get('emission-a').emission.theme==='Ancienne émission');
});
Deno.test('adaptateur atomique : liste sans espace et création d’espace via RPC',async()=>{
 const {repo,calls}=setup();assert((await repo.list(null))[0].space_id===null);
 const created=await repo.createSpace(' Radio amie ');assert(created.name==='Radio amie'&&calls.at(-1).name==='radio_v19_space');
});
