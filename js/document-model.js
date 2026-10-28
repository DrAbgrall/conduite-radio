/* Opérations communes sur le format natif, sans DOM ni stockage. */
(() => {
  'use strict';
  const copy = data => structuredClone(RadioCore.validateNative(data));
  const row = () => ({ type: 'Direct', direct: '', recorded: '', duration_seconds: 60, who: '', block_key: null });
  function renumber(data) { data.sequences.forEach((r, i) => { r.position = i; }); data.blocks.forEach((b, i) => { b.position = i; }); return data; }
  function blank(theme = 'Nouvelle émission') {
    return { format: 'conduite-radio', version: 1, emission: { theme, emission_date: null, start_time: '17:00:00', is_template: false }, blocks: [], sequences: [] };
  }
  function formatDuration(n) { return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); }
  function sequence(data, index, action) {
    const next = copy(data);
    if (!next.sequences[index]) throw Error('Séquence introuvable.');
    if (action === 'duplicate') next.sequences.splice(index + 1, 0, structuredClone(next.sequences[index]));
    else if (action === 'remove') next.sequences.splice(index, 1);
    else {
      const target = index + (action === 'up' ? -1 : 1);
      const rows = next.sequences.map(r => ({ block_id: r.block_key }));
      if (!RadioCore.canMoveSequence(rows, index, target)) return next;
      [next.sequences[index], next.sequences[target]] = [next.sequences[target], next.sequences[index]];
    }
    return renumber(next);
  }
  function assign(data, index, key) {
    const next = copy(data), moving = next.sequences[index];
    if (!moving || (key && !next.blocks.some(b => b.key === key))) throw Error('Bloc ou séquence introuvable.');
    const old = moving.block_key || null;
    if (old === key) return next;
    next.sequences.splice(index, 1);
    const group = key || old;
    const last = next.sequences.findLastIndex(r => r.block_key === group);
    const target = last >= 0 ? last + 1 : Math.min(index, next.sequences.length);
    moving.block_key = key;
    next.sequences.splice(target, 0, moving);
    return renumber(next);
  }
  function block(data, key, action) {
    const next = copy(data), selected = next.blocks.find(b => b.key === key);
    if (!selected) throw Error('Bloc introuvable.');
    if (action === 'detach') {
      next.sequences.forEach(r => { if (r.block_key === key) r.block_key = null; });
      next.blocks = next.blocks.filter(b => b.key !== key);
    } else {
      const units = [];
      next.sequences.forEach(r => {
        const last = units.at(-1);
        if (r.block_key && last?.key === r.block_key) last.rows.push(r);
        else units.push({ key: r.block_key, rows: [r] });
      });
      if (units.filter(u => u.key === key).length > 1) throw Error('Ce bloc importé est dispersé. Regroupez ses séquences avant de déplacer le bloc.');
      const from = units.findIndex(u => u.key === key), to = from + (action === 'up' ? -1 : 1);
      if (from >= 0 && to >= 0 && to < units.length) [units[from], units[to]] = [units[to], units[from]];
      next.sequences = units.flatMap(u => u.rows);
    }
    return renumber(next);
  }
  globalThis.RadioDocument = Object.freeze({ blank, row, formatDuration, renumber, sequence, assign, block });
})();
