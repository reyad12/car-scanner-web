import { Elm } from './elm.js';
import { BleTransport, bleSupported } from './ble.js';
import { SimTransport } from './sim.js';
import { inspect, codes, describe, pid, supported } from './scan.js';
import { parseResponse } from './obd.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let elm = null, SUP = null, RESULT = null, V = {}, MIL = null, timer = null, HUD = localStorage.getItem('hud') || 'gauges';
const LV = { stop: 'خطير', caution: 'انتبه', ok: 'سليم', info: 'معلومة' };

// ---------- tabs ----------
$('nav').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'p-' + b.dataset.tab));
  if (b.dataset.tab === 'map') loadMap();
};

// ---------- connection ----------
function setStatus(txt, on) { $('st').textContent = txt; $('st').className = on ? 'on' : ''; }
async function start(transport, label) {
  if (elm) { stopDash(); elm.close(); }
  elm = new Elm(transport);
  $('cmsg').textContent = 'عم يتصل بالسيارة… (لحد 20 ثانية)';
  try {
    await elm.init();
    SUP = await supported(elm);
    const vin = (await elm.query('0902', 8000).catch(() => [])).length;
    setStatus('متصل ✔ ' + label, true);
    $('connect').hidden = true;
    $('cmsg').textContent = `متصل ✔ — ${elm.version} — بروتوكول ${elm.protocol}` + (vin ? '' : '');
  } catch (e) {
    const off = /UNABLE TO CONNECT|NO DATA|ignition/.test(e.message);
    $('cmsg').innerHTML = `<span class="err">${off ? 'القطعة متصلة ✔ بس السيارة ما بترد — السيارة مطفية. شغّل الإشعال (ON) أو المحرك وجرّب كمان مرة.' : 'ما زبط الاتصال: ' + esc(e.message)}</span>`;
    setStatus('غير متصل', false); elm = null;
  }
}
$('bleBtn').onclick = async () => {
  if (!bleSupported()) { $('cmsg').innerHTML = '<span class="err">هالمتصفح ما بيدعم البلوتوث. افتح الصفحة بـ Chrome على أندرويد (مش من داخل تطبيق تاني).</span>'; return; }
  try { const t = await BleTransport.open(); await start(t, t.label); }
  catch (e) { if (e.name !== 'NotFoundError') $('cmsg').innerHTML = `<span class="err">ما قدرت أفتح القطعة: ${esc(e.message)} — تأكد إنها مشبوكة وما في تطبيق تاني فاتحها.</span>`; }
};
$('simBtn').onclick = () => start(new SimTransport($('simSel').value), '(محاكاة)');
$('st').onclick = () => { $('connect').hidden = !$('connect').hidden; };
$('disBtn').onclick = () => { stopDash(); if (elm) elm.close(); elm = null; setStatus('غير متصل', false); $('cmsg').textContent = ''; };
const need = () => { if (!elm) { alert('اتصل بالسيارة أول (فوق).'); return false; } return true; };

