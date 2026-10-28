
const APP_CONFIG=window.CONDUITE_CONFIG||{};
document.addEventListener('DOMContentLoaded',()=>{
  if(APP_CONFIG.appName) document.title=APP_CONFIG.appName+(APP_CONFIG.organisation?' - '+APP_CONFIG.organisation:'');
});

// V12 — Notion / iframe integration mode.
// Automatically enabled inside an iframe; ?embed=1 can force it for testing.
const __params=new URLSearchParams(location.search);
let __embedded=__params.get('embed')==='1';
try{ if(window.self!==window.top)__embedded=true; }catch(e){ __embedded=true; }
if(__embedded)document.documentElement.classList.add('embed-pending');
window.addEventListener('DOMContentLoaded',()=>{
 if(__embedded)document.body.classList.add('embed-mode');
});
const KEY='conduite-radio-v19-preview';
const seed=[
 {type:'Habillage',direct:'',recorded:'Jingle ouverture',duration:'00:30',who:'Régie'},
 {type:'Direct',direct:'Présentation',recorded:'',duration:'02:00',who:'Animation'},
 {type:'PAD',direct:'',recorded:'Reportage',duration:'04:30',who:'Régie'},
 {type:'Direct',direct:'Interview',recorded:'',duration:'08:00',who:'Animation'}
];
let state={start:'17:00:00',theme:'',date:'',rows:structuredClone(seed)};
try{const cached=JSON.parse(localStorage.getItem(KEY)||'null');if(cached&&Array.isArray(cached.rows)&&RadioCore.validTime(cached.start)&&cached.rows.every(r=>{try{RadioCore.durationSeconds(r.duration);return true}catch{return false}}))state=cached}catch(err){console.warn('Copie locale indisponible :',err)}
let blocks=[];
let collapsedBlocks=new Set();
const tbody=document.querySelector('#rows'), start=document.querySelector('#start'), theme=document.querySelector('#theme'), date=document.querySelector('#date');
start.value=state.start; theme.value=state.theme||''; date.value=state.date||'';
function secs(s){return RadioCore.durationSeconds(s)}
function clock(base,add){return RadioCore.clock(base,add)}
function save(){state.start=start.value||'00:00:00';state.theme=theme.value;state.date=date.value;localStorage.setItem(KEY,JSON.stringify(state))}
function typeSlug(t){return {'Direct':'direct','Habillage':'habillage','PAD':'pad','Appel':'appel','Musique':'musique','Promo':'promo'}[t]||'direct'}
function applyTypeStyle(tr,select,type){
  ['direct','habillage','pad','appel','musique','promo'].forEach(x=>{tr.classList.remove('row-'+x);select.classList.remove('type-'+x)});
  const slug=typeSlug(type);tr.classList.add('row-'+slug);select.classList.add('type-'+slug);
}
function blockById(id){return blocks.find(b=>b.id===id)}
function blockDuration(id){return state.rows.filter(r=>r.block_id===id).reduce((a,r)=>a+secs(r.duration),0)}
function blockOptions(current){
 return '<option value="">Sans bloc</option>'+blocks.map(b=>'<option value="'+esc(b.id)+'" '+(current===b.id?'selected':'')+'>'+esc(b.title||'Bloc')+'</option>').join('');
}
function orderedDisplayRows(){
 // Sequence position remains authoritative. A block header is inserted before its first member.
 const seen=new Set(),items=[];
 state.rows.forEach((r,i)=>{
   if(r.block_id && blockById(r.block_id) && !seen.has(r.block_id)){
     seen.add(r.block_id);items.push({kind:'block',block:blockById(r.block_id)});
   }
   items.push({kind:'row',row:r,index:i});
 });
 blocks.filter(b=>!seen.has(b.id)).forEach(block=>items.push({kind:'block',block}));
 return items;
}
const TYPE_HELP=(window.CONDUITE_CONFIG&&window.CONDUITE_CONFIG.help)||{};
function updateTypeHelp(tr,type){
 const h=tr.querySelector('.typeHelp');if(!h)return;
 const tip=TYPE_HELP[type]||'';
 h.dataset.tip=tip;h.title=tip;
}
function render(){tbody.innerHTML='';let elapsed=0;
 const items=orderedDisplayRows();
 items.forEach(item=>{
  if(item.kind==='block'){
    const b=item.block, tr=document.createElement('tr');tr.className='blockrow';tr.dataset.block=b.id;
    const collapsed=collapsedBlocks.has(b.id);
    tr.innerHTML='<td colspan="8"><div class="blockbar"><button class="blockToggle" title="Replier/déplier">'+(collapsed?'▸':'▾')+'</button><span class="blocktitle">'+esc(b.title||'Bloc')+'</span><span class="blockdur">'+secFmt(blockDuration(b.id))+'</span><div class="blockBtns"><button class="blockUp" title="Monter le bloc">↑</button><button class="blockDown" title="Descendre le bloc">↓</button><button class="blockDup" title="Dupliquer le bloc">⧉</button><button class="blockDel" title="Supprimer le bloc">×</button></div></div></td>';
    tr.querySelector('.blockToggle').onclick=()=>{collapsedBlocks.has(b.id)?collapsedBlocks.delete(b.id):collapsedBlocks.add(b.id);render()};
    tr.querySelector('.blockUp').onclick=()=>moveBlock(b.id,-1);
    tr.querySelector('.blockDown').onclick=()=>moveBlock(b.id,1);
    tr.querySelector('.blockDup').onclick=()=>duplicateBlock(b.id);
    tr.querySelector('.blockDel').onclick=()=>deleteBlock(b.id);
    tbody.appendChild(tr);return;
  }
  const r=item.row,i=item.index;
  let tr=document.createElement('tr');tr.dataset.i=i;if(r.block_id)tr.classList.add('blockMember');if(r.block_id&&collapsedBlocks.has(r.block_id))tr.classList.add('blockCollapsed');
  tr.innerHTML=`<td class="drag" title="Déplacer">☰</td><td class="time">${clock(start.value||'00:00:00',elapsed)}</td>
<td><div style="display:flex;align-items:center"><select class="type"><option>Direct</option><option>Habillage</option><option>PAD</option><option>Appel</option><option>Musique</option><option>Promo</option></select><span class="helpTip typeHelp" tabindex="0">i</span></div></td>
<td><textarea class="direct">${esc(r.direct||'')}</textarea></td>
<td><textarea class="recorded">${esc(r.recorded||'')}</textarea></td>
<td><input class="duration" value="${esc(r.duration)}" inputmode="numeric"></td>
<td class="hide-sm"><input class="who" value="${esc(r.who||'')}"><select class="assignBlock" title="Bloc">${blockOptions(r.block_id||'')}</select></td>
<td class="actions"><div class="reorderBtns"><button class="up" title="Monter">↑</button><button class="down" title="Descendre">↓</button><button class="dup" title="Dupliquer la séquence">⧉</button><button class="del" title="Supprimer">×</button></div></td>`;
  tr.querySelector('.type').value=r.type;applyTypeStyle(tr,tr.querySelector('.type'),r.type);updateTypeHelp(tr,r.type);
  const directInput=tr.querySelector('.direct');directInput.disabled=false;directInput.placeholder='';directInput.title=r.direct||'';
  const recordedInput=tr.querySelector('.recorded');if(recordedInput)recordedInput.title=r.recorded||'';
  ['direct','recorded','duration','who'].forEach(k=>{
   let el=tr.querySelector('.'+k);if(el){
    el.onfocus=()=>{editLock=true;if(k==='direct'||k==='recorded'){el.style.height='auto';el.style.height=el.scrollHeight+'px';el.title=''}};
    el.oninput=()=>{if(k==='duration'){try{secs(el.value);el.setCustomValidity('')}catch(err){el.setCustomValidity(err.message);return}}r[k]=el.value;markLocalChange();if(k==='direct'||k==='recorded'){el.style.height='auto';el.style.height=el.scrollHeight+'px'}renderTimes()};
    el.onblur=async()=>{
      if(k==='duration'){try{secs(el.value);el.setCustomValidity('')}catch(err){alert(err.message);el.value=r.duration;el.setCustomValidity('');editLock=false;return}}
      const value=el.value;if(k==='direct'||k==='recorded'){el.style.height='42px';el.title=value}r[k]=value;editLock=false;
      try{
        if(emissionId&&r.id){
          const payload=k==='duration'?{duration_seconds:secs(value)}:{[k]:value};
          await remoteSync.write('sequence:'+r.id+':'+k,()=>repository.updateSequence(emissionId,r.id,payload));
        }else {originalSave();localDirty=false;}
      }catch(err){setSyncStatus('write-error',err)}
      finally{editLock=false;pullRemote();}
    };
   }
  });
  const assign=tr.querySelector('.assignBlock');if(assign)assign.onchange=async()=>{await assignSequenceToBlock(i,assign.value||null)};
  const typeSelect=tr.querySelector('.type');typeSelect.onfocus=()=>{editLock=true};
  typeSelect.onchange=async e=>{
    if(typeSelect.dataset.saving==='1')return;
    const chosen=e.target.value;r.type=chosen;markLocalChange();applyTypeStyle(tr,e.target,chosen);updateTypeHelp(tr,chosen);
    typeSelect.dataset.saving='1';typeSelect.disabled=true;editLock=false;
    try{
      if(emissionId&&r.id)await remoteSync.write('sequence:'+r.id+':type',()=>repository.updateSequence(emissionId,r.id,{type:chosen}));
      else {originalSave();localDirty=false;}
    }catch(err){setSyncStatus('write-error',err)}
    finally{typeSelect.disabled=false;delete typeSelect.dataset.saving;editLock=false;pullRemote();}
  };
  typeSelect.onblur=()=>{if(typeSelect.dataset.saving!=='1'){editLock=false;setTimeout(()=>pullRemote(),250)}};
  let up=tr.querySelector('.up'),down=tr.querySelector('.down');up.disabled=i===0;down.disabled=i===state.rows.length-1;
  up.onclick=async()=>{if(reorderLock||i<=0)return;const r=state.rows[i],p=state.rows[i-1];if(r.block_id&&p?.block_id!==r.block_id)return;if(!r.block_id&&p?.block_id)return;await moveSequenceReliable(i,-1)};
  down.onclick=async()=>{if(reorderLock||i>=state.rows.length-1)return;const r=state.rows[i],n=state.rows[i+1];if(r.block_id&&n?.block_id!==r.block_id)return;if(!r.block_id&&n?.block_id)return;await moveSequenceReliable(i,1)};
  tr.querySelector('.dup').onclick=async()=>{await duplicateSequence(i)};tr.querySelector('.del').onclick=async()=>{await deleteSequence(i)};
  let handle=tr.querySelector('.drag');handle.draggable=true;
  handle.ondragstart=e=>{window.__dragFrom=i;tr.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(i))};
  handle.ondragend=()=>{tr.classList.remove('dragging');document.querySelectorAll('.over').forEach(x=>x.classList.remove('over'));window.__dragFrom=null};
  tr.ondragenter=e=>{e.preventDefault();if(window.__dragFrom!==i)tr.classList.add('over')};tr.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move'};tr.ondragleave=e=>{if(!tr.contains(e.relatedTarget))tr.classList.remove('over')};
  tr.ondrop=e=>{e.preventDefault();e.stopPropagation();tr.classList.remove('over');let from=Number(e.dataTransfer.getData('text/plain'));if(!Number.isInteger(from))from=window.__dragFrom;let to=i;if(!RadioCore.canMoveSequence(state.rows,from,to)||reorderLock||structureCount||remoteSync.failures.size||remoteSync.writes)return;if(Number.isInteger(from)&&from!==to){let[x]=state.rows.splice(from,1);state.rows.splice(to,0,x);render();persistOrder()}};
  let touchTarget=null;handle.ontouchstart=e=>{tr.classList.add('dragging');touchTarget=null};handle.ontouchmove=e=>{e.preventDefault();let t=e.touches[0],target=document.elementFromPoint(t.clientX,t.clientY)?.closest('tr[data-i]');document.querySelectorAll('.over').forEach(x=>x.classList.remove('over'));if(target&&target!==tr){target.classList.add('over');touchTarget=target}};handle.ontouchend=e=>{e.preventDefault();tr.classList.remove('dragging');document.querySelectorAll('.over').forEach(x=>x.classList.remove('over'));if(touchTarget){let from=+tr.dataset.i,to=+touchTarget.dataset.i;if(!RadioCore.canMoveSequence(state.rows,from,to)||reorderLock||structureCount||remoteSync.failures.size||remoteSync.writes)return;if(from!==to){let[x]=state.rows.splice(from,1);state.rows.splice(to,0,x);render();persistOrder()}}};
  tbody.appendChild(tr);elapsed+=secs(r.duration);
 });
 let end=document.createElement('tr');end.className='endrow';end.innerHTML=`<td></td><td class="time">${clock(start.value||'00:00:00',elapsed)}</td><td></td><td class="endlabel">FIN D’ÉMISSION</td><td></td><td></td><td class="hide-sm"></td><td></td>`;tbody.appendChild(end);
}
function renderTimes(){
 const schedule=RadioCore.schedule(state.rows,start.value||'00:00:00');
 state.rows.forEach((r,i)=>{const cell=tbody.querySelector('tr[data-i="'+i+'"] .time');if(cell)cell.textContent=schedule.times[i]});
 const end=tbody.querySelector('.endrow .time');if(end)end.textContent=schedule.end;
 tbody.querySelectorAll('tr[data-block]').forEach(tr=>{const cell=tr.querySelector('.blockdur');if(cell)cell.textContent=secFmt(blockDuration(tr.dataset.block))});
}
function esc(s){return String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')}
start.oninput=()=>{renderTimes()};
document.querySelector('#add').onclick=()=>addSequenceReliable();document.querySelector('#addBlock').onclick=()=>createBlock();
document.querySelector('#reset').onclick=()=>{if(confirm('Réinitialiser la conduite de démonstration ?')){state={start:'17:00:00',theme:'',date:'',rows:structuredClone(seed)};start.value=state.start;theme.value='';date.value='';save();render()}};

// --- V7 : couche collaborative Supabase ---
const SUPABASE_URL=APP_CONFIG.supabaseUrl||'', SUPABASE_KEY=APP_CONFIG.supabasePublishableKey||'';
const collaborationEnabled=APP_CONFIG.collaborationEnabled===true;
const db=collaborationEnabled?supabase.createClient(SUPABASE_URL,SUPABASE_KEY):null;
let emissionId=collaborationEnabled?new URLSearchParams(location.search).get('emission'):null, remoteRows=[], channel=null, syncLock=false;
// La réinitialisation historique synchronisait les exemples sur l'émission réelle.
document.querySelector('#reset').hidden=true;
let reorderLock=false;
let editLock=false;
let addLock=false;
let localDirty=false,currentIsTemplate=false,structureCount=0,historyOpen=false;
let structureTail=Promise.resolve();
const repository=db?new RadioSupabaseRepository.Repository(db,{atomic:APP_CONFIG.atomicCollaboration!==false}):null;
const remoteSync=new RadioRemoteSync({
 load:()=>repository.read(emissionId),apply:applyRemoteSnapshot,
 isEditing:()=>historyOpen||structureCount>0||syncLock||editLock||Object.keys(pendingMeta).length>0||!!document.activeElement?.matches('input,select,textarea'),
 onStatus:setSyncStatus
});



async function deleteSequence(i){
 if(i<0||i>=state.rows.length)return;
 const row=state.rows[i];

 // Local-only fallback.
 if(!emissionId || !row.id){
   state.rows.splice(i,1);
   save();
   render();
   return;
 }

 // Delete on the server first. Realtime is ignored while this operation is authoritative.
 syncLock=true;
 editLock=true;
 try{
   const {error}=await db.from('sequences').delete().eq('id',row.id).eq('emission_id',emissionId);
   if(error)throw error;

   // Remove locally only after Supabase confirms the deletion.
   state.rows.splice(i,1);
   render();

   // Re-number remaining rows explicitly.
   for(let pos=0;pos<state.rows.length;pos++){
     const r=state.rows[pos];
     if(r.id){
       const {error:orderError}=await db.from('sequences').update({position:pos}).eq('id',r.id).eq('emission_id',emissionId);
       if(orderError)throw orderError;
     }
   }
 }catch(err){
   alert("La séquence n’a pas pu être supprimée : "+err.message);
 }finally{
   syncLock=false;
   editLock=false;
   await pullRemote(true);
 }
}

async function duplicateSequence(i){
 if(i<0||i>=state.rows.length)return;
 const source=state.rows[i];

 // Local fallback.
 if(!emissionId || !source.id){
   const copy={type:source.type||'Direct',direct:source.direct||'',recorded:source.recorded||'',duration:source.duration||'01:00',who:source.who||'',block_id:source.block_id||null};
   state.rows.splice(i+1,0,copy);save();render();return;
 }

 // Server-first: insert the duplicate explicitly, preserving its block.
 syncLock=true;editLock=true;
 try{
   // Make room immediately after the source in the authoritative order.
   for(let pos=state.rows.length-1;pos>i;pos--){
     const rr=state.rows[pos];
     if(rr.id){
       const {error:shiftError}=await db.from('sequences').update({position:pos+1}).eq('id',rr.id).eq('emission_id',emissionId);
       if(shiftError)throw shiftError;
     }
   }
   const payload={
     emission_id:emissionId,
     position:i+1,
     type:source.type||'Direct',
     direct:source.direct||'',
     recorded:source.recorded||'',
     duration_seconds:secs(source.duration),
     who:source.who||'',
     block_id:source.block_id||null
   };
   const {error}=await db.from('sequences').insert(payload);
   if(error)throw error;
 }catch(err){
   alert("La séquence n’a pas pu être dupliquée : "+err.message);
 }finally{
   syncLock=false;editLock=false;
   await pullRemote(true);
 }
}

async function addSequenceReliable(){
 const btn=document.querySelector('#add');
 if(addLock)return;
 // Fallback for a non-collaborative/local page.
 if(!emissionId){
   state.rows.push({type:'Direct',direct:'',recorded:'',duration:'01:00',who:''});
   save();render();return;
 }
 addLock=true;btn.disabled=true;btn.textContent='Ajout…';
 try{
   const position=state.rows.length;
   const payload={emission_id:emissionId,position,type:'Direct',direct:'',recorded:'',duration_seconds:60,who:'',block_id:null};
   const {error}=await db.from('sequences').insert(payload);
   if(error)throw error;
   // Read the authoritative server state only after insert has completed.
   await pullRemote(true);
 }catch(err){
   alert("La nouvelle séquence n’a pas pu être ajoutée : "+err.message);
 }finally{
   addLock=false;btn.disabled=false;btn.textContent='＋ Ajouter une séquence';
 }
}

async function cloneSequences(sourceId,targetId){
 const {data:srcBlocks,error:be}=await db.from('blocks').select('*').eq('emission_id',sourceId).order('position');if(be)throw be;
 const blockMap={};
 for(const b of (srcBlocks||[])){
  const {data:nb,error}=await db.from('blocks').insert({emission_id:targetId,title:b.title||'Bloc',position:b.position||0}).select().single();if(error)throw error;blockMap[b.id]=nb.id;
 }
 const {data,error}=await db.from('sequences').select('*').eq('emission_id',sourceId).order('position');if(error)throw error;
 if(!data?.length)return;
 const copies=data.map((r,i)=>({emission_id:targetId,position:i,type:r.type,direct:r.direct||'',recorded:r.recorded||'',duration_seconds:r.duration_seconds||0,who:r.who||'',block_id:r.block_id?blockMap[r.block_id]||null:null}));
 const {error:ie}=await db.from('sequences').insert(copies);if(ie)throw ie;
}

for(const [id,direction] of [['collabScrollLeft',-1],['collabScrollRight',1]]){
 const button=document.getElementById(id);if(button)button.onclick=()=>{const area=document.getElementById('collabRundownScroll');area.scrollBy({left:direction*Math.max(160,area.clientWidth*.65),behavior:'smooth'});};
}
function currentSpaceId(){return new URLSearchParams(location.search).get('space')}
async function loadSpaces(){
 const {data,error}=await db.from('spaces').select('*').order('position');
 if(error){alert("Impossible de charger les espaces : "+error.message);return []}
 return data||[];
}
function contactLink(){const email=String(APP_CONFIG.contactEmail||'').trim();return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)?'<a href="mailto:'+encodeURIComponent(email)+'">'+esc(email)+'</a>':'Contactez l’organisation qui héberge cette instance.';}
function spaceIcon(name){return name==='Presse-Info'?'📰':name==='Fluid Radio'?'📻':name==='Stou!'?'🎙️':name==='Démo'?'🧪':'📁'}
async function showSpacesHome(){
 document.querySelector('#rundownApp').style.display='none';
 const h=document.querySelector('#home');h.style.display='block';
 const spaces=await loadSpaces();
 h.innerHTML='<div class="homehead"><div><h1>Conduite Radio</h1><div class="homeintro">Un espace collaboratif pour écrire et visualiser des conducteurs radio.</div><div class="showmeta">'+esc(APP_CONFIG.organisation||'')+' · Choisissez votre espace</div></div></div><div class="spacesgrid">'+spaces.map(sp=>'<button class="spacecard" data-space="'+sp.id+'"><strong>'+spaceIcon(sp.name)+' '+esc(sp.name)+'</strong><span>Émissions et modèles</span></button>').join('')+'</div><div class="appcontact">Pour demander un espace, poser une question, faire une suggestion ou adresser un remerciement : '+contactLink()+'</div>';
 const support=homeSupportTarget('homeSupportActions')||h.querySelector('.homehead');if(support.id==='homeSupportActions')support.innerHTML='';
 if(repository?.atomic){
  try{if((await repository.list(null)).length){const unassigned=document.createElement('button');unassigned.textContent='Émissions sans espace';unassigned.onclick=()=>location.href=location.pathname+'?space=sans-espace';h.querySelector('.homehead').appendChild(unassigned);}}
  catch(error){setSyncStatus('read-error',error);}
 }
 attachTrashButton(h);
 h.querySelectorAll('[data-space]').forEach(b=>b.onclick=()=>location.href=location.pathname+'?space='+b.dataset.space+(__embedded?'&embed=1':''));
}
let spaceCreationPending=false;
let trashOpen=false;
function homeSupportTarget(id){
 let target=document.getElementById(id);if(target)return target;
 const footer=document.querySelector('.appSupport');if(!footer)return null;
 target=document.createElement(id==='homeSupportActions'?'nav':'div');target.id=id;
 if(id==='homeSupportActions')target.setAttribute('aria-label','Gestion des espaces et des émissions');
 footer.appendChild(target);return target;
}
function moveHomeContact(home){
 const target=homeSupportTarget('supportContact');if(!target)return;target.innerHTML='';
 const contact=home.querySelector('.appcontact');if(contact)target.appendChild(contact);
}
function attachTrashButton(home,spaceId=null){
 moveHomeContact(home);
 const button=document.createElement('button');button.textContent='Émissions supprimées';
 (homeSupportTarget('homeSupportActions')||home.querySelector('.homehead')).appendChild(button);
 button.onclick=async()=>{
  if(trashOpen||!repository)return;trashOpen=true;button.disabled=true;
  try{const result=await RadioTrashDialog.open({repository,spaceId});if(result.restored)await showHome();}
  catch(error){setSyncStatus('read-error',error);}
  finally{trashOpen=false;button.disabled=false;}
 };
}
async function createSpaceFromHome(){
 if(!repository||spaceCreationPending)return;
 const name=await RadioDialogs.text('Nom du nouvel espace :','');if(name===null)return;
 spaceCreationPending=true;
 try{await repository.createSpace(name);await showSpacesHome();setSyncStatus('saved')}
 catch(error){setSyncStatus('write-error',error)}
 finally{spaceCreationPending=false;}
}
async function createBlankEmission(){
 const title=prompt("Nom ou thème de l’émission :","Nouvelle émission");if(title===null)return;
 const d=prompt("Date (AAAA-MM-JJ), ou laisser vide :","");if(d===null)return;
 const t=prompt("Heure de départ (HH:MM) :","17:00");if(t===null)return;
 const time=t.trim()||'17:00';
 const {data:e,error}=await db.from('emissions').insert({theme:title.trim()||'Nouvelle émission',emission_date:d.trim()||null,start_time:time.length===5?time+':00':time,is_template:false,space_id:currentSpaceId()}).select().single();
 if(error){alert(error.message);return}
 const defaults=[
  {type:'Habillage',direct:'',recorded:'Jingle ouverture',duration_seconds:30,who:'Régie'},
  {type:'Direct',direct:'Présentation',recorded:'',duration_seconds:120,who:'Animation'},
  {type:'PAD',direct:'',recorded:'Reportage',duration_seconds:270,who:'Régie'},
  {type:'Direct',direct:'Interview',recorded:'',duration_seconds:480,who:'Animation'}
 ];
 const {error:se}=await db.from('sequences').insert(defaults.map((r,i)=>({...r,emission_id:e.id,position:i})));
 if(se){alert(se.message);return}
 location.href=location.pathname+'?emission='+e.id+'&space='+(e.space_id||currentSpaceId()||'')+(__embedded?'&embed=1':'');
}
async function duplicateEmission(source,asTemplate=false){
 const defaultName=asTemplate ? 'Modèle — '+(source.theme||'émission') : (source.theme||'Émission')+' — copie';
 const title=prompt(asTemplate?"Nom du modèle :":"Nom de la nouvelle émission :",defaultName);if(title===null)return;
 let d=null;
 if(!asTemplate){d=prompt("Date (AAAA-MM-JJ), ou laisser vide :",source.emission_date||'');if(d===null)return}
 const {data:e,error}=await db.from('emissions').insert({
   theme:title.trim()||defaultName,
   emission_date:asTemplate?null:(d.trim()||null),
   start_time:source.start_time||'17:00:00',
   is_template:asTemplate,
   space_id:source.space_id||currentSpaceId()
 }).select().single();
 if(error){alert(error.message);return}
 try{await cloneSequences(source.id,e.id)}
 catch(err){alert(err.message);return}
 if(asTemplate){alert("Modèle créé.");showHome()}
 else location.href=location.pathname+'?emission='+e.id+'&space='+(e.space_id||currentSpaceId()||'')+(__embedded?'&embed=1':'');
}
function closeModal(){document.querySelector('.modalback')?.remove()}
function chooseTemplate(templates){
 if(!templates.length){alert("Aucun modèle n’existe encore.");return}
 const back=document.createElement('div');back.className='modalback';
 back.innerHTML='<div class="modal"><div class="modalhead">Choisir un modèle <button class="modalclose">×</button></div><div class="modalbody">'+templates.map(t=>'<button class="tplchoice" data-tpl="'+t.id+'"><strong>'+esc(t.theme||'Sans titre')+'</strong><div class="showmeta">Départ '+(t.start_time||'').slice(0,5)+'</div></button>').join('')+'</div></div>';
 document.body.appendChild(back);back.querySelector('.modalclose').onclick=closeModal;back.onclick=e=>{if(e.target===back)closeModal()};
 back.querySelectorAll('[data-tpl]').forEach(btn=>btn.onclick=()=>{const tpl=templates.find(x=>x.id===btn.dataset.tpl);closeModal();createFromTemplate(tpl)});
}
async function createFromTemplate(tpl){
 const title=prompt("Nom ou thème de la nouvelle émission :",tpl.theme.replace(/^Modèle\s*[—-]\s*/i,''));if(title===null)return;
 const d=prompt("Date (AAAA-MM-JJ), ou laisser vide :","");if(d===null)return;
 const {data:e,error}=await db.from('emissions').insert({theme:title.trim()||'Nouvelle émission',emission_date:d.trim()||null,start_time:tpl.start_time||'17:00:00',is_template:false,space_id:currentSpaceId()}).select().single();
 if(error){alert(error.message);return}
 try{await cloneSequences(tpl.id,e.id)}catch(err){alert("Erreur pendant la copie : "+err.message);return}
 location.href=location.pathname+'?emission='+e.id+'&space='+(e.space_id||currentSpaceId()||'')+(__embedded?'&embed=1':'');
}
async function deleteEmission(e){
 if(!confirm('Supprimer définitivement « '+(e.theme||'Sans titre')+' » ?'))return;
 const {error}=await db.from('emissions').delete().eq('id',e.id);if(error)alert(error.message);else showHome();
}
async function showHome(){
 const support=homeSupportTarget('homeSupportActions');if(support)support.innerHTML='';
 const sid=currentSpaceId();
 if(!sid){await showSpacesHome();return}
 const spaces=await loadSpaces(), activeSpace=repository?.atomic&&sid==='sans-espace'?{id:sid,name:'Sans espace'}:spaces.find(x=>x.id===sid);
 if(!activeSpace){await showSpacesHome();return}
 document.querySelector('#rundownApp').style.display='none';
 const h=document.querySelector('#home');h.style.display='block';
 h.innerHTML='<div class="homehead"><div><h1>'+spaceIcon(activeSpace.name)+' '+esc(activeSpace.name)+'</h1><div class="showmeta">Conduite Radio · Votre organisation</div></div><button id="backSpaces">← Espaces</button><button id="newBlank" class="primary">＋ Nouvelle émission</button><button id="newFromTpl">À partir d’un modèle</button><button id="importNativeHome">Importer (.json)</button></div><div id="showlist" class="showlist"><div class="empty">Chargement…</div></div><div class="appcontact">Pour demander un espace, poser une question, faire une suggestion ou adresser un remerciement : '+contactLink()+'</div>';
 attachTrashButton(h,sid==='sans-espace'?null:sid);
 let data,error;
 if(repository?.atomic){try{data=await repository.list(sid==='sans-espace'?null:sid);}catch(e){error=e;}}
 else({data,error}=await db.from('emissions').select('*').eq('space_id',sid).order('emission_date',{ascending:true,nullsFirst:false}).order('created_at',{ascending:false}));
 const list=document.querySelector('#showlist');
 if(error){list.innerHTML='<div class="empty">Erreur : '+esc(error.message)+'</div>';return}
 const emissions=(data||[]).filter(x=>!x.is_template), templates=(data||[]).filter(x=>x.is_template);
 function item(e,isTpl){
   const d=e.emission_date?new Date(e.emission_date+'T12:00:00').toLocaleDateString('fr-BE'):(isTpl?'Modèle':'Date à définir');
   const t=(e.start_time||'').slice(0,5);
   return '<div class="showitem '+(isTpl?'templateitem':'')+'"><div><div class="showtitle">'+esc(e.theme||'Sans titre')+(isTpl?'<span class="badge">MODÈLE</span>':'')+'</div><div class="showmeta">'+d+(t?' · '+t:'')+'</div></div><div class="showdate">'+d+'</div><div class="actions2"><button data-open="'+e.id+'">Ouvrir</button><button class="menuBtn" data-menu="'+e.id+'">•••</button></div></div>'
 }
 let html='<div class="sectiontitle">Émissions</div>';
 html+=emissions.length?emissions.map(e=>item(e,false)).join(''):'<div class="empty">Aucune émission.</div>';
 html+='<div class="sectiontitle">Modèles</div>';
 html+=templates.length?templates.map(e=>item(e,true)).join(''):'<div class="empty">Aucun modèle pour le moment.</div>';
 list.innerHTML=html;
 list.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>location.href=location.pathname+'?emission='+b.dataset.open+'&space='+currentSpaceId()+(__embedded?'&embed=1':''));
 list.querySelectorAll('[data-menu]').forEach(b=>b.onclick=()=>{
   document.querySelector('.popmenu')?.remove();
   const e=data.find(x=>x.id===b.dataset.menu);if(!e)return;
   const m=document.createElement('div');m.className='popmenu';
   m.innerHTML='<button data-act="dup">⧉ Dupliquer</button><button data-act="tpl">☆ Enregistrer comme modèle</button><button data-act="del" class="danger">Supprimer</button>';
   document.body.appendChild(m);
   const r=b.getBoundingClientRect();m.style.left=Math.min(r.left,window.innerWidth-240)+'px';m.style.top=(r.bottom+5)+'px';
   m.querySelector('[data-act="dup"]').onclick=()=>{m.remove();duplicateEmission(e,false)};
   m.querySelector('[data-act="tpl"]').onclick=()=>{m.remove();duplicateEmission(e,true)};
   m.querySelector('[data-act="del"]').onclick=()=>{m.remove();deleteEmission(e)};
 });
 document.querySelector('#backSpaces').onclick=()=>location.href=location.pathname+(__embedded?'?embed=1':'');
 document.querySelector('#newBlank').onclick=createBlankEmission;
 document.querySelector('#newFromTpl').onclick=()=>chooseTemplate(templates);
 document.querySelector('#importNativeHome').onclick=(event)=>{event.preventDefault();importNativeFile()};
}

