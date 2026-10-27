// ELM327 replies, OBD-II decoding and read-only UDS - pure functions (browser + node).
// Port of obd-scanner (Python), where the same logic was tested on a 2023 Skoda Kodiaq.

export class ElmError extends Error {}

const EMPTY = ['NO DATA'];
const ERRORS = ['UNABLE TO CONNECT', 'CAN ERROR', 'BUS BUSY', 'BUS ERROR', 'BUFFER FULL', 'DATA ERROR',
  'FB ERROR', 'LV RESET', 'ACT ALERT', 'STOPPED', 'ERROR', 'NO RESPONSE'];
const NOISE = ['SEARCHING', 'BUS INIT', 'OK'];

export function hexBytes(t) {
  const c = t.replace(/ /g, '').toUpperCase();
  if (!c || c.length % 2 || !/^[0-9A-F]+$/.test(c)) return null;
  const out = [];
  for (let i = 0; i < c.length; i += 2) out.push(parseInt(c.slice(i, i + 2), 16));
  return out;
}

/** Raw adapter text -> list of messages (one per ECU); ISO-TP multi-line reassembly. */
export function parseResponse(raw, echo) {
  const lines = raw.replace(/>/g, '').split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  const msgs = []; let cur = null, expected = 0;
  const flush = () => {
    if (cur !== null) {
      if (expected && cur.length < expected) throw new ElmError(`incomplete multi-frame message (${cur.length}/${expected} bytes)`);
      msgs.push(expected ? cur.slice(0, expected) : cur);
    }
    cur = null;
  };
  for (const line of lines) {
    const up = line.toUpperCase();
    if (echo && up.replace(/ /g, '') === echo.toUpperCase().replace(/ /g, '')) continue;
    if (up.startsWith('BUS INIT') && up.includes('ERROR')) throw new ElmError(line);
    if (NOISE.some(n => up.startsWith(n)) && !hexBytes(up)) continue;
    if (EMPTY.includes(up)) { flush(); return msgs; }
    if (up === '?' || ERRORS.some(e => up.startsWith(e))) throw new ElmError(line);
    const m = up.match(/^([0-9A-F]):(.*)$/);
    if (m && cur !== null) {
      const d = hexBytes(m[2]);
      if (!d) throw new ElmError('bad frame line: ' + line);
      cur.push(...d); continue;
    }
    const compact = up.replace(/ /g, '');
    if (compact.length === 3 && /^[0-9A-F]+$/.test(compact)) { flush(); expected = parseInt(compact, 16); cur = []; continue; }
    const d = hexBytes(up);
    if (!d) continue;
    flush(); expected = 0; msgs.push(d);
  }
  flush();
  return msgs;
}

const PFX = 'PCBU';
export const decodeDtc = (b1, b2) =>
  PFX[(b1 >> 6) & 3] + ((b1 >> 4) & 3) + (b1 & 15).toString(16).toUpperCase() + (b2 >> 4).toString(16).toUpperCase() + (b2 & 15).toString(16).toUpperCase();
export function encodeDtc(code) {
  code = code.toUpperCase();
  return [(PFX.indexOf(code[0]) << 6) | (parseInt(code[1], 16) << 4) | parseInt(code[2], 16), parseInt(code.slice(3, 5), 16)];
}
export function parseDtcMessages(msgs, sid) {
  const codes = [];
  for (const m of msgs) {
    if (!m.length || m[0] !== sid) continue;
    let p = m.slice(1);
    if (p.length % 2 === 1) p = p.slice(1);
    for (let i = 0; i + 1 < p.length; i += 2) {
      if (!p[i] && !p[i + 1]) continue;
      const c = decodeDtc(p[i], p[i + 1]);
      if (!codes.includes(c)) codes.push(c);
    }
  }
  return codes;
}

const w = d => d[0] * 256 + d[1];
export const PIDS = {
  0x04: [1, d => d[0] * 100 / 255], 0x05: [1, d => d[0] - 40], 0x06: [1, d => d[0] * 100 / 128 - 100],
  0x07: [1, d => d[0] * 100 / 128 - 100], 0x0A: [1, d => d[0] * 3], 0x0B: [1, d => d[0]], 0x0C: [2, d => w(d) / 4],
  0x0D: [1, d => d[0]], 0x0E: [1, d => d[0] / 2 - 64], 0x0F: [1, d => d[0] - 40], 0x10: [2, d => w(d) / 100],
  0x11: [1, d => d[0] * 100 / 255], 0x14: [1, d => d[0] / 200], 0x15: [1, d => d[0] / 200], 0x1F: [2, w],
  0x21: [2, w], 0x23: [2, d => w(d) * 10], 0x2C: [1, d => d[0] * 100 / 255], 0x2E: [1, d => d[0] * 100 / 255],
  0x2F: [1, d => d[0] * 100 / 255], 0x30: [1, d => d[0]], 0x31: [2, w], 0x33: [1, d => d[0]],
  0x3C: [2, d => w(d) / 10 - 40], 0x3E: [2, d => w(d) / 10 - 40], 0x42: [2, d => w(d) / 1000],
  0x43: [2, d => w(d) * 100 / 255], 0x44: [2, d => w(d) / 32768], 0x45: [1, d => d[0] * 100 / 255],
  0x46: [1, d => d[0] - 40], 0x47: [1, d => d[0] * 100 / 255], 0x49: [1, d => d[0] * 100 / 255],
  0x4C: [1, d => d[0] * 100 / 255], 0x5C: [1, d => d[0] - 40], 0x5E: [2, d => w(d) / 20],
  0x61: [1, d => d[0] - 125], 0x62: [1, d => d[0] - 125], 0x63: [2, w],
  0xA6: [4, d => ((d[0] << 24) + (d[1] << 16) + (d[2] << 8) + d[3]) / 10],
};
export function decodePid(pid, data) {
  const p = PIDS[pid];
  if (!p || !data || data.length < p[0]) return null;
  const v = p[1](data);
  return Math.round(v * 10) / 10;
}
export function payloadFor(msgs, sid, pid, skip = 0) {
  for (const m of msgs) if (m.length >= 2 + skip && m[0] === sid && m[1] === pid) return m.slice(2 + skip);
  return null;
}
export function supportedPids(base, d) {
  const out = [];
  for (let i = 0; i < 32; i++) if (d[i >> 3] & (0x80 >> (i & 7))) out.push(base + i + 1);
  return out;
}
export function parseVin(msgs) {
  let s = '';
  for (const m of msgs) if (m.length >= 3 && m[0] === 0x49 && m[1] === 0x02) s += m.slice(3).filter(b => b > 0x20 && b < 0x7f).map(b => String.fromCharCode(b)).join('');
  return s.length >= 17 ? s.slice(-17) : null;
}

