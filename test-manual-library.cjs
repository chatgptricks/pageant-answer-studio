const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom');

const root = __dirname;
const key = 'pageantManualEntries';
const expectedScripts = [
  {
    title: 'Opening',
    body: `Welcome, everyone, to the preliminary competition of the very first edition of Miss Wonder All Stars!

I am Angel Muse Lane, Miss Grand Wonder 3rd Edition, and it is an honor to be your host for this special occasion.

Our contestants are ready to take the stage and share their charisma, confidence, and the unique sparkle that makes each of them a star. Thank you all for joining us and being part of this first edition.

Let’s welcome our stars with a big round of applause as we begin the opening of Miss Wonder All Stars!`
  },
  {
    title: 'Evening gown segment',
    body: `Elegance takes center stage as we move on to our Evening Gown Segment.

Each contestant will have the opportunity to express her style and personality, bringing grace and confidence to every step. Get ready for a showcase of glamour, sophistication, and unforgettable presence.

Ladies and gentlemen, please welcome the contestants of Miss Wonder All Stars in their evening gowns! Let’s give them a warm round of applause!`
  }
];
const settle = () => new Promise(resolve => setImmediate(resolve));

async function boot(file, { storage = {}, readFailure = false, writeFailure = false } = {}) {
  const errors = [];
  const copied = [];
  const writes = [];
  let dom;
  dom = new JSDOM(fs.readFileSync(path.join(root, file), 'utf8'), {
    runScripts: 'dangerously',
    url: `https://pageants.test/${file}#library`,
    beforeParse(w) {
      w.scrollTo = () => {};
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async text => { copied.push(text); } } });
      w.addEventListener('error', event => errors.push(event.error || event.message));
      const prototype = w.Storage.prototype;
      const originalGet = prototype.getItem;
      const originalSet = prototype.setItem;
      Object.entries(storage).forEach(([name, value]) => originalSet.call(w.localStorage, name, value));
      prototype.getItem = function (name) {
        if (name === key && readFailure) throw new w.DOMException('Storage unavailable', 'SecurityError');
        return originalGet.call(this, name);
      };
      prototype.setItem = function (name, value) {
        if (name === key && writeFailure) throw new w.DOMException('Storage full', 'QuotaExceededError');
        writes.push([name, value]);
        return originalSet.call(this, name, value);
      };
    }
  });
  const w = dom.window;
  const d = w.document;
  // JSDOM executes inline scripts; run the app's local external scripts in document order.
  for (const element of d.querySelectorAll('script[src]')) {
    const source = new URL(element.src).pathname.split('/').pop();
    assert(!source.includes('..'));
    const filename = path.join(root, source);
    assert(fs.existsSync(filename), `Missing external script: ${source}`);
    w.eval(fs.readFileSync(filename, 'utf8'));
  }
  await settle();
  assert.deepEqual(errors, [], `${file}: runtime errors`);
  assert.equal(d.body.dataset.view, 'library', `${file}: library route`);
  assert(d.getElementById('manualLibrary'), `${file}: library section`);
  return {
    w, d, copied, writes, errors,
    snapshot: () => Object.fromEntries(Array.from({ length: w.localStorage.length }, (_, i) => {
      const name = w.localStorage.key(i);
      return [name, w.localStorage.getItem(name)];
    })),
    records: () => JSON.parse(w.localStorage.getItem(key) || '[]'),
    close: () => { assert.deepEqual(errors, [], `${file}: runtime errors`); dom.window.close(); }
  };
}

