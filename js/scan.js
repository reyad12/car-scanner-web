// Reading the car and the full inspection (read only).
import { payloadFor, decodePid, parseDtcMessages, parseVin, supportedPids, readiness, parseMode06,
  parseDtcCount, parseDtcList, udsCheck, ascii, decodeDtc } from './obd.js';

let DB = null, EXT = null, MODS = null;
const base = typeof window === 'undefined' ? new URL('../', import.meta.url) : new URL('./', location.href);
async function load(name) {
  if (typeof window === 'undefined') {
    const fs = await import('node:fs');
    return JSON.parse(fs.readFileSync(new URL('data/' + name, base), 'utf8'));
  }
  return (await fetch('data/' + name)).json();
}
export async function db() { DB ??= await load('dtc_ar.json'); return DB; }
async function ext() { EXT ??= await load('dtc_ext.json'); return EXT; }
export async function modules() { MODS ??= await load('vag_modules.json'); return MODS; }

const CAT = { P: ['المحرك وناقل الحركة', 'Powertrain'], C: ['الشاسيه (ABS / التوجيه / التعليق)', 'Chassis'],
  B: ['البودي (الوسائد / الراحة)', 'Body'], U: ['اتصال الوحدات (الشبكة)', 'Network'] };
export const LABOR_USD = 40;

/** Code -> {ar, en, causes, severity, cost[lo,hi] USD}; Arabic entries first, then the open databases. */
export async function describe(code, make) {
  const d = await db(), e = d[code];
  const cost = (p, h) => [Math.round(p[0] + h[0] * LABOR_USD), Math.round(p[1] + h[1] * LABOR_USD)];
  if (e) return { code, ar: e.ar, en: e.en, causes_ar: e.causes_ar, causes_en: e.causes_en || e.causes_ar, severity: e.severity, cost: cost(e.parts_usd, e.labor_hours) };
  const x = (await ext())[code], cat = CAT[code[0]] || ['غير معروف', 'Unknown'];
  const title = x && ((x.mfr || {})[make] || x.en);
  if (title) return { code, ar: `${cat[0]} — ${title}`, en: title, causes_ar: x.causes_en || [], causes_en: x.causes_en || [], severity: 'caution', cost: cost([30, 500], [0.5, 3]), ext: true };
  return { code, ar: `عطل في: ${cat[0]} — الكود مش بالقاعدة`, en: `${cat[1]} fault ${code} - not in the database`, causes_ar: [], causes_en: [], severity: 'caution', cost: cost([30, 500], [0.5, 3]), generic: true };
}

export async function supported(elm) {
  const out = new Set();
  for (let b = 0; b <= 0xa0; b += 0x20) {
    let d = null;
    try { d = payloadFor(await elm.query('01' + b.toString(16).padStart(2, '0').toUpperCase()), 0x41, b); } catch { d = null; }
    if (!d) break;
    supportedPids(b, d).forEach(p => out.add(p));
    if (!out.has(b + 0x20)) break;
  }
  return out;
}
export async function pid(elm, p) {
  try { return decodePid(p, payloadFor(await elm.query('01' + p.toString(16).padStart(2, '0').toUpperCase()), 0x41, p)); }
  catch { return null; }
}
export async function codes(elm) {
  const g = async (c, s) => { try { return parseDtcMessages(await elm.query(c, 8000), s); } catch { return []; } };
  return { stored: await g('03', 0x43), pending: await g('07', 0x47), permanent: await g('0A', 0x4a) };
}
export async function vin(elm) { try { return parseVin(await elm.query('0902', 8000)); } catch { return null; } }
export async function mode06(elm) {
  const mids = [];
  for (let b = 0; b <= 0xe0; b += 0x20) {
    let d = null;
    try { d = payloadFor(await elm.query('06' + b.toString(16).padStart(2, '0').toUpperCase()), 0x46, b); } catch { d = null; }
    if (!d) break;
    mids.push(...supportedPids(b, d));
    if (!mids.includes(b + 0x20)) break;
  }
  const tests = [];
  for (const m of mids) {
    if (m % 32 === 0) continue;
    try { for (const msg of await elm.query('06' + m.toString(16).padStart(2, '0').toUpperCase())) tests.push(...parseMode06(msg).filter(t => t.mid === m)); } catch { /* skip */ }
  }
  return tests;
}

