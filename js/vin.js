// Recognise the car from its VIN (offline).  Make from the WMI (positions 1-3), model year from
// position 10, and for Skoda / VW / Audi the model from positions 7-8 (community-documented
// VAG model codes - best effort, the user can still change the body style).
const WMI = {
  WVW: 'Volkswagen', WVG: 'Volkswagen', WV1: 'Volkswagen', WV2: 'Volkswagen', TMB: 'Skoda', VSS: 'Seat', WAU: 'Audi', WUA: 'Audi',
  VF3: 'Peugeot', VF7: 'Citroen', VF1: 'Renault', KMH: 'Hyundai', KNA: 'Kia', KND: 'Kia', KNM: 'Kia', JMZ: 'Mazda', JTD: 'Toyota',
  JTM: 'Toyota', SB1: 'Toyota', JHM: 'Honda', SHH: 'Honda', JS3: 'Suzuki', TSM: 'Suzuki', JN1: 'Nissan', SJN: 'Nissan',
  JMB: 'Mitsubishi', WBA: 'BMW', WBY: 'BMW', WDD: 'Mercedes-Benz', WDC: 'Mercedes-Benz', W1K: 'Mercedes-Benz', YV1: 'Volvo',
  SAL: 'Land Rover', '5YJ': 'Tesla', LRW: 'Tesla', WF0: 'Ford', W0L: 'Opel', VXK: 'Opel', UU1: 'Dacia', ZFA: 'Fiat',
  LGX: 'BYD', LSJ: 'MG', JF1: 'Subaru', JTH: 'Lexus', WMW: 'Mini', NMT: 'Toyota',
};
const AR = { Volkswagen: 'فولكس فاجن', Skoda: 'سكودا', Audi: 'أودي', Seat: 'سيات', Toyota: 'تويوتا', Hyundai: 'هيونداي', Kia: 'كيا',
  Mazda: 'مازدا', Honda: 'هوندا', Nissan: 'نيسان', BMW: 'بي إم دبليو', 'Mercedes-Benz': 'مرسيدس', Ford: 'فورد', Tesla: 'تسلا', MG: 'إم جي', BYD: 'بي واي دي' };
// make -> code -> [model, body]
const VAG = {
  Skoda: { NE: ['Octavia III', 'sedan'], '5E': ['Octavia III', 'sedan'], NX: ['Octavia IV', 'sedan'], NS: ['Kodiaq', 'suv'], NU: ['Karoq', 'suv'],
    '3V': ['Superb III', 'sedan'], NJ: ['Fabia III', 'hatchback'], PJ: ['Fabia IV', 'hatchback'], NW: ['Scala / Kamiq', 'hatchback'], NH: ['Rapid', 'sedan'] },
  Volkswagen: { AU: ['Golf 7', 'hatchback'], '5G': ['Golf 7', 'hatchback'], CD: ['Golf 8', 'hatchback'], AW: ['Polo', 'hatchback'], A1: ['T-Roc', 'suv'],
    C1: ['T-Cross', 'suv'], AD: ['Tiguan', 'suv'], AX: ['Tiguan', 'suv'], '3G': ['Passat B8', 'sedan'], '3H': ['Arteon', 'sedan'],
    '1T': ['Touran', 'mpv'], '5T': ['Touran', 'mpv'], E1: ['ID.3', 'ev'], E2: ['ID.4', 'ev'], CR: ['Touareg', 'suv'] },
  Audi: { '8V': ['A3', 'hatchback'], GY: ['A3', 'hatchback'], F4: ['A4', 'sedan'], '8W': ['A4', 'sedan'], GB: ['A1', 'hatchback'], GA: ['Q2', 'suv'],
    F3: ['Q3', 'suv'], FY: ['Q5', 'suv'], '4M': ['Q7', 'suv'], '4K': ['A6', 'sedan'], F5: ['A5', 'sedan'], GE: ['e-tron', 'ev'], FZ: ['Q4 e-tron', 'ev'] },
};
const YEARS = 'ABCDEFGHJKLMNPRSTVWXY123456789';   // 2010.. (30-year cycle)

export function decodeVin(vin) {
  if (!vin || vin.length !== 17) return null;
  const make = WMI[vin.slice(0, 3)] || null;
  let year = null;
  const i = YEARS.indexOf(vin[9]);
  if (i >= 0) {
    year = 2010 + i;
    if (year > new Date().getFullYear() + 1) year -= 30;
    if (/\d/.test(vin[6]) && !(make && VAG[make])) year -= 30;   // North-American rule for older cars
  }
  const m = make && VAG[make] ? VAG[make][vin.slice(6, 8)] : null;
  return { vin, make, make_ar: AR[make] || make, year, model: m ? m[0] : null, body: m ? m[1] : null, modelFromVin: !!m };
}
