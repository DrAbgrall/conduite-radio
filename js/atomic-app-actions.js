/* Pont progressif vers l'éditeur historique. Appelé après l'initialisation de ses variables. */
function installAtomicActions(){
 if(typeof RadioExports!=='undefined'){
  const download=(bytes,type,suffix)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type}));a.download=safeFileName()+suffix;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),30000);};
  excelExport=()=>download(RadioExports.xlsx(makeNative()),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.xlsx');
  fixedHtmlExport=()=>download(RadioExports.html(makeNative()),'text/html;charset=utf-8','.html');
  printExport=()=>{
   let frame=document.getElementById('commonPrintFrame');
   if(!frame){frame=document.createElement('iframe');frame.id='commonPrintFrame';frame.title='Impression du conducteur';frame.setAttribute('sandbox','allow-same-origin allow-modals');frame.style.position='fixed';frame.style.width='1px';frame.style.height='1px';frame.style.left='-9999px';document.body.appendChild(frame);}
   frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print();};frame.srcdoc=RadioExports.html(makeNative());
  };
 }
 if(!repository?.atomic)return;
 const edit=(action,args)=>repository.structure(emissionId,action,args);
 deleteSequence=async i=>{const row=state.rows[i];if(row&&await RadioDialogs.confirm('Supprimer cette séquence ?'))return edit('remove',{id:row.id});};
 duplicateSequence=async i=>edit('duplicate',{id:state.rows[i].id});
 moveSequenceReliable=async(i,direction)=>edit('move',{id:state.rows[i].id,direction});
 assignSequenceToBlock=async(i,blockId)=>edit('assign',{id:state.rows[i].id,blockId});
 addSequenceReliable=async()=>edit('add');
 createBlock=async()=>{const title=await RadioDialogs.text('Nom du bloc :','Bloc');if(title!==null)return edit('addBlock',{title:title.trim()||'Bloc'});};
 deleteBlock=async id=>{const b=blockById(id);if(b&&await RadioDialogs.confirm('Supprimer « '+b.title+' » ? Ses séquences seront conservées sans bloc.'))return edit('removeBlock',{id});};
 duplicateBlock=async id=>edit('duplicateBlock',{id});
 moveBlock=async(id,direction)=>edit('moveBlock',{id,direction});
 persistOrder=async()=>edit('order',{ids:state.rows.map(r=>r.id)});
 const spaceValue=()=>currentSpaceId()==='sans-espace'?null:currentSpaceId();
 const navigate=snapshot=>{location.href=location.pathname+'?emission='+encodeURIComponent(snapshot.emission.id)+'&space='+encodeURIComponent(snapshot.emission.space_id||'sans-espace')+(__embedded?'&embed=1':'');};
 let busy=false;
 const homeAction=operation=>async(...args)=>{
  if(busy)return;busy=true;
  try{return await operation(...args);}catch(error){setSyncStatus('write-error',error);alert(['PT409','40001'].includes(error.code)?'Le conducteur a changé. Actualisez la liste avant de recommencer.':error.message);}
  finally{busy=false;}
 };
 async function details(initial){
  const title=await RadioDialogs.text('Nom de l’émission :',initial.theme||'Nouvelle émission');if(title===null)return null;
  const date=await RadioDialogs.text('Date (AAAA-MM-JJ), ou laisser vide :',initial.emission_date||'');if(date===null)return null;
  const time=await RadioDialogs.text('Heure de départ (HH:MM ou HH:MM:SS) :',initial.start_time||'17:00:00');if(time===null)return null;
  const result={...initial,theme:title.trim()||'Nouvelle émission',emission_date:date.trim()||null,start_time:time.trim().length===5?time.trim()+':00':time.trim()};
  if(!RadioCore.validDate(result.emission_date)||!RadioCore.validTime(result.start_time))throw Error('Date ou heure invalide. Aucune émission créée.');return result;
 }
 createBlankEmission=homeAction(async()=>{
  const data=RadioDocument.blank(),meta=await details(data.emission);if(!meta)return;
  data.emission=meta;navigate(await repository.createDocument(data,spaceValue()));
 });
 duplicateEmission=homeAction(async(source,asTemplate=false)=>{
  const data=RadioSupabaseRepository.native(await repository.read(source.id));
  const name=await RadioDialogs.text(asTemplate?'Nom du modèle :':'Nom de la copie :',(asTemplate?'Modèle — ':'')+data.emission.theme+' — copie');if(name===null)return;
  data.emission={...data.emission,theme:name.trim()||'Copie',is_template:asTemplate};
  if(asTemplate)data.emission.emission_date=null;
  const snapshot=await repository.createDocument(data,spaceValue());if(asTemplate)await showHome();else navigate(snapshot);
 });
 createFromTemplate=homeAction(async source=>{
  const data=RadioSupabaseRepository.native(await repository.read(source.id));
  const meta=await details({...data.emission,is_template:false});if(!meta)return;
  data.emission=meta;navigate(await repository.createDocument(data,spaceValue()));
 });
 deleteEmission=homeAction(async source=>{
  if(!await RadioDialogs.confirm('Supprimer « '+(source.theme||'Sans titre')+' » ? Ses versions resteront dans les émissions supprimées.'))return;
  await repository.removeDocument(source.id,source.revision);await showHome();
 });
 importNativeFile=()=>{
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;document.body.appendChild(input);
  input.onchange=homeAction(async()=>{
   input.remove();const file=input.files?.[0];if(!file)return;
   if(file.size>RadioCore.MAX_NATIVE_BYTES)throw Error('Fichier trop volumineux (maximum 2 Mo).');
   const data=RadioCore.validateNative(JSON.parse(await file.text()));
   if(!currentSpaceId())throw Error('Choisissez d’abord un espace de destination.');
   const title=await RadioDialogs.text('Nom de la nouvelle émission importée :',data.emission.theme||'Émission importée');if(title===null)return;
   if(!await RadioDialogs.confirm('Créer une nouvelle émission ? Les émissions existantes seront conservées.'))return;
   data.emission.theme=title.trim()||'Émission importée';navigate(await repository.createDocument(data,spaceValue()));
  });input.click();
 };
}
