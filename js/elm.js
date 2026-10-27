// ELM327 session over any transport ({write(text), readUntilPrompt(ms)}), plus UDS to one module.
import { ElmError, parseResponse, isPending, udsGuard } from './obd.js';

export class Elm {
  constructor(t) { this.t = t; this.version = ''; this.protocol = ''; this.uds = null; this.fcOk = null; this.queue = Promise.resolve(); }

  // one command at a time (BLE has a single serial channel)
  raw(cmd, ms = 4000) {
    const run = async () => { await this.t.write(cmd); return this.t.readUntilPrompt(ms); };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
  async at(cmd, ms) {
    const r = (await this.raw(cmd, ms)).replace(/>/g, '');
    return r.split(/[\r\n]+/).map(l => l.trim()).filter(l => l && l.toUpperCase() !== cmd.toUpperCase()).join('\n');
  }
  async query(cmd, ms = 4000) {
    if (this.uds) await this.obdHeaders();
    return parseResponse(await this.raw(cmd, ms), cmd);
  }
  async init() {
    const r = await this.at('ATZ', 4000);
    if (!/ELM|OBD/i.test(r)) throw new ElmError('adapter did not identify itself: ' + JSON.stringify(r));
    this.version = r.split('\n').find(l => /ELM|OBD/i.test(l)) || r;
    for (const c of ['ATE0', 'ATL0', 'ATS1', 'ATH0', 'ATAT1', 'ATSP0']) await this.at(c);
    const m = await this.query('0100', 15000);
    if (!m.length) throw new ElmError('NO DATA - is the ignition on?');
    this.protocol = await this.at('ATDPN');
  }
  async voltage() {
    const m = (await this.at('ATRV')).match(/(\d+(?:\.\d+)?)\s*V/);
    return m ? parseFloat(m[1]) : null;
  }
  async obdHeaders() {
    await this.at('ATSH7DF'); await this.at('ATAR');
    if (this.fcOk !== false) await this.at('ATFCSM0');
    this.uds = null;
  }
  async udsHeaders(tx, rx) {
    await this.at('ATSH' + tx.toString(16).toUpperCase().padStart(3, '0'));
    await this.at('ATCRA' + rx.toString(16).toUpperCase().padStart(3, '0'));
    const fc = await this.at('ATFCSH' + tx.toString(16).toUpperCase().padStart(3, '0'));
    this.fcOk = !fc.includes('?');
    if (this.fcOk) { await this.at('ATFCSD300000'); if ((await this.at('ATFCSM1')).includes('?')) this.fcOk = false; }
    this.uds = [tx, rx];
  }
  /** Physical UDS request to one module (11-bit); null if it does not answer. */
  async udsRequest(tx, rx, payload, ms = 2500) {
    udsGuard(payload);
    if (!this.uds || this.uds[0] !== tx) await this.udsHeaders(tx, rx);
    const cmd = payload.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    for (let i = 0; i < 3; i++) {
      let msgs;
      try { msgs = parseResponse(await this.raw(cmd, ms), cmd); } catch (e) {
        if (/CAN ERROR|NO RESPONSE|incomplete/.test(e.message)) return null;
        throw e;
      }
      const real = msgs.filter(m => !isPending(m));
      if (real.length) return real[real.length - 1];
      if (!msgs.length) return null;
    }
    return null;
  }
  close() { return this.t.close && this.t.close(); }
}
