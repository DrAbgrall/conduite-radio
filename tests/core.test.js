import '../js/core.js';

function equal(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(`Obtenu ${JSON.stringify(actual)}, attendu ${JSON.stringify(expected)}`);
}
function rejects(fn) {
  let failed = false;
  try { fn(); } catch { failed = true; }
  if (!failed) throw Error('La valeur aurait dû être refusée.');
}
const core = globalThis.RadioCore;
const fixture = () => ({ format: 'conduite-radio', version: 1,
  emission: { theme: 'RadioPanik', start_time: '17:00:00', emission_date: '2026-10-17', is_template: false },
  blocks: [{ key: 'block-1', title: 'Actualités', position: 0 }],
  sequences: [{ type: 'Direct', direct: 'Bonjour', recorded: '', who: 'Animation', duration_seconds: 60, block_key: 'block-1', position: 0 }]
});
Deno.test('durées usuelles, heures et zéro', () => {
  equal(['02:30', '01:02:03', '00:00', '1440:00'].map(core.durationSeconds), [150, 3723, 0, 86400]);
});
Deno.test('durées négatives, fractionnaires, non finies et excessives refusées', () => {
  for (const value of ['-1:00', '00:90', '00:01.5', 'Infinity:00', '25:00:00', '', 'abc']) rejects(() => core.durationSeconds(value));
});
Deno.test('cumul et passage à minuit', () => {
  equal(core.schedule([{ duration: '00:30' }, { duration: '01:00' }], '23:59:30'), { times: ['23:59:30', '00:00:00'], total: 90, end: '00:01:00' });
});
Deno.test('conducteur vide', () => equal(core.schedule([], '17:00'), { times: [], total: 0, end: '17:00:00' }));
Deno.test('validation calendaire et horaires', () => {
  equal(core.validDate('2024-02-29'), true);
  equal(core.validDate('2026-02-29'), false);
  equal(core.validDate('2026-13-01'), false);
  equal(core.validTime('99:99'), false);
  equal(core.validTime('23:59:59'), true);
});
Deno.test('déplacements sans fragmentation des blocs', () => {
  const rows = [{}, { block_id: 'a' }, { block_id: 'a' }, {}];
  equal(core.canMoveSequence(rows, 1, 2), true);
  equal(core.canMoveSequence(rows, 0, 3), false);
  equal(core.canMoveSequence(rows, 1, 3), false);
  equal(core.canMoveSequence(rows, -1, 0), false);
  equal(core.canMoveSequence([{}, {}, {}], 0, 2), true);
});
Deno.test('JSON V18.2 compatible et aller-retour sans perte', () => {
  const original = fixture();
  equal(core.validateNative(JSON.parse(JSON.stringify(original))), original);
});
Deno.test('import vide et blocs vides acceptés', () => {
  const data = fixture(); data.sequences = [];
  equal(core.validateNative(data), data);
});
Deno.test('référence à un bloc inexistant refusée', () => {
  const data = fixture(); data.sequences[0].block_key = 'absent';
  rejects(() => core.validateNative(data));
});
Deno.test('métadonnées et types invalides refusés', () => {
  for (const change of [d => d.emission.start_time = '99:99', d => d.emission.emission_date = '2026-02-30', d => d.sequences[0].type = 'Autre', d => d.sequences[0].duration_seconds = 1.5, d => d.blocks.push({ ...d.blocks[0] })]) {
    const data = fixture(); change(data); rejects(() => core.validateNative(data));
  }
});
