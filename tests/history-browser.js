import {mockSupabase,serverFixture} from './mock-supabase.js';
import {historyFixture} from './history-fixture.js';
const fixture=historyFixture(),db=mockSupabase(serverFixture()),repository=new RadioSupabaseRepository.Repository(db);
const versions=new Map([['2',fixture.snapshot],['1',{...fixture.snapshot,emission:{...fixture.snapshot.emission,theme:'Départ'},blocks:[],sequences:[]}]]);
let revision=4,next=3;
const showCurrent=()=>{document.querySelector('#current').textContent='État fictif actuel : '+db.tables.emissions[0].theme+' · '+db.tables.sequences.length+' séquence(s) · révision '+revision;};
showCurrent();
db.rpcHandler=(name,params)=>{
 if(name==='radio_v19_history')return {data:{...structuredClone(fixture.info),current_revision:String(revision)},error:null};
 if(name==='radio_v19_version')return {data:structuredClone(versions.get(params.p_history_id)||null),error:null};
 if(name==='radio_v19_restore'){
  if(document.querySelector('#conflict').checked){document.querySelector('#conflict').checked=false;revision++;showCurrent();return {data:null,error:{code:'40001',message:'Modification concurrente fictive'}};}
  if(params.p_expected_revision!==String(revision))return {data:null,error:{code:'40001',message:'Révision fictive périmée'}};
  const snapshot=versions.get(params.p_history_id);if(!snapshot)return {data:null,error:Error('Version fictive absente')};
  const savedId=String(next++),now=new Date().toISOString();
  const before={format:'conduite-radio-db',version:1,emission:{...db.tables.emissions[0],v19_revision:revision},blocks:structuredClone(db.tables.blocks),sequences:structuredClone(db.tables.sequences)};
  versions.set(savedId,before);fixture.info.versions.unshift({history_id:savedId,revision:String(revision),captured_at:now,reason:'before_restore',theme:before.emission.theme,sequence_count:before.sequences.length});
  fixture.info.versions=fixture.info.versions.slice(0,20);revision++;
  db.tables.emissions=[{...structuredClone(snapshot.emission),v19_revision:revision}];
  db.tables.blocks=structuredClone(snapshot.blocks);db.tables.sequences=structuredClone(snapshot.sequences);showCurrent();
  return {data:{emission_id:'emission-a',restored_from:params.p_history_id,revision:String(revision),space_missing:false},error:null};
 }
 return {data:null,error:Error('Appel fictif inconnu')};
};
document.querySelector('#openHistory').onclick=async()=>{
 try{
  const outcome=await RadioCollaborationHistory.open({repository,emissionId:'emission-a',restore:(version,expected)=>repository.restoreVersion('emission-a',version,expected)});
  document.querySelector('#result').textContent=outcome.restored?'Version fictive restaurée. L’état remplacé reste consultable.':'Historique fermé sans restauration confirmée.';
 }catch(error){document.querySelector('#result').textContent=error.message;}
};
