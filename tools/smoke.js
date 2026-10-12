'use strict';
// Loads the real extension, both worlds, into a real Chrome against local fixture responses, and prints
// what the panel shows. Unit tests cannot see how Chrome injects content scripts; this can.
// What it loads is the zip tools/package.js builds, unpacked, so a file missing from the package fails here.
//   node tools/smoke.js            exit 0 when the panel shows the two fixture neighbours, no notice, on hover
//                                  the first one's land outline with its name, and with People switched on
//                                  the layer inside the map, dark over Dhaka, clear over the Sundarbans, and
//                                  after a wider view with the pointer held still the larger hexagon's figure,
//                                  and the layer sliding with a pan, scaling with a zoom and hiding when the
//                                  pins move in a way that is neither
//   CHROME=/path/to/chrome node tools/smoke.js
//   FIREFOX=/path/to/firefox node tools/smoke.js    the same in Firefox, loaded through web-ext as a temporary add-on
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { build } = require('./package.js');
const fx = require('../support/fixtures.js');

const CHROME = process.env.CHROME || path.join(os.homedir(),
  'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idt-smoke-'));
const ext = path.join(tmp, 'ext');
execFileSync('unzip', ['-q', build(root, tmp), '-d', ext]);
fs.writeFileSync(path.join(ext, 'manifest.json'), fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8')
  .replaceAll('https://inkdom.io/play*', 'http://127.0.0.1/*').replaceAll('https://inkdom.io/*', 'http://127.0.0.1/*'));

const routes = {
  '/rest/v1/rpc/my_player': fx.myPlayer(), '/rest/v1/players': fx.playersDirectory(), '/rest/v1/rpc/world_tick2': fx.tick(),
  '/api/view/v1/0/2/1_2_3_4/5.json': fx.cell(), '/api/read': fx.viewMembers(), '/rest/v1/rpc/econ_shop': fx.shop(),
  '/rest/v1/seasons': fx.seasons(), '/api/boards/v1/2/marks/7.json': fx.marks(), '/rest/v1/player_lands': fx.playerLands(fx.ME, fx.T + 3372000)
};
const VIEW = { minx: 86.25, miny: 21.5, maxx: 91.6, maxy: 24.4 };
const ASK = JSON.stringify({ fn: 'view_members', args: VIEW });
const ASK_WIDE = JSON.stringify({ fn: 'view_members', args: { minx: 80.9, miny: 18.4, maxx: 96.95, maxy: 27.2 } });
const PAGE = `<!doctype html><meta charset="utf-8"><title>smoke</title><div aria-label="Ink 66.3, full 41m">ink</div>
<canvas class="maplibregl-canvas" style="position:fixed;left:0;top:0;width:100vw;height:100vh"></canvas>
<button class="maplibregl-marker" style="position:fixed;transform:translate(-500px, 20px)"></button>
<button class="maplibregl-marker" style="position:fixed;transform:translate(-600px, 40px)"></button>
<div class="maplibregl-ctrl-scale" style="position:fixed;left:4px;bottom:4px;width:65px">50 km</div><script>
(async () => {
  for (const u of ${JSON.stringify(Object.keys(routes))}) await fetch(u, u === '/api/read' ? { method: 'POST', body: ${JSON.stringify(ASK)} } : {});
  await new Promise(r => setTimeout(r, 2500));
  const host = document.getElementById('inkdom-timers'), root = host && host.shadowRoot;
  const txt = sel => (root ? Array.from(root.querySelectorAll(sel)).map(n => n.textContent.replace(/\\s+/g, ' ').trim()) : []);
  const note = root && root.querySelector('.p-note');
  // Hover the first neighbour: her land outline should light up over the map, with her name on it.
  const first = root && root.querySelector('.row .name');
  if (first) first.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  const mark = root && root.querySelector('.mark');
  // The people layer: switch it on, wait for the data and the first drawing, then look at the canvas itself.
  const sw = root && root.querySelector('.switch'), map = document.querySelector('canvas.maplibregl-canvas');
  let layer = null;
  if (sw) sw.click();
  for (let i = 0; sw && i < 60 && !(layer && !root.querySelector('.legend').hidden); i++) {
    await new Promise(r => setTimeout(r, 250));
    layer = document.getElementById('inkdom-timers-people');
  }
  const B = ${JSON.stringify(VIEW)}, W = innerWidth, H = innerHeight, PAD = 1.3;
  const merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const px = (lat, lng) => [(lng - B.minx) * W * PAD / (B.maxx - B.minx) - W * (PAD - 1) / 2,
    (merc(B.maxy) - merc(lat)) * H * PAD / (merc(B.maxy) - merc(B.miny)) - H * (PAD - 1) / 2];
  const opacityAt = (lat, lng) => {
    if (!layer || !layer.width) return null;
    const [x, y] = px(lat, lng), k = layer.width / W;
    return layer.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data[3];
  };
  const [kx, ky] = px(22.82, 89.55);
  map.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: kx, clientY: ky }));
  await new Promise(r => setTimeout(r, 300));
  const people = {
    // The People section sits under the player's own timers, above the list of neighbours.
    order: Array.from(root.querySelectorAll('.panel > .p-sec > .p-label > span:first-child')).map(n => n.textContent),
    sibling: !!layer && map.nextElementSibling === layer, dhaka: opacityAt(23.73, 90.40), forest: opacityAt(22.0, 89.3),
    ticks: txt('.ticks span'), hexes: txt('.hexes')[0], here: txt('.here')[0], message: txt('.p-sec > .p-empty:not([hidden])')
  };
  // A zoom with the pointer held still: the game asks about a wider view, and the figure must be the one for the
  // larger hexagon now under the pointer, not the one from before.
  await fetch('/api/read', { method: 'POST', body: ${JSON.stringify(ASK_WIDE)} });
  await new Promise(r => setTimeout(r, 1500));
  people.wide = { hexes: txt('.hexes')[0], here: txt('.here')[0] };
  // The map moves: the game's pins all shift the same way, and the layer slides along with them at once, with
  // the figure under the still pointer read again. The next view draws it afresh. A zoom, where the pins
  // spread out and the scale bar changes, scales it. Pins moved in a way no pan or zoom explains hide it.
  const shown = () => (layer ? layer.style.visibility || 'visible' : null);
  const settle = ms => new Promise(r => setTimeout(r, ms));
  const place = where => document.querySelectorAll('.maplibregl-marker').forEach((pin, i) => { pin.style.transform = 'translate(' + where[i][0] + 'px, ' + where[i][1] + 'px)'; });
  people.hide = { before: shown() };
  place([[-700, 90], [-800, 110]]);
  await settle(300);
  people.hide.afterPan = shown();
  people.hide.slide = layer.style.transform;
  people.hide.hereSlid = txt('.here')[0];
  await fetch('/api/read', { method: 'POST', body: ${JSON.stringify(ASK)} });
  await settle(1500);
  people.hide.afterView = shown();
  people.hide.afterViewSlide = layer.style.transform;
  people.hide.hereBack = txt('.here')[0];
  document.querySelector('.maplibregl-ctrl-scale').style.width = '130px';
  place([[-1400, 180], [-1600, 220]]);
  await settle(300);
  people.hide.afterZoom = shown();
  people.hide.zoom = layer.style.transform;
  place([[-100, 5], [-900, 600]]);
  await settle(300);
  people.hide.afterScatter = shown();
  await fetch('/report', { method: 'POST', body: JSON.stringify({
    people, viewport: [innerWidth, innerHeight, devicePixelRatio],
    panel: !!root, note: note && !note.hidden ? note.textContent : null, you: txt('.p-sec .kv'), rows: txt('.row'),
    ring: mark ? { hidden: mark.hidden, left: mark.style.left, top: mark.style.top, name: txt('.ring-tag .name')[0], outlined: mark.classList.contains('outlined') } : null,
    outline: root ? { display: root.querySelector('.outline').style.display, pathLength: (root.querySelector('.outline .line').getAttribute('d') || '').length } : null,
    leaked: Object.getOwnPropertySymbols(window).map(String).filter(s => /inkdom/.test(s))
  }) });
})();
</script>`;

