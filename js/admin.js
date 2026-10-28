// Connexion de l’interface d’administration. Les autorisations API restent définies côté Supabase.
(() => {
 'use strict';
 const email=String(window.CONDUITE_CONFIG?.adminEmail||'').trim().toLowerCase();
 const get=id=>document.getElementById(id),login=get('adminLogin'),tools=get('adminTools'),create=get('adminCreate'),status=get('adminStatus');
 const message=(text,error=false)=>{status.textContent=text;status.dataset.error=String(error);};
 get('adminEmail').value=email;
 const config=window.CONDUITE_CONFIG;
 if(!config?.collaborationEnabled||!window.supabase||!email){message('Administration indisponible. Vérifiez la configuration adminEmail et votre connexion Internet.',true);login.hidden=true;return;}
 // Session limitée à cet onglet : aucun mot de passe stocké dans l’application.
 const db=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:false,detectSessionInUrl:false}});
 const repository=new RadioSupabaseRepository.Repository(db,{atomic:true});
 let busy=false,deletion=null,spaces=[];
 const deletionTools=get('adminDeleteTools'),deleteForm=get('adminDelete');
 function deleteEnabled(){get('adminConfirmDelete').disabled=busy||!deletion||get('adminDeleteName').value!==deletion.name;}
 function clearDeletion(){deletion=null;get('adminDeleteName').value='';get('adminDeleteSummary').textContent='';deleteEnabled();}
 function authenticated(user){return user?.email?.toLowerCase()===email&&!!user.email_confirmed_at;}
 function lock(value){busy=value;for(const button of document.querySelectorAll('button'))button.disabled=value;deleteEnabled();}
 async function check(){const {data,error}=await db.auth.getUser();if(error||!authenticated(data?.user))throw Error('Connexion administrateur requise.');return data.user;}
 login.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;lock(true);message('Connexion…');
  try{
   const password=get('adminPassword').value;
   if(get('adminEmail').value.trim().toLowerCase()!==email)throw Error('Ce compte n’est pas autorisé à administrer cette application.');
   const {error}=await db.auth.signInWithPassword({email,password});
   if(error)throw Error('Connexion refusée. Vérifiez votre compte et votre mot de passe.');
   await check();login.hidden=true;tools.hidden=false;deletionTools.hidden=false;message('Vous êtes connecté.');get('adminSpaceName').focus();
  }catch(error){await db.auth.signOut({scope:'local'});tools.hidden=true;deletionTools.hidden=true;login.hidden=false;message(error.message,true);}
  finally{get('adminPassword').value='';lock(false);}
 });
 async function loadSpaces(){
  await check();const {data,error}=await db.from('spaces').select('id,name').order('position');if(error)throw error;
  spaces=data;clearDeletion();const select=get('adminDeleteSpace');select.replaceChildren();
  const blank=document.createElement('option');blank.value='';blank.textContent='Choisir un espace';select.appendChild(blank);
  for(const space of spaces){const option=document.createElement('option');option.value=space.id;option.textContent=space.name;select.appendChild(option);}
 }
 get('adminLoadSpaces').addEventListener('click',async()=>{
  if(busy)return;lock(true);try{await loadSpaces();message('Choisissez un espace, puis vérifiez son contenu.');}catch(error){message(error.message,true);}finally{lock(false);}
 });
 get('adminDeleteSpace').addEventListener('change',clearDeletion);
 get('adminDeleteName').addEventListener('input',deleteEnabled);
 get('adminReviewDelete').addEventListener('click',async()=>{
  if(busy)return;lock(true);clearDeletion();
  try{
   await check();const space=spaces.find(s=>s.id===get('adminDeleteSpace').value);if(!space)throw Error('Choisissez un espace.');
   const rows=await repository.list(space.id);deletion={id:space.id,name:space.name,emissions:rows.map(r=>({id:r.id,revision:r.revision}))};
   get('adminDeleteSummary').textContent='« '+space.name+' » : '+rows.length+' émission(s) ou modèle(s) seront placés dans la corbeille. Recopiez le nom exact pour confirmer.';
   message('Vérifiez l’espace sélectionné avant de confirmer.');
  }catch(error){message(error.message,true);}finally{lock(false);}
 });
 deleteForm.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!deletion||get('adminDeleteName').value!==deletion.name)return;lock(true);
  try{
   await check();const target=deletion;
   const {data,error}=await db.rpc('radio_v19_delete_space',{p_space_id:target.id,p_expected_name:target.name,p_expected_emissions:target.emissions});
   if(error){if(error.code==='PGRST202')throw Error('La suppression administrative doit encore être activée sur Supabase.');throw error;}
   if(data?.space_id!==target.id||data.deleted!==true||data.emissions_trashed!==target.emissions.length)throw Error('Résultat non confirmé. Rechargez la liste avant toute nouvelle action.');
   clearDeletion();message('Espace « '+target.name+' » supprimé. '+data.emissions_trashed+' conducteur(s) conservés dans la corbeille.');
   try{await loadSpaces();}catch{message('Espace supprimé ; rechargez la liste pour actualiser l’affichage.');}
  }catch(error){clearDeletion();message(error.message,true);}finally{lock(false);}
 });
 create.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;lock(true);get('adminSpaceLink').hidden=true;message('Création…');
  try{await check();const space=await repository.createSpace(get('adminSpaceName').value);get('adminSpaceName').value='';const link=get('adminSpaceLink');link.href='index.html?space='+encodeURIComponent(space.id);link.hidden=false;message('Espace « '+space.name+' » créé.');}
  catch(error){message(error.message,true);}finally{lock(false);}
 });
 get('adminLogout').addEventListener('click',async()=>{
  if(busy)return;lock(true);
  try{const {error}=await db.auth.signOut({scope:'local'});if(error)throw error;tools.hidden=true;deletionTools.hidden=true;clearDeletion();login.hidden=false;get('adminSpaceLink').hidden=true;message('Vous êtes déconnecté.');}
  catch{message('Déconnexion non confirmée. Fermez cet onglet.',true);}finally{lock(false);}
 });
})();
