'use strict';
// Takes the pictures for the Chrome Web Store listing: four screenshots of tools/store.html and the small promo
// tile, into store/. The store wants 1280x800 screenshots and a 440x280 tile, as PNG without transparency.
//   node tools/store-shots.js
//   CHROME=/path/to/chrome node tools/store-shots.js
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CHROME = process.env.CHROME || path.join(os.homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idt-shots-'));
// file, page, window width and height, device pixels per CSS pixel. The close-ups are a quarter of the window at 2x.
const SHOTS = [
  ['store/screenshot-1-overview.png', 'tools/store.html?shot=overview', 1280, 800, 1],
  ['store/screenshot-2-you.png', 'tools/store.html?shot=you', 1280, 800, 2],
  ['store/screenshot-3-neighbours.png', 'tools/store.html?shot=neighbours', 1280, 800, 2],
  ['store/screenshot-4-people.png', 'tools/store.html?shot=people', 1280, 800, 2],
  ['store/promo-440x280.png', 'tools/store-promo.html', 440, 280, 1]
];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const file = path.join(root, path.normalize(decodeURIComponent(req.url.split('?')[0])));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end(); return; }
  res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

// Chrome's DevTools protocol over the two extra pipes: JSON messages, each ended by a zero byte.
function connect(chrome) {
  const to = chrome.stdio[3], from = chrome.stdio[4], waiting = new Map();
  let last = 0, buffer = '';
  from.setEncoding('utf8');
  from.on('data', chunk => {
    buffer += chunk;
    for (let end = buffer.indexOf('\0'); end >= 0; end = buffer.indexOf('\0')) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      const asked = waiting.get(message.id);
      if (!asked) continue;
      waiting.delete(message.id);
      if (message.error) asked.reject(new Error(message.error.message));
      else asked.resolve(message.result);
    }
  });
  return (method, params, sessionId) => new Promise((resolve, reject) => {
    waiting.set(++last, { resolve, reject });
    to.write(JSON.stringify({ id: last, method, params, sessionId }) + '\0');
  });
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function take(send, base, [file, page, width, height, scale]) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false }, sessionId);
  await send('Page.navigate', { url: base + page }, sessionId);
  // The page sets window.ready to a promise of the part to photograph, once everything is drawn.
  let clip = null;
  for (let i = 0; i < 100 && !clip; i++) {
    await sleep(200);
    const got = await send('Runtime.evaluate', { expression: 'window.ready', awaitPromise: true, returnByValue: true }, sessionId).catch(() => null);
    if (got && got.exceptionDetails) throw new Error(page + ': ' + got.exceptionDetails.exception.description);
    clip = got && got.result.value;
  }
  if (!clip) throw new Error(page + ' never said it was ready');
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: Object.assign({ scale: 1 }, clip) }, sessionId);
  await send('Target.closeTarget', { targetId });
  const png = Buffer.from(shot.data, 'base64');
  fs.writeFileSync(path.join(root, file), png);
  console.log(file + '  ' + png.readUInt32BE(16) + 'x' + png.readUInt32BE(20) + (png[25] === 2 ? '' : '  (has transparency: colour type ' + png[25] + ')'));
}

server.listen(0, '127.0.0.1', async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-pipe', '--user-data-dir=' + path.join(tmp, 'profile'), '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  try {
    const send = connect(chrome);
    for (const shot of SHOTS) await take(send, 'http://127.0.0.1:' + server.address().port + '/', shot);
  } catch (err) {
    console.error(String(err.message || err));
    process.exitCode = 1;
  }
  chrome.kill();
  server.close();
  setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true }), 500);
});