const add = (f, system, zone, level, ar, en, extra = {}) => f.push({ system, zone, level, ar, en, ...extra });

/** The full inspection.  progress(pct, ar, en). */
export async function inspect(elm, { make = null, progress = () => {} } = {}) {
  const f = [], t0 = Date.now();
  progress(5, 'قراءة الأكواد', 'Reading codes');
  const c = await codes(elm), v = await vin(elm);
  const seen = new Set();
  for (const [grp, list] of Object.entries(c)) for (const code of list) {
    if (seen.has(code)) continue; seen.add(code);
    const d = await describe(code, make), z = zoneFor(code);
    add(f, 'obd', z, grp === 'pending' ? 'caution' : d.severity, `${code}: ${d.ar}`, `${code}: ${d.en}`, { code, cost: d.cost, causes_ar: d.causes_ar, causes_en: d.causes_en });
  }
  progress(20, 'الفحوصات الذاتية', 'Readiness');
  let rd = null;
  try { rd = readiness(payloadFor(await elm.query('0101'), 0x41, 1)); } catch { rd = null; }
  if (rd) {
    const inc = rd.monitors.filter(m => !m.complete && !m.continuous);
    if (!inc.length) add(f, 'readiness', 'engine', 'ok', 'كل فحوصات الكمبيوتر الذاتية مكتملة.', 'All readiness monitors complete.');
    else add(f, 'readiness', 'engine', inc.length >= 3 ? 'caution' : 'info', 'فحوصات ذاتية غير مكتملة: ' + inc.map(m => m.ar).join('، '), 'Monitors not complete: ' + inc.map(m => m.en).join(', '));
  }
  progress(35, 'نتائج الاختبارات الداخلية (Mode 06)', 'Mode 06');
  const tests = await mode06(elm);
  const cyl = {};
  for (const t of tests) {
    if (t.mid >= 0xa2 && t.mid <= 0xad && t.tid === 0x0b) cyl[t.mid - 0xa1] = t.raw;
    else if (!t.pass) add(f, 'mode06', 'engine', 'caution', `اختبار داخلي فشل (MID ${t.mid.toString(16)})`, `On-board test failed (MID ${t.mid.toString(16)})`);
  }
  for (const [n, cnt] of Object.entries(cyl)) {
    const others = Object.entries(cyl).filter(([k]) => k !== n).map(([, x]) => x).sort((a, b) => a - b);
    const med = others.length ? others[Math.floor(others.length / 2)] : 0;
    if (cnt >= 10 && cnt >= 4 * (med + 1)) add(f, 'engine', 'cyl' + n, 'caution', `السلندر ${n} ضعيف: عدّاد الحرق ${cnt} (الباقي حوالي ${med}).`, `Cylinder ${n} weak: misfire count ${cnt} (others ~${med}).`, { cost: [70, 610] });
  }
  progress(50, 'صحة المحرك من البيانات الحيّة', 'Live engine data');
  const sup = await supported(elm), L = {};
  for (const p of [0x0c, 0x0d, 0x05, 0x06, 0x07, 0x42, 0x0e, 0x0f, 0x04, 0x1f, 0xa6]) if (sup.has(p)) L[p] = await pid(elm, p);
  const volt = await elm.voltage().catch(() => null), run = (L[0x0c] || 0) > 400;
  if (!run) add(f, 'engine', 'engine', 'info', 'المحرك مطفي: فحوصات الدوران والوقود بدها المحرك شغّال.', 'Engine off: idle and fuel checks need the engine running.');
  else {
    const tr = (L[6] ?? 0) + (L[7] ?? 0);
    if (L[6] != null) add(f, 'engine', 'engine', Math.abs(tr) > 12 ? 'caution' : 'ok', Math.abs(tr) > 12 ? `تصحيح الوقود ${tr.toFixed(0)}% — ${tr > 0 ? 'خليط فقير (تسريب هوا؟)' : 'خليط غني'}` : `تصحيح الوقود طبيعي (${tr.toFixed(0)}%).`, `Fuel trims ${tr.toFixed(0)}%`);
    if (L[5] >= 112) add(f, 'engine', 'cooling', 'stop', `حرارة المحرك ${L[5]}° عالية جدًا!`, `Coolant ${L[5]}° too hot!`);
  }
  if (volt != null) add(f, 'battery', 'battery', run ? (volt < 13 || volt > 15 ? 'caution' : 'ok') : (volt < 11.8 ? 'caution' : 'ok'),
    run ? `فولت الشحن ${volt}V` : `فولت البطارية ${volt}V (الإشعال ON)`, run ? `Charging ${volt}V` : `Battery ${volt}V (ignition on)`);
  progress(70, 'فحص وحدات السيارة', 'Module scan');
  const mods = [], ML = (await modules()).filter(m => !m.ext && !m.only.includes('ev'));
  for (const [i, m] of ML.entries()) {
    progress(70 + Math.round(25 * i / ML.length), `وحدة ${m.addr} — ${m.ar}`, `Module ${m.addr} - ${m.en}`);
    const rec = { addr: m.addr, ar: m.ar, en: m.en, zone: m.zone, responded: false };
    let r = null;
    try { r = await elm.udsRequest(m.tx, m.rx, [0x3e, 0x00]); } catch { r = null; }
    if (r) {
      rec.responded = true;
      try { rec.name = ascii(udsCheck(await elm.udsRequest(m.tx, m.rx, [0x22, 0xf1, 0x97]), 0x22).slice(3)); } catch { /* optional */ }
      try { const cnt = parseDtcCount(await elm.udsRequest(m.tx, m.rx, [0x19, 0x01, 0x08])); rec.count = cnt.count; rec.format = cnt.format; } catch { /* optional */ }
      if (rec.count) {
        let list = null;
        try { list = parseDtcList(await elm.udsRequest(m.tx, m.rx, [0x19, 0x02, 0x0d]), rec.format); } catch { list = null; }
        rec.dtcs = list || [];
        add(f, 'modules', m.zone, 'caution', `${m.addr} ${m.ar}: ${rec.count} عطل مؤكد` + (list && list.length ? ' — ' + list.map(d => d.code).join('، ') : ' (القائمة ما وصلت كاملة عبر هالقطعة)'),
          `${m.addr} ${m.en}: ${rec.count} confirmed fault(s)`);
      }
    }
    mods.push(rec);
  }
  await elm.obdHeaders().catch(() => {});
  if (mods.filter(m => m.responded).length <= 1) add(f, 'modules', 'gateway', 'info',
    'من منفذ OBD وعبر هالقطعة ردّ كمبيوتر المحرك بس. باقي الوحدات (الجير، ABS، الوسائد…) بدها جهاز VAG مخصص.',
    'Only the engine ECU answered through this adapter; other modules need a VAG-capable tool.');
  if (L[0xa6]) add(f, 'odometer', 'cluster', 'info', `العداد: ${Math.round(L[0xa6]).toLocaleString()} كم`, `Odometer: ${Math.round(L[0xa6]).toLocaleString()} km`);
  progress(100, 'انتهى', 'Done');
  return { time: new Date().toISOString(), vin: v, codes: c, readiness: rd, mode06: tests, cylinders: cyl, live: L, volt, modules: mods,
    findings: f, score: score(f), seconds: Math.round((Date.now() - t0) / 1000) };
}

