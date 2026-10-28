// Test des vrais gestionnaires local-app, avec DOM/stockage simulés.
// Le Blob exporté est capturé en mémoire : aucun téléchargement hors du projet.
import vm from 'node:vm';
import '../js/core.js';
import '../js/document-model.js';
import '../js/local-session.js';
const source = await Deno.readTextFile(new URL('../js/local-app.js', import.meta.url));
const fixture = async name => JSON.parse(await Deno.readTextFile(new URL(`fixtures/${name}.conduite.json`, import.meta.url)));
function equal(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); }
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
async function harness() {
  const elements = new Map(), records = new Map(), downloads = [];
  let exportedBlob, prompts = 0;
  class Element {
    constructor() { this.listeners = new Map(); this.value = ''; this.hidden = true; this.textContent = ''; }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    click() { downloads.push(this.download); }
    remove() {}
  }
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const store = {
    async list() { return [...records.values()].map(r => ({ id: r.id, updatedAt: r.updatedAt, theme: r.data.emission.theme })); },
    async get(id) { return structuredClone(records.get(id)); },
    async save(id, data, reason, revision) {
      if ((records.get(id)?.revision || 0) !== revision) throw Error('Conflit');
      const record = { id, data: structuredClone(data), revision: revision + 1, updatedAt: new Date().toISOString(), history: [] };
      records.set(id, record); return structuredClone(record);
    }
  };
  vm.runInNewContext(source, {
    RadioCore, RadioDocument, RadioLocalSession, RadioLocalStore: store,
    RadioDialogs: { async text(message, initial) { prompts++; return initial; }, async confirm() { return true; } },
    document: { getElementById: get, querySelectorAll: () => [], addEventListener() {}, createElement: () => new Element(), body: { appendChild() {} } },
    window: { addEventListener() {} }, indexedDB: {}, crypto, structuredClone, Blob,
    URL: { createObjectURL(blob) { exportedBlob = blob; return 'blob:test'; }, revokeObjectURL() {} },
    setTimeout() { return 1; }, clearTimeout() {}
  });
  await settle();
  return {
    get, records, downloads, prompts: () => prompts,
    async importFile(file) { get('fileInput').files = [file]; await get('fileInput').onchange(); },
    async exportFile() { get('exportDocument').listeners.get('click')(); await settle(); if (!exportedBlob) throw Error('Aucun Blob exporté'); return exportedBlob; }
  };
}
for (const name of ['vide', 'blocs']) {
  Deno.test(`gestionnaires JSON : import → export → import (${name}) sans perte ni remplacement`, async () => {
    const app = await harness(), original = await fixture(name);
    const text = JSON.stringify(original);
    await app.importFile(new File([text], `${name}.json`, { type: 'application/json' }));
    equal(app.records.size, 1);
    const before = structuredClone([...app.records.values()][0]);
    const blob = await app.exportFile(), exported = JSON.parse(await blob.text());
    equal(blob.type, 'application/json');
    equal(typeof exported.exported_at, 'string');
    delete exported.exported_at; equal(exported, original);
    equal(app.downloads.length, 1);
    if (!app.downloads[0].endsWith('.conduite.json')) throw Error('Extension incorrecte');
    await app.importFile(new File([await blob.text()], app.downloads[0], { type: blob.type }));
    equal(app.records.size, 2); // Identifiants distincts, aucune émission remplacée.
    equal(app.records.get(before.id), before);
    const after = [...app.records.values()][1].data;
    delete after.exported_at; equal(after, original);
  });
}
Deno.test('gestionnaires JSON : statut modèle préservé', async () => {
  const app = await harness(), data = await fixture('blocs'); data.emission.is_template = true;
  await app.importFile(new File([JSON.stringify(data)], 'modele.json'));
  const exported = JSON.parse(await (await app.exportFile()).text());
  equal(exported.emission.is_template, true); equal(exported.blocks, data.blocks);
});
Deno.test('import invalide refusé avant création ou demande de nom', async () => {
  for (const content of ['{', JSON.stringify({ format: 'autre' })]) {
    const app = await harness(); await app.importFile(new File([content], 'invalide.json'));
    equal(app.records.size, 0); equal(app.prompts(), 0); equal(app.get('error').hidden, false);
  }
});
Deno.test('fichier trop volumineux refusé avant lecture et création', async () => {
  const app = await harness(); let read = false;
  await app.importFile({ size: 2 * 1024 * 1024 + 1, async text() { read = true; return ''; } });
  equal(read, false); equal(app.records.size, 0); equal(app.prompts(), 0);
});
