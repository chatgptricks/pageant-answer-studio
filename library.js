(() => {
  const spanish = document.documentElement.lang === 'es';
  const labels = spanish ? {
    answer: 'Respuesta', script: 'Script', copy: 'Copiar texto completo',
    empty: 'No hay textos que coincidan con tu búsqueda.',
    saved: 'Texto guardado en este navegador.', duplicate: 'Este texto ya está en tu biblioteca.',
    invalid: 'Elige un tipo e ingresa un título y un texto.',
    unavailable: 'No se pudo leer la biblioteca guardada. No se harán cambios. Revisa el almacenamiento del navegador e inténtalo de nuevo.',
    failed: 'No se pudo guardar el texto. Tu borrador sigue aquí. Revisa el espacio disponible e inténtalo de nuevo.',
    copied: 'Texto completo copiado', copyFailed: 'No se pudo copiar. Selecciona el texto y cópialo.'
  } : {
    answer: 'Answer', script: 'Script', copy: 'Copy full text',
    empty: 'No entries match your search.',
    saved: 'Entry saved in this browser.', duplicate: 'This text is already in your library.',
    invalid: 'Choose a type and enter a title and body.',
    unavailable: 'Could not read the saved library. No changes will be made. Check browser storage and try again.',
    failed: 'Could not save the entry. Your draft is still here. Check available storage and try again.',
    copied: 'Full text copied', copyFailed: 'Could not copy. Select the text and copy it.'
  };
  const storageKey = 'pageantManualEntries';
  const included = [
    {
      id: 'miss-wonder-all-stars-opening', type: 'script', title: 'Opening',
      body: 'Welcome, everyone, to the preliminary competition of the very first edition of Miss Wonder All Stars!\n\nI am Angel Muse Lane, Miss Grand Wonder 3rd Edition, and it is an honor to be your host for this special occasion.\n\nOur contestants are ready to take the stage and share their charisma, confidence, and the unique sparkle that makes each of them a star. Thank you all for joining us and being part of this first edition.\n\nLet’s welcome our stars with a big round of applause as we begin the opening of Miss Wonder All Stars!'
    },
    {
      id: 'miss-wonder-all-stars-evening-gown', type: 'script', title: 'Evening gown segment',
      body: 'Elegance takes center stage as we move on to our Evening Gown Segment.\n\nEach contestant will have the opportunity to express her style and personality, bringing grace and confidence to every step. Get ready for a showcase of glamour, sophistication, and unforgettable presence.\n\nLadies and gentlemen, please welcome the contestants of Miss Wonder All Stars in their evening gowns! Let’s give them a warm round of applause!'
    }
  ];
  const form = document.getElementById('manualEntryForm');
  const type = document.getElementById('manualEntryType');
  const title = document.getElementById('manualEntryTitle');
  const body = document.getElementById('manualEntryBody');
  const status = document.getElementById('manualEntryStatus');
  const list = document.getElementById('manualEntryList');
  const search = document.getElementById('manualLibrarySearch');
  const filter = document.getElementById('manualLibraryType');
  const add = document.getElementById('addManualEntry');
  const save = document.getElementById('saveManualEntry');
  let saving = false;

  const normalized = text => text.normalize('NFC').toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();
  const identity = entry => `${entry.type}:${normalized(entry.body)}`;
  function readEntries() {
    const stored = localStorage.getItem(storageKey);
    if (stored === null) return [];
    const entries = JSON.parse(stored);
    if (!Array.isArray(entries) || entries.some(entry => !entry ||
      !['answer', 'script'].includes(entry.type) ||
      typeof entry.id !== 'string' || !entry.id ||
      typeof entry.title !== 'string' || !entry.title.trim() ||
      typeof entry.body !== 'string' || !entry.body.trim())) {
      throw new Error('Invalid saved library');
    }
    return entries;
  }
  function combinedEntries(stored) {
    const seen = new Set();
    // Saved entries come first so their original text and title stay intact.
    return [...stored, ...included].filter(entry => {
      const key = identity(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function render() {
    let stored = [];
    try { stored = readEntries(); }
    catch { status.textContent = labels.unavailable; }
    const query = normalized(search.value);
    const entries = combinedEntries(stored).filter(entry =>
      (!filter.value || entry.type === filter.value) &&
      normalized(`${entry.title} ${entry.body}`).includes(query));
    list.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'bank-note';
      empty.textContent = labels.empty;
      list.append(empty);
    }
    for (const [index, entry] of entries.entries()) {
      const card = document.createElement('article');
      card.className = 'manual-entry card';
      card.dataset.entryType = entry.type;
      const kind = document.createElement('span');
      kind.className = 'manual-entry-kind';
      kind.textContent = labels[entry.type];
      const heading = document.createElement('h3');
      heading.textContent = entry.title;
      const text = document.createElement('p');
      text.className = 'manual-entry-body';
      text.textContent = entry.body;
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'bank-action';
      copy.dataset.copyEntry = index;
      copy.textContent = labels.copy;
      copy.setAttribute('aria-label', `${labels.copy}: ${entry.title}`);
      copy.addEventListener('click', async () => {
        copy.disabled = true;
        try {
          // This library preserves authored text, including names and paragraphs.
          await copyText(entry.body, true);
          showToast(labels.copied);
        } catch { status.textContent = labels.copyFailed; }
        finally { copy.disabled = false; }
      });
      card.append(kind, heading, text, copy);
      list.append(card);
    }
  }
  function closeForm() {
    form.reset();
    form.hidden = true;
    add.setAttribute('aria-expanded', 'false');
    add.focus();
  }
  add.addEventListener('click', () => {
    form.hidden = false;
    add.setAttribute('aria-expanded', 'true');
    status.textContent = '';
    type.focus();
  });
  document.getElementById('cancelManualEntry').addEventListener('click', () => {
    closeForm();
    status.textContent = '';
  });
  form.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeForm();
      status.textContent = '';
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (form.hidden || saving) return;
    if (!['answer', 'script'].includes(type.value) || !title.value.trim() || !body.value.trim()) {
      status.textContent = labels.invalid;
      return;
    }
    saving = true;
    save.disabled = true;
    try {
      let entries;
      try { entries = readEntries(); }
      catch { status.textContent = labels.unavailable; return; }
      const entry = {
        id: globalThis.crypto?.randomUUID?.() || `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: type.value, title: title.value.trim(), body: body.value
      };
      if (combinedEntries(entries).some(existing => identity(existing) === identity(entry))) {
        status.textContent = labels.duplicate;
        return;
      }
      try { localStorage.setItem(storageKey, JSON.stringify([...entries, entry])); }
      catch { status.textContent = labels.failed; return; }
      closeForm();
      search.value = '';
      filter.value = '';
      status.textContent = labels.saved;
      render();
    } finally {
      saving = false;
      save.disabled = false;
    }
  });
  search.addEventListener('input', render);
  filter.addEventListener('change', render);
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) {
      status.textContent = '';
      render();
    }
  });
  render();
})();
