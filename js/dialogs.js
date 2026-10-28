/* Dialogues HTML utilisables aussi dans les navigateurs intégrés sans prompt/confirm. */
(() => {
  'use strict';
  let active = false;
  function ask(message, initial) {
    if (active) return Promise.resolve(null);
    active = true;
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      const form = document.createElement('form'); form.method = 'dialog';
      const title = document.createElement('h2'); title.textContent = message; title.id = 'questionTitle';
      dialog.setAttribute('aria-labelledby', title.id); form.appendChild(title);
      let input;
      if (initial !== undefined) {
        const label = document.createElement('label'); label.textContent = 'Nom';
        input = document.createElement('input'); input.value = initial; input.maxLength = 1000;
        label.appendChild(input); form.appendChild(label);
      }
      const actions = document.createElement('div'); actions.className = 'toolbar';
      for (const [value, text] of [['cancel', 'Annuler'], ['ok', initial === undefined ? 'Confirmer' : 'Valider']]) {
        const button = document.createElement('button'); button.type = 'submit'; button.value = value; button.textContent = text; actions.appendChild(button);
      }
      form.appendChild(actions); dialog.appendChild(form); document.body.appendChild(dialog);
      // Entrée valide le texte plutôt que le premier bouton (Annuler).
      form.addEventListener('submit', e => { if (!e.submitter && input) { e.preventDefault(); dialog.close('ok'); } });
      input?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dialog.close('ok'); } });
      dialog.addEventListener('close', () => { const result = dialog.returnValue === 'ok' ? (input ? input.value : true) : null; dialog.remove(); active = false; resolve(result); }, { once: true });
      dialog.showModal(); if (input) { input.focus(); input.select(); }
    });
  }
  globalThis.RadioDialogs = Object.freeze({ text: (message, initial = '') => ask(message, initial), confirm: async message => (await ask(message)) === true });
})();
