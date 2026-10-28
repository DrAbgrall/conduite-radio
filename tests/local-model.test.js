import '../js/core.js';
import '../js/document-model.js';
import '../js/local-session.js';
const m = RadioDocument;
function equal(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); }
const fixture = () => {
  const d = m.blank('Test');
  d.blocks = [{ key: 'a', title: 'A', position: 0 }, { key: 'b', title: 'B', position: 1 }];
  d.sequences = [null, 'a', 'a', 'b', null].map((key, i) => ({ ...m.row(), direct: String(i), block_key: key, position: i }));
  return d;
};
Deno.test('duplication préserve contenu, bloc et positions sans muter la source', () => {
  const d = fixture(), next = m.sequence(d, 1, 'duplicate');
  equal(d.sequences.length, 5); equal(next.sequences.length, 6);
  equal(next.sequences[2].block_key, 'a'); equal(next.sequences[2].direct, '1');
  equal(next.sequences.map(r => r.position), [0, 1, 2, 3, 4, 5]);
});
Deno.test('affecter et quitter un bloc préserve ses autres membres', () => {
  const next = m.assign(fixture(), 0, 'a');
  equal(next.sequences.map(r => r.direct), ['1', '2', '0', '3', '4']);
  equal(m.assign(next, 0, null).sequences.map(r => r.direct), ['2', '0', '1', '3', '4']);
});
Deno.test('déplacement de bloc préserve ordre interne et toutes les séquences', () => {
  const next = m.block(fixture(), 'a', 'down');
  equal(next.sequences.map(r => r.direct), ['0', '3', '1', '2', '4']);
});
Deno.test('retirer un bloc conserve ses séquences et les autres blocs', () => {
  const next = m.block(fixture(), 'a', 'detach');
  equal(next.sequences.length, 5); equal(next.blocks.map(b => b.key), ['b']);
  equal(next.sequences.map(r => r.block_key), [null, null, null, 'b', null]);
});
Deno.test('session : saisie pendant une sauvegarde conservée et écritures sérialisées', async () => {
  let release, writes = [];
  const store = { async save(id, data, reason, rev) {
    writes.push({ data: structuredClone(data), rev });
    if (writes.length === 1) await new Promise(resolve => { release = resolve; });
    return { revision: rev + 1 };
  } };
  const session = new RadioLocalSession(store, { id: 'test', revision: 1, data: m.blank('Initial') });
  session.update(m.blank('Premier')); const first = session.flush();
  await Promise.resolve();
  session.update(m.blank('Deuxième')); const second = session.flush();
  release(); await first; await second;
  equal(writes.map(w => [w.data.emission.theme, w.rev]), [['Premier', 1], ['Deuxième', 2]]);
  equal(session.data.emission.theme, 'Deuxième'); equal(session.dirty, false);
});
Deno.test('session : échec de stockage conserve la copie exportable et autorise une nouvelle tentative', async () => {
  let fail = true;
  const session = new RadioLocalSession({ async save() { if (fail) throw Error('Quota'); return { revision: 2 }; } }, { id: 'test', revision: 1, data: m.blank('Initial') });
  session.update(m.blank('À préserver'));
  try { await session.flush(); } catch { /* attendu */ }
  equal(session.dirty, true); equal(session.data.emission.theme, 'À préserver'); equal(session.revision, 1);
  fail = false; await session.flush(); equal(session.dirty, false);
});