// ---------- dashboard ----------
function arc(cx, cy, r, a0, a1) {
  const p = a => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)], s = p(a0), e = p(a1);
  return `M${s[0].toFixed(1)},${s[1].toFixed(1)} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${e[0].toFixed(1)},${e[1].toFixed(1)}`;
}
function gauge(v, min, max, label, unit, o = {}) {
  const A0 = 150, A1 = 390, cx = 120, cy = 118, R = 92, val = v == null ? null : Math.max(min, Math.min(max, v));
  const ang = A0 + (A1 - A0) * (val == null ? 0 : (val - min) / (max - min));
  let h = `<path d="${arc(cx, cy, R, A0, A1)}" stroke="#13263a" stroke-width="14" fill="none" stroke-linecap="round"/>`;
  if (o.red != null) h += `<path d="${arc(cx, cy, R, A0 + (A1 - A0) * (o.red - min) / (max - min), A1)}" stroke="#ff3b3b" stroke-opacity=".55" stroke-width="14" fill="none"/>`;
  if (val != null) h += `<path d="${arc(cx, cy, R, A0, Math.max(A0 + .5, ang))}" stroke="url(#gg)" stroke-width="14" fill="none" stroke-linecap="round"/>`;
  const n = o.ticks || 10;
  for (let i = 0; i <= n; i++) {
    const a = (A0 + (A1 - A0) * i / n) * Math.PI / 180, r1 = R - 18, r2 = R - (i % 2 ? 24 : 30);
    h += `<line x1="${(cx + r1 * Math.cos(a)).toFixed(1)}" y1="${(cy + r1 * Math.sin(a)).toFixed(1)}" x2="${(cx + r2 * Math.cos(a)).toFixed(1)}" y2="${(cy + r2 * Math.sin(a)).toFixed(1)}" stroke="#4d6a88" stroke-width="2"/>`;
    if (!(i % 2)) { const r3 = R - 42; h += `<text x="${(cx + r3 * Math.cos(a)).toFixed(1)}" y="${(cy + r3 * Math.sin(a) + 4).toFixed(1)}" fill="#6f8aa6" font-size="11" text-anchor="middle">${Math.round((min + (max - min) * i / n) / (o.div || 1))}</text>`; }
  }
  if (val != null) { const a = ang * Math.PI / 180; h += `<line x1="${cx}" y1="${cy}" x2="${(cx + (R - 14) * Math.cos(a)).toFixed(1)}" y2="${(cy + (R - 14) * Math.sin(a)).toFixed(1)}" stroke="#ff4d4d" stroke-width="3" stroke-linecap="round"/>`; }
  h += `<circle cx="${cx}" cy="${cy}" r="8" fill="#0b1520" stroke="#4d6a88"/><text x="${cx}" y="${cy + (o.big ? 44 : 40)}" fill="#fff" font-size="${o.big ? 44 : 30}" font-weight="bold" text-anchor="middle">${v == null ? '--' : Math.round(v)}</text>`;
  h += `<text x="${cx}" y="${cy + (o.big ? 62 : 58)}" fill="#7fb8e6" font-size="12" text-anchor="middle">${unit}</text><text x="${cx}" y="${cy + (o.big ? 80 : 76)}" fill="#9fb3c8" font-size="13" text-anchor="middle">${label}</text>`;
  return `<svg viewBox="0 0 240 204"><defs><linearGradient id="gg"><stop offset="0" stop-color="#0a7bd6"/><stop offset="1" stop-color="#1fe0ff"/></linearGradient></defs>${h}</svg>`;
}
const tile = (l, v, u, dec = 0, cls = '') => `<div class="${cls}"><small>${l}</small><b dir="ltr">${typeof v === 'number' ? (dec ? v.toFixed(dec) : Math.round(v)) : (v ?? '--')}</b><i>${u}</i></div>`;
const ICONS = {
  engine: ['فحص المحرك', '<path d="M8 20h6l3-4h10l3 4h4v4h3v-3h3v12h-3v-3h-3v5h-6l-3 4H16l-4-4H8z" fill="none" stroke="currentColor" stroke-width="2.6"/>'],
  temp: ['حرارة المحرك', '<path d="M22 6v20a6 6 0 1 0 4 0V6z" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M6 40q4-3 8 0t8 0 8 0 8 0 8 0" fill="none" stroke="currentColor" stroke-width="2.4"/>'],
  battery: ['الشحن', '<rect x="6" y="14" width="36" height="24" rx="2" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12 26h8M32 22v8M28 26h8" stroke="currentColor" stroke-width="2.6"/>'],
  fuel: ['البنزين قليل', '<path d="M10 40V10h18v30zM10 18h18M28 22h4v12a3 3 0 0 0 6 0V18l-5-6" fill="none" stroke="currentColor" stroke-width="2.6"/>'],
  abs: ['ABS', '<circle cx="24" cy="24" r="13" fill="none" stroke="currentColor" stroke-width="2.6"/><text x="24" y="28.5" font-size="10.5" font-weight="bold" text-anchor="middle" fill="currentColor">ABS</text>'],
  airbag: ['الوسائد', '<circle cx="17" cy="9" r="4" fill="currentColor"/><path d="M14 16l-2 14h8l4 12M30 30a8 8 0 1 0 .1 0" fill="none" stroke="currentColor" stroke-width="2.6"/>'],
};
function lamps() {
  const run = (V[0x0c] || 0) > 400, volt = V.volt ?? V[0x42];
  return { engine: MIL == null ? '' : MIL ? 'amber' : 'green', temp: V[5] == null ? '' : V[5] >= 112 ? 'red' : V[5] >= 108 ? 'amber' : 'green',
    battery: volt == null ? '' : run ? (volt < 12.8 ? 'red' : 'green') : (volt < 11.8 ? 'amber' : 'green'),
    fuel: V[0x2f] == null ? '' : V[0x2f] < 12 ? 'amber' : 'green', abs: '', airbag: '' };
}
function renderDash() {
  document.querySelectorAll('[data-hud]').forEach(b => b.classList.toggle('pri', b.dataset.hud === HUD));
  $('runBtn').textContent = timer ? '⏸ إيقاف' : '▶ تشغيل';
  const volt = V.volt ?? V[0x42];
  $('nocar').hidden = !!elm;
  if (HUD === 'gauges') $('dashbody').innerHTML = `<div class="gauges"><div>${gauge(V[0x0c], 0, 8000, 'دورات', 'x1000', { red: 6500, div: 1000 })}</div>
     <div>${gauge(V[0x0d], 0, 240, 'السرعة', 'km/h', { big: true, ticks: 12 })}</div><div>${gauge(V[5], 40, 130, 'الحرارة', '°C', { red: 110, ticks: 9 })}</div></div>
     <div class="g12" style="margin-top:6px">${tile('فولت', volt, 'V', 1)}${tile('الحمل', V[4], '%')}${tile('البنزين', V[0x2f], '%')}</div>`;
  else if (HUD === 'grid') $('dashbody').innerHTML = `<div class="g12">${[['السرعة', V[0x0d], 'km/h'], ['دورات', V[0x0c], 'rpm'], ['الحرارة', V[5], '°C'],
    ['فولت', volt, 'V', 1], ['ضغط السحب', V[0x0b], 'kPa'], ['التوقيت', V[0x0e], '°', 1], ['هواء السحب', V[0x0f], '°C'], ['الحمل', V[4], '%'],
    ['الخانق', V[0x11], '%'], ['البنزين', V[0x2f], '%'], ['تصحيح قصير', V[6], '%', 1], ['تصحيح طويل', V[7], '%', 1]].map(a => tile(...a)).join('')}</div>`;
  else { const s = lamps(); $('dashbody').innerHTML = `<div class="lamps">${Object.entries(ICONS).map(([k, [n, svg]]) => `<div class="lamp ${s[k]}"><svg viewBox="0 0 48 48">${svg}</svg><b>${n}</b><br><small>${{ red: 'مضوية — خطير', amber: 'مضوية — انتبه', green: 'سليمة', '': 'ما في قراءة' }[s[k]]}</small></div>`).join('')}</div>`; }
}
document.addEventListener('click', e => { const b = e.target.closest('[data-hud]'); if (b) { HUD = b.dataset.hud; localStorage.setItem('hud', HUD); renderDash(); } });
const ROT = [0x05, 0x42, 0x0b, 0x0e, 0x0f, 0x04, 0x11, 0x2f, 0x06, 0x07];
let ri = 0, busy = false, milAt = 0;
async function tick() {
  if (busy || !elm) return; busy = true;
  try {
    const pick = [0x0d, 0x0c, ...[0, 1, 2].map(k => ROT[(ri + k) % ROT.length])].filter(p => !SUP || !SUP.size || SUP.has(p));
    ri += 3;
    for (const p of pick) V[p] = await pid(elm, p);
    if (Date.now() - milAt > 10000) {
      milAt = Date.now();
      try { const m = parseResponse(await elm.raw('0101'), '0101').find(x => x[0] === 0x41 && x[1] === 1); MIL = m ? !!(m[2] & 0x80) : null; } catch { /* keep */ }
      V.volt = await elm.voltage().catch(() => null);
    }
  } finally { busy = false; }
  renderDash();
}
function stopDash() { clearInterval(timer); timer = null; renderDash(); }
$('runBtn').onclick = () => { if (timer) return stopDash(); if (!need()) return; timer = setInterval(tick, 400); renderDash(); };
$('hudBtn').onclick = async () => { document.body.classList.add('hudmode'); HUD = 'gauges'; renderDash(); if (!timer && elm) $('runBtn').click(); try { await document.documentElement.requestFullscreen(); } catch { /* optional */ } };
$('hudflip').onclick = () => document.body.classList.toggle('mirror');
$('hudexit').onclick = () => { document.body.classList.remove('hudmode', 'mirror'); try { document.exitFullscreen(); } catch { /* not fullscreen */ } };

