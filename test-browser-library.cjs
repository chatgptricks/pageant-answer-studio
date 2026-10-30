const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = __dirname;
const qaOutput = process.env.QA_OUTPUT_DIR || path.join(root, 'review');
const expected = [
  'Welcome, everyone, to the preliminary competition of the very first edition of Miss Wonder All Stars!\n\nI am Angel Muse Lane, Miss Grand Wonder 3rd Edition, and it is an honor to be your host for this special occasion.\n\nOur contestants are ready to take the stage and share their charisma, confidence, and the unique sparkle that makes each of them a star. Thank you all for joining us and being part of this first edition.\n\nLet’s welcome our stars with a big round of applause as we begin the opening of Miss Wonder All Stars!',
  'Elegance takes center stage as we move on to our Evening Gown Segment.\n\nEach contestant will have the opportunity to express her style and personality, bringing grace and confidence to every step. Get ready for a showcase of glamour, sophistication, and unforgettable presence.\n\nLadies and gentlemen, please welcome the contestants of Miss Wonder All Stars in their evening gowns! Let’s give them a warm round of applause!'
];
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
    response.writeHead(404).end(); return;
  }
  const extension = path.extname(filename);
  response.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[extension] || 'application/octet-stream');
  response.end(fs.readFileSync(filename));
});
(async () => {
  fs.mkdirSync(qaOutput, {recursive:true});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}, permissions:['clipboard-read','clipboard-write']});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const clipboard = async (button, body) => {
      await button.click();
      await page.waitForFunction(expectedBody => navigator.clipboard.readText().then(text => text === expectedBody), body);
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), body, 'Clipboard holds only the exact block body');
    };
    const verifyBlocks = async (card, blocks, spanish) => {
      const buttons = card.locator('.manual-entry-body .manual-entry-block[data-copy-entry][data-copy-block]');
      assert.equal(await buttons.count(), blocks.length, 'Exactly one copy button per nonempty block');
      assert.equal(await card.locator('[data-copy-entry]').count(), blocks.length, 'No extra whole-body copy button');
      for (let index = 0; index < blocks.length; index++) {
        const button = buttons.nth(index);
        assert.equal(await button.locator('.speech-line').textContent(), blocks[index], 'Rendered block text stays exact');
        assert.equal(await button.locator('.speech-label').textContent(), `${spanish ? 'Parte' : 'Part'} ${index + 1} · ${spanish ? 'Copiar' : 'Copy'}`);
        assert((await button.boundingBox()).height >= 48, 'Block button is a mobile touch target');
        await clipboard(button, blocks[index]);
      }
      // Reusing a block and switching among blocks must not retain any earlier text.
      for (const index of [0, blocks.length - 1, 0]) await clipboard(buttons.nth(index), blocks[index]);
      if (blocks.length > 1) {
        await buttons.evaluateAll(items => { items[0].click(); items[1].click(); });
        await page.waitForFunction(expectedBody => navigator.clipboard.readText().then(text => text === expectedBody), blocks[1]);
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), blocks[1], 'Rapid different-block clicks copy the latest selected block');
        await clipboard(buttons.nth(0), blocks[0]);
      }
    };
    const byTitle = title => page.locator('.manual-entry').filter({has:page.locator('h3', {hasText:title})});
    for (const file of ['index.html','es.html']) {
      await page.goto(`${base}/${file}#library`);
      assert.equal(await page.locator('#manualLibrary').isVisible(), true);
      assert.equal(await page.locator('#results').isVisible(), false);
      assert.equal(await page.locator('#copyAllCaps').isChecked(), true);
      assert.equal(await page.locator('.manual-entry').count(), 2);
      for (let index = 0; index < expected.length; index++) {
        const card = page.locator('.manual-entry').nth(index);
        assert.equal(await card.locator('h3').textContent(), ['Opening','Evening gown segment'][index]);
        assert.equal(await card.locator('h3').evaluate(el => getComputedStyle(el).textTransform), 'none');
        const blocks = expected[index].split('\n\n');
        assert.equal(blocks.length, [4,3][index]);
        await verifyBlocks(card, blocks, file === 'es.html');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    }
    await page.goto(`${base}/index.html#library`);
    await page.locator('#addManualEntry').click();
    await page.locator('#manualEntryTitle').fill('Cancel this draft');
    await page.locator('#manualEntryBody').fill('This should never be saved.');
    await page.locator('#cancelManualEntry').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('pageantManualEntries')), null);
    const manualBody = 'Angel Muse Lane keeps the original case.\n\nA second paragraph, with punctuation!';
    await page.locator('#addManualEntry').click();
    await page.locator('#manualEntryTitle').fill('A saved answer');
    await page.locator('#manualEntryBody').fill(manualBody);
    await page.locator('#saveManualEntry').click();
    await page.reload();
    assert.equal(await page.locator('.manual-entry').count(), 3);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pageantManualEntries'))[0].body), manualBody);
    await page.locator('#manualLibraryType').selectOption('answer');
    await page.locator('#manualLibrarySearch').fill('saved answer');
    assert.equal(await page.locator('.manual-entry').count(), 1);
    await verifyBlocks(page.locator('.manual-entry'), manualBody.split('\n\n'), false);
    await page.goto(`${base}/es.html#library`);
    assert.equal(await page.locator('.manual-entry').count(), 3);
    await verifyBlocks(byTitle('A saved answer'), manualBody.split('\n\n'), true);
    await page.locator('#addManualEntry').click();
    await page.locator('#manualEntryTitle').fill('Duplicate answer');
    await page.locator('#manualEntryBody').fill(manualBody.toUpperCase());
    await page.locator('#saveManualEntry').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pageantManualEntries')).length), 1);
    await page.locator('#cancelManualEntry').click();
    const manualScript = 'A manually saved script.\nSecond line keeps Miss Wonder All Stars.\nThird line, with punctuation!';
    await page.locator('#addManualEntry').click();
    await page.locator('#manualEntryType').selectOption('script');
    await page.locator('#manualEntryTitle').fill('A saved script');
    await page.locator('#manualEntryBody').fill(manualScript);
    await page.locator('#saveManualEntry').click();
    await page.evaluate(() => {
      document.getElementById('manualEntryForm').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
    });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pageantManualEntries')).length), 2);
    await page.reload();
    assert.equal(await page.locator('.manual-entry').count(), 4);
    await verifyBlocks(byTitle('A saved script'), manualScript.split('\n'), true);
    const legacyBody = '  First legacy paragraph, with Angel Muse Lane!\r\n \t\r\nSecond legacy paragraph.\r\n\r\n\r\nThird paragraph keeps  double spaces.  ';
    const legacy = {id:'legacy-multiline-script',type:'script',title:'Previously saved multiline script',body:legacyBody};
    const beforeLegacy = await page.evaluate(entry => {
      const entries = JSON.parse(localStorage.getItem('pageantManualEntries'));
      entries.push(entry);
      const raw = JSON.stringify(entries);
      localStorage.setItem('pageantManualEntries', raw);
      return raw;
    }, legacy);
    await page.reload();
    await verifyBlocks(byTitle(legacy.title), ['  First legacy paragraph, with Angel Muse Lane!','Second legacy paragraph.','Third paragraph keeps  double spaces.  '], true);
    assert.equal(await page.evaluate(() => localStorage.getItem('pageantManualEntries')), beforeLegacy, 'Rendering and block-copying legacy entries never rewrite storage');
    await page.goto(`${base}/index.html#library`);
    await verifyBlocks(byTitle('A saved script'), manualScript.split('\n'), false);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pageantManualEntries')).find(entry => entry.id === 'legacy-multiline-script').body), legacyBody);
    // Remove only this isolated test origin's sample records for the QA captures.
    await page.evaluate(() => localStorage.removeItem('pageantManualEntries'));
    await page.goto(`${base}/es.html#library`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => !document.getElementById('toast').classList.contains('show'));
    await page.screenshot({path:path.join(qaOutput,'library-blocks-mobile.png'), fullPage:true});
    await page.setViewportSize({width:1280,height:900});
    await page.reload();
    await page.locator('#addManualEntry').click();
    await page.screenshot({path:path.join(qaOutput,'library-blocks-desktop.png')});
    assert.equal(await page.locator('.bottom-nav a').count(), 6);
    assert.equal(await page.locator('.bottom-nav a[href="#library"]').isVisible(), true);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('Chrome: both languages, exact per-block clipboard, repeated/rapid clicks, mobile layout, multiline save/reload, preserved legacy content, cancellation, duplicate and repeated saves passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
