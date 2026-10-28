import {validateBackup} from '../tools/backup-validation.mjs';
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004'];
function fixture(){const created_at='2026-10-27T10:00:00.123456+00:00';return {
 format:'conduite-radio-db-backup',version:1,captured_at:created_at,server_version_num:'170006',is_full_database_backup:false,
 counts:{spaces:1,emissions:1,blocks:1,sequences:1},tables:{
 spaces:[{id:ids[0],name:'Fictif',position:0,created_at}],
 emissions:[{id:ids[1],theme:'Émission',emission_date:null,start_time:'17:00:00',is_template:false,space_id:null,created_at}],
 blocks:[{id:ids[2],emission_id:ids[1],title:'Ouverture',position:0,created_at}],
 sequences:[{id:ids[3],emission_id:ids[1],block_id:ids[2],position:0,type:'Direct',direct:'Éè & < >',recorded:'',duration_seconds:60,who:'Fictif',created_at}]
 }};}
function assert(value){if(!value)throw Error('Assertion échouée');}
function refused(data){let failed=false;try{validateBackup(data);}catch{failed=true;}assert(failed);}
Deno.test('sauvegarde : colonnes complètes, accents et émission sans espace acceptés',()=>{
 const data=fixture(),before=JSON.stringify(data),result=validateBackup(data);
 assert(result.counts.sequences===1&&result.emissions_without_space===1&&JSON.stringify(data)===before);
});
Deno.test('sauvegarde : table tronquée ou colonne manquante refusée',()=>{
 const a=fixture();a.tables.sequences=[];refused(a);
 const b=fixture();delete b.tables.emissions[0].is_template;refused(b);
 const c=fixture();c.tables.sequences[0].extra='hors schéma';refused(c);
});
Deno.test('sauvegarde : identifiants dupliqués ou référence absente refusés',()=>{
 const a=fixture();a.tables.sequences.push({...a.tables.sequences[0]});a.counts.sequences++;refused(a);
 const b=fixture();b.tables.sequences[0].block_id=ids[0];refused(b);
 const c=fixture();c.tables.emissions[0].space_id=ids[3];refused(c);
});
Deno.test('sauvegarde : bloc d’une autre émission refusé',()=>{
 const data=fixture();data.tables.emissions.push({...data.tables.emissions[0],id:ids[0]});data.counts.emissions++;
 data.tables.blocks[0].emission_id=ids[0];refused(data);
});
Deno.test('sauvegarde : types, date et durée incorrects refusés',()=>{
 for(const mutate of [d=>d.tables.sequences[0].duration_seconds=-1,d=>d.tables.sequences[0].who=null,d=>d.tables.emissions[0].emission_date='2026-02-30',d=>d.tables.spaces[0].position=1.5]){
  const data=fixture();mutate(data);refused(data);
 }
});
Deno.test('sauvegarde : export métier jamais présenté comme sauvegarde complète de la base',()=>{
 const data=fixture();data.is_full_database_backup=true;refused(data);
});
