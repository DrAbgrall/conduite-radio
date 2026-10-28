/* Stockage local autonome. Document et historique sont écrits dans la même transaction. */
(() => {
  'use strict';
  const HISTORY_LIMIT = 20;
  const CHECKPOINT_INTERVAL = 120000;
  function createStore(name = 'conduite-radio-v19-local') {
    function open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(name, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('documents', { keyPath: 'id' });
        req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(Error('Fermez les autres onglets pour ouvrir le stockage local.'));
      });
    }
    async function transaction(mode, operation) {
      const db = await open();
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction('documents', mode);
          let result, failure;
          tx.oncomplete = () => resolve(result);
          tx.onabort = () => reject(failure || tx.error || Error('Sauvegarde locale interrompue.'));
          tx.onerror = () => {};
          try {
            operation(tx.objectStore('documents'), value => { result = value; }, error => { failure = error; tx.abort(); });
          } catch (error) { failure = error; tx.abort(); }
        });
      } finally { db.close(); }
    }
    function get(id) {
      return transaction('readonly', (store, done) => {
        store.get(id).onsuccess = e => done(e.target.result || null);
      });
    }
    function list() {
      return transaction('readonly', (store, done) => {
        store.getAll().onsuccess = e => done(e.target.result.map(({ id, updatedAt, data }) => ({ id, updatedAt, theme: data.emission.theme, isTemplate: !!data.emission.is_template })));
      });
    }
    function save(id, data, reason = 'Sauvegarde automatique', expectedRevision = 0, checkpoint = false) {
      RadioCore.validateNative(data);
      const copy = structuredClone(data);
      return transaction('readwrite', (store, done, fail) => {
        store.get(id).onsuccess = e => {
          try {
            const previous = e.target.result;
            if ((previous?.revision || 0) !== expectedRevision) {
              const error = Error('Ce conducteur a changé dans un autre onglet. Exportez votre copie avant de le recharger.');
              error.name = 'ConflictError'; fail(error); return;
            }
            if (previous && JSON.stringify(previous.data) === JSON.stringify(copy)) { done(previous); return; }
            const now = Date.now(), at = new Date(now).toISOString();
            const keep = previous && (checkpoint || now - (previous.checkpointAt || 0) >= CHECKPOINT_INTERVAL);
            const history = keep ? [{ at: previous.updatedAt, reason, data: previous.data }, ...(previous.history || [])].slice(0, HISTORY_LIMIT) : (previous?.history || []);
            const record = { id, updatedAt: at, revision: (previous?.revision || 0) + 1, checkpointAt: keep || !previous ? now : previous.checkpointAt, data: copy, history };
            store.put(record); done(record);
          } catch (error) { fail(error); }
        };
      });
    }
    async function restore(id, index, expectedRevision) {
      const record = await get(id);
      if (!record || record.revision !== expectedRevision) throw Error('Historique modifié : fermez et rouvrez cette fenêtre.');
      if (!Number.isInteger(index) || index < 0 || !record.history[index]) throw Error('Version introuvable.');
      return save(id, record.history[index].data, 'Avant restauration', expectedRevision, true);
    }
    return Object.freeze({ get, list, save, restore, HISTORY_LIMIT });
  }
  globalThis.RadioLocalStore = Object.freeze({ ...createStore(), createStore, HISTORY_LIMIT });
})();
