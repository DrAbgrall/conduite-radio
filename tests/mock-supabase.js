// Serveur simulé en mémoire : aucune connexion réseau.
export function mockSupabase(initial){
 const tables=structuredClone(initial),calls=[],events=[];let next=1;
 const client={tables,calls,events,failRead:null,failWrite:false,emptyUpdate:false,
  rpc(name,params){
   calls.push({rpc:name,params:structuredClone(params)});
   return client.rpcHandler?Promise.resolve().then(()=>client.rpcHandler(name,params)):
    Promise.resolve({data:null,error:{code:'PGRST202',message:'Fonction absente du serveur simulé'}});
  },
  from(table){
   const spec={table,action:'select',filters:[],orders:[],payload:null,single:false,limit:null};
   const q={
    select(columns='*'){spec.columns=columns;return q;},
    update(payload){spec.action='update';spec.payload=structuredClone(payload);return q;},
    insert(payload){spec.action='insert';spec.payload=structuredClone(payload);return q;},
    eq(key,value){spec.filters.push([key,value]);return q;},
    order(key,options={}){spec.orders.push([key,options]);return q;},
    limit(n){spec.limit=n;return q;},single(){spec.single=true;return q;},
    then(resolve,reject){return Promise.resolve().then(()=>{
     calls.push(structuredClone(spec));
     if(spec.action==='select'&&client.failRead===table)return {data:null,error:Error('Lecture refusée : '+table)};
     if(spec.action!=='select'&&client.failWrite)return {data:null,error:Error('Écriture refusée')};
     const matches=r=>spec.filters.every(([k,v])=>r[k]===v);
     let data=(tables[table]||[]).filter(matches);
     if(spec.action==='update'){
      if(client.emptyUpdate)data=[];
      else data.forEach(row=>Object.assign(row,spec.payload));
      data=data.map(r=>({id:r.id}));
     }else if(spec.action==='insert'){
      const row={id:'created-'+next++,...spec.payload};(tables[table]??=[]).push(row);data=[row];
     }else{
      data=[...data];
      for(const [key,options] of [...spec.orders].reverse())data.sort((a,b)=>(a[key]<b[key]?-1:a[key]>b[key]?1:0)*(options.ascending===false?-1:1));
      if(spec.limit!==null)data=data.slice(0,spec.limit);
     }
     return {data:structuredClone(spec.single?data[0]||null:data),error:null};
    }).then(resolve,reject);}
   };return q;
  },
  channel(){const channel={on(event,filter,callback){events.push({event,filter,callback});return channel;},subscribe(callback){client.subscriptionCallback=callback;return channel;}};return channel;}
 };return client;
}
export function serverFixture(){return {
 emissions:[{id:'emission-a',theme:'Radio test',emission_date:null,start_time:'23:59:30',is_template:false,space_id:'space-a'}],
 blocks:[{id:'block-a',emission_id:'emission-a',title:'Ouverture',position:0}],
 sequences:[{id:'row-a',emission_id:'emission-a',position:0,type:'Direct',direct:'Bonjour',recorded:'',duration_seconds:30,who:'Équipe',block_id:'block-a'}],
 spaces:[{id:'space-a',name:'Radio test',position:0}]
};}
