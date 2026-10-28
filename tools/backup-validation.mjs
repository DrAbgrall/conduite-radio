// Validation d'un export métier : ne lit ni fichier ni réseau, ne retourne pas les textes.
export const backupColumns=Object.freeze({
 spaces:['id','name','position','created_at'],
 emissions:['id','theme','emission_date','start_time','created_at','is_template','space_id'],
 blocks:['id','emission_id','title','position','created_at'],
 sequences:['id','emission_id','position','type','direct','recorded','duration_seconds','who','created_at','block_id']
});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const integer=value=>Number.isInteger(value)&&value>=-2147483648&&value<=2147483647;
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
function requireValue(ok,label){if(!ok)throw Error('Sauvegarde incohérente : '+label);}
export function validateBackup(data){
 requireValue(data?.format==='conduite-radio-db-backup'&&data.version===1,'format/version');
 requireValue(data.is_full_database_backup===false,'périmètre de la sauvegarde');
 requireValue(timestamp(data.captured_at)&&/^\d+$/.test(data.server_version_num),'métadonnées');
 requireValue(data.tables&&data.counts&&Object.keys(data.tables).sort().join(',')===Object.keys(backupColumns).sort().join(','),'tables');
 const maps={},counts={};
 for(const [table,columns] of Object.entries(backupColumns)){
  const rows=data.tables[table];requireValue(Array.isArray(rows),'liste '+table);
  requireValue(data.counts[table]===rows.length,'effectif '+table);counts[table]=rows.length;
  const ids=new Map();maps[table]=ids;
  for(const row of rows){
   requireValue(row&&Object.keys(row).sort().join(',')===[...columns].sort().join(','),'colonnes '+table);
   requireValue(uuid(row.id)&&!ids.has(row.id.toLowerCase()),'identifiants '+table);
   ids.set(row.id.toLowerCase(),row);requireValue(timestamp(row.created_at),'horodatage '+table);
   if('position' in row)requireValue(integer(row.position),'position '+table);
   if(table==='spaces')requireValue(typeof row.name==='string','nom espace');
   if(table==='emissions'){
    requireValue(typeof row.theme==='string'&&typeof row.start_time==='string'&&typeof row.is_template==='boolean','métadonnées émission');
    requireValue(row.emission_date===null||date(row.emission_date),'date émission');
    requireValue(row.space_id===null||uuid(row.space_id),'référence espace');
   }
   if(table==='blocks')requireValue(uuid(row.emission_id)&&typeof row.title==='string','bloc');
   if(table==='sequences'){
    requireValue(uuid(row.emission_id)&&(row.block_id===null||uuid(row.block_id)),'références séquence');
    requireValue(['Direct','Habillage','PAD','Appel','Musique','Promo'].includes(row.type),'type séquence');
    requireValue(integer(row.duration_seconds)&&row.duration_seconds>=0,'durée séquence');
    requireValue(['direct','recorded','who'].every(k=>typeof row[k]==='string'),'textes séquence');
   }
  }
 }
 for(const e of data.tables.emissions)requireValue(e.space_id===null||maps.spaces.has(e.space_id.toLowerCase()),'espace absent');
 for(const b of data.tables.blocks)requireValue(maps.emissions.has(b.emission_id.toLowerCase()),'émission de bloc absente');
 for(const s of data.tables.sequences){
  requireValue(maps.emissions.has(s.emission_id.toLowerCase()),'émission de séquence absente');
  requireValue(s.block_id===null||maps.blocks.has(s.block_id.toLowerCase()),'bloc de séquence absent');
  if(s.block_id!==null)requireValue(maps.blocks.get(s.block_id.toLowerCase()).emission_id.toLowerCase()===s.emission_id.toLowerCase(),'bloc appartenant à une autre émission');
 }
 return {counts,emissions_without_space:data.tables.emissions.filter(e=>e.space_id===null).length};
}
