import '../js/core.js';import '../js/atomic-document.js';
import {historyFixture} from './history-fixture.js';
const assert=(x)=>{if(!x)throw Error('Assertion échouée');};
const source=()=>({...historyFixture().snapshot,revision:'4'});
function ids(){let n=0;return ()=>'new-'+(++n);}
Deno.test('modèle atomique : import force de nouveaux IDs même si le JSON contient des IDs étrangers',()=>{
 const data={format:'conduite-radio',version:1,emission:{id:'foreign',theme:'Import',emission_date:null,start_time:'17:00:00',is_template:true},blocks:[{key:'a',title:'Bloc'}],sequences:[{id:'foreign-row',type:'Direct',direct:'é & <',recorded:'',who:'',duration_seconds:0,block_key:'a'}]};
 const doc=RadioAtomicDocument.fromNative(data,'space-a',ids());assert(doc.emission.id==='new-1'&&doc.sequences[0].id==='new-3'&&doc.sequences[0].block_id===doc.blocks[0].id&&doc.emission.is_template&&doc.sequences[0].duration_seconds===0);
});
Deno.test('modèle atomique : duplication et retrait préservent original et contenu',()=>{
 const doc=source(),before=JSON.stringify(doc),copy=RadioAtomicDocument.edit(doc,'duplicate',{id:'row-a'},ids());
 assert(copy.sequences.length===2&&copy.sequences[1].id!=='row-a'&&copy.sequences[1].direct===doc.sequences[0].direct);
 const removed=RadioAtomicDocument.edit(copy,'remove',{id:copy.sequences[1].id});assert(removed.sequences.length===1&&removed.sequences[0].id==='row-a'&&JSON.stringify(doc)===before);
});
Deno.test('modèle atomique : affectation et sortie ne fragmentent pas les blocs',()=>{
 const doc=source();doc.sequences.push({...doc.sequences[0],id:'row-b',position:1},{...doc.sequences[0],id:'row-c',position:2,block_id:null});
 const joined=RadioAtomicDocument.edit(doc,'assign',{id:'row-c',blockId:'block-a'});assert(joined.sequences.every(r=>r.block_id==='block-a'));
 const detached=RadioAtomicDocument.edit(joined,'assign',{id:'row-a',blockId:null});assert(detached.sequences.at(-1).id==='row-a'&&detached.sequences.at(-1).block_id===null);
});
Deno.test('modèle atomique : déplacement et duplication de bloc préservent l’ordre interne',()=>{
 const doc=source();doc.sequences.push({...doc.sequences[0],id:'row-b',position:1},{...doc.sequences[0],id:'outside',position:2,block_id:null});
 const moved=RadioAtomicDocument.edit(doc,'moveBlock',{id:'block-a',direction:1});assert(moved.sequences.map(r=>r.id).join()==='outside,row-a,row-b');
 const duplicate=RadioAtomicDocument.edit(doc,'duplicateBlock',{id:'block-a'},ids());assert(duplicate.blocks.length===2&&duplicate.sequences.length===5&&duplicate.sequences[2].block_id===duplicate.blocks[1].id);
 const detached=RadioAtomicDocument.edit(doc,'removeBlock',{id:'block-a'});assert(detached.sequences.length===3&&detached.sequences.every(r=>r.block_id===null));
});
Deno.test('modèle atomique : permutation dupliquée refusée et bloc vide déplaçable',()=>{
 let failed=false;try{RadioAtomicDocument.edit(source(),'order',{ids:['row-a','row-a']});}catch{failed=true;}assert(failed);
 const doc=source();doc.blocks.push({id:'empty',emission_id:'emission-a',title:'Vide',position:1});
 const moved=RadioAtomicDocument.edit(doc,'moveBlock',{id:'empty',direction:-1});assert(moved.blocks[0].id==='empty'&&moved.sequences[0].id==='row-a');
});
