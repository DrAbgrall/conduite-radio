import '../js/core.js';import '../js/supabase-repository.js';
const item={emission_id:'deleted-a',revision:'9007199254740993',deleted_at:'2026-10-27T10:00:00.123456Z',space_id:'space-a',theme:'Émission',is_template:false,sequence_count:2};
function assert(value){if(!value)throw Error('Assertion échouée');}
async function refused(fn){let failed=false;try{await fn();}catch{failed=true;}assert(failed);}
function setup(){const calls=[],db={response:{items:[{...item}],next_cursor:null},rpc:async(name,args)=>{calls.push({name,args});return {data:db.response,error:null};}};return {db,calls,repo:new RadioSupabaseRepository.Repository(db)};}
Deno.test('corbeille : espace et curseur transmis sans arrondi de date/bigint',async()=>{
 const {repo,calls}=setup(),cursor={deleted_at:'2026-10-28T10:00:00.987654Z',emission_id:'before'};
 const data=await repo.trash('space-a',cursor);assert(data.items[0].revision==='9007199254740993');
 assert(JSON.stringify(calls[0])===JSON.stringify({name:'radio_v19_trash',args:{p_space_id:'space-a',p_before_deleted_at:cursor.deleted_at,p_before_emission_id:'before',p_limit:50}}));
});
Deno.test('corbeille : scope racine sans filtre et résultat vide acceptés',async()=>{
 const {repo,db,calls}=setup();db.response={items:[],next_cursor:null};assert((await repo.trash()).items.length===0);assert(calls[0].args.p_space_id===null);
});
Deno.test('corbeille : doublons, autre espace et métadonnées invalides refusés',async()=>{
 const {repo,db}=setup();
 for(const entries of [[item,item],[{...item,space_id:'other'}],[{...item,revision:2}],[{...item,deleted_at:'invalide'}],[{...item,sequence_count:-1}]]){db.response={items:entries,next_cursor:null};await refused(()=>repo.trash('space-a'));}
});
Deno.test('corbeille : curseur doit correspondre à la fin de page',async()=>{
 const {repo,db}=setup();db.response.next_cursor={deleted_at:item.deleted_at,emission_id:'wrong'};await refused(()=>repo.trash());
 db.response.next_cursor={deleted_at:item.deleted_at,emission_id:item.emission_id};assert((await repo.trash()).next_cursor.emission_id===item.emission_id);
 await refused(()=>repo.trash(null,{emission_id:item.emission_id,deleted_at:item.deleted_at}));
});
Deno.test('corbeille : curseur invalide refusé sans appel réseau',async()=>{
 const {repo,calls}=setup();await refused(()=>repo.trash(null,{deleted_at:'invalide'}));assert(calls.length===0);
});
