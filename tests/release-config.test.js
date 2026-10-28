import vm from 'node:vm';
import {releaseConfig,configScript,releaseFiles} from '../tools/release-config.mjs';
function assert(value,message='Assertion échouée'){if(!value)throw Error(message);}
function refused(fn){let error=false;try{fn();}catch{error=true;}assert(error);}
const enabled={RADIO_COLLABORATION_ENABLED:'true',RADIO_SUPABASE_URL:'https://project.supabase.co',RADIO_SUPABASE_PUBLIC_KEY:'sb_publishable_fictive'};
Deno.test('build : aucune configuration réelle embarquée par défaut',()=>{
 const config=releaseConfig({...enabled,RADIO_COLLABORATION_ENABLED:'false'});
 assert(!config.collaborationEnabled&&config.supabaseUrl===''&&config.supabasePublishableKey==='');
});
Deno.test('build : activation explicite et clé publique requises',()=>{
 assert(releaseConfig(enabled).collaborationEnabled);
 refused(()=>releaseConfig({RADIO_COLLABORATION_ENABLED:'yes'}));
 refused(()=>releaseConfig({...enabled,RADIO_SUPABASE_PUBLIC_KEY:''}));
 refused(()=>releaseConfig({...enabled,RADIO_SUPABASE_URL:''}));
});
Deno.test('build : clés privilégiées et URL avec identifiants refusées',()=>{
 for(const key of ['sb_secret_fictive','invalide','x.'+btoa(JSON.stringify({role:'service_role'}))+'.x'])refused(()=>releaseConfig({...enabled,RADIO_SUPABASE_PUBLIC_KEY:key}));
 for(const url of ['http://project.supabase.co','https://user:password@project.supabase.co','https://project.supabase.co/path','https://project.supabase.co/?key=x'])refused(()=>releaseConfig({...enabled,RADIO_SUPABASE_URL:url}));
});
Deno.test('build : ancienne clé anon compatible et clé jamais imprimée dans une erreur',()=>{
 const key='x.'+btoa(JSON.stringify({role:'anon'}))+'.x';assert(releaseConfig({...enabled,RADIO_SUPABASE_PUBLIC_KEY:key}).supabasePublishableKey===key);
 const secret='sb_secret_NE_PAS_AFFICHER';let message='';try{releaseConfig({...enabled,RADIO_SUPABASE_PUBLIC_KEY:secret});}catch(error){message=error.message;}
 assert(!message.includes(secret));
});
Deno.test('build : contenu de configuration sérialisé comme texte',()=>{
 const value='</script><script>alert(1)</script>',context=vm.createContext({window:{}});
 const source=configScript(releaseConfig({RADIO_APP_NAME:value}));vm.runInContext(source,context);
 assert(context.window.CONDUITE_CONFIG.appName===value&&!source.includes('</script>'));
});
Deno.test('build : liste de publication limitée et toutes les ressources PWA incluses',async()=>{
 assert(releaseFiles.every(f=>!f.startsWith('docs/')&&!f.startsWith('tests/')&&!f.startsWith('.test-tools/')&&!f.endsWith('.sql')&&f!=='config.js'));
 assert(new Set(releaseFiles).size===releaseFiles.length);
 const self={};vm.runInNewContext(await Deno.readTextFile(new URL('../pwa-assets.js',import.meta.url)),{self});
 for(const asset of self.RADIO_ASSETS)assert(releaseFiles.includes(asset.split('?')[0].replace(/^\.\//,'')),asset);
 for(const asset of releaseFiles)assert((await Deno.stat(new URL('../'+asset,import.meta.url))).isFile,asset);
});
Deno.test('Vercel : sortie dist, aucune réécriture globale et aucune commande de déploiement',async()=>{
 const settings=JSON.parse(await Deno.readTextFile(new URL('../vercel.json',import.meta.url)));
 assert(settings.outputDirectory==='dist'&&settings.framework===null&&!settings.rewrites&&!settings.redirects);
 assert(settings.buildCommand==='node tools/build-release.mjs');
 const ignore=await Deno.readTextFile(new URL('../.vercelignore',import.meta.url));
 assert(ignore.split('\n').includes('backups/'));
});