function exportRows(){
 let elapsed=0, base=start.value||'17:00';
 const rows=state.rows.map(r=>{
   const sec=secs(r.duration);
   const item={Heure:clock(base,elapsed),Type:r.type||'',Direct:r.direct||'',"PAD / Enregistré":r.recorded||'',Durée:r.duration||'',Qui:r.who||''};
   elapsed+=sec; return item;
 });
 rows.push({Heure:clock(base,elapsed),Type:'',Direct:"FIN D’ÉMISSION","PAD / Enregistré":'',Durée:'',Qui:''});
 return rows;
}
function safeFileName(){
 const raw=(theme.value||'conduite-radio')+'_'+(date.value||'');
 return raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'conduite-radio';
}
function exportMeta(){
 return {title:theme.value||'Conduite radio',date:date.value||'',start:(start.value||'').slice(0,5)};
}
function printExport(){
 const m=exportMeta(), rows=exportRows();
 const p=document.querySelector('#printSheet');
 p.innerHTML='<h1>'+esc(m.title)+'</h1><div class="printmeta">'+(m.date?esc(m.date)+' · ':'')+'Départ '+esc(m.start)+'</div>'+
 '<table><thead><tr><th>Heure</th><th>Type</th><th>Direct</th><th>PAD / Enregistré</th><th>Durée</th><th>Qui</th></tr></thead><tbody>'+
 rows.map((r,i)=>'<tr class="'+(i===rows.length-1?'finish':'')+'"><td>'+esc(r.Heure)+'</td><td>'+esc(r.Type)+'</td><td>'+esc(r.Direct)+'</td><td>'+esc(r["PAD / Enregistré"])+'</td><td>'+esc(r["Durée"])+'</td><td>'+esc(r.Qui)+'</td></tr>').join('')+
 '</tbody></table>';
 window.print();
}
function excelExport(){
 if(typeof XLSX==='undefined'){alert("Le module Excel n’a pas pu être chargé. Vérifiez la connexion internet puis réessayez.");return}
 const rows=exportRows(), m=exportMeta();
 const aoa=[
   [m.title],
   [(m.date?m.date+' · ':'')+'Départ '+m.start],
   [],
   ['Heure','Type','Direct','PAD / Enregistré','Durée','Qui'],
   ...rows.map(r=>[r.Heure,r.Type,r.Direct,r["PAD / Enregistré"],r["Durée"],r.Qui])
 ];
 const ws=XLSX.utils.aoa_to_sheet(aoa);
 ws['!cols']=[{wch:12},{wch:14},{wch:34},{wch:34},{wch:12},{wch:22}];
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,ws,'Conduite');
 XLSX.writeFile(wb,safeFileName()+'.xlsx');
}
function fixedHtmlExport(){
 const m=exportMeta(), rows=exportRows();
 const html='<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>'+esc(m.title)+'</title><style>body{font-family:Arial,sans-serif;max-width:1200px;margin:32px auto;padding:0 18px;color:#111}h1{margin-bottom:6px}.meta{color:#555;margin-bottom:22px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top}th{background:#eee}.fin{font-weight:bold}@media(max-width:700px){table{font-size:13px}th,td{padding:5px}}@media print{@page{size:A4 landscape;margin:10mm}}</style></head><body>'+
 '<h1>'+esc(m.title)+'</h1><div class="meta">'+(m.date?esc(m.date)+' · ':'')+'Départ '+esc(m.start)+'</div>'+
 '<table><thead><tr><th>Heure</th><th>Type</th><th>Direct</th><th>PAD / Enregistré</th><th>Durée</th><th>Qui</th></tr></thead><tbody>'+
 rows.map((r,i)=>'<tr class="'+(i===rows.length-1?'fin':'')+'"><td>'+esc(r.Heure)+'</td><td>'+esc(r.Type)+'</td><td>'+esc(r.Direct)+'</td><td>'+esc(r["PAD / Enregistré"])+'</td><td>'+esc(r["Durée"])+'</td><td>'+esc(r.Qui)+'</td></tr>').join('')+
 '</tbody></table></body></html>';
 const blob=new Blob([html],{type:'text/html;charset=utf-8'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=safeFileName()+'.html';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function closeExportModal(){
 document.querySelector('.exportModalBack')?.remove();
}
function openExportModal(){
 closeExportModal();
 const back=document.createElement('div');
 back.className='exportModalBack';
 back.innerHTML='<div class="exportModal" role="dialog" aria-modal="true" aria-labelledby="exportTitle">'+
 '<div class="exportModalHead"><h2 id="exportTitle">Exporter la conduite</h2><button class="exportModalClose" aria-label="Fermer">×</button></div>'+
 '<div class="exportChoices">'+
 '<button data-exp="print">🖨️ <strong>Imprimer / PDF</strong><small>Version propre A4 paysage, imprimable ou enregistrable en PDF</small></button>'+
 '<button data-exp="xlsx">📊 <strong>Excel (.xlsx)</strong><small>Conduite modifiable dans Excel ou un tableur compatible</small></button>'+
 '<button data-exp="native">💾 <strong>Conduite modifiable (.json)</strong><small>À réimporter dans Conduite Radio, avec les blocs et séquences</small></button>'+
 '<button data-exp="html">🌐 <strong>HTML fixe</strong><small>Copie autonome et figée à ouvrir dans un navigateur</small></button>'+
 '</div></div>';
 document.body.appendChild(back);
 back.querySelector('.exportModalClose').onclick=closeExportModal;
 back.onclick=e=>{if(e.target===back)closeExportModal()};
 back.querySelector('[data-exp="print"]').onclick=()=>{closeExportModal();setTimeout(printExport,50)};
 back.querySelector('[data-exp="xlsx"]').onclick=()=>{closeExportModal();excelExport()};
 back.querySelector('[data-exp="native"]').onclick=()=>{closeExportModal();exportNative()};
 back.querySelector('[data-exp="html"]').onclick=()=>{closeExportModal();fixedHtmlExport()};
}
function wireExportButton(){
 const importBtn=document.querySelector('#importNative');if(importBtn)importBtn.onclick=importNativeFile;
 const btn=document.querySelector('#exportBtn');
 if(!btn)return;
 btn.onclick=e=>{e.preventDefault();e.stopPropagation();openExportModal()};
}


const VIZ_TYPES=['Direct','Habillage','PAD','Appel','Musique','Promo'];
const VIZ_COLORS={
 'Direct':'#79b987',
 'Habillage':'#d69a52',
 'PAD':'#779bcf',
 'Appel':'#ae7ac8',
 'Musique':'#e1c83f','Promo':'#e8a0a8'
};

let vizMode='bars';

function vizData(){
 const rows=state.rows.map((r,i)=>({
   index:i,
   type:r.type||'Direct',
   seconds:secs(r.duration||'00:00'),
   direct:r.direct||'',
   recorded:r.recorded||'',
   who:r.who||'',
   block_id:r.block_id||null
 }));
 const total=rows.reduce((a,r)=>a+r.seconds,0);
 const byType={};VIZ_TYPES.forEach(t=>byType[t]=0);
 rows.forEach(r=>{if(byType[r.type]===undefined)byType[r.type]=0;byType[r.type]+=r.seconds});
 return {rows,total,byType};
}
function humanDuration(sec){
 sec=Math.max(0,Math.round(sec||0));
 const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),ss=sec%60;
 return h?`${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}
function pct(sec,total){return total?Math.round(sec/total*100):0}
function polar(cx,cy,r,angle){
 const a=(angle-90)*Math.PI/180;return {x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)};
}
function donutPath(cx,cy,ro,ri,a0,a1){
 const p0=polar(cx,cy,ro,a0),p1=polar(cx,cy,ro,a1),q1=polar(cx,cy,ri,a1),q0=polar(cx,cy,ri,a0);
 const large=(a1-a0)>180?1:0;
 return `M ${p0.x} ${p0.y} A ${ro} ${ro} 0 ${large} 1 ${p1.x} ${p1.y} L ${q1.x} ${q1.y} A ${ri} ${ri} 0 ${large} 0 ${q0.x} ${q0.y} Z`;
}
function vizLegendHTML(data){
 return '<div class="vizLegend">'+VIZ_TYPES.map(t=>'<div class="legendItem"><span class="legendSwatch" style="background:'+VIZ_COLORS[t]+'"></span><span>'+t+' · '+humanDuration(data.byType[t]||0)+' · '+pct(data.byType[t]||0,data.total)+' %</span></div>').join('')+'</div>';
}

function escapeViz(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function elapsedMMSS(sec){sec=Math.max(0,Math.round(sec||0));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')}
function shortStartTime(v){let p=String(v||'00:00').split(':');return String(p[0]||'00').padStart(2,'0')+':'+String(p[1]||'00').padStart(2,'0')}
function renderVizBars(){
 const data=vizData(),max=Math.max(1,...VIZ_TYPES.map(t=>data.byType[t]||0));
 const bars=VIZ_TYPES.map(t=>{
   const v=data.byType[t]||0,h=v?Math.max(2,v/max*100):0;
   return '<div class="barItem"><div class="barValue">'+humanDuration(v)+'<br><span style="font-weight:400">'+pct(v,data.total)+' %</span></div><div class="barRect" style="height:'+h+'%;background:'+VIZ_COLORS[t]+'"></div><div class="barLabel">'+t+'</div></div>';
 }).join('');
 document.querySelector('#vizPanel').innerHTML='<h3 class="vizEmissionTitle">'+escapeViz(theme.value||'Sans titre')+'</h3><div class="barChart">'+bars+'</div>'+vizLegendHTML(data)+'<div class="vizNote">Hauteur = durée cumulée de chaque type · Durée totale : '+humanDuration(data.total)+'</div>';
}
function renderVizClock(){
 const data=vizData(),cx=300,cy=300,ro=220,ri=132;
 if(!data.total){
   document.querySelector('#vizPanel').innerHTML='<h3 class="vizEmissionTitle">'+escapeViz(theme.value||'Sans titre')+'</h3><div class="empty">Aucune durée à visualiser.</div>';return;
 }
 let elapsed=0,paths='',labels='',lastLabelAngle=-999;
 const blockBoundarySecs=new Set();
 let _be=0,_prev=null;
 data.rows.forEach((r,i)=>{
   const bid=r.block_id||null;
   if(i>0 && bid!==_prev && (bid||_prev)) blockBoundarySecs.add(Math.round(_be));
   _be+=r.seconds; _prev=bid;
 });
 blockBoundarySecs.delete(0);
 blockBoundarySecs.delete(Math.round(data.total));
 // Block boundaries have absolute priority over sequence time labels.
 const priorityBlockBoundaries=new Set();
 let _cursor=0,_run=null,_runsForPriority=[];
 data.rows.forEach(r=>{
   const _begin=_cursor,_end=_cursor+r.seconds;
   if(r.block_id && r.seconds>0){
     if(_run && _run.id===r.block_id && Math.abs(_run.end-_begin)<0.001) _run.end=_end;
     else { if(_run)_runsForPriority.push(_run); _run={id:r.block_id,start:_begin,end:_end}; }
   } else if(_run){ _runsForPriority.push(_run); _run=null; }
   _cursor=_end;
 });
 if(_run)_runsForPriority.push(_run);
 _runsForPriority.forEach(br=>{
   if(Math.round(br.start)>0) priorityBlockBoundaries.add(Math.round(br.start));
   if(Math.round(br.end)<Math.round(data.total)) priorityBlockBoundaries.add(Math.round(br.end));
 });

 data.rows.forEach((r,i)=>{
   if(r.seconds<=0)return;
   const a0=elapsed/data.total*360,a1=(elapsed+r.seconds)/data.total*360;
   const label=(r.direct||r.recorded||r.type).replace(/"/g,'&quot;');
   paths+='<path class="clockSeg" d="'+donutPath(cx,cy,ro,ri,a0,a1)+'" fill="'+(VIZ_COLORS[r.type]||'#999')+'" stroke="#fff" stroke-width="2" data-tip="'+clock(start.value||'00:00:00',elapsed)+' — '+escapeViz(r.type)+' — '+label+' — '+humanDuration(r.seconds)+'"></path>';
   // Label each segment start as elapsed mm:ss, except the first one:
   // the top label is the real show start time.
   if(elapsed>0 && elapsed<data.total &&
      ![...priorityBlockBoundaries].some(bs=>Math.abs(bs-Math.round(elapsed))<=20)){
     const angle=a0;
     // Avoid unreadable collisions for very close segment starts.
     if(angle-lastLabelAngle>=7){
       const p1=polar(cx,cy,264,angle),p2=polar(cx,cy,274,angle);
       let pt=polar(cx,cy,292,angle),anchor='middle';
       // Zone de sécurité autour de 12 h : l'heure réelle reste seule au sommet.
       // Les premiers repères écoulés sont déportés latéralement avec un trait de rappel.
       const topDistance=Math.min(angle,360-angle);
       if(topDistance<18){
         const side=angle<=180?1:-1;
         pt={x:p2.x+(side*48),y:p2.y+8};
         anchor=side>0?'start':'end';
         labels+='<line class="clockTick" x1="'+p2.x+'" y1="'+p2.y+'" x2="'+pt.x+'" y2="'+(pt.y-4)+'"></line>';
       }
       labels+='<line class="clockTick" x1="'+p1.x+'" y1="'+p1.y+'" x2="'+p2.x+'" y2="'+p2.y+'"></line><text class="clockTickText" text-anchor="'+anchor+'" x="'+pt.x+'" y="'+pt.y+'">'+elapsedMMSS(elapsed)+'</text>';
       lastLabelAngle=angle;
     }
   }
   elapsed+=r.seconds;
 });
 // V17 — stable: thick grayscale outer ring with explicit boundaries.
 // Build contiguous runs from the canonical sequence order. Unblocked sequences have no outer arc.
 let blockPaths='',blockLabels='',blockBoundaryLabels='';
 const blockBoundarySeen=new Set();
 let lastBlockBoundaryAngle=-999;
 let cursor=0,run=null,runs=[];
 data.rows.forEach(r=>{
   const begin=cursor,end=cursor+r.seconds;
   if(r.block_id && r.seconds>0){
     if(run && run.id===r.block_id && Math.abs(run.end-begin)<0.001) run.end=end;
     else { if(run)runs.push(run); run={id:r.block_id,start:begin,end:end}; }
   }else if(run){runs.push(run);run=null}
   cursor=end;
 });
 if(run)runs.push(run);
 const blockDefs='';
 const BLOCK_GRAYS=['#f1f1f1','#d8d8d8','#bdbdbd','#9f9f9f','#7f7f7f','#626262'];
 runs.forEach((br,bi)=>{
   const b=blockById(br.id);if(!b||br.end<=br.start)return;
   const a0=br.start/data.total*360,a1=br.end/data.total*360,mid=(a0+a1)/2;
   const dur=br.end-br.start,title=b.title||'Bloc';
   const gi=Math.max(0,blocks.findIndex(x=>x.id===br.id))%BLOCK_GRAYS.length;
   const gray=BLOCK_GRAYS[gi];
   // Thick grayscale block ring, visually separate from sequence colors.
   blockPaths+='<path class="clockBlockArc" fill="'+gray+'" d="'+donutPath(cx,cy,258,226,a0,a1)+'" data-tip="Bloc : '+escapeViz(title)+' — '+humanDuration(dur)+'"></path>';

   // Strong start/end boundaries extending across the block ring.
   const bs0=polar(cx,cy,220,a0), be0=polar(cx,cy,267,a0);
   const bs1=polar(cx,cy,220,a1), be1=polar(cx,cy,267,a1);
   blockPaths+='<line x1="'+bs0.x+'" y1="'+bs0.y+'" x2="'+be0.x+'" y2="'+be0.y+'" stroke="#111" stroke-width="4"></line>'+
              '<line x1="'+bs1.x+'" y1="'+bs1.y+'" x2="'+be1.x+'" y2="'+be1.y+'" stroke="#111" stroke-width="4"></line>';

   // Exact block start/end times, positioned outside the block ring.
   // Block boundaries use elapsed mm:ss, just like sequence markers.
   // The very first block starts at 00:00, which is intentionally not labelled.
   const elapsedMMSS=(sec)=>{
     const n=Math.max(0,Math.round(sec));
     return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
   };
   const addBoundary=(sec,ang)=>{
     const rounded=Math.round(sec);
     if(rounded===0 || rounded===Math.round(data.total))return;
     const key=String(rounded);
     if(!blockBoundarySeen.has(key)){
       blockBoundarySeen.add(key);
       const close=Math.abs(ang-lastBlockBoundaryAngle)<8;
       const p=polar(cx,cy,close?330:310,ang);
       blockBoundaryLabels+='<text x="'+p.x+'" y="'+p.y+'" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="800" fill="#111" paint-order="stroke" stroke="#fff" stroke-width="4">'+elapsedMMSS(sec)+'</text>';
       lastBlockBoundaryAngle=ang;
     }
   };
   addBoundary(br.start,a0);
   addBoundary(br.end,a1);

   // Block title farther away, connected from the middle of the block.
   const edge=polar(cx,cy,264,mid),bend=polar(cx,cy,350,mid);
   const right=Math.cos((mid-90)*Math.PI/180)>=0;
   const labelX=bend.x+(right?68:-68),labelY=bend.y;
   const safeTitle=escapeViz(title), badgeW=Math.max(104,Math.min(210,46+title.length*6.6));
   const rectX=labelX-badgeW/2,rectY=labelY-14;
   blockLabels+='<path class="clockBlockLeader" d="M '+edge.x+' '+edge.y+' L '+bend.x+' '+bend.y+' L '+labelX+' '+labelY+'"></path>'+
    '<rect x="'+rectX+'" y="'+rectY+'" width="'+badgeW+'" height="28" rx="6" fill="#fff" stroke="#333" stroke-width="1.8"></rect>'+
    '<text class="clockBlockLabel" x="'+labelX+'" y="'+labelY+'">'+safeTitle+'</text>';
 });
 // Start marker: actual show start time, displayed once at the top.
 const svg='<div class="clockWrap"><svg class="clockSvg" viewBox="-180 -180 960 960" aria-label="Horloge de l’émission">'+blockDefs+paths+blockPaths+blockBoundaryLabels+blockLabels+labels+
 '<text class="clockCenterTitle" x="300" y="292">'+humanDuration(data.total)+'</text><text class="clockCenterSub" x="300" y="322">durée totale</text></svg></div>';
 document.querySelector('#vizPanel').innerHTML='<h3 class="vizEmissionTitle">'+escapeViz(theme.value||'Sans titre')+'</h3>'+svg+vizLegendHTML(data)+'';
 const tip=document.querySelector('#vizTooltip');
 document.querySelectorAll('.clockSeg,.clockBlockArc').forEach(seg=>{
   seg.onmousemove=e=>{tip.textContent=seg.dataset.tip;tip.style.display='block';tip.style.left=Math.min(e.clientX+12,window.innerWidth-300)+'px';tip.style.top=(e.clientY+12)+'px'};
   seg.onmouseleave=()=>tip.style.display='none';
 });
}
function renderViz(){
 document.querySelectorAll('.vizTabs button').forEach(b=>b.classList.toggle('active',b.dataset.viz===vizMode));
 if(vizMode==='clock')renderVizClock();else renderVizBars();
}
function closeViz(){
 document.body.classList.remove('vizPrinting');
 document.querySelector('.vizBack')?.remove();
 document.querySelector('#vizTooltip')?.remove();
}
function openViz(){
 closeViz();
 const back=document.createElement('div');back.className='vizBack';
 back.innerHTML='<div class="vizModal" role="dialog" aria-modal="true"><div class="vizHead"><h2>Visualiser la conduite</h2><button id="vizPrint">Imprimer cette vue</button><button id="vizClose">×</button></div>'+
 '<div class="vizTabs"><button data-viz="bars">Répartition par type</button><button data-viz="clock">Horloge de l’émission</button></div><div id="vizPanel" class="vizPanel"></div></div>';
 document.body.appendChild(back);
 const tip=document.createElement('div');tip.id='vizTooltip';tip.className='vizTooltip';document.body.appendChild(tip);
 back.querySelector('#vizClose').onclick=closeViz;
 back.onclick=e=>{if(e.target===back)closeViz()};
 back.querySelectorAll('[data-viz]').forEach(b=>b.onclick=()=>{vizMode=b.dataset.viz;renderViz()});
 back.querySelector('#vizPrint').onclick=()=>{document.body.classList.add('vizPrinting');window.print();setTimeout(()=>document.body.classList.remove('vizPrinting'),300)};
 renderViz();
}
function wireVizButton(){
 const b=document.querySelector('#visualizeBtn');if(b)b.onclick=e=>{e.preventDefault();openViz()};
}
async function ensureEmission(){
 if(emissionId)return true;
 await showHome();return false;
}

async function createBlock(){
 if(!emissionId)return;
 const title=prompt("Nom du bloc :","Bloc A");if(title===null)return;
 syncLock=true;editLock=true;
 try{
  const {error}=await db.from('blocks').insert({emission_id:emissionId,title:title.trim()||'Bloc',position:blocks.length});
  if(error)throw error;
 }catch(err){alert("Le bloc n’a pas pu être créé : "+err.message)}
 finally{syncLock=false;editLock=false;await pullRemote(true)}
}
async function assignSequenceToBlock(i,blockId){
 const moving=state.rows[i];if(!moving||!moving.id||reorderLock)return;
 const oldBlock=moving.block_id||null;
 if(oldBlock===blockId)return;

 reorderLock=true;syncLock=true;editLock=true;
 try{
  // Rebuild the canonical flattened order before writing anything.
  const without=state.rows.filter(r=>r.id!==moving.id);
  let ordered;

  if(blockId){
    // Joining a block: insert at the END of that block so the block stays contiguous.
    const memberIndexes=[];
    without.forEach((r,idx)=>{if(r.block_id===blockId)memberIndexes.push(idx)});
    if(memberIndexes.length){
      const insertAt=memberIndexes[memberIndexes.length-1]+1;
      ordered=[...without.slice(0,insertAt),moving,...without.slice(insertAt)];
    }else{
      // Empty block: keep the sequence close to its previous location.
      const insertAt=Math.min(i,without.length);
      ordered=[...without.slice(0,insertAt),moving,...without.slice(insertAt)];
    }
  }else{
    // Leaving a block: keep the sequence at approximately the same place,
    // but place it just AFTER its former block so that block remains contiguous.
    const formerIndexes=[];
    without.forEach((r,idx)=>{if(r.block_id===oldBlock)formerIndexes.push(idx)});
    const insertAt=formerIndexes.length ? formerIndexes[formerIndexes.length-1]+1 : Math.min(i,without.length);
    ordered=[...without.slice(0,insertAt),moving,...without.slice(insertAt)];
  }

  // Change membership first while realtime is locked.
  let q=await db.from('sequences').update({block_id:blockId}).eq('id',moving.id).eq('emission_id',emissionId);
  if(q.error)throw q.error;

  // Then persist one authoritative contiguous order.
  for(let p=0;p<ordered.length;p++){
    q=await db.from('sequences').update({position:-(p+1)}).eq('id',ordered[p].id).eq('emission_id',emissionId);
    if(q.error)throw q.error;
  }
  for(let p=0;p<ordered.length;p++){
    q=await db.from('sequences').update({position:p}).eq('id',ordered[p].id).eq('emission_id',emissionId);
    if(q.error)throw q.error;
  }

  // Keep block.position coherent for both affected blocks.
  const affected=[oldBlock,blockId].filter(Boolean);
  for(const bid of [...new Set(affected)]){
    const first=ordered.findIndex(r=>(r.id===moving.id?blockId:r.block_id)===bid);
    if(first>=0){
      q=await db.from('blocks').update({position:first}).eq('id',bid).eq('emission_id',emissionId);
      if(q.error)throw q.error;
    }
  }
 }catch(err){
  alert("Le changement de bloc n’a pas pu être enregistré : "+err.message);
 }finally{
  syncLock=false;reorderLock=false;editLock=false;
  await pullRemote(true);
 }
}
async function deleteBlock(id){
 const b=blockById(id);if(!b)return;
 if(!confirm('Supprimer le bloc « '+(b.title||'Bloc')+' » ? Les séquences seront conservées sans bloc.'))return;
 syncLock=true;editLock=true;
 try{
  const {error:u}=await db.from('sequences').update({block_id:null}).eq('emission_id',emissionId).eq('block_id',id);if(u)throw u;
  const {error}=await db.from('blocks').delete().eq('id',id).eq('emission_id',emissionId);if(error)throw error;
 }catch(err){alert("Le bloc n’a pas pu être supprimé : "+err.message)}
 finally{syncLock=false;editLock=false;collapsedBlocks.delete(id);await pullRemote(true)}
}
async function duplicateBlock(id){
 const b=blockById(id);if(!b)return;
 const members=state.rows.filter(r=>r.block_id===id);
 syncLock=true;editLock=true;
 try{
  const {data:nb,error}=await db.from('blocks').insert({emission_id:emissionId,title:(b.title||'Bloc')+' — copie',position:(b.position??blocks.length)+1}).select().single();if(error)throw error;
  if(members.length){
   const copies=members.map((r,k)=>({emission_id:emissionId,position:state.rows.length+k,type:r.type,direct:r.direct||'',recorded:r.recorded||'',duration_seconds:secs(r.duration),who:r.who||'',block_id:nb.id}));
   const {error:ie}=await db.from('sequences').insert(copies);if(ie)throw ie;
  }
 }catch(err){alert("Le bloc n’a pas pu être dupliqué : "+err.message)}
 finally{syncLock=false;editLock=false;await pullRemote(true)}
}
async function moveSequenceReliable(index,dir){
 if(!emissionId||reorderLock)return;
 const target=index+dir;
 if(target<0||target>=state.rows.length)return;
 const a=state.rows[index],b=state.rows[target];
 if(!a?.id||!b?.id)return;
 reorderLock=true;syncLock=true;editLock=true;
 try{
   // Give the moving row a temporary position, then atomically establish the requested order.
   // This avoids transient duplicate positions and realtime races during the swap.
   let res=await db.from('sequences').update({position:-1}).eq('id',a.id).eq('emission_id',emissionId);
   if(res.error)throw res.error;
   res=await db.from('sequences').update({position:index}).eq('id',b.id).eq('emission_id',emissionId);
   if(res.error)throw res.error;
   res=await db.from('sequences').update({position:target}).eq('id',a.id).eq('emission_id',emissionId);
   if(res.error)throw res.error;
 }catch(err){
   alert("Le déplacement n’a pas pu être enregistré : "+err.message);
 }finally{
   syncLock=false;reorderLock=false;editLock=false;
   await pullRemote(true);
 }
}
async function moveBlock(id,dir){
 if(!emissionId||reorderLock)return;
 const units=[],seen=new Set();
 state.rows.forEach(r=>{
   if(r.block_id){
     if(!seen.has(r.block_id)){
       seen.add(r.block_id);
       units.push({kind:'block',id:r.block_id,rows:state.rows.filter(x=>x.block_id===r.block_id)});
     }
   }else units.push({kind:'sequence',id:r.id,rows:[r]});
 });
 const ui=units.findIndex(u=>u.kind==='block'&&u.id===id),ti=ui+dir;
 if(ui<0||ti<0||ti>=units.length)return;
 [units[ui],units[ti]]=[units[ti],units[ui]];
 const ordered=units.flatMap(u=>u.rows);
 reorderLock=true;syncLock=true;editLock=true;
 try{
   for(let i=0;i<ordered.length;i++){
     const q=await db.from('sequences').update({position:-(i+1)}).eq('id',ordered[i].id).eq('emission_id',emissionId);
     if(q.error)throw q.error;
   }
   for(let i=0;i<ordered.length;i++){
     const q=await db.from('sequences').update({position:i}).eq('id',ordered[i].id).eq('emission_id',emissionId);
     if(q.error)throw q.error;
   }
   for(const u of units.filter(x=>x.kind==='block')){
     const first=ordered.findIndex(r=>r.block_id===u.id);
     const q=await db.from('blocks').update({position:first}).eq('id',u.id).eq('emission_id',emissionId);
     if(q.error)throw q.error;
   }
 }catch(err){alert("Le déplacement du bloc n’a pas pu être enregistré : "+err.message)}
 finally{syncLock=false;reorderLock=false;editLock=false;await pullRemote(true)}
}
async function persistOrder(){
 if(!emissionId || reorderLock)return;
 reorderLock=true; syncLock=true;
 try{
   // Persist every row's current visual position before accepting realtime refreshes.
   for(let i=0;i<state.rows.length;i++){
     const r=state.rows[i];
     if(r.id){
       const {error}=await db.from('sequences').update({position:i}).eq('id',r.id).eq('emission_id',emissionId);
       if(error)throw error;
     }
   }
 }catch(err){
   alert("Le déplacement n’a pas pu être enregistré : "+err.message);
 }finally{
   syncLock=false; reorderLock=false;
   await pullRemote();
 }
}
function makeNative(){
 return RadioSupabaseRepository.native({
  emission:{theme:theme.value,emission_date:date.value||null,start_time:start.value||state.start||'17:00:00',is_template:currentIsTemplate},
  blocks,
  sequences:state.rows.map(r=>({type:r.type,direct:r.direct||'',recorded:r.recorded||'',who:r.who||'',duration_seconds:secs(r.duration),block_id:r.block_id||null}))
 });
}
function setSyncStatus(status,error){
 const el=document.querySelector('#syncStatus');if(!el)return;
 const panel=document.querySelector('.syncPanel');if(panel){panel.dataset.state=status;if(status==='write-error'||status==='read-error')panel.open=true;}
 el.textContent=({saving:'Enregistrement…',saved:'Modifications enregistrées',loaded:'Conducteur à jour',pending:'Modifications en cours', 'read-error':'Chargement impossible — copie affichée conservée','write-error':'Modifications non enregistrées — réessayez ou exportez votre copie'})[status]||status;
 if(error)el.textContent+=' : '+(['PT409','40001'].includes(error.code)?'Conflit de version. Exportez votre copie locale, puis rechargez le conducteur.':error.message);
}
function backupCurrent(){
 if(!emissionId)return;
 try{localStorage.setItem('conduite-radio-v19-draft:'+emissionId,RadioCore.nativeText(makeNative()))}
 catch(error){const el=document.querySelector('#backupStatus');if(el)el.textContent='Copie locale indisponible : '+error.message;}
}
function markLocalChange(){localDirty=true;remoteSync.changed();setSyncStatus('pending');backupCurrent();}
function applyRemoteSnapshot(snapshot){
 repository?.accept(snapshot);
 const {emission:e,sequences:r,blocks:bs}=snapshot;
 blocks=bs;currentIsTemplate=!!e.is_template;
 theme.value=e.theme||'';date.value=e.emission_date||'';start.value=(e.start_time||'17:00:00').slice(0,8);
 state={start:start.value,theme:theme.value,date:date.value,rows:r.map(x=>({id:x.id,type:x.type,direct:x.direct,recorded:x.recorded,duration:secFmt(x.duration_seconds),who:x.who,block_id:x.block_id||null}))};
 remoteRows=r;render();localDirty=false;document.querySelector('#rundownApp').inert=false;
 document.querySelector('#remoteHistory').disabled=false;
}
async function showRemoteHistory(){
 if(!repository||!emissionId||historyOpen||structureCount)return;
 for(const field of document.querySelectorAll('#rundownApp input,#rundownApp select,#rundownApp textarea')){
  if(!field.checkValidity()){field.reportValidity();return;}
 }
 const editor=document.querySelector('#rundownApp');let restored=false,needsReload=false;
 historyOpen=true;remoteSync.changed();editor.inert=true;
 try{
  await saveEmissionMeta();await remoteSync.flush();backupCurrent();
  const outcome=await RadioCollaborationHistory.open({repository,emissionId,
    restore:(version,revision)=>remoteSync.write('history:restore',()=>repository.restoreVersion(emissionId,version,revision),{retryable:false})});
  restored=outcome.restored;needsReload=!!outcome.attempted;
  if(restored){
   editLock=false;localDirty=false;
   document.querySelector('#backupStatus').textContent=outcome.result.space_missing?'Version restaurée. Son espace n’existe plus : elle est conservée sans espace.':'Version restaurée ; l’état remplacé reste dans l’historique.';
  }
 }catch(error){setSyncStatus('write-error',error);}
 finally{
  historyOpen=false;const loaded=await pullRemote();
  if(!needsReload&&!loaded)editor.inert=false;
 }
}
document.querySelector('#remoteHistory').onclick=showRemoteHistory;
async function pullRemote(){
 if(!emissionId||!repository)return false;
 return remoteSync.requestRefresh();
}
function secFmt(n){n=Number(n)||0;return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
// La sauvegarde locale ne déclenche plus d'écrasement global ni de suppression distante.
const originalSave=save;
async function startCollab(){
 if(!collaborationEnabled){
  document.querySelector('.hint').textContent='Préparation V19 déconnectée · copie de démonstration locale';
  for(const id of ['homeBtn','addBlock','importNative','remoteHistory']){
   const button=document.getElementById(id);button.disabled=true;button.title='Fonction en cours de préparation dans cette version déconnectée.';
  }
  return;
 }
 setSyncStatus('Mode collaboratif');
 if(!(await ensureEmission()))return;
 try{if(localStorage.getItem('conduite-radio-v19-draft:'+emissionId))document.querySelector('#backupStatus').textContent='Une sauvegarde locale existe pour cette émission ; exportez-la si nécessaire.'}catch(error){document.querySelector('#backupStatus').textContent='Stockage local indisponible.'}
 document.querySelector('#rundownApp').inert=true;await pullRemote();
 channel=db.channel('radio-'+emissionId)
 .on('postgres_changes',{event:'*',schema:'public',table:'emissions',filter:'id=eq.'+emissionId},()=>pullRemote())
 .on('postgres_changes',{event:'*',schema:'public',table:'sequences',filter:'emission_id=eq.'+emissionId},()=>pullRemote())
 .on('postgres_changes',{event:'*',schema:'public',table:'blocks',filter:'emission_id=eq.'+emissionId},()=>pullRemote()).subscribe(status=>{
   const el=document.querySelector('#realtimeStatus');if(el)el.textContent=status==='SUBSCRIBED'?'Temps réel connecté':'Temps réel : '+status;
   if(status==='SUBSCRIBED')pullRemote();
 });
 let b=document.createElement('button');b.textContent='Copier le lien';b.onclick=async()=>{
 const u=new URL(location.href);u.searchParams.delete('embed');
 await navigator.clipboard.writeText(u.toString());
 b.textContent='Lien copié ✓';setTimeout(()=>b.textContent='Copier le lien',1500)
};document.querySelector('.footer').insertBefore(b,document.querySelector('.hint'));
}

// V11.1 — persistance explicite des métadonnées de l'émission
let __metaTimer=null;
let pendingMeta={};
async function saveEmissionMeta(){
 clearTimeout(__metaTimer);
 if(!emissionId)return;
 if(syncLock){__metaTimer=setTimeout(()=>saveEmissionMeta().catch(error=>setSyncStatus('write-error',error)),250);return;}
 const patch=pendingMeta;pendingMeta={};
 const writes=Object.entries(patch).map(([key,value])=>remoteSync.write('meta:'+key,()=>repository.updateEmission(emissionId,{[key]:value})));
 const results=await Promise.allSettled(writes);
 const failure=results.find(x=>x.status==='rejected');if(failure)throw failure.reason;
}
function queueEmissionMeta(id){
 if(!emissionId)return;
 const field={theme:'theme',date:'emission_date',start:'start_time'}[id];if(!field)return;
 pendingMeta[field]=id==='date'?(date.value||null):id==='start'?(start.value||'00:00:00'):theme.value;
 markLocalChange();clearTimeout(__metaTimer);
 __metaTimer=setTimeout(()=>saveEmissionMeta().catch(error=>setSyncStatus('write-error',error)),250);
}
[theme,date,start].forEach(el=>{
 el.addEventListener('input',()=>queueEmissionMeta(el.id));
 for(const event of ['change','blur'])el.addEventListener(event,()=>saveEmissionMeta().catch(error=>setSyncStatus('write-error',error)));
});
document.querySelector('#homeBtn').onclick=async()=>{
 try{await saveEmissionMeta();await remoteSync.flush();location.href=location.pathname+(currentSpaceId()?'?space='+currentSpaceId():'')}
 catch(error){setSyncStatus('write-error',error)}
};
document.querySelector('#retrySync').onclick=async()=>{
 try{await saveEmissionMeta();await remoteSync.retryFailed();await pullRemote()}catch(error){setSyncStatus('write-error',error)}
};
document.querySelector('#reloadRemote').onclick=async()=>{
 if(!emissionId)return;
 if(!confirm('Recharger le serveur et abandonner les modifications non enregistrées ? Exportez votre copie avant de continuer.'))return;
 clearTimeout(__metaTimer);pendingMeta={};await remoteSync.flush().catch(()=>{});
 editLock=false;localDirty=false;await remoteSync.discardFailed();await pullRemote();
};
document.querySelector('#exportDraft').onclick=()=>{
 try{const text=localStorage.getItem('conduite-radio-v19-draft:'+emissionId);if(!text)throw Error('Aucune sauvegarde locale pour cette émission.');const data=JSON.parse(text);RadioCore.validateNative(data);downloadNative(data,'sauvegarde-locale')}
 catch(error){setSyncStatus('read-error',error)}
};
window.addEventListener('online',()=>pullRemote());
window.addEventListener('beforeunload',event=>{
 if(emissionId&&(localDirty||structureCount||remoteSync.writes||remoteSync.failures.size||Object.keys(pendingMeta).length)){backupCurrent();event.preventDefault();event.returnValue='';}
});
// Sérialisation des actions de structure dans cet onglet. L'atomicité multi-utilisateur
// exige encore les futures fonctions transactionnelles Supabase.
function runStructure(operation){
 if(structureCount)return structureTail;
 structureCount++;remoteSync.changed();document.querySelector('#rundownApp').inert=true;
 let started=false,operationError=null;
 const result=structureTail.then(async()=>{
   await saveEmissionMeta();await remoteSync.flush();backupCurrent();started=true;return operation();
 }).catch(error=>{operationError=error;setSyncStatus('write-error',error)}).finally(async()=>{
   structureCount--;
   if(!structureCount){
     await pullRemote();
     if(operationError)setSyncStatus('write-error',operationError);
     if(!emissionId||!started)document.querySelector('#rundownApp').inert=false;
   }
 });
 structureTail=result;return result;
}
function structuralRowAction(operation){
 return (index,...args)=>{
   const selected=state.rows[index];if(!selected)return Promise.resolve();
   return runStructure(()=>{
     const current=state.rows.findIndex(r=>selected.id?r.id===selected.id:r===selected);
     if(current<0)return;return operation(current,...args);
   });
 };
}
function structuralAction(operation){return (...args)=>runStructure(()=>operation(...args));}
installAtomicActions();
deleteSequence=structuralRowAction(deleteSequence);
duplicateSequence=structuralRowAction(duplicateSequence);
moveSequenceReliable=structuralRowAction(moveSequenceReliable);
assignSequenceToBlock=structuralRowAction(assignSequenceToBlock);
addSequenceReliable=structuralAction(addSequenceReliable);
createBlock=structuralAction(createBlock);
deleteBlock=structuralAction(deleteBlock);
duplicateBlock=structuralAction(duplicateBlock);
moveBlock=structuralAction(moveBlock);
persistOrder=structuralAction(persistOrder);
wireExportButton();wireVizButton();render();startCollab().catch(error=>setSyncStatus('read-error',error));

// V18.1 — échange natif portable. Identifiants internes exclus du fichier.
const NATIVE_FORMAT='conduite-radio';
function downloadNative(data,name=safeFileName()){
 const blob=new Blob([RadioCore.nativeText(RadioCore.validateNative(data))],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'.conduite.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function exportNative(){
 try{downloadNative(makeNative())}catch(error){alert('Export impossible : '+error.message)}
}
function importNativeFile(){
 const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
 // Safari: le sélecteur de fichiers doit être rattaché au document.
 input.style.position='fixed';input.style.left='-9999px';document.body.appendChild(input);
 input.onchange=async()=>{
  input.remove();
  const file=input.files?.[0];if(!file)return;
  try{
   if(file.size>2*1024*1024)throw Error('Fichier trop volumineux (maximum 2 Mo).');
   const data=JSON.parse(await file.text());
   RadioCore.validateNative(data);
   const m=data.emission;
   const sid=currentSpaceId();if(!sid)throw Error('Choisissez d’abord un espace de destination.');
   const title=prompt('Nom de la nouvelle émission importée :',m.theme||'Émission importée');if(title===null)return;
   if(!confirm('Créer une nouvelle émission dans cet espace ? Aucune émission existante ne sera remplacée.'))return;
   const {data:e,error}=await db.from('emissions').insert({theme:title.trim()||'Émission importée',emission_date:m.emission_date||null,start_time:m.start_time,is_template:false,space_id:sid}).select().single();if(error)throw error;
   try{
    const map=Object.create(null);
    for(const b of data.blocks){const x=await db.from('blocks').insert({emission_id:e.id,title:b.title,position:Number.isInteger(b.position)?b.position:0}).select().single();if(x.error)throw x.error;map[b.key]=x.data.id}
    if(data.sequences.length){const rows=data.sequences.map((r,i)=>({emission_id:e.id,position:i,type:r.type,direct:r.direct,recorded:r.recorded,duration_seconds:r.duration_seconds,who:r.who,block_id:r.block_key?map[r.block_key]:null}));
     for(let i=0;i<rows.length;i+=100){const x=await db.from('sequences').insert(rows.slice(i,i+100));if(x.error)throw x.error}}
   }catch(inner){await db.from('emissions').delete().eq('id',e.id);throw inner}
   location.href=location.pathname+'?emission='+e.id+'&space='+sid+(__embedded?'&embed=1':'');
  }catch(e){alert('Import impossible : '+e.message)}
 };
 input.click();
}