const CONT = [['misfire', 'الحرق غير المنتظم', 'Misfire'], ['fuel', 'نظام الوقود', 'Fuel system'], ['components', 'المكوّنات الشاملة', 'Components']];
const SPARK = { 0: ['catalyst', 'الكاتاليزر', 'Catalyst'], 1: ['heated_cat', 'الكاتاليزر المسخّن', 'Heated catalyst'], 2: ['evap', 'نظام EVAP', 'EVAP'],
  3: ['sec_air', 'الهواء الثانوي', 'Secondary air'], 5: ['o2', 'حساسات الأكسجين', 'O2 sensors'], 6: ['o2_heater', 'سخّان حساس الأكسجين', 'O2 heater'], 7: ['egr', 'EGR / VVT', 'EGR / VVT'] };
const DIESEL = { 0: ['nmhc', 'محفّز NMHC', 'NMHC catalyst'], 1: ['nox', 'NOx / AdBlue', 'NOx / SCR'], 3: ['boost', 'ضغط التيربو', 'Boost'],
  5: ['egs', 'حساسات العادم', 'Exhaust sensor'], 6: ['pm', 'فلتر DPF', 'DPF'], 7: ['egr', 'EGR / VVT', 'EGR / VVT'] };
export function readiness(d) {
  if (!d || d.length < 4) return null;
  const [a, b, c, e] = d, diesel = !!(b & 8), mons = [];
  CONT.forEach(([key, ar, en], i) => { if (b & (1 << i)) mons.push({ key, ar, en, complete: !(b & (1 << (i + 4))), continuous: true }); });
  for (const [bit, [key, ar, en]] of Object.entries(diesel ? DIESEL : SPARK)) if (c & (1 << bit)) mons.push({ key, ar, en, complete: !(e & (1 << bit)), continuous: false });
  return { mil: !!(a & 0x80), dtcCount: a & 0x7f, diesel, monitors: mons };
}

export function parseMode06(m) {
  if (!m || m[0] !== 0x46) return [];
  const out = [], b = m.slice(1);
  const raw = (h, l, s) => { const v = h * 256 + l; return s && v & 0x8000 ? v - 0x10000 : v; };
  for (let i = 0; i + 8 < b.length; i += 9) {
    const [mid, tid, uas] = b.slice(i, i + 3), s = uas >= 0x80;
    const v = raw(b[i + 3], b[i + 4], s), lo = raw(b[i + 5], b[i + 6], s), hi = raw(b[i + 7], b[i + 8], s);
    out.push({ mid, tid, uas, raw: v, min: lo, max: hi, pass: lo <= v && v <= hi });
  }
  return out;
}

// ---- UDS (read only) ----
const READ = { 0x10: [1, 3], 0x19: [1, 2, 4, 6, 10], 0x22: null, 0x3e: [0, 0x80] };
export function udsGuard(p) {
  const sid = p[0], allowed = READ[sid];
  if (allowed === undefined) throw new Error(`UDS service 0x${sid.toString(16)} is blocked (read-only program)`);
  if (allowed && !allowed.includes(p[1])) throw new Error('UDS sub-function not allowed');
}
export const NRC = { 0x11: 'service not supported', 0x12: 'sub-function not supported', 0x13: 'bad length', 0x22: 'conditions not correct',
  0x31: 'out of range', 0x33: 'security access denied', 0x78: 'response pending', 0x7f: 'not in this session' };
export function udsCheck(r, sid) {
  if (!r || !r.length) throw new Error('no response');
  if (r[0] === 0x7f && r[1] === sid) { const e = new Error(NRC[r[2]] || 'NRC ' + r[2]); e.nrc = r[2]; throw e; }
  if (r[0] !== sid + 0x40) throw new Error('unexpected response');
  return r;
}
export const isPending = r => r && r.length >= 3 && r[0] === 0x7f && r[2] === 0x78;
export function parseDtcCount(r) { udsCheck(r, 0x19); return { format: r[3], count: r[4] * 256 + r[5] }; }
export function parseDtcList(r, fmt = 0) {
  udsCheck(r, 0x19);
  const out = [];
  for (let i = 3; i + 3 < r.length; i += 4) {
    const raw = r.slice(i, i + 3), st = r[i + 3];
    if (!raw[0] && !raw[1] && !raw[2]) continue;
    const hex = raw.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    out.push({ code: fmt === 0 ? decodeDtc(raw[0], raw[1]) : `VAG ${parseInt(hex, 16)} (0x${hex})`, status: st,
      active: !!(st & 1), pending: !!(st & 4), confirmed: !!(st & 8) });
  }
  return out;
}
export const ascii = d => d.filter(b => b >= 0x20 && b < 0x7f).map(b => String.fromCharCode(b)).join('').trim();
