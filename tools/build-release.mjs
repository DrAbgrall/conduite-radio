// Node.js pour Vercel ; utilisable localement avec Deno, sans dépendance npm.
// Ne supprime ni ne remplace aucun dossier existant.
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import process from 'node:process';
import {releaseFiles,releaseEnvNames,releaseConfig,configScript} from './release-config.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const config=releaseConfig(Object.fromEntries(releaseEnvNames.map(name=>[name,process.env[name]])));
const contents=new Map();
for(const name of releaseFiles){
 const source=join(root,name),stat=await lstat(source);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('Ressource absente ou lien non autorisé : '+name);
 contents.set(name,await readFile(source));
}
contents.set('config.js',Buffer.from(configScript(config)));
const output=process.argv.find(x=>x.startsWith('--output='))?.slice(9)||'dist';
if(!/^dist(?:-[a-zA-Z0-9-]+)?$/.test(output))throw Error('Le dossier de sortie doit être dist ou dist-<nom>, dans le projet.');
const target=join(root,output);
// EEXIST est volontaire : garder les anciens artefacts pour comparaison/retour.
await mkdir(target);
const manifest=[];
for(const [name,data] of contents){
 const destination=join(target,name);await mkdir(dirname(destination),{recursive:true});
 await writeFile(destination,data,{flag:'wx'});
 manifest.push({path:name,bytes:data.byteLength,sha256:createHash('sha256').update(data).digest('hex')});
}
await writeFile(join(target,'release.json'),JSON.stringify({version:'19.0.0',built_at:new Date().toISOString(),collaborationEnabled:config.collaborationEnabled,files:manifest},null,2)+'\n',{flag:'wx'});
console.log(`${contents.size} fichiers applicatifs préparés dans ${output}/. Collaboration ${config.collaborationEnabled?'activée par configuration':'désactivée'}. Aucun déploiement effectué.`);