export function zoneFor(code) {
  if (/^P0(30|20|35)[1-8]$/.test(code)) return 'cyl' + code[4];
  if (/^P04[23]/.test(code)) return 'catalyst';
  if (/^P(20B|20E|203|204|229|220|2BA)/.test(code)) return 'adblue';
  if (/^P(246|242|245|2002|0471)/.test(code)) return 'dpf';
  if (/^P(0128|0125|0597|2181|0217|011|2B6)/.test(code)) return 'cooling';
  if (/^P0(562|563)/.test(code)) return 'battery';
  if (/^P0[78]/.test(code)) return 'gearbox';
  if (/^P01[3-6]/.test(code)) return 'exhaust';
  if (/^C/.test(code)) return 'abs';
  if (/^B000/.test(code)) return 'airbag';
  return 'engine';
}

export function score(f) {
  const W = { stop: 15, caution: 6 }, byZone = {};
  for (const x of f) if (W[x.level]) (byZone[x.zone] ??= []).push(W[x.level]);
  let s = 100;
  for (const ws of Object.values(byZone)) { ws.sort((a, b) => b - a); s -= Math.min(22, ws[0] + 0.5 * ws.slice(1).reduce((a, b) => a + b, 0)); }
  return Math.max(0, Math.round(s));
}
export { decodeDtc };
