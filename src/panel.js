(function (g) {
  'use strict';
  const KEY = Symbol.for('inkdom-timers');
  const IDT = g[KEY] || (g[KEY] = {});
  const F = IDT.format;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MAX_ROWS = 15;
  const INK_TIP = 'Estimate from their last loop. A bought refill makes it higher.';
  const NOTES = {
    waiting: "Waiting for the game's map data. If this stays, reload the tab.",
    format: "The game's data format changed. Update the extension.",
    noview: "No map view data is arriving. If this stays after a reload, the game's format changed: update the extension."
  };
  const PEOPLE_NOTES = {
    loading: 'Loading people data',
    failed: 'People data did not load. Reload the tab.',
    waiting: "Waiting for the game's map view.",
    h3: 'Could not work out the hexagons for this view.'
  };
  const ICONS = {
    drop: 'M6 1c1.8 2.3 3.5 4.1 3.5 6.1A3.5 3.5 0 0 1 6 10.6 3.5 3.5 0 0 1 2.5 7.1C2.5 5.1 4.2 3.3 6 1z',
    lock: 'M3.5 5V3.8a2.5 2.5 0 0 1 5 0V5H9a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1.2 0h2.6V3.8a1.3 1.3 0 0 0-2.6 0z',
    pin: 'M6 1.2l1.5 3 3.3.5-2.4 2.3.6 3.3L6 8.7l-3 1.6.6-3.3-2.4-2.3 3.3-.5z',
    min: 'M2.5 5.4h7v1.2h-7z',
    max: 'M5.4 2.5h1.2v2.9h2.9v1.2H6.6v2.9H5.4V6.6H2.5V5.4h2.9z',
    grip: 'M4 2.5a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm4 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zM4 5.1a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm4 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zM4 7.7a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm4 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z'
  };
  const CSS = `
:host{all:initial;--bg:#131a23;--raise:#1d2733;--line:rgba(255,255,255,.11);--fg:#e8edf3;--fg2:#b4bfcb;--muted:#8794a3;--faint:#5c6878;--open:#5fd39a;--open-bg:rgba(95,211,154,.15);--risk:#e7b55c;--ally:#93a9ff}
*{box-sizing:border-box}
[hidden]{display:none!important}
.box,.mark{font:12px/1.35 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--fg);-webkit-user-select:none;user-select:none}
.box{position:relative;z-index:1}
.mark{position:fixed;width:0;height:0;pointer-events:none}
.ring{position:absolute;left:-22px;top:-22px;width:44px;height:44px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px rgba(10,16,24,.75),inset 0 0 0 2px rgba(10,16,24,.75);animation:idt-pulse 1.2s ease-out infinite}
.mark.edge .ring{border-style:dashed;animation:none}
.ring-tag{position:absolute;top:30px;left:0;transform:translateX(-50%);display:inline-flex;align-items:center;gap:6px;white-space:nowrap;padding:3px 8px;border-radius:6px;background:var(--bg);border:1px solid var(--line);font-weight:600;box-shadow:0 2px 10px rgba(10,16,24,.24)}
@keyframes idt-pulse{0%{transform:scale(.8);opacity:1}70%{transform:scale(1.35);opacity:.35}100%{transform:scale(1.35);opacity:0}}
.mark.outlined .ring{display:none}
.mark.outlined .ring-tag{top:0;transform:translate(-50%,-50%)}
.outline{position:fixed;pointer-events:none;overflow:hidden}
.outline path{fill:none;stroke-linejoin:round;stroke-linecap:round}
.outline .wash{fill:#fff;fill-opacity:.16;fill-rule:evenodd}
.outline .casing{stroke:rgba(10,16,24,.8);stroke-width:6}
.outline .line{stroke:#fff;stroke-width:2.5;animation:idt-glow .9s ease-in-out infinite alternate}
@keyframes idt-glow{from{stroke-opacity:1}to{stroke-opacity:.4}}
@media (prefers-reduced-motion:reduce){.ring,.outline .line{animation:none}}
.panel,.pill{background:var(--bg);border:1px solid var(--line);box-shadow:0 2px 10px rgba(10,16,24,.24)}
.panel{width:296px;max-width:calc(100vw - 24px);max-height:calc(100vh - 240px);min-height:120px;overflow:auto;border-radius:8px;color-scheme:dark;scrollbar-width:thin}
.num{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.ic{width:12px;height:12px;flex:none;fill:currentColor}
.p-head{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line);cursor:grab;touch-action:none}
.p-head>.ic{color:var(--faint)}
.p-title{font-weight:600;letter-spacing:.02em}
.p-clock{margin-left:auto;color:var(--muted);font-size:11px}
.p-note{padding:8px 12px;border-bottom:1px solid var(--line);color:var(--risk);font-size:11px}
.icon-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--muted);cursor:pointer}
.icon-btn:hover{background:var(--raise);color:var(--fg)}
button:focus-visible{outline:2px solid var(--fg);outline-offset:1px}
.p-sec{padding:12px;display:grid;gap:8px}
.p-sec+.p-sec{border-top:1px solid var(--line)}
.p-label{display:flex;justify-content:space-between;font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.p-empty{color:var(--muted);font-size:11px}
.kv{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:8px;row-gap:2px;align-items:center}
.kv .k{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kv .v{display:inline-flex;align-items:center;gap:5px}
.kv .v.risk{color:var(--risk);font-weight:600}
.kv .sub{grid-column:1/-1;color:var(--muted);font-size:11px}
.meter{grid-column:1/-1;height:4px;border-radius:2px;background:var(--raise);overflow:hidden}
.meter i{display:block;height:100%;width:0;background:var(--fg2)}
.mini{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding-top:8px;border-top:1px solid var(--line)}
.mini div{display:grid;gap:1px;min-width:0}
.mini .l{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.mini .n{font-size:10.5px;color:var(--muted);white-space:nowrap}
.rows{display:grid}
.row{display:grid;gap:3px;padding:8px 0;border-top:1px solid var(--line)}
.rows .row:first-child{border-top:0;padding-top:0}
.rows .row:last-child{padding-bottom:0}
.row.is-ally>*{opacity:.62}
.row-head{display:flex;align-items:center;gap:6px;min-width:0}
.dot{width:8px;height:8px;border-radius:50%;flex:none;box-shadow:0 0 0 1px var(--line)}
.name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.rank{color:var(--muted);font-size:11px;flex:none}
.tag{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--ally);border:1px solid currentColor;border-radius:4px;padding:0 4px;flex:none}
.pin{width:16px;height:16px;color:var(--faint);flex:none}
.pin.on{color:var(--fg)}
.state{margin-left:auto;display:inline-flex;align-items:center;gap:6px;flex:none}
.state.window .num{color:var(--open)}
.state.free{color:var(--fg2)}
.state.unknown,.state.safe{color:var(--muted)}
.chip-open{font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--open);background:var(--open-bg);border-radius:4px;padding:1px 5px;white-space:nowrap}
.row-sub{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:11px;padding-left:14px}
.row-sub>span:first-child{min-width:0}
.ink{display:inline-flex;align-items:center;gap:4px;flex:none}
.land{display:flex;align-items:center;gap:6px;padding-left:14px;font-size:11px;min-width:0}
.land .lname{color:var(--fg2);font-weight:600;flex:none}
.land .ldet{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.more{font:inherit;font-size:11px;color:var(--fg2);background:var(--raise);border:0;border-radius:4px;padding:6px 8px;cursor:pointer}
.pill{display:inline-flex;align-items:center;gap:12px;padding:6px 10px;border-radius:6px;cursor:grab;touch-action:none}
.pill>.ic{color:var(--faint)}
.pill>span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.pill .open{color:var(--open);font-weight:600}
.pill .risk{color:var(--risk)}
.odot{width:6px;height:6px;border-radius:50%;background:var(--open);display:inline-block}
.switch{position:relative;width:26px;height:14px;padding:0;border:0;border-radius:7px;background:var(--raise);cursor:pointer;flex:none}
.switch i{position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:var(--muted);transition:left .12s}
.switch[aria-checked="true"]{background:var(--fg2)}
.switch[aria-checked="true"] i{left:14px;background:var(--bg)}
@media (prefers-reduced-motion:reduce){.switch i{transition:none}}
.legend{display:grid;gap:4px;font-size:11px}
.ramp{height:8px;border-radius:2px;background:linear-gradient(90deg,rgba(37,52,148,.04),rgba(37,52,148,.78)),#f4f2ed}
.ticks{display:flex;justify-content:space-between;color:var(--muted);font-size:10.5px}
.hexes{color:var(--muted)}
.here{min-height:2.7em}
`;

  function create(doc, opts) {
    const win = doc.defaultView;
    const ui = { x: opts.ui.x, y: opts.ui.y, collapsed: opts.ui.collapsed === true, people: opts.ui.people === true };
    const saveUi = () => opts.onUi({ x: ui.x, y: ui.y, collapsed: ui.collapsed, people: ui.people });
    const refs = {};
    let vm = null, now = 0, showAll = false, builtCollapsed = null, youSig = '', pillSig = '';
    let peopleInfo = { state: 'off' }, peopleSig = '';

    const el = (tag, cls, txt) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (txt != null) e.textContent = txt;
      return e;
    };
    const icon = name => {
      const s = doc.createElementNS(SVG_NS, 'svg'), p = doc.createElementNS(SVG_NS, 'path');
      s.setAttribute('class', 'ic'); s.setAttribute('viewBox', '0 0 12 12'); s.setAttribute('aria-hidden', 'true');
      p.setAttribute('d', ICONS[name]); p.setAttribute('fill-rule', 'evenodd');
      s.appendChild(p);
      return s;
    };
    const button = (cls, label, iconName, onClick) => {
      const b = el('button', cls);
      b.type = 'button';
      if (label) b.setAttribute('aria-label', label);
      if (iconName) b.append(icon(iconName));
      b.addEventListener('click', () => { onClick(); b.blur(); });
      return b;
    };
    const live = until => { const s = el('span', 'num'); s.dataset.until = String(until); return s; };
    const inkNode = ink => {
      if (ink.state !== 'filling') return el('span', 'num', ink.state === 'full' ? 'full' : 'no data');
      const s = live(ink.at);
      if (ink.approx) s.dataset.approx = '1';
      return s;
    };

    const host = el('div');
    host.id = 'inkdom-timers';
    host.style.cssText = 'position:fixed;z-index:2147483000;top:12px;right:12px;';
    const root = host.attachShadow({ mode: 'open' });
    const sheet = new win.CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
    const box = el('div', 'box');
    // The hover ring: drawn over the map at the hovered player's point. It sits before the card, so the card
    // covers it where they overlap, and it never takes a click.
    const mark = el('div', 'mark'), ringTag = el('span', 'ring-tag'), ringDot = el('i', 'dot'), ringName = el('span', 'name');
    mark.hidden = true;
    ringTag.append(ringDot, ringName);
    mark.append(el('div', 'ring'), ringTag);
    // The land outline: the hovered player's whole border, lit up. Three copies of one path: a light wash
    // over the land, a dark casing so it shows on any colour, and the white line that pulses.
    const outline = doc.createElementNS(SVG_NS, 'svg');
    outline.setAttribute('class', 'outline');
    outline.setAttribute('aria-hidden', 'true');
    outline.style.display = 'none';
    const strokes = ['wash', 'casing', 'line'].map(cls => {
      const p = doc.createElementNS(SVG_NS, 'path');
      p.setAttribute('class', cls);
      outline.appendChild(p);
      return p;
    });
    root.append(outline, mark, box);
    doc.body.appendChild(host);
    let hoverId = null, drawnKey = '', drawnRings = null, drawn = null;

    function showTag(row, rect, x, y) {
      // Keep the name on screen even when the place itself is at or past the edge.
      const edge = 26;
      const cx = Math.min(Math.max(x, edge), rect.width - edge), cy = Math.min(Math.max(y, edge), rect.height - edge);
      mark.classList.toggle('edge', cx !== x || cy !== y);
      // The card covers whatever is under it. If the name would land there, put it just left of the card.
      const card = host.getBoundingClientRect();
      let left = rect.left + cx;
      const top = rect.top + cy;
      if (left > card.left - 70 && left < card.right + 10 && top > card.top - 20 && top < card.bottom + 40) left = Math.max(edge, card.left - 80);
      mark.style.left = left + 'px';
      mark.style.top = top + 'px';
      ringDot.style.background = row.color;
      ringName.textContent = row.name;
      mark.hidden = false;
    }

    function placeMark() {
      const row = hoverId && vm && vm.map && !ui.collapsed ? vm.neighbours.find(r => r.id === hoverId) : null;
      const rect = row && opts.mapRect ? opts.mapRect() : null;
      if (!rect) { mark.hidden = true; outline.style.display = 'none'; return; }
      // First choice: the player's land outline, with the name in the middle of the part that is on screen.
      const rings = vm.map.shapes ? vm.map.shapes[hoverId] : null;
      if (rings) {
        const key = hoverId + JSON.stringify(vm.map.bounds) + [rect.left, rect.top, rect.width, rect.height].join(',');
        if (key !== drawnKey || rings !== drawnRings) {
          drawnKey = key; drawnRings = rings;
          drawn = IDT.project.pathOf(rings, vm.map.bounds, rect);
          for (const p of strokes) p.setAttribute('d', drawn ? drawn.d : '');
        }
        if (drawn && drawn.n > 0) {
          outline.style.left = rect.left + 'px'; outline.style.top = rect.top + 'px';
          outline.style.width = rect.width + 'px'; outline.style.height = rect.height + 'px';
          outline.style.display = 'block';
          mark.classList.add('outlined');
          showTag(row, rect, drawn.cx, drawn.cy);
          return;
        }
      }
      // Otherwise: a ring at the point the game gives for the player's land. That point is inside the land but
      // can be far from the avatar, or off screen; then the ring is dashed and held at the edge.
      outline.style.display = 'none';
      mark.classList.remove('outlined');
      const pin = vm.map.pins[hoverId];
      const at = pin ? IDT.project.toScreen(vm.map.bounds, rect, pin.lat, pin.lng) : null;
      if (!at) { mark.hidden = true; return; }
      showTag(row, rect, at.x, at.y);
    }

    function place() {
      if (ui.x == null || ui.y == null) { host.style.left = 'auto'; host.style.right = '12px'; host.style.top = '12px'; return; }
      const x = Math.min(Math.max(0, ui.x), Math.max(0, win.innerWidth - 60));
      const y = Math.min(Math.max(0, ui.y), Math.max(0, win.innerHeight - 30));
      host.style.right = 'auto'; host.style.left = x + 'px'; host.style.top = y + 'px';
    }
    function drag(handle) {
      handle.addEventListener('pointerdown', ev => {
        if (ev.button !== 0 || ev.target.closest('button')) return;
        const r = host.getBoundingClientRect(), dx = ev.clientX - r.left, dy = ev.clientY - r.top;
        const move = e => { ui.x = e.clientX - dx; ui.y = e.clientY - dy; place(); };
        const up = () => {
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
          handle.removeEventListener('pointercancel', up);
          saveUi();
        };
        handle.setPointerCapture(ev.pointerId);
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
        ev.preventDefault();
      });
    }
    function setCollapsed(v) {
      ui.collapsed = v;
      saveUi();
      render();
    }

    function build() {
      builtCollapsed = ui.collapsed; youSig = ''; pillSig = ''; peopleSig = ''; hoverId = null;
      for (const k of Object.keys(refs)) delete refs[k];
      if (ui.collapsed) {
        refs.pill = el('div', 'pill');
        drag(refs.pill);
        box.replaceChildren(refs.pill);
        return;
      }
      const card = el('div', 'panel'), head = el('div', 'p-head'), sec = el('div', 'p-sec'), lab = el('div', 'p-label');
      refs.clock = el('span', 'num p-clock');
      head.append(icon('grip'), el('span', 'p-title', 'Timers'), refs.clock, button('icon-btn', 'Collapse to pill', 'min', () => setCollapsed(true)));
      drag(head);
      refs.note = el('div', 'p-note');
      refs.you = el('div', 'p-sec');
      refs.count = el('span', 'num');
      lab.append(el('span', null, 'On screen'), refs.count);
      refs.rows = el('div', 'rows');
      refs.rows.addEventListener('pointerover', ev => {
        const row = ev.target.closest ? ev.target.closest('.row') : null;
        if (row && row.dataset.key !== hoverId) { hoverId = row.dataset.key; placeMark(); }
      });
      refs.rows.addEventListener('pointerleave', () => { hoverId = null; placeMark(); });
      refs.empty = el('div', 'p-empty', 'No other players on screen.');
      refs.more = button('more', null, null, () => { showAll = !showAll; render(); });
      sec.append(lab, refs.rows, refs.empty, refs.more);
      // The people layer: its switch, and while it is on either one line saying why nothing is drawn, or the legend.
      const psec = el('div', 'p-sec'), plab = el('div', 'p-label'), ticks = el('div', 'ticks num');
      refs.peopleSwitch = el('button', 'switch');
      refs.peopleSwitch.type = 'button';
      refs.peopleSwitch.setAttribute('role', 'switch');
      refs.peopleSwitch.setAttribute('aria-label', 'People layer');
      refs.peopleSwitch.append(el('i'));
      refs.peopleSwitch.addEventListener('click', () => {
        ui.people = !ui.people;
        saveUi();
        opts.onPeople(ui.people);
        renderPeople();
        refs.peopleSwitch.blur();
      });
      plab.append(el('span', null, 'People'), refs.peopleSwitch);
      refs.peopleMsg = el('div', 'p-empty');
      refs.legend = el('div', 'legend');
      refs.lo = el('span');
      refs.hi = el('span');
      refs.hexes = el('div', 'hexes');
      refs.here = el('div', 'here');
      ticks.append(refs.lo, refs.hi);
      refs.legend.append(el('div', 'ramp'), ticks, refs.hexes, refs.here);
      psec.append(plab, refs.peopleMsg, refs.legend);
      card.append(head, refs.note, refs.you, psec, sec);
      box.replaceChildren(card);
    }

    function renderPill() {
      const shield = vm.you.lands.filter(l => l.state === 'shield').map(l => l.until).sort((a, b) => a - b)[0];
      const sig = JSON.stringify([vm.you.ink, shield, vm.open]);
      if (sig === pillSig) return;
      pillSig = sig;
      const a = el('span'), b = el('span'), c = el('span', 'open');
      a.append(icon('drop'), inkNode(vm.you.ink));
      if (shield != null) b.append(icon('lock'), live(shield));
      else { b.className = 'risk'; b.textContent = 'no shield'; }
      c.append(el('i', 'odot'), vm.open + ' open');
      refs.pill.replaceChildren(icon('grip'), a, b, c, button('icon-btn', 'Expand', 'max', () => setCollapsed(false)));
    }

    const cell = (label, value, note) => {
      const c = el('div'), v = el('span', 'num'), n = el('span', 'n');
      v.append(value);
      n.append(...[].concat(note));
      c.append(el('span', 'l', label), v, n);
      return c;
    };
    function renderYou() {
      const y = vm.you, sig = JSON.stringify(y) + new Date(now).toDateString();
      if (sig === youSig) return;
      youSig = sig;
      const head = el('div', 'p-label'), ink = el('div', 'kv'), iv = el('span', 'v'), meter = el('div', 'meter');
      head.append(el('span', null, 'You'));
      refs.fill = el('i');
      refs.ink = y.ink;
      meter.append(refs.fill);
      iv.append(icon('drop'), inkNode(y.ink));
      ink.append(el('span', 'k', 'Ink'), iv, meter, el('span', 'sub',
        y.ink.state === 'filling' ? (y.ink.approx ? 'full at about ' : 'full at ') + F.clock(y.ink.at, now)
          : y.ink.state === 'full' ? 'the tank is full' : 'no ink reading yet'));
      const kids = [head, ink];
      for (const l of y.lands) {
        const kv = el('div', 'kv'), v = el('span', 'v');
        let sub;
        if (l.state === 'shield') {
          v.append(icon('lock'), live(l.until));
          sub = 'until ' + F.clock(l.until, now) + (l.next == null ? '' : ', next shield ' + F.clock(l.next, now));
        } else {
          v.className = 'v risk';
          v.textContent = 'open';
          sub = l.state === 'window' ? 'next shield ' + F.clock(l.next, now) : 'shield available now';
        }
        kv.append(el('span', 'k', l.name), v, el('span', 'sub', sub));
        kids.push(kv);
      }
      const r = y.refills, mini = el('div', 'mini');
      const refill = cell('Refills', r.used == null ? 'no data' : r.used + '/' + r.cap, r.resets_at == null ? '' : ['resets ', live(r.resets_at)]);
      if (r.price != null && r.used != null && r.used < r.cap) refill.title = 'The next refill costs ' + Math.round(r.price) + ' gold.';
      mini.append(
        refill,
        cell('Joker', y.joker.ready ? 'ready' : live(y.joker.at), ''),
        cell('Season', y.season.ends_at == null ? 'no data' : live(y.season.ends_at), y.season.ends_at == null ? '' : F.date(y.season.ends_at)));
      kids.push(mini);
      refs.you.replaceChildren(...kids);
    }

    // An ally's open land is never an opportunity, so it gets no green OPEN, only a plain "open" and the time.
    function stateEl(l, ally) {
      const s = el('span', 'state ' + (ally && l.state === 'window' ? 'free' : l.state));
      if (l.state === 'shield') s.append(icon('lock'), live(l.until));
      else if (l.state === 'window' && ally) s.append('open ', live(l.until));
      else if (l.state === 'window') s.append(el('span', 'chip-open', 'OPEN'), live(l.until));
      else if (l.state === 'safe') s.append('new ', live(l.until));
      else s.textContent = l.state === 'free' ? 'open' : 'open?';
      return s;
    }
    function detail(l, short) {
      switch (l.state) {
        case 'shield': return 'until ' + F.clock(l.until, now);
        case 'window': return (short ? 'no shield until ' : "can't re-shield until ") + F.clock(l.until, now);
        case 'free': return 'can shield any time';
        case 'safe': return 'new player, safe until ' + F.clock(l.until, now);
        default: return short ? 'no shield seen' : 'no shield seen yet';
      }
    }
    function buildRow(r) {
      const row = el('div', 'row' + (r.ally ? ' is-ally' : '')), hd = el('div', 'row-head'), dot = el('span', 'dot'), sub = el('div', 'row-sub');
      const seen = r.seen_min == null ? '' : 'seen ' + r.seen_min + ' min ago';
      dot.style.background = r.color;
      hd.append(dot, el('span', 'name', r.name), el('span', 'rank', r.rank));
      if (r.ally) hd.append(el('span', 'tag', 'ally'));
      const pin = button('icon-btn pin' + (r.pinned ? ' on' : ''), (r.pinned ? 'Unpin ' : 'Pin ') + r.name, 'pin', () => opts.onPin(r.id, !r.pinned));
      pin.setAttribute('aria-pressed', String(r.pinned));
      hd.append(pin);
      row.append(hd);
      if (r.lands.length === 1) {
        hd.append(stateEl(r.lands[0], r.ally));
        sub.append(el('span', null, detail(r.lands[0], false) + (seen ? ' · ' + seen : '')));
      } else {
        for (const l of r.lands) {
          const ln = el('div', 'land');
          ln.append(el('span', 'lname', l.label), el('span', 'ldet', detail(l, true)), stateEl(l, r.ally));
          row.append(ln);
        }
        sub.append(el('span', null, seen || 'one tank for both lands'));
      }
      if (r.ink) {
        const ink = el('span', 'ink');
        ink.title = INK_TIP;
        ink.append(icon('drop'), el('span', 'num', r.ink.full ? 'full' : r.ink.pct + '%+ ~' + F.clock(r.ink.at, now)));
        sub.append(ink);
      }
      row.append(sub);
      return row;
    }
    function renderRows() {
      const all = vm.neighbours, list = showAll ? all : all.slice(0, MAX_ROWS), day = new Date(now).toDateString();
      refs.count.textContent = String(all.length);
      refs.empty.hidden = all.length > 0;
      refs.more.hidden = all.length <= MAX_ROWS;
      refs.more.textContent = showAll ? 'Show fewer' : 'Show all ' + all.length;
      const have = new Map(Array.from(refs.rows.children, c => [c.dataset.key, c]));
      let prev = null;
      for (const r of list) {
        const sig = JSON.stringify(r) + day;
        let node = have.get(r.id);
        have.delete(r.id);
        if (!node || node.dataset.sig !== sig) {
          const fresh = buildRow(r);
          fresh.dataset.key = r.id;
          fresh.dataset.sig = sig;
          if (node) node.replaceWith(fresh);
          node = fresh;
        }
        const want = prev ? prev.nextSibling : refs.rows.firstChild;
        if (node !== want) refs.rows.insertBefore(node, want);
        prev = node;
      }
      for (const node of have.values()) node.remove();
    }

    function renderPeople() {
      const p = peopleInfo, sig = JSON.stringify([ui.people, p]);
      if (sig === peopleSig) return;
      peopleSig = sig;
      refs.peopleSwitch.setAttribute('aria-checked', String(ui.people));
      const msg = ui.people ? PEOPLE_NOTES[p.state] || '' : '';
      refs.peopleMsg.hidden = !msg;
      refs.peopleMsg.textContent = msg;
      const drawn = ui.people && p.state === 'on';
      refs.legend.hidden = !drawn;
      if (!drawn) return;
      refs.lo.textContent = p.lo == null ? '' : F.count(F.sig2(p.lo));
      refs.hi.textContent = p.hi == null ? '' : F.count(F.sig2(p.hi)) + ' and up';
      refs.hexes.textContent = 'Hexagons about ' + p.name + ' across';
      refs.here.textContent = !p.here ? 'Point at the map for a figure'
        : p.here.people ? F.count(p.here.density) + ' people per km² here, ' + F.count(p.here.people) + ' in this hexagon'
          : 'No people counted here';
    }

    function tick() {
      for (const s of root.querySelectorAll('[data-until]')) s.textContent = (s.dataset.approx ? '~' : '') + F.countdown(Number(s.dataset.until) - now);
      if (refs.clock) refs.clock.textContent = F.hms(now);
      if (refs.fill && refs.ink) {
        const i = refs.ink;
        const part = i.state === 'full' ? 1 : i.state === 'filling' && i.refill_ms ? Math.min(1, Math.max(0, 1 - (i.at - now) / i.refill_ms)) : 0;
        refs.fill.style.width = Math.round(part * 100) + '%';
      }
    }
    function render() {
      if (!vm) return;
      if (builtCollapsed !== ui.collapsed) build();
      if (ui.collapsed) renderPill();
      else {
        refs.note.hidden = vm.status === 'ok';
        refs.note.textContent = NOTES[vm.status] || '';
        renderYou();
        renderRows();
        renderPeople();
      }
      placeMark();
      tick();
    }
    function update(nextVm, nextNow) {
      vm = nextVm;
      now = nextNow;
      render();
    }

    place();
    win.addEventListener('resize', place);
    // info: { state: 'off' | 'loading' | 'failed' | 'waiting' | 'h3' | 'on', res, name, lo, hi, here }.
    function people(info) {
      peopleInfo = info;
      if (vm && builtCollapsed === false) renderPeople();
    }

    return { update, host, people };
  }

  IDT.panel = { create };
})(globalThis);