// ---------- inspection ----------
$('inspBtn').onclick = async () => {
  if (!need()) return;
  const was = !!timer; if (was) stopDash();
  $('iprog').hidden = false; $('inspBtn').disabled = true;
  try {
    RESULT = await inspect(elm, { make: null, progress: (p, ar) => { $('ibar').style.width = p + '%'; $('imsg').textContent = ar + ` (${p}%)`; } });
    localStorage.setItem('last', JSON.stringify(RESULT));
    renderSummary();
  } catch (e) { $('imsg').innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  $('inspBtn').disabled = false;
  if (was) $('runBtn').click();
};
function renderSummary() {
  const r = RESULT; if (!r) return;
  const lvl = r.score >= 85 ? 'ok' : r.score >= 50 ? 'caution' : 'stop', order = { stop: 0, caution: 1, ok: 2, info: 3 };
  const cost = r.findings.filter(f => f.cost && (f.level === 'stop' || f.level === 'caution')).reduce((a, f) => [a[0] + f.cost[0], a[1] + f.cost[1]], [0, 0]);
  $('isum').innerHTML = `<section class="card"><div class="row" style="gap:14px"><div class="dial ${lvl}"><b>${r.score}</b><span>من 100</span></div>
    <div><b style="font-size:19px">${r.score >= 85 ? 'ممتازة' : r.score >= 70 ? 'جيدة' : r.score >= 50 ? 'مقبولة — بدها تصليح' : 'سيئة'}</b>
    <div>التكلفة التقديرية: <b dir="ltr">$${cost[0].toLocaleString()}–${cost[1].toLocaleString()}</b></div><div class="sub" dir="ltr">${esc(r.vin || '')}</div>
    <button onclick="document.querySelector('[data-tab=map]').click()">🚙 شوفها على السيارة</button></div></div></section>
    <section class="card"><h2>النتائج</h2>${r.findings.slice().sort((a, b) => order[a.level] - order[b.level]).map(f => `<div class="dtc ${f.level}"><span class="tag">${LV[f.level]}</span>${esc(f.ar)}${f.cost ? ` <span class="sub" dir="ltr">($${f.cost[0]}–${f.cost[1]})</span>` : ''}</div>`).join('')}</section>`;
}

// ---------- car map ----------
let ANCH = null, ZOOM = false;
async function loadMap() {
  ANCH ??= await (await fetch('cars/anchors.json')).json();
  const body = $('bodySel').value, a = ANCH[body];
  $('map').innerHTML = await (await fetch(`cars/${body}.svg`)).text();
  $('credit').textContent = a.credit; ZOOM = false; $('zoomOut').hidden = true;
  const svg = $('map').querySelector('svg'), f = RESULT ? RESULT.findings : [], rank = { stop: 2, caution: 1 }, zones = {};
  for (const x of f) if (rank[x.level]) { const z = x.zone; if (!zones[z] || rank[x.level] > rank[zones[z]]) zones[z] = x.level; if (z.startsWith('cyl') && (!zones.engine || rank[x.level] > rank[zones.engine])) zones.engine = x.level; }
  let n = 0, mk = '';
  for (const [z, l] of Object.entries(zones)) {
    svg.querySelectorAll(`[data-zone="${z}"]`).forEach(g => g.classList.add('s-' + l));
    const p = a.anchors[z]; if (!p) continue; n++;
    mk += `<g class="mk s-${l}" data-zone="${z}"><circle class="pulse" cx="${p[0]}" cy="${p[1]}" r="10"/><circle class="dot" cx="${p[0]}" cy="${p[1]}" r="12"/><text x="${p[0]}" y="${p[1]}">${n}</text></g>`;
  }
  svg.insertAdjacentHTML('beforeend', mk);
  svg.dataset.full = svg.getAttribute('viewBox');
  if (!RESULT) $('zinfo').innerHTML = '<span class="sub">اعمل الفحص الشامل أول، وبتطلع المشاكل هون.</span>';
}
$('bodySel').onchange = loadMap;
function animate(to, ms = 550) {
  const s = $('map').querySelector('svg'), from = s.getAttribute('viewBox').split(' ').map(Number), t0 = performance.now(), ease = x => x < .5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
  const step = now => { const k = ease(Math.min(1, (now - t0) / ms)); s.setAttribute('viewBox', from.map((v, i) => (v + (to[i] - v) * k).toFixed(1)).join(' ')); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
$('map').onclick = e => {
  const g = e.target.closest('[data-zone]'), s = $('map').querySelector('svg');
  if (!g) { if (ZOOM) $('zoomOut').click(); return; }
  const full = s.dataset.full.split(' ').map(Number), bb = g.getBBox(), cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2, w = Math.max(full[2] / 2.6, bb.width * 1.8), h = w * full[3] / full[2];
  animate([Math.min(Math.max(0, cx - w / 2), full[2] - w), Math.min(Math.max(0, cy - h / 2), full[3] - h), w, h]); ZOOM = true; $('zoomOut').hidden = false;
  const z = g.dataset.zone, fs = (RESULT ? RESULT.findings : []).filter(f => f.zone === z || (z === 'engine' && f.zone.startsWith('cyl')));
  const name = (s.querySelector(`g.z[data-zone="${z}"] title`) || {}).textContent || z;
  $('zinfo').innerHTML = `<h2>${esc(name)}</h2>` + (fs.length ? fs.map(f => `<div class="dtc ${f.level}"><span class="tag">${LV[f.level]}</span>${esc(f.ar)}${(f.causes_ar || []).length ? `<div class="sub">الأسباب: ${f.causes_ar.map(esc).join(' • ')}</div>` : ''}${f.cost ? `<div>التكلفة التقديرية: <b dir="ltr">$${f.cost[0]}–${f.cost[1]}</b></div>` : ''}</div>`).join('') : '<span class="sub">ما في ملاحظات على هالقطعة.</span>');
  setTimeout(() => { const m = $('map').getBoundingClientRect(), zi = $('zinfo').getBoundingClientRect(); scrollBy({ top: Math.min(m.top - 60, zi.bottom - innerHeight + 80), behavior: 'smooth' }); }, 120);
};
$('zoomOut').onclick = () => { const s = $('map').querySelector('svg'); animate(s.dataset.full.split(' ').map(Number)); ZOOM = false; $('zoomOut').hidden = true; };

// ---------- codes ----------
$('codesBtn').onclick = async () => {
  if (!need()) return;
  const was = !!timer; if (was) stopDash();
  $('codes').innerHTML = '<p class="sub">عم يقرا…</p>';
  const c = await codes(elm), all = [...new Set([...c.stored, ...c.pending, ...c.permanent])];
  const rows = [];
  for (const code of all) {
    const d = await describe(code), grp = ['stored', 'pending', 'permanent'].filter(g => c[g].includes(code)).map(g => ({ stored: 'مخزّن', pending: 'معلّق', permanent: 'دائم' }[g]));
    rows.push(`<div class="dtc ${d.severity}"><b dir="ltr">${code}</b> ${grp.map(g => `<span class="tag">${g}</span>`).join('')}<div>${esc(d.ar)}</div>${d.causes_ar.length ? `<div class="sub">الأسباب: ${d.causes_ar.map(esc).join(' • ')}</div>` : ''}<div class="sub" dir="ltr">~$${d.cost[0]}–${d.cost[1]}</div></div>`);
  }
  $('codes').innerHTML = rows.join('') || '<p>ما في أكواد أعطال ✔</p>';
  if (was) $('runBtn').click();
};
$('clearBtn').onclick = async () => {
  if (!need()) return;
  const t = prompt('رح تنمسح الأكواد وتنطفي لمبة المحرك. إذا ما تصلّح العطل بترجع.\nللتأكيد اكتب: امسح');
  if ((t || '').trim() !== 'امسح') return;
  const r = await elm.query('04', 8000).catch(() => []);
  alert(r.some(m => m[0] === 0x44) ? 'انبعت أمر المسح. اقرأ الأكواد كمان مرة للتأكد.' : 'السيارة ما قبلت المسح.');
};

// ---------- start ----------
try { RESULT = JSON.parse(localStorage.getItem('last') || 'null'); if (RESULT) renderSummary(); } catch { /* fresh start */ }
renderDash();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
