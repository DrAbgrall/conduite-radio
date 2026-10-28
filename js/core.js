/* Moteur partagé : aucune dépendance au DOM, au réseau ou au stockage. */
(() => {
  'use strict';
  const MAX_NATIVE_BYTES = 2 * 1024 * 1024;
  function nativeText(data, at = new Date().toISOString()) {
    const text = JSON.stringify({ ...data, exported_at: at }, null, 2);
    if (new TextEncoder().encode(text).byteLength > MAX_NATIVE_BYTES) throw Error('Conducteur trop volumineux (maximum 2 Mo au format JSON). Répartissez les textes entre plusieurs conducteurs.');
    return text;
  }
  const TYPES = Object.freeze(['Direct', 'Habillage', 'PAD', 'Appel', 'Musique', 'Promo']);
  function durationSeconds(value) {
    if (typeof value !== 'string' || !/^\d+:\d{2}(:\d{2})?$/.test(value.trim())) throw Error('Durée attendue : MM:SS ou HH:MM:SS.');
    const p = value.trim().split(':').map(Number);
    if (p.at(-1) > 59 || (p.length === 3 && p[1] > 59)) throw Error('Minutes et secondes invalides.');
    const n = p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2];
    if (!Number.isSafeInteger(n) || n > 86400) throw Error('Durée maximale par séquence : 24 heures.');
    return n;
  }
  function validTime(value) {
    return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
  }
  function validDate(value) {
    if (value == null || value === '') return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }
  function clock(base, elapsed) {
    if (!validTime(base) || !Number.isSafeInteger(elapsed)) throw Error('Horaire invalide.');
    const p = base.split(':').map(Number);
    const n = ((p[0] * 3600 + p[1] * 60 + (p[2] || 0) + elapsed) % 86400 + 86400) % 86400;
    return [Math.floor(n / 3600), Math.floor(n % 3600 / 60), n % 60].map(x => String(x).padStart(2, '0')).join(':');
  }
  function schedule(rows, base) {
    let elapsed = 0;
    const times = rows.map(r => {
      const time = clock(base, elapsed);
      elapsed += durationSeconds(r.duration);
      return time;
    });
    return { times, total: elapsed, end: clock(base, elapsed) };
  }
  function canMoveSequence(rows, from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return false;
    const block = rows[from].block_id || null;
    return rows.slice(Math.min(from, to), Math.max(from, to) + 1).every(r => (r.block_id || null) === block);
  }
  function validateNative(data) {
    if (!data || data.format !== 'conduite-radio' || data.version !== 1 || !data.emission || !Array.isArray(data.blocks) || !Array.isArray(data.sequences)) throw Error('Format de conduite non reconnu.');
    if (data.blocks.length > 500 || data.sequences.length > 5000) throw Error('Trop de blocs ou de séquences.');
    const m = data.emission;
    if (typeof m.theme !== 'string' || !validTime(m.start_time) || !validDate(m.emission_date)) throw Error('Métadonnées invalides.');
    const keys = new Set();
    for (const b of data.blocks) {
      if (!b || typeof b.key !== 'string' || !b.key || keys.has(b.key) || typeof b.title !== 'string') throw Error('Bloc invalide.');
      keys.add(b.key);
    }
    for (const r of data.sequences) {
      if (!r || !TYPES.includes(r.type) || !Number.isInteger(r.duration_seconds) || r.duration_seconds < 0 || r.duration_seconds > 86400 || ['direct', 'recorded', 'who'].some(k => typeof r[k] !== 'string') || (r.block_key != null && !keys.has(r.block_key))) throw Error('Séquence invalide.');
    }
    if (m.is_template !== undefined && typeof m.is_template !== 'boolean') throw Error('Statut de modèle invalide.');
    nativeText(data);
    return data;
  }
  globalThis.RadioCore = Object.freeze({ MAX_NATIVE_BYTES, nativeText, TYPES, durationSeconds, validTime, validDate, clock, schedule, canMoveSequence, validateNative });
})();
