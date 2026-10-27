// Software ELM327 + a virtual car, so the app can be tried without a car.
// "kodiaq" replays the real readings of a 2023 Skoda Kodiaq 1.5 TSI (VIN removed);
// "demo" is a car with typical faults.
import { encodeDtc } from './obd.js';

const hx = a => a.map(b => (b & 255).toString(16).padStart(2, '0').toUpperCase()).join(' ');
const u16 = v => { v = Math.max(0, Math.min(65535, Math.round(v))); return [v >> 8, v & 255]; };
const s16 = v => [(v & 0xffff) >> 8, v & 255];

export const PROFILES = {
  kodiaq: {
    ar: 'كودياك 2023 ‏1.5 TSI (قراءات حقيقية)', en: 'Kodiaq 2023 1.5 TSI (real readings)',
    vin: 'TMBJB9NS0P0000000', stored: ['P2B60'], pending: ['P2B60'], permanent: [], mil: true, coolant: 97, iat: 38,
    idle: 927, trims: [-1.3, -0.8], timing: 0.6, volt: 14.2, odo: 93955, fuel: 29,
    pids: [0x01, 0x03, 0x04, 0x05, 0x06, 0x07, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x11, 0x13, 0x15, 0x1C, 0x1F, 0x2F, 0x3C, 0x42, 0xA6],
    readiness: [0x81, 0x07, 0xe1, 0x00],
    mode06: [[1, 139, 133, -80, -2625, 32767], [1, 138, 133, -80, -32768, 2623], [1, 133, 51, 4106, 0, 14336], [1, 129, 16, 0, 0, 400],
      [2, 5, 16, 80, 0, 600], [2, 150, 10, 1540, 0, 1640], [2, 149, 10, 6140, 6140, 10240], [33, 132, 47, 43069, 10000, 65535],
      [53, 129, 156, 391, -419, 1181], [53, 131, 156, -2048, -2255, 1297], [61, 139, 3, 199, 50, 65535], [65, 133, 22, 7593, 7201, 65535],
      [162, 11, 36, 4, 0, 65535], [163, 11, 36, 2, 0, 65535], [164, 11, 36, 13, 0, 65535], [165, 11, 36, 6, 0, 65535]],
    engine: { F187: '05E906018DJ', F189: '1903', F197: 'R4 1.5l TFS', count: 2 },
  },
  demo: {
    ar: 'سيارة تجربة (أعطال شائعة)', en: 'Demo car (common faults)',
    vin: 'WVWZZZ1JZ3W386752', stored: ['P0301', 'P0171', 'P0420'], pending: ['P0135'], permanent: ['P0420'], mil: true,
    coolant: 91, iat: 30, idle: 760, trims: [2, 9], timing: 8, volt: 13.8, odo: null, fuel: 55,
    pids: [0x01, 0x04, 0x05, 0x06, 0x07, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x1F, 0x2F, 0x33, 0x42, 0x5C],
    readiness: [0x83, 0x07, 0xe5, 0x00],
    mode06: [[162, 11, 36, 48, 0, 65535], [163, 11, 36, 1, 0, 65535], [164, 11, 36, 2, 0, 65535], [165, 11, 36, 0, 0, 65535]],
    engine: null,
  },
};

