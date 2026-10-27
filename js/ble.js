// Web Bluetooth transport for BLE ELM327 adapters (KUULAA "OBD BLE", vLinker, Vgate, ...).
// Works in Chrome on Android and desktop (HTTPS or localhost). No pairing needed.
const KNOWN = [
  ['0000fff0-0000-1000-8000-00805f9b34fb', '0000fff1-0000-1000-8000-00805f9b34fb', '0000fff2-0000-1000-8000-00805f9b34fb'],
  ['0000ffe0-0000-1000-8000-00805f9b34fb', '0000ffe1-0000-1000-8000-00805f9b34fb', '0000ffe1-0000-1000-8000-00805f9b34fb'],
  ['000018f0-0000-1000-8000-00805f9b34fb', '00002af0-0000-1000-8000-00805f9b34fb', '00002af1-0000-1000-8000-00805f9b34fb'],
  ['e7810a71-73ae-499d-8c15-faa9aef0c3f2', 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f'],
];

export const bleSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

export class BleTransport {
  static async open() {
    if (!bleSupported()) throw new Error('هالمتصفح ما بيدعم البلوتوث. استعمل Chrome على أندرويد أو الكمبيوتر.');
    const dev = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'OBD' }, { namePrefix: 'V-LINK' }, { namePrefix: 'vLinker' }, { namePrefix: 'IOS-Vlink' },
        { namePrefix: 'Android-Vlink' }, { namePrefix: 'VEEPEAK' }, { namePrefix: 'KONNWEI' },
        { services: [KNOWN[0][0]] }, { services: [KNOWN[1][0]] }],
      optionalServices: KNOWN.map(k => k[0]),
    });
    const t = new BleTransport();
    await t.connect(dev);
    return t;
  }
  async connect(dev) {
    this.dev = dev;
    this.buf = '';
    this.waiters = [];
    const gatt = await dev.gatt.connect();
    for (const [svc, n, wr] of KNOWN) {
      try {
        const s = await gatt.getPrimaryService(svc);
        this.notify = await s.getCharacteristic(n);
        this.writeCh = await s.getCharacteristic(wr);
        break;
      } catch { /* try the next layout */ }
    }
    if (!this.notify) throw new Error('القطعة ما فيها خدمة ELM327 المعروفة');
    this.notify.addEventListener('characteristicvaluechanged', e => {
      this.buf += new TextDecoder().decode(e.target.value);
      if (this.buf.includes('>')) this.waiters.splice(0).forEach(f => f());
    });
    await this.notify.startNotifications();
    this.label = `BLE ${dev.name || ''}`.trim();
  }
  async write(cmd) {
    this.buf = '';
    const data = new TextEncoder().encode(cmd + '\r');
    for (let i = 0; i < data.length; i += 20) {
      const part = data.slice(i, i + 20);
      if (this.writeCh.properties.writeWithoutResponse) await this.writeCh.writeValueWithoutResponse(part);
      else await this.writeCh.writeValue(part);
    }
  }
  readUntilPrompt(ms = 4000) {
    return new Promise(resolve => {
      const done = () => { clearTimeout(tm); const out = this.buf; this.buf = ''; resolve(out); };
      if (this.buf.includes('>')) return done();
      const tm = setTimeout(done, ms);
      this.waiters.push(done);
    });
  }
  close() { try { this.dev && this.dev.gatt.disconnect(); } catch { /* already gone */ } }
}
