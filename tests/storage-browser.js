(async () => {
  const store = RadioLocalStore.createStore('conduite-radio-v19-tests-' + crypto.randomUUID());
  const results = document.getElementById('results'); results.textContent = '';
  let passed = 0, failed = 0;
  const equal = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
  async function test(name, run) { try { await run(); passed++; results.textContent += 'OK — ' + name + '\n'; } catch (e) { failed++; results.textContent += 'ÉCHEC — ' + name + ': ' + e.message + '\n'; } }
  const d = RadioDocument.blank('Version A'); let record;
  await test('Création et relecture après fermeture de connexion', async () => {
    record = await store.save('test', d, 'Création', 0); equal((await store.get('test')).data, d); equal(record.revision, 1);
  });
  await test('Liste des conducteurs', async () => { equal((await store.list()).length, 1); });
  await test('Sauvegardes automatiques regroupées', async () => {
    record = await store.save('test', { ...d, emission: { ...d.emission, theme: 'Version B' } }, 'Automatique', record.revision);
    equal(record.history.length, 0);
  });
  await test('Point de retour avant action importante', async () => {
    record = await store.save('test', { ...d, emission: { ...d.emission, theme: 'Version C' } }, 'Avant suppression', record.revision, true);
    equal(record.history[0].data.emission.theme, 'Version B');
  });
  await test('Conflit entre deux onglets : écrasement refusé', async () => {
    let refused = false;
    try { await store.save('test', d, 'Conflit', 1); } catch (e) { refused = e.name === 'ConflictError'; }
    equal(refused, true); equal((await store.get('test')).data.emission.theme, 'Version C');
  });
  await test('Restauration conserve l’état remplacé', async () => {
    record = await store.restore('test', 0, record.revision);
    equal(record.data.emission.theme, 'Version B'); equal(record.history[0].data.emission.theme, 'Version C');
  });
  await test('Ancien aperçu de restauration refusé', async () => {
    let refused = false; try { await store.restore('test', 0, record.revision - 1); } catch { refused = true; } equal(refused, true);
  });
  await test('Historique borné à vingt versions', async () => {
    for (let i = 0; i < 23; i++) record = await store.save('test', { ...d, emission: { ...d.emission, theme: 'Version ' + i } }, 'Point de retour', record.revision, true);
    equal(record.history.length, 20);
  });
  await test('JSON compatible après stockage et restauration', async () => { const data = JSON.parse(JSON.stringify(record.data)); equal(RadioCore.validateNative(data), record.data); });
  await test('Deux créations concurrentes : une seule acceptée', async () => {
    const writes = await Promise.allSettled([store.save('concurrent', d, 'A', 0), store.save('concurrent', d, 'B', 0)]);
    equal(writes.filter(w => w.status === 'fulfilled').length, 1);
  });
  results.textContent += `\n${passed} réussis · ${failed} échec(s)`;
  document.title = `V19 — ${passed} tests réussis, ${failed} échec(s)`;
})();