function input(app, id, value) {
  const field = app.d.getElementById(id);
  assert(field, `Missing field ${id}`);
  field.value = value;
  field.dispatchEvent(new app.w.Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}
function articles(app) {
  return [...app.d.querySelectorAll('#manualEntryList article[data-entry-type]')];
}
function bodyOf(article) { return article.querySelector('.manual-entry-body').textContent; }
function findByBody(app, body) { return articles(app).find(article => bodyOf(article) === body); }
function openEditor(app) {
  app.d.getElementById('addManualEntry').click();
  assert.equal(app.d.getElementById('manualEntryForm').hidden, false, 'Editor opens');
}
function draft(app, entry) {
  openEditor(app);
  input(app, 'manualEntryType', entry.type);
  input(app, 'manualEntryTitle', entry.title);
  input(app, 'manualEntryBody', entry.body);
}
function submit(app) {
  app.d.getElementById('manualEntryForm').dispatchEvent(new app.w.Event('submit', { bubbles: true, cancelable: true }));
}
async function copyArticle(app, article, expected) {
  assert(article, 'Entry is visible');
  article.querySelector('[data-copy-entry]').click();
  await settle();
  assert.equal(app.copied.at(-1), expected, 'Clipboard receives the complete original body only');
}

function verifySpanishLibraryMarkup() {
  let translated = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const ui = JSON.parse(fs.readFileSync(path.join(root, 'spanish-ui.json'), 'utf8'));
  // Match the build generator's ordered replacements without making translation requests.
  for (const [english, spanish] of Object.entries(ui).sort((a, b) => b[0].length - a[0].length)) {
    translated = translated.split(english).join(spanish);
  }
  const generated = new JSDOM(translated);
  const published = new JSDOM(fs.readFileSync(path.join(root, 'es.html'), 'utf8'));
  for (const selector of ['#manualLibrary', '.bottom-nav a[href="#library"]']) {
    const expected = generated.window.document.querySelector(selector);
    const actual = published.window.document.querySelector(selector);
    assert(expected && actual, `Spanish markup exists: ${selector}`);
    assert.equal(actual.outerHTML, expected.outerHTML, `Spanish build mappings retain the complete library markup: ${selector}`);
  }
  generated.window.close();
  published.window.close();
}

(async () => {
  verifySpanishLibraryMarkup();
  for (const file of ['index.html', 'es.html']) {
    let app = await boot(file);
    assert.equal(app.w.eval('state.copyAllCaps'), true, 'Existing caps preference starts on');
    assert.equal(articles(app).length, 2, 'Exactly the two requested scripts are bundled');
    for (const expected of expectedScripts) {
      const article = findByBody(app, expected.body);
      assert(article, `Original ${expected.title} wording and paragraph breaks preserved`);
      assert.equal(article.querySelector('h3').textContent, expected.title);
      assert.equal(article.dataset.entryType, 'script');
      await copyArticle(app, article, expected.body);
    }
    assert.equal(app.w.localStorage.getItem(key), null, 'Opening a library does not rewrite storage');
    const answer = { type: 'answer', title: 'My personal answer', body: 'I prepare with confidence.\n\nI listen to Angel Muse Lane.' };
    const script = { type: 'script', title: 'My personal script', body: 'Welcome to rehearsal.\n\nLine two keeps its punctuation and spacing.' };
    draft(app, answer);
    submit(app);
    // A repeated submit event must never add a second record, including after the form closes.
    submit(app);
    assert.equal(app.records().length, 1, 'Repeated submission saves once');
    assert.equal(app.records()[0].body, answer.body);
    assert.equal(app.d.getElementById('manualEntryForm').hidden, true, 'Successful save closes editor');
    draft(app, script);
    submit(app);
    assert.equal(app.records().length, 2, 'Both manual entry types save');
    await copyArticle(app, findByBody(app, answer.body), answer.body);
    await copyArticle(app, findByBody(app, script.body), script.body);

    // Cancellation discards the draft without modifying saved entries.
    const savedBeforeCancel = app.w.localStorage.getItem(key);
    draft(app, { type: 'script', title: 'Discard this draft', body: 'This is a cancelled draft.' });
    app.d.getElementById('cancelManualEntry').click();
    assert.equal(app.d.getElementById('manualEntryForm').hidden, true, 'Cancel closes editor');
    assert.equal(app.w.localStorage.getItem(key), savedBeforeCancel, 'Cancel writes nothing');
    openEditor(app);
    assert.equal(app.d.getElementById('manualEntryTitle').value, '', 'Cancelled title is cleared');
    assert.equal(app.d.getElementById('manualEntryBody').value, '', 'Cancelled body is cleared');
    app.d.getElementById('cancelManualEntry').click();

    draft(app, { ...answer, title: 'Another title', body: '  I PREPARE WITH CONFIDENCE.   I LISTEN TO ANGEL MUSE LANE.  ' });
    submit(app);
    assert.equal(app.records().length, 2, 'Content duplicates ignore title, casing, and whitespace');
    app.d.getElementById('cancelManualEntry').click();
    draft(app, { type: 'script', title: 'Opening again', body: expectedScripts[0].body });
    submit(app);
    assert.equal(app.records().length, 2, 'A bundled script cannot be added a second time');
    app.d.getElementById('cancelManualEntry').click();

    draft(app, { type: 'answer', title: 'Empty answer', body: '   ' });
    submit(app);
    assert.equal(app.records().length, 2, 'Whitespace-only content is rejected');
    app.d.getElementById('cancelManualEntry').click();

    input(app, 'manualLibraryType', 'answer');
    assert.equal(articles(app).length, 1, 'Answer filter selects manual answers');
    assert.equal(bodyOf(articles(app)[0]), answer.body);
    input(app, 'manualLibraryType', 'script');
    input(app, 'manualLibrarySearch', 'line two');
    assert.equal(articles(app).length, 1, 'Search finds stored body text');
    assert.equal(bodyOf(articles(app)[0]), script.body);
    input(app, 'manualLibraryType', '');
    input(app, 'manualLibrarySearch', '');
    const persisted = app.snapshot();
    app.close();

    app = await boot(file, { storage: persisted });
    assert.equal(app.records().length, 2, 'Saved entries survive a page reload');
    assert.equal(articles(app).length, 4, 'Both saved entries and bundled scripts are consulted again');
    await copyArticle(app, findByBody(app, answer.body), answer.body);
    await copyArticle(app, findByBody(app, script.body), script.body);
    const unsafe = { type: 'script', title: '<img src=x onerror="window.injected=true">', body: '<script>window.injected=true</script>\n\n<b>Literal text</b>' };
    draft(app, unsafe);
    submit(app);
    const unsafeArticle = findByBody(app, unsafe.body);
    assert.equal(unsafeArticle.querySelector('h3').textContent, unsafe.title, 'Title is rendered as text');
    assert.equal(unsafeArticle.querySelectorAll('script,img,b').length, 0, 'Stored text cannot introduce markup');
    assert.equal(app.w.injected, undefined);
    await copyArticle(app, unsafeArticle, unsafe.body);
    app.close();

    const existing = { id: 'existing-user-entry', type: 'answer', title: 'Previously saved', body: 'Keep this existing answer.' };
    const duplicate = { id: 'existing-opening', type: 'script', title: 'Opening copy', body: expectedScripts[0].body };
    const original = JSON.stringify([existing, duplicate]);
    app = await boot(file, { storage: { [key]: original, pageantContest: 'Miss Existing Pageant', unrelatedSetting: 'preserve me' } });
    assert.equal(articles(app).length, 3, 'Existing bundled duplicate is displayed once');
    assert.equal(app.w.localStorage.getItem(key), original, 'Reading leaves existing records untouched');
    const external = { id: 'another-tab-entry', type: 'script', title: 'Saved in another tab', body: 'This script arrived through the existing browser storage.' };
    const externalValue = JSON.stringify([...app.records(), external]);
    app.w.localStorage.setItem(key, externalValue);
    app.w.dispatchEvent(new app.w.StorageEvent('storage', {
      key, oldValue: original, newValue: externalValue,
      storageArea: app.w.localStorage, url: 'https://pageants.test/another-tab.html'
    }));
    assert(findByBody(app, external.body), 'A storage event makes another tab’s saved entry visible');
    input(app, 'manualLibraryType', 'script');
    input(app, 'manualLibrarySearch', 'a query with no matching entries');
    assert.equal(articles(app).length, 0);
    const laterAnswer = { type: 'answer', title: 'A later answer', body: 'This is added after the existing entries.' };
    draft(app, laterAnswer);
    submit(app);
    assert.equal(app.d.getElementById('manualLibraryType').value, '', 'A successful save clears the type filter');
    assert.equal(app.d.getElementById('manualLibrarySearch').value, '', 'A successful save clears the search filter');
    assert(findByBody(app, laterAnswer.body), 'The new saved entry is immediately visible after filtered browsing');
    assert.deepEqual(app.records().find(entry => entry.id === external.id), external, 'Saving appends and preserves the entry from another tab');
    assert.equal(app.records().length, 4, 'Saving appends to the latest storage contents');
    assert.deepEqual(app.records().find(entry => entry.id === existing.id), existing, 'Saving preserves every existing field');
    assert.deepEqual(app.records().find(entry => entry.id === duplicate.id), duplicate, 'Saving does not replace a stored duplicate');
    assert.equal(app.w.localStorage.getItem('pageantContest'), 'Miss Existing Pageant');
    assert.equal(app.w.localStorage.getItem('unrelatedSetting'), 'preserve me');
    app.close();

    for (const damaged of ['{invalid JSON', JSON.stringify({ entries: [] }), JSON.stringify([{ id: 'bad', type: 'script', title: 'Missing body' }])]) {
      app = await boot(file, { storage: { [key]: damaged } });
      assert.equal(articles(app).length, 2, 'Bundled scripts remain readable with damaged storage');
      if (!app.d.getElementById('addManualEntry').disabled) {
        draft(app, answer);
        submit(app);
      }
      assert.equal(app.w.localStorage.getItem(key), damaged, 'Damaged storage is never overwritten');
      assert.equal(app.writes.filter(([name]) => name === key).length, 0);
      assert(app.d.getElementById('manualEntryStatus').textContent.trim(), 'Storage failure has visible feedback');
      app.close();
    }

    app = await boot(file, { writeFailure: true });
    draft(app, answer);
    submit(app);
    assert.equal(app.w.localStorage.getItem(key), null, 'A failed save does not claim persisted content');
    assert.equal(app.d.getElementById('manualEntryForm').hidden, false, 'A failed save retains the editor');
    assert.equal(app.d.getElementById('manualEntryTitle').value, answer.title, 'A failed save retains title');
    assert.equal(app.d.getElementById('manualEntryBody').value, answer.body, 'A failed save retains body');
    assert(app.d.getElementById('manualEntryStatus').textContent.trim(), 'Save failure has visible feedback');
    app.close();

    app = await boot(file, { readFailure: true });
    assert.equal(articles(app).length, 2, 'Bundled scripts remain readable if localStorage is unavailable');
    await copyArticle(app, findByBody(app, expectedScripts[1].body), expectedScripts[1].body);
    assert.equal(app.writes.filter(([name]) => name === key).length, 0, 'Unreadable storage is not replaced');
    assert(app.d.getElementById('manualEntryStatus').textContent.trim(), 'Unavailable storage has visible feedback');
    app.close();
    console.log(`${file}: manual library, exact clipboard, save/reload, cancellation, repeated/duplicate saves, safe rendering, storage events, filters, and storage failure checks passed`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
