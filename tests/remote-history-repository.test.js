import '../js/core.js';
import '../js/supabase-repository.js';
import {historyFixture} from './history-fixture.js';
function equal(a,b){if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);}
async function refused(fn){let failed=false;try{await fn();}catch{failed=true;}equal(failed,true);}
function setup(){
 const fixture=historyFixture(),calls=[];
 const db={response:fixture.info,error:null,rpc:async(name,params)=>{calls.push({name,params});return {data:db.response,error:db.error};}};
 return {fixture,db,calls,repo:new RadioSupabaseRepository.Repository(db)};
}
Deno.test('historique : RPC ciblé et révisions bigint conservées comme texte',async()=>{
 const {db,repo,calls}=setup();db.response.current_revision='9007199254740993';
 equal((await repo.history('emission-a')).current_revision,'9007199254740993');
 equal(calls,[{name:'radio_v19_history',params:{p_emission_id:'emission-a'}}]);
});
Deno.test('historique : absence acceptée et réponses incohérentes refusées',async()=>{
 const {db,repo,fixture}=setup();db.response=null;equal(await repo.history('emission-a'),null);
 for(const patch of [{emission_id:'autre'},{current_revision:4},{current_revision:'9223372036854775808'},{deleted_at:'invalide'},{versions:[...fixture.info.versions,fixture.info.versions[0]]}]){
  db.response={...fixture.info,...patch};await refused(()=>repo.history('emission-a'));
 }
});
Deno.test('historique : instance sans fonctions gérée sans tentative de migration',async()=>{
 const {db,repo,calls}=setup();db.error={code:'PGRST202',message:'absent'};
 let message;try{await repo.history('emission-a');}catch(error){message=error.message;}
 equal(message,'L’historique n’est pas encore disponible sur cette instance.');equal(calls.length,1);
});
Deno.test('aperçu : conversion du format interne en document portable sans UUID',async()=>{
 const {db,repo,fixture,calls}=setup();db.response=fixture.snapshot;
 const version=await repo.version('emission-a','2');equal(version.document.sequences[0].block_key,'block-1');
 equal(version.document.emission.theme,'Ancienne émission');equal(version.document.sequences[0].id,undefined);
 equal(calls[0],{name:'radio_v19_version',params:{p_emission_id:'emission-a',p_history_id:'2'}});
});
Deno.test('aperçu : appartenance, ordre ambigu et bloc fragmenté refusés',async()=>{
 const {db,repo,fixture}=setup();
 for(const mutate of [s=>s.emission.id='autre',s=>s.sequences[0].emission_id='autre',s=>s.blocks[0].id='absent',s=>s.sequences[0].position=-1,
   s=>s.sequences.push({...s.sequences[0],id:'dup'}),
   s=>s.sequences.push({...s.sequences[0],id:'middle',position:1,block_id:null},{...s.sequences[0],id:'last',position:2})]){
  db.response=structuredClone(fixture.snapshot);mutate(db.response);await refused(()=>repo.version('emission-a','2'));
 }
});
Deno.test('restauration : révision attendue transmise sans arrondi',async()=>{
 const {db,repo,calls}=setup();db.response={emission_id:'emission-a',restored_from:'2',revision:'9007199254740994',space_missing:false};
 await repo.restoreVersion('emission-a','2','9007199254740993');
 equal(calls[0],{name:'radio_v19_restore',params:{p_emission_id:'emission-a',p_history_id:'2',p_expected_revision:'9007199254740993'}});
});
Deno.test('restauration : paramètres invalides refusés sans appel et conflit propagé',async()=>{
 const {db,repo,calls}=setup();
 for(const args of [['0','4'],['-1','4'],['2',4],['2',null],['2','9223372036854775808']])await refused(()=>repo.restoreVersion('emission-a',...args));
 equal(calls.length,0);db.error={code:'40001',message:'Conflit'};
 let error;try{await repo.restoreVersion('emission-a','2','4');}catch(e){error=e;}equal(error,db.error);equal(calls.length,1);
});
Deno.test('restauration : réponse non confirmée refusée sans réessai',async()=>{
 const {db,repo,calls}=setup();
 for(const result of [null,{emission_id:'autre',restored_from:'2',revision:'5',space_missing:false},{emission_id:'emission-a',restored_from:'2',revision:'4',space_missing:false}]){
  db.response=result;await refused(()=>repo.restoreVersion('emission-a','2','4'));
 }
 equal(calls.length,3);
});
