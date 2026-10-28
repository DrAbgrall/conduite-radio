/* Transformations du document collaboratif : UUID stables, aucun accès réseau. */
(() => {
 'use strict';
 const newid=()=>crypto.randomUUID();
 function normalize(doc){
  doc.sequences.forEach((r,i)=>{r.position=i;r.emission_id=doc.emission.id;});
  doc.blocks.forEach((b,i)=>{b.position=i;b.emission_id=doc.emission.id;});return doc;
 }
 function fromNative(data,spaceId=null,ids=newid){
  RadioCore.validateNative(data);const id=ids(),map=new Map(data.blocks.map(b=>[b.key,ids()]));
  return normalize({format:'conduite-radio-db',version:1,emission:{...structuredClone(data.emission),id,space_id:spaceId},
   blocks:data.blocks.map(b=>({id:map.get(b.key),title:b.title})),
   sequences:data.sequences.map(r=>({...structuredClone(r),id:ids(),block_id:r.block_key?map.get(r.block_key):null}))});
 }
 function edit(source,action,args={},ids=newid){
  const doc=structuredClone(source),rows=doc.sequences,blocks=doc.blocks;
  const index=()=>{const i=rows.findIndex(r=>r.id===args.id);if(i<0)throw Error('Séquence introuvable.');return i;};
  const block=()=>{const b=blocks.find(b=>b.id===args.id);if(!b)throw Error('Bloc introuvable.');return b;};
  if(action==='add')rows.push({id:ids(),type:'Direct',direct:'',recorded:'',who:'',duration_seconds:60,block_id:null});
  else if(action==='remove')rows.splice(index(),1);
  else if(action==='duplicate'){const i=index();rows.splice(i+1,0,{...rows[i],id:ids()});}
  else if(action==='move'){
   const i=index(),to=i+args.direction;if(!RadioCore.canMoveSequence(rows,i,to))return normalize(doc);
   [rows[i],rows[to]]=[rows[to],rows[i]];
  }else if(action==='assign'){
   const i=index(),moving=rows[i],old=moving.block_id||null,key=args.blockId||null;
   if(key&&!blocks.some(b=>b.id===key))throw Error('Bloc introuvable.');
   if(old!==key){rows.splice(i,1);const last=rows.findLastIndex(r=>r.block_id===(key||old));moving.block_id=key;rows.splice(last<0?Math.min(i,rows.length):last+1,0,moving);}
  }else if(action==='order'){
   if(!Array.isArray(args.ids)||args.ids.length!==rows.length||new Set(args.ids).size!==rows.length||args.ids.some(id=>!rows.some(r=>r.id===id)))throw Error('Ordre périmé. Rechargez le conducteur.');
   doc.sequences=args.ids.map(id=>rows.find(r=>r.id===id));
  }else if(action==='addBlock')blocks.push({id:ids(),title:args.title||'Bloc'});
  else if(action==='removeBlock'){
   block();doc.blocks=blocks.filter(b=>b.id!==args.id);rows.forEach(r=>{if(r.block_id===args.id)r.block_id=null;});
  }else if(action==='duplicateBlock'){
   const original=block(),id=ids(),members=rows.filter(r=>r.block_id===original.id);
   blocks.splice(blocks.indexOf(original)+1,0,{...original,id,title:(original.title||'Bloc')+' — copie'});
   const last=rows.findLastIndex(r=>r.block_id===original.id);
   rows.splice(last<0?rows.length:last+1,0,...members.map(r=>({...r,id:ids(),block_id:id})));
  }else if(action==='moveBlock'){
   const original=block(),units=[];
   rows.forEach(r=>{const last=units.at(-1);if(r.block_id&&last?.id===r.block_id)last.rows.push(r);else units.push({id:r.block_id||null,rows:[r]});});
   if(units.filter(u=>u.id===original.id).length>1)throw Error('Bloc fragmenté.');
   const i=units.findIndex(u=>u.id===original.id),to=i+args.direction;
   if(i>=0&&to>=0&&to<units.length){[units[i],units[to]]=[units[to],units[i]];doc.sequences=units.flatMap(u=>u.rows);}
   else if(i<0){const j=blocks.indexOf(original),k=j+args.direction;if(k>=0&&k<blocks.length)[blocks[j],blocks[k]]=[blocks[k],blocks[j]];}
  }else throw Error('Action inconnue.');
  return normalize(doc);
 }
 globalThis.RadioAtomicDocument=Object.freeze({normalize,fromNative,edit});
})();