let finish;
const reported = new Promise(resolve => { finish = resolve; });
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/report') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { res.end('ok'); finish(JSON.parse(body)); });
  } else if (p === '/' || p === '/index.html') {
    res.setHeader('content-type', 'text/html');
    res.end(PAGE);
  } else if (routes[p]) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(routes[p]));
  } else {
    res.statusCode = 404;
    res.end();
  }
});

server.listen(0, '127.0.0.1', async () => {
  const url = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const FIREFOX = process.env.FIREFOX;
  const browser = FIREFOX
    ? spawn('npx', ['--yes', 'web-ext@10.7.0', 'run', '--no-input', '--no-reload', '--source-dir', ext, '--firefox', FIREFOX, '--start-url', url, '--args=-headless', '--args=--width=1280', '--args=--height=800'],
      { stdio: 'ignore', detached: true })
    : spawn(CHROME, ['--headless=new', '--user-data-dir=' + path.join(tmp, 'profile'), '--disable-extensions-except=' + ext,
      '--load-extension=' + ext, '--no-first-run', '--no-default-browser-check', '--window-size=1280,800', url], { stdio: 'ignore' });
  const result = await Promise.race([reported, new Promise(resolve => setTimeout(() => resolve(null), FIREFOX ? 60000 : 20000))]);
  if (FIREFOX) process.kill(-browser.pid);
  else browser.kill();
  server.close();
  setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true }), 500);
  console.log(JSON.stringify(result, null, 2));
  const ring = result && result.ring, pe = result && result.people;
  const ok = result && result.panel && result.note === null && result.rows.length === 2 && result.leaked.length === 0 &&
    ring && ring.hidden === false && /px$/.test(ring.left) && ring.name === 'Tessaly' && ring.outlined === true &&
    result.outline && result.outline.display === 'block' && result.outline.pathLength > 40 &&
    pe && pe.order.join() === 'You,People,On screen' && pe.sibling === true && pe.dhaka > 127 && pe.forest === 0 && pe.ticks.length === 2 && pe.ticks.every(t => /\d/.test(t)) &&
    /455,625 in this hexagon$/.test(pe.here || '') &&
    pe.wide && pe.wide.hexes === 'Hexagons about 20 km across' && /in this hexagon$/.test(pe.wide.here || '') && pe.wide.here !== pe.here &&
    pe.hide && pe.hide.before === 'visible' && pe.hide.afterPan === 'visible' && pe.hide.slide === 'translate(-200px, 70px) scale(1)' &&
    /in this hexagon$|^No people/.test(pe.hide.hereSlid || '') && pe.hide.hereSlid !== pe.here &&
    pe.hide.afterView === 'visible' && pe.hide.afterViewSlide === '' && /455,625 in this hexagon$/.test(pe.hide.hereBack || '') &&
    // Firefox gives a zero translate back as translate(0px), Chrome as translate(0px, 0px).
    pe.hide.afterZoom === 'visible' && /^translate\(0px(, 0px)?\) scale\(2\)$/.test(pe.hide.zoom) && pe.hide.afterScatter === 'hidden';
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
  process.exitCode = ok ? 0 : 1;
});
