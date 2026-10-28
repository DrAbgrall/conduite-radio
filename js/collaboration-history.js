/* Historique distant : aucun client réseau créé ici. Écritures déléguées à l'appelant. */
(() => {
  'use strict';
  let active=false;
  const reasons={baseline:'Version initiale',activation:'Activation de l’historique',created:'Création',autosave:'Sauvegarde automatique',before_delete_child:'Avant suppression',before_delete_emission:'Avant suppression de l’émission',before_restore:'Avant restauration'};
  const duration=n=>[Math.floor(n/3600),Math.floor(n%3600/60),n%60].map(x=>String(x).padStart(2,'0')).join(':');
  function open({repository,emissionId,restore}){
    if(active)return Promise.reject(Error('Un historique est déjà ouvert.'));
    active=true;
    return new Promise((resolve,reject)=>{
      let generation=0,closed=false,restoring=false,history=null,selected=null,outcome={restored:false};
      const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
      const dialog=el('dialog',undefined,'historyDialog');dialog.setAttribute('aria-labelledby','remoteHistoryTitle');
      const title=el('h2','Historique de l’émission');title.id='remoteHistoryTitle';
      const intro=el('p','Choisissez une version pour la consulter. Restaurer conservera aussi l’état remplacé.');
      const tools=el('div',undefined,'historyTools'),refresh=el('button','Actualiser'),close=el('button','Fermer');
      tools.append(refresh,close);
      const status=el('p');status.setAttribute('role','status');
      const layout=el('div',undefined,'historyLayout'),list=el('div',undefined,'historyList'),preview=el('section',undefined,'historyPreview');
      list.setAttribute('aria-label','Versions disponibles');preview.setAttribute('aria-label','Aperçu de la version');
      const restoreButton=el('button','Restaurer cette version');restoreButton.disabled=true;
      layout.append(list,preview);dialog.append(title,intro,tools,status,layout,restoreButton);
      const message=text=>{if(!closed)status.textContent=text;};
      function renderPreview(data){
        preview.replaceChildren();const d=data.document;
        preview.append(el('h3',d.emission.theme||'Sans titre'),el('p',`${d.emission.emission_date||'Sans date'} · Départ ${d.emission.start_time}${d.emission.is_template?' · Modèle':''}`));
        const blockNames=new Map(d.blocks.map(b=>[b.key,b.title||'Bloc sans titre']));
        const empty=d.blocks.filter(b=>!d.sequences.some(s=>s.block_key===b.key));
        if(empty.length)preview.append(el('p','Blocs vides : '+empty.map(b=>b.title||'Sans titre').join(', ')));
        const table=el('table'),thead=el('thead'),head=el('tr');
        for(const text of ['Heure','Bloc','Type','Direct','PAD / Enregistré','Durée','Qui']){const th=el('th',text);th.scope='col';head.append(th);}
        thead.append(head);table.append(thead);const body=el('tbody');let elapsed=0;
        for(const row of d.sequences){
          const tr=el('tr');
          for(const text of [RadioCore.clock(d.emission.start_time,elapsed),blockNames.get(row.block_key)||'—',row.type,row.direct,row.recorded,duration(row.duration_seconds),row.who])tr.append(el('td',text));
          body.append(tr);elapsed+=row.duration_seconds;
        }
        table.append(body);preview.append(el('p',`${d.sequences.length} séquence(s) · Durée ${duration(elapsed)} · Fin ${RadioCore.clock(d.emission.start_time,elapsed)}`));
        if(d.sequences.length)preview.append(table);else preview.append(el('p','Ce conducteur est vide.'));
      }
      async function select(version,button){
        if(restoring||closed||!history)return;
        const token=++generation;selected=null;restoreButton.disabled=true;preview.replaceChildren();message('Chargement de la version…');
        for(const item of list.children)item.setAttribute('aria-pressed',item===button?'true':'false');
        try{
          const data=await repository.version(emissionId,version.history_id);
          if(closed||token!==generation)return;
          renderPreview(data);selected=version;restoreButton.disabled=false;message('Aperçu chargé. Aucune donnée n’a été modifiée.');
        }catch(error){if(token===generation)message(error.message||'Version indisponible.');}
      }
      async function load(){
        if(restoring||closed)return;
        const token=++generation;selected=null;history=null;restoreButton.disabled=true;refresh.disabled=true;
        list.replaceChildren();preview.replaceChildren();message('Chargement de l’historique…');
        try{
          const data=await repository.history(emissionId);
          if(closed||token!==generation)return;
          history=data;
          if(!data){message('Aucun historique disponible pour cette émission.');return;}
          if(!data.versions.length){message('Aucun point de retour disponible pour le moment.');return;}
          for(const v of data.versions){
            const button=el('button',`${new Date(v.captured_at).toLocaleString('fr-BE')} · ${reasons[v.reason]||'Version enregistrée'} · ${v.theme||'Sans titre'} · ${v.sequence_count} séquence(s)`);
            button.type='button';button.setAttribute('aria-pressed','false');button.onclick=()=>select(v,button);list.append(button);
          }
          message(data.deleted_at?'Cette émission est supprimée. Une version peut être récupérée.':'Choisissez une version pour afficher son contenu.');
        }catch(error){if(token===generation)message(error.message||'Historique indisponible.');}
        finally{if(!closed&&token===generation)refresh.disabled=false;}
      }
      restoreButton.onclick=async()=>{
        if(!selected||!history||restoring||closed)return;
        const version=selected,revision=history.current_revision;
        restoring=true;restoreButton.disabled=true;refresh.disabled=true;close.disabled=true;
        let attempted=false;
        try{
          const confirmed=await RadioDialogs.confirm('Restaurer « '+(version.theme||'Sans titre')+' » ? L’état actuel sera conservé dans l’historique.');
          if(!confirmed||closed)return;
          attempted=true;outcome.attempted=true;message('Restauration en cours…');
          const result=await restore(version.history_id,revision);
          outcome={restored:true,attempted:true,result};dialog.close();
        }catch(error){
          selected=null;history=null;generation++;
          for(const button of list.children)button.disabled=true;
          message(['PT409','40001'].includes(error.code)?'L’émission a changé. Actualisez l’historique et consultez à nouveau la version avant de restaurer.':'Restauration non confirmée. Actualisez l’historique avant tout nouvel essai. '+(error.message||''));
        }finally{
          restoring=false;
          if(!closed){refresh.disabled=false;close.disabled=false;restoreButton.disabled=attempted||!selected;}
        }
      };
      refresh.onclick=load;close.onclick=()=>{if(!restoring)dialog.close();};
      dialog.addEventListener('cancel',event=>{if(restoring)event.preventDefault();});
      dialog.addEventListener('close',()=>{closed=true;generation++;active=false;dialog.remove();resolve(outcome);},{once:true});
      try{document.body.append(dialog);dialog.showModal();load();}
      catch(error){active=false;closed=true;dialog.remove();reject(error);}
    });
  }
  globalThis.RadioCollaborationHistory=Object.freeze({open});
})();
