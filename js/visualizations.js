/* Visualisations locales SVG/HTML, accessibles sans survol. */
(() => {
  'use strict';
  const colors = { Direct: '#79b987', Habillage: '#d69a52', PAD: '#779bcf', Appel: '#ae7ac8', Musique: '#e1c83f', Promo: '#e8a0a8' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function summarize(data) {
    RadioCore.validateNative(data);
    const byType = Object.fromEntries(RadioCore.TYPES.map(t => [t, 0])); let total = 0;
    data.sequences.forEach(r => { byType[r.type] += r.duration_seconds; total += r.duration_seconds; });
    return { byType, total };
  }
  function html(data, mode = 'clock') {
    const { byType, total } = summarize(data), duration = RadioDocument.formatDuration;
    const legend = '<ul class="vizLegend">' + RadioCore.TYPES.map(t => '<li><span style="background:' + colors[t] + '"></span>' + t + ' · ' + duration(byType[t]) + ' · ' + (total ? Math.round(byType[t] / total * 100) : 0) + ' %</li>').join('') + '</ul>';
    if (!total) return '<p>Aucune durée positive à visualiser.</p>' + legend;
    if (mode === 'bars') {
      const max = Math.max(...Object.values(byType));
      return '<div class="vizBars">' + RadioCore.TYPES.map(t => '<div><strong>' + t + '</strong><span class="vizBar" style="width:' + (byType[t] / max * 100) + '%;background:' + colors[t] + '"></span><span>' + duration(byType[t]) + '</span></div>').join('') + '</div>' + legend;
    }
    let elapsed = 0, circles = '', blockArcs = '', table = '';
    const circumference = 2 * Math.PI * 110, blockCircumference = 2 * Math.PI * 150;
    const runs = []; let run = null;
    data.sequences.forEach(r => {
      const begin = elapsed, end = begin + r.duration_seconds;
      const start = RadioCore.clock(data.emission.start_time, begin);
      if (r.duration_seconds > 0) {
        circles += '<circle cx="200" cy="200" r="110" fill="none" stroke="' + colors[r.type] + '" stroke-width="54" stroke-dasharray="' + (r.duration_seconds / total * circumference) + ' ' + circumference + '" stroke-dashoffset="' + (-begin / total * circumference) + '" transform="rotate(-90 200 200)"><title>' + esc(start + ' · ' + r.type + ' · ' + (r.direct || r.recorded) + ' · ' + duration(r.duration_seconds)) + '</title></circle>';
      }
      if (r.block_key && run?.key === r.block_key) run.end = end;
      else { if (run) runs.push(run); run = r.block_key ? { key: r.block_key, begin, end } : null; }
      elapsed = end;
      table += '<li>' + esc(start + ' · ' + r.type + ' · ' + duration(r.duration_seconds) + ' · ' + (r.direct || r.recorded)) + '</li>';
    });
    if (run) runs.push(run);
    runs.forEach((r, i) => {
      const block = data.blocks.find(b => b.key === r.key);
      if (!block || r.end === r.begin) return;
      blockArcs += '<circle cx="200" cy="200" r="150" fill="none" stroke="' + (i % 2 ? '#667067' : '#abb4a9') + '" stroke-width="12" stroke-dasharray="' + ((r.end - r.begin) / total * blockCircumference) + ' ' + blockCircumference + '" stroke-dashoffset="' + (-r.begin / total * blockCircumference) + '" transform="rotate(-90 200 200)"><title>' + esc('Bloc ' + block.title + ' · ' + duration(r.end - r.begin)) + '</title></circle>';
    });
    return '<svg class="localClock" viewBox="0 0 400 400" role="img" aria-label="Répartition des séquences dans l’émission"><text x="200" y="25" text-anchor="middle">Départ ' + esc(data.emission.start_time) + '</text>' + circles + blockArcs + '<text x="200" y="197" text-anchor="middle" font-size="26" font-weight="bold">' + duration(total) + '</text><text x="200" y="222" text-anchor="middle">durée totale</text></svg>' + legend + '<details><summary>Horaires et détails des séquences</summary><ol>' + table + '</ol></details>';
  }
  globalThis.RadioViews = Object.freeze({ summarize, html });
})();
