/* Corbeille distante ouverte : consultation et récupération, aucune purge. */
(() => {
 'use strict';let active=false;
 function open({repository,spaceId=null}){
  if(active)return Promise.reject(Error('Une corbeille est déjà ouverte.'));
  active=true;
  return new Promise((resolve,reject)=>{
   let closed=false,loading=false,child=false,token=0,cursor=null,restored=0;
   const seen=new Set();
   const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
   const dialog=el('dialog');dialog.className='historyDialog';dialog.setAttribute('aria-labelledby','trashTitle');
   const title=el('h2','Émissions supprimées');title.id='trashTitle';
   const intro=el('p',spaceId?'Retrouvez les émissions et modèles supprimés de cet espace.':'Retrouvez les émissions et modèles supprimés de tous les espaces.');
   const status=el('p');status.setAttribute('role','status');
   const tools=el('div');tools.className='historyTools';
   const refresh=el('button','Actualiser'),close=el('button','Fermer'),more=el('button','Voir la suite'),list=el('div');
   list.className='trashList';more.hidden=true;tools.append(refresh,close);dialog.append(title,intro,tools,status,list,more);
   const busy=()=>{refresh.disabled=loading||child;more.disabled=loading||child;close.disabled=child;for(const button of list.children)button.disabled=loading||child;};
   async function inspect(item){
    if(closed||loading||child)return;child=true;busy();
    try{
     const result=await RadioCollaborationHistory.open({repository,emissionId:item.emission_id,
       restore:(version,revision)=>repository.restoreVersion(item.emission_id,version,revision)});
     if(result.restored){restored++;status.textContent=result.result.space_missing?'Émission récupérée sans espace : son ancien espace n’existe plus.':'Émission récupérée.';}
     child=false;if(!closed)await load(true,result.restored?status.textContent:'');
    }catch(error){if(!closed)status.textContent=error.message||'Récupération indisponible.';}
    finally{child=false;if(!closed)busy();}
   }
   async function load(reset=false,notice=''){
    if(closed||loading||child)return;
    const current=++token;loading=true;
    if(reset){cursor=null;seen.clear();list.replaceChildren();more.hidden=true;}
    status.textContent='Chargement des émissions supprimées…';busy();
    try{
     const data=await repository.trash(spaceId,cursor);
     if(closed||current!==token)return;
     for(const item of data.items){
      if(seen.has(item.emission_id))continue;seen.add(item.emission_id);
      const button=el('button',`${item.theme||'Sans titre'}${item.is_template?' · Modèle':''} · supprimé le ${new Date(item.deleted_at).toLocaleString('fr-BE')} · ${item.sequence_count} séquence(s) · Consulter et récupérer`);
      button.onclick=()=>inspect(item);list.append(button);
     }
     cursor=data.next_cursor;more.hidden=!cursor;
     status.textContent=notice||(seen.size?'Choisissez une émission pour consulter ses versions avant récupération.':'Aucune émission supprimée.');
    }catch(error){if(!closed&&current===token)status.textContent=error.message||'Corbeille indisponible.';}
    finally{loading=false;if(!closed&&current===token)busy();}
   }
   refresh.onclick=()=>load(true);more.onclick=()=>load();close.onclick=()=>{if(!child)dialog.close();};
   dialog.addEventListener('cancel',event=>{if(child)event.preventDefault();});
   dialog.addEventListener('close',()=>{closed=true;token++;active=false;dialog.remove();resolve({restored});},{once:true});
   try{document.body.append(dialog);dialog.showModal();load(true);}
   catch(error){closed=true;active=false;dialog.remove();reject(error);}
  });
 }
 globalThis.RadioTrashDialog=Object.freeze({open});
})();
