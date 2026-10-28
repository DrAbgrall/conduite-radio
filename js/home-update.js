/* Activation automatique depuis l’accueil, sans recharger les conducteurs ouverts. */
(() => {
 'use strict';
 const link=document.getElementById('homeUpdate');
 if(!link||!('serviceWorker' in navigator)||new URLSearchParams(location.search).has('emission'))return;
 navigator.serviceWorker.getRegistration('./').then(registration=>{
  if(!registration)return;
  let activating=false;
  const activate=()=>{
   if(!registration.waiting||activating||document.querySelector?.('dialog[open],.modalback')||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'))return;
   activating=true;link.textContent='Mise à jour en cours…';registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
  };
  const show=()=>{if(registration.waiting){link.hidden=false;activate();}};
  const watch=worker=>{if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){link.hidden=false;show();}});};
  navigator.serviceWorker.addEventListener?.('controllerchange',()=>{link.hidden=true;});
  document.addEventListener?.('click',()=>queueMicrotask(activate));
  show();watch(registration.installing);
  registration.addEventListener('updatefound',()=>watch(registration.installing));
  // Vérifie aussi les changements depuis la dernière ouverture du mode local.
  registration.update().then(show).catch(()=>{});
 }).catch(()=>{});
})();
