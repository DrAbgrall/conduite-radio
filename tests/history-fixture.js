import {serverFixture} from './mock-supabase.js';
export function historyFixture(){
 const data=serverFixture();
 return {
  info:{emission_id:'emission-a',current_revision:'4',deleted_at:null,versions:[
   {history_id:'2',revision:'2',captured_at:'2026-10-27T10:00:00Z',reason:'autosave',theme:'Ancienne émission',sequence_count:1},
   {history_id:'1',revision:'0',captured_at:'2026-10-27T09:00:00Z',reason:'baseline',theme:'Départ',sequence_count:0}]},
  snapshot:{format:'conduite-radio-db',version:1,emission:{...data.emissions[0],theme:'Ancienne émission',v19_revision:2},blocks:data.blocks,sequences:data.sequences}
 };
}
