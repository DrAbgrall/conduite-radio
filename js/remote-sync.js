/* Coordination des rafraîchissements/écritures d'un onglet, sans dépendance au DOM. */
(() => {
  'use strict';
  class RemoteSync {
    constructor({ load, apply, isEditing = () => false, onStatus = () => {}, delay = 250, schedule = setTimeout, cancel = clearTimeout }) {
      this.load=load;this.apply=apply;this.isEditing=isEditing;this.onStatus=onStatus;
      this.delay=delay;this.schedule=schedule;this.cancel=cancel;
      this.generation=0;this.pending=false;this.reading=null;this.writes=0;this.tail=Promise.resolve();
      this.failures=new Map();this.latest=new Map();this.timer=null;this.closed=false;
    }
    blocked(){return this.writes>0||this.failures.size>0||this.isEditing();}
    changed(){this.generation++;}
    requestRefresh(){
      if(this.closed)return Promise.resolve(false);
      this.generation++;this.pending=true;return this.resume();
    }
    async resume(){
      if(this.closed||!this.pending)return false;
      if(this.reading)return this.reading;
      if(this.blocked()){
        // Une erreur attend une action de l'utilisateur ; pas de boucle de réessai réseau.
        if(!this.failures.size&&this.timer===null)this.timer=this.schedule(()=>{this.timer=null;this.resume();},this.delay);
        return false;
      }
      if(this.timer!==null){this.cancel(this.timer);this.timer=null;}
      this.pending=false;const generation=this.generation;
      this.reading=(async()=>{
        try{
          const snapshot=await this.load();
          if(this.closed)return false;
          if(generation!==this.generation||this.blocked()){this.pending=true;return false;}
          this.apply(snapshot);this.onStatus('loaded');return true;
        }catch(error){this.onStatus('read-error',error);return false;}
      })();
      try{return await this.reading;}
      finally{this.reading=null;if(this.pending&&!this.closed)this.resume();}
    }
    write(key, operation, {retryable=true}={}){
      if(this.closed)return Promise.reject(Error('Synchronisation fermée.'));
      const generation=++this.generation;this.latest.set(key,generation);this.writes++;
      this.onStatus('saving');
      const run=async()=>{
        try{
          const result=await operation();
          if(this.latest.get(key)===generation)this.failures.delete(key);
          return result;
        }catch(error){
          if(retryable&&this.latest.get(key)===generation)this.failures.set(key,{operation,error});
          this.onStatus('write-error',error);throw error;
        }finally{
          this.writes--;this.pending=true;
          if(!this.writes){this.onStatus(this.failures.size?'write-error':'saved',this.failures.values().next().value?.error);this.resume();}
        }
      };
      const result=this.tail.then(run);this.tail=result.catch(()=>{});return result;
    }
    async retryFailed(){
      const operations=[...this.failures.entries()];
      for(const [key,{operation}] of operations)await this.write(key,operation);
    }
    async flush(){await this.tail;if(this.failures.size)throw Error('Des modifications ne sont pas enregistrées. Réessayez ou exportez votre copie.');}
    discardFailed(){this.failures.clear();this.generation++;this.pending=true;return this.resume();}
    close(){this.closed=true;this.generation++;if(this.timer!==null)this.cancel(this.timer);}
  }
  globalThis.RadioRemoteSync=RemoteSync;
})();
