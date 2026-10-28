import vm from 'node:vm';
const source=await Deno.readTextFile(new URL('../js/admin.js',import.meta.url));
function assert(value){if(!value)throw Error('Assertion échouée');}
function app(user){
 const elements=new Map(),calls=[];
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',dataset:{},hidden:false,children:[],replaceChildren(){this.children=[];},appendChild(child){this.children.push(child);},addEventListener(name,fn){this[name]=fn;},focus(){}});return elements.get(id);};
 const db={from(){return {select(){return {async order(){return {data:[{id:'demo',name:'RadioPanik'}],error:null};}};}};},async rpc(name,args){calls.push({name,args});return {data:{space_id:args.p_space_id,deleted:true,emissions_trashed:2},error:null};},auth:{async signInWithPassword(){calls.push('login');return {error:null};},async getUser(){return {data:{user},error:null};},async signOut(){calls.push('logout');return {error:null};}}};
 class Repository{async list(){return [{id:'a',revision:'1'},{id:'b',revision:'2'}];}async createSpace(){calls.push('create');return {id:'demo',name:'RadioPanik'};}}
 vm.runInNewContext(source,{window:{CONDUITE_CONFIG:{collaborationEnabled:true,adminEmail:'admin@example.org'},supabase:{createClient:()=>db}},document:{getElementById:get,createElement:()=>({}),querySelectorAll:()=>[]},RadioSupabaseRepository:{Repository},encodeURIComponent});
 return {get,calls,setUser:next=>{user=next;},submit:id=>get(id).submit({preventDefault(){}})};
}
Deno.test('admin : une création sans session validée est refusée',async()=>{
 const a=app(null);await a.submit('adminCreate');assert(!a.calls.includes('create'));assert(a.get('adminStatus').dataset.error==='true');
});
Deno.test('admin suppression : aucun appel avant vérification et nom exact',async()=>{
 const a=app({email:'admin@example.org',email_confirmed_at:'2026-01-01'});
 await a.submit('adminDelete');assert(a.calls.length===0);
 await a.get('adminLoadSpaces').click();a.get('adminDeleteSpace').value='demo';await a.get('adminReviewDelete').click();a.get('adminDeleteName').value='Autre';await a.submit('adminDelete');assert(a.calls.length===0);
 a.get('adminDeleteName').value='RadioPanik';await a.submit('adminDelete');
 const rpc=a.calls.find(c=>c.name==='radio_v19_delete_space');assert(rpc.args.p_space_id==='demo'&&rpc.args.p_expected_emissions.length===2);assert(a.get('adminConfirmDelete').disabled);
});
Deno.test('admin suppression : changement de sélection ou session expirée bloque la suppression',async()=>{
 const a=app({email:'admin@example.org',email_confirmed_at:'2026-01-01'});
 await a.get('adminLoadSpaces').click();a.get('adminDeleteSpace').value='demo';await a.get('adminReviewDelete').click();a.get('adminDeleteSpace').change();a.get('adminDeleteName').value='RadioPanik';await a.submit('adminDelete');assert(a.calls.length===0);
 await a.get('adminReviewDelete').click();a.get('adminDeleteName').value='RadioPanik';a.setUser(null);await a.submit('adminDelete');assert(a.calls.length===0);assert(a.get('adminStatus').dataset.error==='true');
});
Deno.test('admin : un autre compte confirmé ne peut pas créer',async()=>{
 const a=app({email:'autre@example.org',email_confirmed_at:'2026-01-01'});await a.submit('adminCreate');assert(!a.calls.includes('create'));
});
Deno.test('admin : email non confirmé refusé et mot de passe effacé',async()=>{
 const a=app({email:'admin@example.org'});a.get('adminPassword').value='test-secret';await a.submit('adminLogin');assert(a.get('adminTools').hidden);assert(a.get('adminPassword').value==='');assert(a.calls.includes('logout'));
});
Deno.test('admin : compte confirmé autorisé puis création et déconnexion',async()=>{
 const a=app({email:'admin@example.org',email_confirmed_at:'2026-01-01'});await a.submit('adminLogin');assert(a.get('adminLogin').hidden);a.get('adminSpaceName').value='RadioPanik';await a.submit('adminCreate');assert(a.calls.includes('create'));assert(a.get('adminSpaceLink').href==='index.html?space=demo');await a.get('adminLogout').click();assert(a.get('adminTools').hidden);
});
