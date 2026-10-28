/* Accès ciblés à Supabase. Aucun client n'est créé par ce module. */
(() => {
  'use strict';
  function integerText(value,positive=false){
    return typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value)&&
      value.length<=19&&BigInt(value)<=9223372036854775807n&&(!positive||value!=='0');
  }
  function storedVersion(snapshot,id){
    if(!snapshot||snapshot.format!=='conduite-radio-db'||snapshot.version!==1||snapshot.emission?.id!==id||!Array.isArray(snapshot.blocks)||!Array.isArray(snapshot.sequences))throw Error('Version absente ou incompatible.');
    for(const rows of [snapshot.blocks,snapshot.sequences]){
      const ids=new Set(),positions=new Set();
      for(const row of rows){
        if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id)||row.emission_id!==id||!Number.isInteger(row.position)||row.position<0)throw Error('Cette version contient un ordre ou une appartenance incohérents.');
        if(rows===snapshot.sequences&&positions.has(row.position))throw Error('Cette version contient des positions de séquence ambiguës.');
        ids.add(row.id);positions.add(row.position);
      }
    }
    if(typeof snapshot.emission.is_template!=='boolean')throw Error('Statut de modèle invalide dans la version.');
    const sort=(a,b)=>a.position-b.position||a.id.localeCompare(b.id);
    const ordered={...snapshot,blocks:[...snapshot.blocks].sort(sort),sequences:[...snapshot.sequences].sort(sort)};
    const visited=new Set();let previous=null;
    for(const row of ordered.sequences){
      const block=row.block_id||null;
      if(block!==previous){if(block&&visited.has(block))throw Error('Cette version contient un bloc fragmenté.');if(block)visited.add(block);previous=block;}
    }
    return {snapshot:ordered,document:native(ordered)};
  }
  function native(snapshot){
    const {emission:e,blocks,sequences}=snapshot;
    const keys=new Map(blocks.map((b,i)=>[b.id,'block-'+(i+1)]));
    const data={format:'conduite-radio',version:1,emission:{theme:e.theme,emission_date:e.emission_date||null,start_time:e.start_time,is_template:!!e.is_template},
      blocks:blocks.map((b,i)=>({key:keys.get(b.id),title:b.title,position:i})),
      sequences:sequences.map((r,i)=>({position:i,type:r.type,direct:r.direct,recorded:r.recorded,duration_seconds:r.duration_seconds,who:r.who,block_key:r.block_id?keys.get(r.block_id):null}))};
    if(sequences.some(r=>r.block_id&&!keys.has(r.block_id)))throw Error('Une séquence référence un bloc absent de cette émission.');
    return RadioCore.validateNative(data);
  }
  class Repository {
    constructor(db,{atomic=false}={}){this.db=db;this.atomic=atomic;this.snapshots=new Map();}
    accept(snapshot){
      if(this.atomic){if(!integerText(snapshot.revision))throw Error('Révision serveur absente.');this.snapshots.set(snapshot.emission.id,structuredClone(snapshot));}
    }
    async commitDocument(doc,revision,{checkpoint=true}={}){
      if(revision!==null&&!integerText(revision))throw Error('Révision invalide. Rechargez le conducteur.');
      RadioAtomicDocument.normalize(doc);storedVersion(doc,doc.emission.id);
      const data=await this.historyCall('radio_v19_commit',{p_emission_id:doc.emission.id,p_expected_revision:revision,p_document:doc,p_checkpoint:checkpoint});
      const result=storedVersion(data,doc.emission.id).snapshot;
      if(!integerText(result.revision)||(revision!==null&&BigInt(result.revision)<=BigInt(revision)))throw Error('Enregistrement non confirmé. Rechargez avant toute nouvelle action.');
      this.accept(result);return result;
    }
    async change(id,transform,{checkpoint=true}={}){
      const current=this.snapshots.get(id);if(!current)throw Error('Rechargez le conducteur avant de modifier.');
      return this.commitDocument(transform(structuredClone(current)),current.revision,{checkpoint});
    }
    async structure(id,action,args){return this.change(id,doc=>RadioAtomicDocument.edit(doc,action,args));}
    async createDocument(data,spaceId){return this.commitDocument(RadioAtomicDocument.fromNative(data,spaceId),null);}
    async removeDocument(id,revision){
      if(!integerText(revision))throw Error('Rechargez la liste avant de supprimer.');
      const result=await this.historyCall('radio_v19_delete',{p_emission_id:id,p_expected_revision:revision});
      if(result?.emission_id!==id||result.deleted!==true)throw Error('Suppression non confirmée. Rechargez la liste.');
      this.snapshots.delete(id);
    }
    async list(spaceId){
      const rows=await this.historyCall('radio_v19_list',{p_space_id:spaceId});
      if(!Array.isArray(rows)||rows.some(e=>!e.id||!integerText(e.revision)||e.space_id!==spaceId))throw Error('Liste reçue incohérente.');return rows;
    }
    async historyCall(name,params){
      const {data,error}=await this.db.rpc(name,params);
      if(error){
        if(error.code==='PGRST202'||error.code==='42883')throw Error(name==='radio_v19_trash'?'La corbeille n’est pas encore disponible sur cette instance.':'L’historique n’est pas encore disponible sur cette instance.');
        throw error;
      }
      return data;
    }
    async history(id){
      const data=await this.historyCall('radio_v19_history',{p_emission_id:id});
      if(data===null)return null;
      if(!data||data.emission_id!==id||!integerText(data.current_revision)||!(data.deleted_at===null||(typeof data.deleted_at==='string'&&Number.isFinite(Date.parse(data.deleted_at))))||!Array.isArray(data.versions)||data.versions.length>20)throw Error('Historique reçu incomplet ou incohérent.');
      const ids=new Set();
      for(const v of data.versions){
        if(!v||!integerText(v.history_id,true)||ids.has(v.history_id)||!integerText(v.revision)||typeof v.theme!=='string'||typeof v.reason!=='string'||typeof v.captured_at!=='string'||!Number.isFinite(Date.parse(v.captured_at))||!Number.isInteger(v.sequence_count)||v.sequence_count<0)throw Error('Version reçue incohérente.');
        ids.add(v.history_id);
      }
      return data;
    }
    async trash(spaceId=null,cursor=null){
      if(cursor!==null&&(!cursor||typeof cursor.emission_id!=='string'||!cursor.emission_id||typeof cursor.deleted_at!=='string'||!Number.isFinite(Date.parse(cursor.deleted_at))))throw Error('Pagination invalide. Actualisez la corbeille.');
      const data=await this.historyCall('radio_v19_trash',{p_space_id:spaceId,
        p_before_deleted_at:cursor?.deleted_at||null,p_before_emission_id:cursor?.emission_id||null,p_limit:50});
      if(!data||!Array.isArray(data.items)||data.items.length>50||!('next_cursor'in data))throw Error('Corbeille reçue incomplète.');
      const ids=new Set();
      for(const item of data.items){
        if(!item||typeof item.emission_id!=='string'||!item.emission_id||ids.has(item.emission_id)||!integerText(item.revision)||typeof item.deleted_at!=='string'||!Number.isFinite(Date.parse(item.deleted_at))||typeof item.theme!=='string'||typeof item.is_template!=='boolean'||!Number.isInteger(item.sequence_count)||item.sequence_count<0||!(item.space_id===null||typeof item.space_id==='string')||(spaceId!==null&&item.space_id!==spaceId))throw Error('Émission reçue incohérente dans la corbeille.');
        ids.add(item.emission_id);
      }
      if(data.next_cursor!==null){
        const last=data.items.at(-1);
        if(!last||data.next_cursor.emission_id!==last.emission_id||data.next_cursor.deleted_at!==last.deleted_at||(cursor&&data.next_cursor.emission_id===cursor.emission_id&&data.next_cursor.deleted_at===cursor.deleted_at))throw Error('Pagination incohérente. Actualisez la corbeille.');
      }
      return data;
    }
    async version(id,historyId){
      if(!integerText(historyId,true))throw Error('Identifiant de version invalide.');
      return storedVersion(await this.historyCall('radio_v19_version',{p_emission_id:id,p_history_id:historyId}),id);
    }
    async restoreVersion(id,historyId,expectedRevision){
      if(!integerText(historyId,true)||!integerText(expectedRevision))throw Error('Version ou révision invalide. Actualisez l’historique.');
      const result=await this.historyCall('radio_v19_restore',{p_emission_id:id,p_history_id:historyId,p_expected_revision:expectedRevision});
      if(!result||result.emission_id!==id||result.restored_from!==historyId||!integerText(result.revision)||BigInt(result.revision)<=BigInt(expectedRevision)||typeof result.space_missing!=='boolean')throw Error('La restauration n’a pas été confirmée. Actualisez avant tout nouvel essai.');
      return result;
    }
    async read(id){
      if(this.atomic){
        const data=await this.historyCall('radio_v19_read',{p_emission_id:id});
        const result=storedVersion(data,id).snapshot;
        if(!integerText(result.revision))throw Error('Révision serveur absente.');return result;
      }
      const results=await Promise.all([
        this.db.from('emissions').select('*').eq('id',id).single(),
        this.db.from('sequences').select('*').eq('emission_id',id).order('position').order('id'),
        this.db.from('blocks').select('*').eq('emission_id',id).order('position').order('id')
      ]);
      const error=results.find(r=>r.error)?.error;if(error)throw error;
      const [e,r,b]=results.map(x=>x.data);
      if(!e||!Array.isArray(r)||!Array.isArray(b))throw Error('Réponse incomplète : le conducteur affiché a été conservé.');
      if(e.id!==id||r.some(x=>x.emission_id!==id)||b.some(x=>x.emission_id!==id))throw Error('Réponse reçue pour une autre émission.');
      const snapshot={emission:e,sequences:r,blocks:b};native(snapshot);return snapshot;
    }
    async createSpace(name){
      if(typeof name!=='string'||!name.trim()||name.trim().length>200)throw Error('Le nom de l’espace doit contenir entre 1 et 200 caractères.');
      if(this.atomic){const space=await this.historyCall('radio_v19_space',{p_name:name.trim()});if(!space?.id||space.name!==name.trim()||!Number.isInteger(space.position))throw Error('Création de l’espace non confirmée.');return space;}
      const {data:positions,error:readError}=await this.db.from('spaces').select('position').order('position',{ascending:false}).limit(1);
      if(readError)throw readError;
      const position=positions?.length?positions[0].position+1:0;
      if(!Number.isSafeInteger(position)||position>2147483647)throw Error('Position d’espace invalide.');
      const {data,error}=await this.db.from('spaces').insert({name:name.trim(),position}).select('*').single();
      if(error)throw error;if(!data?.id)throw Error('La création de l’espace n’a pas été confirmée.');return data;
    }
    async updateSequence(emissionId,id,payload){
      const allowed=['type','direct','recorded','duration_seconds','who'];
      for(const [key,value] of Object.entries(payload)){
        if(!allowed.includes(key))throw Error('Champ de séquence non autorisé.');
        if(key==='duration_seconds'){if(!Number.isInteger(value)||value<0||value>86400)throw Error('Durée invalide.');}
        else if(typeof value!=='string'||(key==='type'&&!RadioCore.TYPES.includes(value)))throw Error('Valeur de séquence invalide.');
      }
      if(this.atomic)return this.change(emissionId,doc=>{const row=doc.sequences.find(r=>r.id===id);if(!row)throw Error('Séquence supprimée.');Object.assign(row,payload);return doc;},{checkpoint:false});
      const {data,error}=await this.db.from('sequences').update({...payload}).eq('id',id).eq('emission_id',emissionId).select('id');
      if(error)throw error;
      if(!Array.isArray(data)||data.length!==1||data[0].id!==id)throw Error('Aucune séquence modifiée : elle a été supprimée ou l’accès est refusé.');
    }
    async updateEmission(id,payload){
      const allowed=['theme','emission_date','start_time'];
      if(Object.keys(payload).some(k=>!allowed.includes(k)))throw Error('Champ d’émission non autorisé.');
      if(('theme'in payload&&typeof payload.theme!=='string')||('emission_date'in payload&&!RadioCore.validDate(payload.emission_date))||('start_time'in payload&&!RadioCore.validTime(payload.start_time)))throw Error('Métadonnées invalides.');
      if(this.atomic)return this.change(id,doc=>{Object.assign(doc.emission,payload);return doc;},{checkpoint:false});
      const {data,error}=await this.db.from('emissions').update({...payload}).eq('id',id).select('id');
      if(error)throw error;
      if(!Array.isArray(data)||data.length!==1||data[0].id!==id)throw Error('Aucune émission modifiée : elle a été supprimée ou l’accès est refusé.');
    }
  }
  globalThis.RadioSupabaseRepository=Object.freeze({Repository,native});
})();
