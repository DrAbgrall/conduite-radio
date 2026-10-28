/* File d'écriture indépendante du DOM : aucune sauvegarde concurrente du même onglet. */
(() => {
  'use strict';
  class LocalSession {
    constructor(store, record, onStatus = () => {}) {
      this.store = store; this.id = record.id; this.revision = record.revision;
      this.data = structuredClone(record.data); this.change = 0; this.saved = 0;
      this.queue = Promise.resolve(); this.onStatus = onStatus; this.error = null;
    }
    update(data) {
      RadioCore.validateNative(data);
      this.data = structuredClone(data); this.change++; this.onStatus('pending');
    }
    get dirty() { return this.change !== this.saved; }
    flush(reason = 'Sauvegarde automatique', checkpoint = false) {
      const run = async () => {
        if (!this.dirty) return;
        const version = this.change, data = structuredClone(this.data);
        this.onStatus('saving');
        try {
          const record = await this.store.save(this.id, data, reason, this.revision, checkpoint);
          this.revision = record.revision; this.saved = version; this.error = null;
          this.onStatus(this.dirty ? 'pending' : 'saved');
        } catch (error) { this.error = error; this.onStatus('error', error); throw error; }
      };
      const result = this.queue.then(run);
      this.queue = result.catch(() => {});
      return result;
    }
    async restore(index, revision) {
      await this.flush();
      const record = await this.store.restore(this.id, index, revision);
      this.revision = record.revision; this.data = structuredClone(record.data);
      this.change++; this.saved = this.change; this.error = null; this.onStatus('saved');
    }
  }
  globalThis.RadioLocalSession = LocalSession;
})();
