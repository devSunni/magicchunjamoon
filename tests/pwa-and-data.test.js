const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const manifestRaw = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
const swRaw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function extractHanjaData() {
  const m = html.match(/const HANJA_DATA = \[([\s\S]*?)\];/);
  assert.ok(m, 'HANJA_DATA array must exist in index.html');
  return eval('[' + m[1] + ']');
}

test('HANJA_DATA has exact official counts (8급~5급 = 500자) with no duplicates', () => {
  const data = extractHanjaData();
  assert.equal(data.length, 500);

  const expected = {
    '8급': 50,
    '준7급': 50,
    '7급': 50,
    '준6급': 75,
    '6급': 75,
    '준5급': 100,
    '5급': 100
  };
  const counts = {};
  const chars = new Set();
  const ids = new Set();

  for (const h of data) {
    assert.ok(h.id && h.char && h.hun && h.eum && h.level && h.elem && h.words, `Missing field on ${JSON.stringify(h)}`);
    assert.equal(h.char.length, 1, `char must be 1 glyph: ${h.char}`);
    assert.ok(!chars.has(h.char), `Duplicate char: ${h.char}`);
    assert.ok(!ids.has(h.id), `Duplicate id: ${h.id}`);
    assert.ok(h.words.includes(h.char), `words should include char ${h.char}: ${h.words}`);
    chars.add(h.char);
    ids.add(h.id);
    counts[h.level] = (counts[h.level] || 0) + 1;
  }

  assert.deepEqual(counts, expected);
});

test('index.html inline script parses cleanly with zero syntax errors', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, 'Expected 1 inline <script> block');
  assert.doesNotThrow(() => new Function(scripts[0][1]));
});

test('PWA manifest.json is valid and installable', () => {
  const manifest = JSON.parse(manifestRaw);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.name && manifest.short_name);
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);

  const sizes = new Set(manifest.icons.map(i => i.sizes));
  assert.ok(sizes.has('192x192'), 'Must include 192x192 icon');
  assert.ok(sizes.has('512x512'), 'Must include 512x512 icon');

  for (const icon of manifest.icons) {
    assert.notEqual(icon.purpose, 'any maskable', 'Avoid combined any maskable purpose');
    const iconPath = path.join(ROOT, icon.src.replace(/^\.\//, ''));
    assert.ok(fs.existsSync(iconPath), `Icon file missing: ${icon.src}`);
  }
});

test('index.html references external ./manifest.json cleanly without data-URI manifest injection', () => {
  assert.ok(html.includes('<link rel="manifest" href="./manifest.json" />'));
  assert.ok(!html.includes('data:application/manifest+json'), 'Must not inject conflicting data-URI manifest');
  assert.ok(html.includes("navigator.serviceWorker.register('./sw.js')"));
});

test('sw.js parses cleanly and all CORE_ASSETS exist on disk', () => {
  assert.doesNotThrow(() => new Function(swRaw));
  const m = swRaw.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(m, 'CORE_ASSETS must be defined in sw.js');
  const assets = eval('[' + m[1] + ']');
  for (const a of assets) {
    if (a === './') continue;
    const p = path.join(ROOT, a.replace(/^\.\//, ''));
    assert.ok(fs.existsSync(p), `SW core asset missing: ${a}`);
  }
});

test('Pronunciation engine and HanziWriter alias map are properly wired', () => {
  assert.ok(html.includes('function resolveKoreanVoice()'));
  assert.ok(html.includes('function playFallbackTTS('));
  assert.ok(html.includes('HANZI_WRITER_ALIAS'));
  for (const ch of ['敎', '飮', '窓', '淸', '擧', '氷', '査']) {
    assert.ok(html.includes(`'${ch}':`), `Missing HanziWriter alias for ${ch}`);
  }
});