export class SimTransport {
  constructor(name = 'kodiaq') { this.p = structuredClone(PROFILES[name]); this.t0 = Date.now(); this.out = ''; this.header = 0x7df; this.mode = 'idle'; this.label = 'Simulator'; }
  now() { return (Date.now() - this.t0) / 1000; }
  setMode(m) { this.mode = m; this.mt = this.now(); }
  speed() {
    const e = this.now() - (this.mt || 0);
    if (this.mode === 'launch') return Math.min(150, 150 * (1 - Math.exp(-e / 8.8)));
    if (this.mode === 'drive') return 60 + 25 * Math.sin(this.now() / 5);
    return 0;
  }
  live(pid) {
    const p = this.p, t = this.now(), v = this.speed(), rpm = this.mode === 'launch' ? 900 + (v % 45) * 110 : p.idle + 8 * Math.sin(t * 3);
    const tab = {
      0x04: [Math.round((v ? 60 : 28) * 2.55)], 0x05: [p.coolant + 40], 0x06: [Math.round((p.trims[0] + 1.5 * Math.sin(t) + 100) * 1.28)],
      0x07: [Math.round((p.trims[1] + 100) * 1.28)], 0x0B: [v ? 90 : 34], 0x0C: u16(rpm * 4), 0x0D: [Math.round(v)],
      0x0E: [Math.round((p.timing + 64) * 2)], 0x0F: [p.iat + 40], 0x10: u16(320 + v * 8), 0x11: [Math.round((v ? 60 : 13) * 2.55)],
      0x1F: u16(600 + t), 0x2F: [Math.round(p.fuel * 2.55)], 0x33: [98], 0x3C: u16((330 + 40) * 10),
      0x42: u16(p.volt * 1000), 0x5C: [p.coolant + 45], 0x13: [0x33], 0x15: [0x80, 0x80], 0x1C: [6],
      0xA6: p.odo ? [0, ...[(p.odo * 10) >> 16 & 255, (p.odo * 10) >> 8 & 255, (p.odo * 10) & 255]] : null,
    };
    return tab[pid];
  }
  mask(base) {
    let m = 0;
    for (const pid of this.p.pids) if (pid > base && pid <= base + 32) m |= 2 ** (32 - (pid - base));
    if (this.p.pids.some(pid => pid > base + 32)) m += 1;
    return [m >>> 24 & 255, m >>> 16 & 255, m >>> 8 & 255, m & 255];
  }
  frames(d) {
    if (d.length <= 7) return hx(d);
    const lines = [d.length.toString(16).toUpperCase().padStart(3, '0'), '0: ' + hx(d.slice(0, 6))];
    for (let i = 6, n = 1; i < d.length; i += 7, n++) lines.push((n % 16).toString(16).toUpperCase() + ': ' + hx(d.slice(i, i + 7)));
    return lines.join('\r');
  }
  obd(r) {
    const p = this.p, mode = r[0];
    if (mode === 1) {
      const pid = r[1];
      if (pid % 32 === 0) return [0x41, pid, ...this.mask(pid)];
      if (pid === 1) return [0x41, 1, ...p.readiness];
      if (!p.pids.includes(pid)) return null;
      const v = this.live(pid);
      return v ? [0x41, pid, ...v] : null;
    }
    if (mode === 3 || mode === 7 || mode === 0x0a) {
      const c = p[{ 3: 'stored', 7: 'pending', 10: 'permanent' }[mode]];
      return [mode + 0x40, c.length, ...c.flatMap(encodeDtc)];
    }
    if (mode === 4) { p.stored = []; p.pending = []; p.mil = false; p.readiness[0] &= 0x7f; return [0x44]; }
    if (mode === 6) {
      const mids = [...new Set(p.mode06.map(t => t[0]))];
      if (r[1] % 32 === 0) {
        let m = 0; for (const x of mids) if (x > r[1] && x <= r[1] + 32) m |= 2 ** (32 - (x - r[1]));
        if (mids.some(x => x > r[1] + 32)) m += 1;
        return m ? [0x46, r[1], m >>> 24 & 255, m >>> 16 & 255, m >>> 8 & 255, m & 255] : null;
      }
      const rec = p.mode06.filter(t => t[0] === r[1]);
      return rec.length ? [0x46, ...rec.flatMap(([a, b, c, v, lo, hi]) => [a, b, c, ...s16(v), ...s16(lo), ...s16(hi)])] : null;
    }
    if (mode === 9 && r[1] === 2) return [0x49, 2, 1, ...[...p.vin].map(c => c.charCodeAt(0))];
    return null;
  }
  uds(r) {
    const e = this.p.engine;
    if (this.header !== 0x7e0 || !e) return null;   // like the real car: only the engine ECU answers
    if (r[0] === 0x3e) return [0x7e, 0];
    if (r[0] === 0x22) {
      const did = ((r[1] << 8) | r[2]).toString(16).toUpperCase();
      return e[did] ? [0x62, r[1], r[2], ...[...e[did]].map(c => c.charCodeAt(0))] : [0x7f, 0x22, 0x31];
    }
    if (r[0] === 0x19 && r[1] === 1) return [0x59, 1, 0xff, 1, 0, e.count];
    if (r[0] === 0x19 && r[1] === 2) return 'LOST';   // the KUULAA drops this long reply after 7F 19 78
    return [0x7f, r[0], 0x11];
  }
  handle(cmd) {
    if (cmd.startsWith('AT')) {
      if (cmd === 'ATZ') { this.header = 0x7df; return '\r\rELM327 v1.5'; }
      if (cmd === 'ATRV') return this.p.volt.toFixed(1) + 'V';
      if (cmd === 'ATDPN') return 'A6';
      if (cmd.startsWith('ATSH')) { this.header = parseInt(cmd.slice(4), 16); return 'OK'; }
      if (cmd.startsWith('ATFCSM')) return '?';
      return 'OK';
    }
    const r = cmd.match(/../g).map(x => parseInt(x, 16));
    let reply;
    if (this.header === 0x7df || (this.header === 0x7e0 && r[0] < 0x10)) reply = this.obd(r);
    else reply = this.uds(r);
    if (reply === 'LOST') return '7F 19 78\r0: 0B 59 02 0D 00 5C D5';
    if (!reply) return 'NO DATA';
    const txt = this.frames(reply);
    return cmd === '0100' ? 'SEARCHING...\r' + txt : txt;
  }
  async write(cmd) { this.out = this.handle(cmd.trim().toUpperCase().replace(/ /g, '')); }
  async readUntilPrompt() { const o = this.out; this.out = ''; return o + '\r\r>'; }
  close() {}
}
