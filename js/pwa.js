/* Installation et mise à jour sans effacer IndexedDB. */
(() => {
  'use strict';
  const status = document.getElementById('offlineStatus'), install = document.getElementById('installApp'), update = document.getElementById('updateApp');
  let installEvent, registration, activating = false;
  let autoChecking=false,controllerChanged=false;
  const autoUpdate=async()=>{
    if(autoChecking||activating||!RadioLocalApp.canAutoUpdate?.())return;
    autoChecking=true;
    try{
      if(controllerChanged){if(await RadioLocalApp.prepareUpdate())location.reload();}
      else if(registration?.waiting)await update.onclick();
    }catch(error){report('Mise à jour différée : '+error.message);}
    finally{autoChecking=false;}
  };
  window.addEventListener('radio:idle',autoUpdate);
  window.addEventListener('focus',autoUpdate);
  const panel=document.getElementById('installationPanel');
  const standalone=()=>window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true;
  const showHelp=()=>{
    const ua=navigator.userAgent||'',mac=/Macintosh|Mac OS X/.test(ua),ios=/iPhone|iPad|iPod/.test(ua)||(mac&&navigator.maxTouchPoints>1);
    const steps=ios?'Dans Safari, ouvrez Partager, puis Sur l’écran d’accueil. Activez Ouvrir comme app web si proposé, puis touchez Ajouter.'
      :/Android/.test(ua)?'Dans Chrome, ouvrez le menu ⋮, puis Installer l’application ou Ajouter à l’écran d’accueil. Confirmez l’installation.'
      :mac&&/Safari/.test(ua)&&!/Chrome|Chromium|Edg/.test(ua)?'Avec Safari sur macOS Sonoma 14 ou version ultérieure : choisissez Fichier → Ajouter au Dock, puis Ajouter.'
      :/Edg/.test(ua)?'Dans Edge, ouvrez le menu ⋯, puis Applications → Installer ce site en tant qu’application. Confirmez l’installation.'
      :'Dans Chrome, ouvrez le menu ⋮ → Caster, enregistrer et partager → Installer la page en tant qu’appli. Si cette commande n’est pas proposée, utilisez un navigateur compatible récent.';
    document.getElementById('installSteps').textContent=steps;
    document.getElementById('installDialog').showModal();
  };
  const installed=()=>{install.hidden=true;if(panel)panel.hidden=true;};
  if(standalone())installed();else install.hidden=false;
  const report = message => { status.textContent = message; };
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installEvent = event;if(!standalone())install.hidden = false; });
  install.onclick = async () => {
    if (!installEvent){showHelp();return;}
    const pending=installEvent;installEvent=null;
    try{await pending.prompt();const choice=await pending.userChoice;if(choice.outcome==='accepted')installed();}
    catch{showHelp();}
  };
  window.addEventListener('appinstalled', () => { installed();report('Application installée · données sur cet appareil'); });
  update.onclick = async () => {
    try {
      // L'éditeur vérifie aussi les champs invalides et les conflits avant validation.
      if (await RadioLocalApp.prepareUpdate()) {
        if (!registration?.waiting) { update.hidden = true; return; }
        activating = true; update.disabled = true;
        registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
      }
    } catch (error) { report('Mise à jour différée : ' + error.message); }
  };
  document.getElementById('installHelp').onclick = showHelp;
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    report('Installation hors ligne indisponible dans ce navigateur ou à cette adresse.'); return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (activating) location.reload();else{controllerChanged=true;autoUpdate();} });
  navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(async reg => {
    registration = reg;
    const ready = () => report(navigator.onLine ? 'Application prête hors ligne sur cet appareil' : 'Mode hors ligne · données sur cet appareil');
    await navigator.serviceWorker.ready; ready();
    window.addEventListener('online', ready); window.addEventListener('offline', ready);
    if (reg.waiting){update.hidden = false;autoUpdate();}
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller){update.hidden = false;autoUpdate();}
      });
    });
  }).catch(error => report('Préparation hors ligne impossible : ' + error.message));
})();
