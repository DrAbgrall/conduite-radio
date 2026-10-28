/* Interface locale : aucun script CDN, aucune requête Supabase. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const core = RadioCore, model = RadioDocument, store = RadioLocalStore;
  const askText = RadioDialogs.text, askConfirm = RadioDialogs.confirm;
  for(const [id,direction] of [['scrollRundownLeft',-1],['scrollRundownRight',1]]){
    const button=$(id);if(button)button.onclick=()=>{const area=$('blockList');area.scrollBy({left:direction*Math.max(160,area.clientWidth*.65),behavior:'smooth'});};
  }
  let session = null, timer, busy = false, historyRecord = null, selectedVersion = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = value => new Date(value).toLocaleString('fr-BE');
  function error(err) { const message=err.message || String(err); $('error').textContent=message; $('error').hidden=false; if($('historyDialog').open){$('historyError').textContent=message;$('historyError').hidden=false;} }
  function clearError() { $('error').hidden = true; }
  function status(state, err) {
    $('saveStatus').textContent = ({ pending: 'Modifications à enregistrer…', saving: 'Enregistrement…', saved: 'Enregistré sur cet appareil', error: 'Non enregistré — exportez votre copie' })[state];
    if (state === 'saved') clearError();
    if (err) error(err);
  }
  function validInputs() {
    const invalid = $('editor').querySelector(':invalid');
    if (invalid) { invalid.reportValidity(); throw Error('Corrigez le champ invalide avant de continuer.'); }
  }
  async function flush(reason, checkpoint) {
    clearTimeout(timer);
    if (!session) return;
    validInputs();
    await session.flush(reason, checkpoint);
  }
  function changed(next) {
    session.update(model.renumber(next));
    clearTimeout(timer);
    timer = setTimeout(() => flush().catch(error), 700);
  }
  function bind(id, handler) {
    $(id).addEventListener('click', () => Promise.resolve().then(handler).catch(error));
  }
  async function action(operation, reason = 'Avant modification', checkpoint = false) {
    if (busy) return;
    busy = true; $('editor').inert = true; let applied=false;
    try {
      await flush();
      const next = operation(structuredClone(session.data));
      session.update(model.renumber(next)); applied=true;
      await session.flush(reason, checkpoint);
      clearError(); render();
    } catch (err) { if(applied)render(); throw err; }
    finally { busy = false; $('editor').inert = false; }
  }
  async function library() {
    if (session) await flush();
    session = null; clearError();
    $('editor').hidden = true; $('library').hidden = false;
    const documents = (await store.list()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    $('documents').innerHTML = documents.length ? documents.map(d => `<article class="document"><h3>${esc(d.theme || 'Sans titre')}</h3><p>${d.isTemplate ? 'Modèle · ' : ''}${esc(when(d.updatedAt))}</p><button data-open="${esc(d.id)}">Ouvrir</button></article>`).join('') : '<p>Aucun conducteur local. Créez-en un ou importez un fichier JSON.</p>';
    $('saveStatus').textContent = `${documents.length} conducteur(s) sur cet appareil`;
    window.dispatchEvent?.(new Event('radio:idle'));
  }
  async function open(id) {
    if (session) await flush();
    const record = await store.get(id);
    if (!record) throw Error('Conducteur introuvable.');
    core.validateNative(record.data);
    session = new RadioLocalSession(store, record, status);
    $('library').hidden = true; $('editor').hidden = false; clearError(); render(); status('saved');
  }
  async function create(data, reason) {
    core.validateNative(data);
    const id = crypto.randomUUID();
    await store.save(id, data, reason, 0);
    await open(id);
  }
  function render() {
    if (!session) return;
    const data = session.data, m = data.emission;
    const moveRows = data.sequences.map(r => ({ block_id: r.block_key }));
    $('localTheme').value = m.theme;
    $('localDate').value = m.emission_date || '';
    $('localStart').value = m.start_time;
    $('localTemplate').checked = !!m.is_template;
    $('editorTitle').textContent = m.theme || 'Sans titre';
    const shown = new Set();
    const blockHeader = b => `<tr class="localBlock"><td colspan="7"><div class="block"><strong>${esc(b.title || 'Bloc')} <span data-block-duration="${esc(b.key)}"></span></strong><button data-block="${esc(b.key)}" data-action="rename">Renommer</button><button data-block="${esc(b.key)}" data-action="up" aria-label="Monter le bloc ${esc(b.title)}">↑</button><button data-block="${esc(b.key)}" data-action="down" aria-label="Descendre le bloc ${esc(b.title)}">↓</button><button data-block="${esc(b.key)}" data-action="detach">Retirer le bloc</button></div></td></tr>`;
    const rows = data.sequences.map((r, i) => {
      let heading = '';
      if (r.block_key && !shown.has(r.block_key)) { shown.add(r.block_key); heading = blockHeader(data.blocks.find(b => b.key === r.block_key)); }
      return heading + `<tr class="sequence row-${r.type.toLowerCase()}" data-index="${i}">
      <td class="localTime"><span data-time="${i}"></span></td>
      <td><select data-field="type" aria-label="Type de la séquence ${i + 1}">${core.TYPES.map(t => `<option ${r.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
      <td><textarea rows="1" data-field="direct" aria-label="Direct de la séquence ${i + 1}">${esc(r.direct)}</textarea></td>
      <td><textarea rows="1" data-field="recorded" aria-label="Enregistré de la séquence ${i + 1}">${esc(r.recorded)}</textarea></td>
      <td><input data-field="duration_seconds" aria-label="Durée de la séquence ${i + 1} (MM:SS ou HH:MM:SS)" value="${model.formatDuration(r.duration_seconds)}" inputmode="numeric" required></td>
      <td><input data-field="who" aria-label="Qui, séquence ${i + 1}" value="${esc(r.who)}"><select class="localBlockSelect" data-field="block_key" aria-label="Bloc de la séquence ${i + 1}"><option value="">Sans bloc</option>${data.blocks.map(b => `<option value="${esc(b.key)}" ${r.block_key === b.key ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></td>
      <td class="localActions"><button data-row-action="up" aria-label="Monter la séquence ${i + 1}" ${core.canMoveSequence(moveRows, i, i - 1) ? '' : 'disabled'}>↑</button><button data-row-action="down" aria-label="Descendre la séquence ${i + 1}" ${core.canMoveSequence(moveRows, i, i + 1) ? '' : 'disabled'}>↓</button><button data-row-action="duplicate" aria-label="Dupliquer la séquence ${i + 1}">⧉</button><button data-row-action="remove" aria-label="Supprimer la séquence ${i + 1}">×</button></td>
    </tr>`;
    }).join('');
    const emptyBlocks = data.blocks.filter(b => !shown.has(b.key)).map(blockHeader).join('');
    $('sequences').innerHTML = rows + emptyBlocks || '<tr><td colspan="7" class="emptySequence">Aucune séquence. Ajoutez la première.</td></tr>';
    updateTimes();
  }
  function updateTimes() {
    const data = session.data;
    const schedule = core.schedule(data.sequences.map(r => ({ duration: model.formatDuration(r.duration_seconds) })), data.emission.start_time);
    document.querySelectorAll('[data-time]').forEach(el => { el.textContent = schedule.times[Number(el.dataset.time)]; });
    $('total').textContent = `Durée totale : ${model.formatDuration(schedule.total)}`;
    $('end').textContent = `FIN D’ÉMISSION · ${schedule.end}`;
    document.querySelectorAll('[data-block-duration]').forEach(el => {
      const members = data.sequences.filter(r => r.block_key === el.dataset.blockDuration);
      el.textContent = `· ${model.formatDuration(members.reduce((sum, r) => sum + r.duration_seconds, 0))} · ${members.length} séquence(s)`;
    });
  }
  $('documents').addEventListener('click', e => {
    const button = e.target.closest('[data-open]');
    if (button) open(button.dataset.open).catch(error);
  });
  bind('newDocument', async () => {
    const theme = await askText('Nom du nouveau conducteur :', 'Nouvelle émission');
    if (theme !== null) await create(model.blank(theme.trim() || 'Nouvelle émission'), 'Création');
  });
  bind('back', library);
  bind('retrySave', async () => { await flush(); clearError(); });
  bind('reloadDocument', async () => {
    if (!await askConfirm('Recharger la copie enregistrée ? Vos modifications non enregistrées seront abandonnées. Exportez-les d’abord si nécessaire.')) return;
    const id = session.id; clearTimeout(timer); await session.queue; session = null; await open(id);
  });
  bind('addSequence', () => action(data => { data.sequences.push(model.row()); return data; }, 'Avant ajout de séquence'));
  bind('addLocalBlock', async () => {
    const title = await askText('Nom du bloc :', 'Nouveau bloc');
    if (title === null) return;
    await action(data => { data.blocks.push({ key: crypto.randomUUID(), title: title.trim() || 'Bloc', position: data.blocks.length }); return data; });
  });
  for (const [id, field] of [['localTheme', 'theme'], ['localDate', 'emission_date'], ['localStart', 'start_time'], ['localTemplate', 'is_template']]) {
    $(id).addEventListener('input', () => {
      const el = $(id); el.setCustomValidity('');
      const value = field === 'is_template' ? el.checked : field === 'emission_date' ? el.value || null : el.value;
      if ((field === 'start_time' && !core.validTime(value)) || (field === 'emission_date' && !core.validDate(value))) { el.setCustomValidity('Date ou heure invalide.'); status('pending'); return; }
      const next = structuredClone(session.data); next.emission[field] = value;
      try { changed(next); } catch(err) { el.setCustomValidity(err.message); error(err); return; }
      $('editorTitle').textContent = next.emission.theme || 'Sans titre'; updateTimes();
    });
  }
  $('sequences').addEventListener('input', e => {
    const el = e.target, field = el.dataset.field;
    if (!field || field === 'block_key') return;
    try {
      el.setCustomValidity('');
      const value = field === 'duration_seconds' ? core.durationSeconds(el.value) : el.value;
      const next = structuredClone(session.data); next.sequences[Number(el.closest('[data-index]').dataset.index)][field] = value;
      changed(next); updateTimes();
    } catch (err) { el.setCustomValidity(err.message); status('pending'); }
  });
  $('sequences').addEventListener('change', e => {
    if (e.target.dataset.field !== 'block_key') return;
    const index = Number(e.target.closest('[data-index]').dataset.index), key = e.target.value || null;
    action(data => model.assign(data, index, key), 'Avant changement de bloc').catch(error);
  });
  $('sequences').addEventListener('click', async e => {
    const button = e.target.closest('[data-row-action]'); if (!button) return;
    const index = Number(button.closest('[data-index]').dataset.index), op = button.dataset.rowAction;
    if (op === 'remove' && !await askConfirm('Supprimer cette séquence ? Une version précédente sera conservée.')) return;
    action(data => model.sequence(data, index, op), op === 'remove' ? 'Avant suppression de séquence' : 'Avant modification de séquence', op === 'remove').catch(error);
  });
  $('blockList').addEventListener('click', async e => {
    const button = e.target.closest('[data-block]'); if (!button) return;
    const key = button.dataset.block, op = button.dataset.action;
    if (op === 'rename') {
      const title = await askText('Nom du bloc :', session.data.blocks.find(b => b.key === key).title);
      if (title === null) return;
      action(data => { data.blocks.find(b => b.key === key).title = title.trim() || 'Bloc'; return data; }).catch(error);
    } else {
      if (op === 'detach' && !await askConfirm('Retirer ce bloc ? Ses séquences seront conservées sans bloc.')) return;
      action(data => model.block(data, key, op), op === 'detach' ? 'Avant retrait de bloc' : 'Avant déplacement de bloc', op === 'detach').catch(error);
    }
  });
  // Ouverture directe dans le geste utilisateur, notamment sur Safari.
  $('importDocument').onclick = () => { $('fileInput').value = ''; $('fileInput').click(); };
  $('fileInput').onchange = async () => {
    const file = $('fileInput').files?.[0]; if (!file) return;
    try {
      if (file.size > core.MAX_NATIVE_BYTES) throw Error('Fichier trop volumineux (maximum 2 Mo).');
      const data = core.validateNative(JSON.parse(await file.text()));
      const title = await askText('Nom de la nouvelle copie importée :', data.emission.theme || 'Émission importée');
      if (title === null) return;
      data.emission.theme = title.trim() || 'Émission importée';
      await create(data, 'Import JSON');
    } catch (err) { error(err); }
  };
  bind('exportDocument', () => {
    validInputs();
    // Exporter aussi la copie en mémoire si le stockage est en erreur ou en conflit.
    const data = structuredClone(core.validateNative(session.data));
    const url = URL.createObjectURL(new Blob([core.nativeText(data)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url;
    a.download = (data.emission.theme || 'conduite-radio').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 100) + '.conduite.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
  function download(blob, extension) {
    validInputs();
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = (session.data.emission.theme || 'conduite-radio').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0,100) + extension;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  bind('exportHtml', () => { validInputs(); download(new Blob([RadioExports.html(session.data)], {type:'text/html;charset=utf-8'}), '.html'); });
  bind('exportExcel', () => { validInputs(); download(new Blob([RadioExports.xlsx(session.data)], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), '.xlsx'); });
  bind('printDocument', () => {
    validInputs(); const frame=$('printFrame');
    frame.onload=()=>{ frame.contentWindow.focus(); frame.contentWindow.print(); };
    frame.srcdoc=RadioExports.html(session.data);
  });
  let vizMode='clock';
  function renderVisualization(){ $('vizContent').innerHTML=RadioViews.html(session.data,vizMode); }
  bind('visualize',()=>{validInputs();$('vizTitle').textContent=session.data.emission.theme||'Visualiser';renderVisualization();$('vizDialog').showModal();});
  bind('vizClock',()=>{vizMode='clock';renderVisualization();});
  bind('vizBars',()=>{vizMode='bars';renderVisualization();});
  globalThis.RadioLocalApp=Object.freeze({canAutoUpdate(){return !busy&&!session&&!document.querySelector('dialog[open]')&&!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');},async prepareUpdate(){await flush();if(session?.dirty)throw Error('Des modifications restent à enregistrer.');return true;}});
  bind('history', async () => {
    await flush(); historyRecord = await store.get(session.id);
    if (historyRecord.revision !== session.revision) throw Error('Ce conducteur a changé dans un autre onglet. Exportez votre copie puis rechargez-la.');
    selectedVersion = null; $('preview').hidden = true; $('historyError').hidden=true;
    $('versions').innerHTML = historyRecord.history.length ? historyRecord.history.map((v, i) => `<div class="version"><span>${esc(when(v.at))} · ${esc(v.reason)} · ${v.data.sequences.length} séquence(s)</span><button data-version="${i}">Aperçu</button></div>`).join('') : '<p>Aucune version précédente pour le moment.</p>';
    $('historyDialog').showModal();
  });
  $('versions').onclick = e => {
    const button = e.target.closest('[data-version]'); if (!button) return;
    selectedVersion = Number(button.dataset.version);
    const data = historyRecord.history[selectedVersion].data;
    $('previewText').textContent = `${data.emission.theme}\n${data.emission.emission_date || 'Sans date'} · Départ ${data.emission.start_time}\n${data.blocks.length} bloc(s) · ${data.sequences.length} séquence(s)\n\n` + data.sequences.map((r, i) => `${i + 1}. ${r.type} · ${model.formatDuration(r.duration_seconds)} · ${r.direct || r.recorded} · ${r.who}`).join('\n');
    $('preview').hidden = false;
  };
  bind('restoreVersion', async () => {
    if (selectedVersion === null || busy) return;
    if (!await askConfirm('Restaurer cette version ? L’état actuel restera disponible dans l’historique.')) return;
    busy = true; $('restoreVersion').disabled = true;
    try { await session.restore(selectedVersion, historyRecord.revision); $('historyDialog').close(); clearError(); render(); }
    finally { busy = false; $('restoreVersion').disabled = false; }
  });
  window.addEventListener('beforeunload', e => {
    if (session && (session.dirty || $('editor').querySelector(':invalid'))) { e.preventDefault(); e.returnValue = ''; }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && session) flush().catch(error); });
  if (!('indexedDB' in globalThis)) error(Error('Ce navigateur ne permet pas le stockage local IndexedDB.'));
  else library().catch(error);
})();
