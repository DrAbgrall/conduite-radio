import '../js/core.js';
import '../js/supabase-repository.js';
import {mockSupabase,serverFixture} from './mock-supabase.js';
function equal(a,b){if(JSON.stringify(a)!==JSON.stringify(b))throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);}
async function refused(fn){let failed=false;try{await fn();}catch{failed=true;}equal(failed,true);}
Deno.test('lecture simulée : filtrage émission sur les trois tables et format JSON portable',async()=>{
 const db=mockSupabase(serverFixture()),repo=new RadioSupabaseRepository.Repository(db),snapshot=await repo.read('emission-a');
 const data=RadioSupabaseRepository.native(snapshot);equal(data.blocks[0].key,'block-1');equal(data.sequences[0].block_key,'block-1');
 equal(db.calls.map(c=>c.filters),[[['id','emission-a']],[['emission_id','emission-a']],[['emission_id','emission-a']]]);
});
Deno.test('lecture simulée : erreur des blocs propagée au lieu de renvoyer une liste vide',async()=>{
 const db=mockSupabase(serverFixture());db.failRead='blocks';await refused(()=>new RadioSupabaseRepository.Repository(db).read('emission-a'));
});
Deno.test('bloc étranger ou absent : refus du conducteur incohérent',()=>{
 const data=serverFixture();data.sequences[0].block_id='absent';let failed=false;
 try{RadioSupabaseRepository.native({emission:data.emissions[0],blocks:data.blocks,sequences:data.sequences});}catch{failed=true;}equal(failed,true);
});
Deno.test('écriture ciblée : filtre id ET émission, sans mise à jour des autres champs',async()=>{
 const db=mockSupabase(serverFixture()),repo=new RadioSupabaseRepository.Repository(db);
 await repo.updateSequence('emission-a','row-a',{direct:'Nouveau texte'});
 equal(db.calls[0].filters,[['id','row-a'],['emission_id','emission-a']]);equal(db.tables.sequences[0].who,'Équipe');equal(db.tables.sequences[0].direct,'Nouveau texte');
});
Deno.test('zéro ligne modifiée est une erreur, même sans erreur HTTP',async()=>{
 const db=mockSupabase(serverFixture());db.emptyUpdate=true;const repo=new RadioSupabaseRepository.Repository(db);
 await refused(()=>repo.updateSequence('emission-a','row-a',{who:'Nouveau'}));await refused(()=>repo.updateEmission('emission-a',{theme:'Nouveau'}));
});
Deno.test('métadonnées : un champ enregistré ne remplace pas les autres',async()=>{
 const db=mockSupabase(serverFixture()),repo=new RadioSupabaseRepository.Repository(db);
 await repo.updateEmission('emission-a',{theme:'RadioPanik'});equal(db.tables.emissions[0].start_time,'23:59:30');equal(db.calls[0].payload,{theme:'RadioPanik'});
});
Deno.test('durées, types et champs interdits refusés avant toute requête',async()=>{
 const db=mockSupabase(serverFixture()),repo=new RadioSupabaseRepository.Repository(db);
 for(const patch of [{duration_seconds:-1},{duration_seconds:1.5},{position:2},{type:'Inconnu'}])await refused(()=>repo.updateSequence('emission-a','row-a',patch));equal(db.calls.length,0);
});
Deno.test('création d’un espace supplémentaire sans nom codé en dur',async()=>{
 const db=mockSupabase(serverFixture()),repo=new RadioSupabaseRepository.Repository(db);
 const created=await repo.createSpace(' RadioPanik ');equal(created.name,'RadioPanik');equal(created.position,1);equal(db.tables.spaces.length,2);
});
Deno.test('nom d’espace vide refusé sans requête',async()=>{
 const db=mockSupabase(serverFixture());await refused(()=>new RadioSupabaseRepository.Repository(db).createSpace('   '));equal(db.calls.length,0);
});
