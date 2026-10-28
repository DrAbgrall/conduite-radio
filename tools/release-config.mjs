// Configuration publique de navigateur : aucune lecture d'environnement ici.
export const releaseFiles=Object.freeze([
 'index.html','local.html','admin.html','js/admin.js','js/home-update.js','manifest.webmanifest','sw.js','pwa-assets.js',
 'css/styles.css','css/local.css',
 'icons/radio-180.png','icons/radio-192.png','icons/radio-512.png',
 'js/app.js','js/core.js','js/dialogs.js','js/remote-sync.js','js/supabase-repository.js',
 'js/collaboration-history.js','js/trash-dialog.js','js/document-model.js','js/atomic-document.js','js/atomic-app-actions.js','js/local-store.js','js/local-session.js',
 'js/local-app.js','js/pwa.js','js/exports.js','js/visualizations.js'
]);
export const releaseEnvNames=Object.freeze([
 'RADIO_COLLABORATION_ENABLED','RADIO_SUPABASE_URL','RADIO_SUPABASE_PUBLIC_KEY',
 'RADIO_APP_NAME','RADIO_ORGANISATION','RADIO_CONTACT_EMAIL','RADIO_ADMIN_EMAIL'
]);
function publicKey(value){
 if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(value))return true;
 const parts=value.split('.');if(parts.length!==3)return false;
 try{
  const payload=JSON.parse(atob(parts[1].replaceAll('-','+').replaceAll('_','/')));
  return payload.role==='anon';
 }catch{return false;}
}
export function releaseConfig(env){
 const mode=env.RADIO_COLLABORATION_ENABLED||'false';
 if(!['true','false'].includes(mode))throw Error('RADIO_COLLABORATION_ENABLED doit être true ou false.');
 const enabled=mode==='true';let url='',key='';
 if(enabled){
  url=env.RADIO_SUPABASE_URL||'';key=env.RADIO_SUPABASE_PUBLIC_KEY||'';
  let parsed;try{parsed=new URL(url);}catch{throw Error('URL Supabase requise pour activer la collaboration.');}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw Error('URL Supabase HTTPS sans chemin ni identifiants requise.');
  if(!publicKey(key))throw Error('Utilisez uniquement une clé Supabase publishable ou une ancienne clé anon ; jamais service_role/secret.');
  url=parsed.origin;
 }
 return {collaborationEnabled:enabled,atomicCollaboration:true,supabaseUrl:url,supabasePublishableKey:key,
  appName:env.RADIO_APP_NAME||'Conduite radio',organisation:env.RADIO_ORGANISATION||'',
  contactEmail:env.RADIO_CONTACT_EMAIL||'',adminEmail:env.RADIO_ADMIN_EMAIL||'',homeSubtitle:'Créer, organiser et visualiser des conducteurs radio.'};
}
export function configScript(config){return 'window.CONDUITE_CONFIG = '+JSON.stringify(config,null,2).replaceAll('<','\\u003c')+';\n';}
