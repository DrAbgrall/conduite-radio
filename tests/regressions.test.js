import '../js/core.js';
const source = await Deno.readTextFile(new URL('../js/app.js', import.meta.url));

Deno.test('mode préparatoire : aucune connexion Supabase sans activation explicite', () => {
  const fragment = source.slice(source.indexOf('const collaborationEnabled='), source.indexOf('// La réinitialisation historique'));
  let calls = 0;
  const result = new Function('APP_CONFIG', 'supabase', 'URLSearchParams', 'location', fragment + ';return {db,emissionId};')(
    {}, { createClient() { calls++; throw Error('Accès interdit'); } }, URLSearchParams, { search: '?emission=production' }
  );
  if (calls || result.db !== null || result.emissionId !== null) throw Error('Le mode préparatoire doit rester déconnecté.');
});

Deno.test('recalcul avec en-tête de bloc : horaires et durée du bloc actualisés', () => {
  const sequenceCells = [{ textContent: '' }, { textContent: '' }];
  const end = { textContent: '' }, duration = { textContent: '' };
  const tbody = {
    querySelector(selector) {
      if (selector === '.endrow .time') return end;
      return sequenceCells[Number(selector.match(/data-i="(\d+)"/)[1])];
    },
    querySelectorAll() { return [{ dataset: { block: 'a' }, querySelector: () => duration }]; },
    // Ancien chemin erroné : l'en-tête n'a pas de cellule .time.
    rows: [{ querySelector: () => null }]
  };
  const body = source.slice(source.indexOf('function renderTimes()'), source.indexOf('function esc('));
  new Function('RadioCore', 'state', 'start', 'tbody', 'secFmt', 'blockDuration', body + ';renderTimes();')(
    RadioCore, { rows: [{ duration: '01:00' }, { duration: '02:00' }] }, { value: '17:00:00' }, tbody,
    n => String(Math.floor(n / 60)).padStart(2, '0') + ':00', () => 180
  );
  if (sequenceCells[0].textContent !== '17:00:00' || sequenceCells[1].textContent !== '17:01:00' || end.textContent !== '17:03:00' || duration.textContent !== '03:00') throw Error('Recalcul incorrect.');
});

Deno.test('le callback Realtime ne transmet pas le payload comme force', () => {
  const matches = [...source.matchAll(/\.on\('postgres_changes'.*?,(\(\)=>pullRemote\(\))\)/g)];
  if (matches.length !== 3) throw Error('Les trois abonnements doivent utiliser le callback explicite.');
  let received;
  const callback = new Function('pullRemote', 'return ' + matches[0][1])(force => { received = force; });
  callback({ eventType: 'UPDATE' });
  if (received !== undefined) throw Error('Le payload contourne les protections.');
});

Deno.test('mise à jour depuis l’accueil : ne pas valider les champs de l’éditeur masqué', async () => {
  const localSource = await Deno.readTextFile(new URL('../js/local-app.js', import.meta.url));
  const body = localSource.slice(localSource.indexOf('  async function flush('), localSource.indexOf('  function changed('));
  await new Function('session', 'clearTimeout', 'validInputs', 'let timer;\n' + body + '\nreturn flush();')(
    null, () => {}, () => { throw Error('Un éditeur fermé ne doit pas bloquer la mise à jour.'); }
  );
});
