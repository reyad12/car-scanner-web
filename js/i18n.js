// Arabic <-> English.  The page is written in Arabic; in English mode every Arabic
// phrase below is replaced (also in content added later, through a MutationObserver).
export const lang = (() => { try { return localStorage.getItem('lang') || 'ar'; } catch { return 'ar'; } })();
export const fl = lang === 'en' ? 'en' : 'ar';           // field suffix for findings / codes

export const EN = {
  'فاحص السيارة': 'Car Scanner', 'غير متصل': 'Not connected', 'الاتصال بالقطعة': 'Connect to the adapter',
  'ركّب القطعة (KUULAA / vLinker / أي ELM327 بلوتوث BLE) بمنفذ OBD، وشغّل الإشعال ON أو المحرك، وبعدين:': 'Plug the adapter (KUULAA / vLinker / any Bluetooth LE ELM327) into the OBD port, switch the ignition ON or start the engine, then:',
  '🔵 اتصل بالقطعة (بلوتوث)': '🔵 Connect to the adapter (Bluetooth)', 'أو جرّب بدون سيارة:': 'Or try without a car:',
  'كودياك 2023 (قراءات حقيقية)': 'Kodiaq 2023 (real readings)', 'سيارة تجربة (أعطال شائعة)': 'Demo car (common faults)',
  'تجربة': 'Try', 'افصل': 'Disconnect', 'الداشبورد الحي': 'Live dashboard', 'عدادات': 'Gauges', '12 قراءة': '12 readings',
  'لمبات': 'Lights', '▶ تشغيل': '▶ Start', '⏸ إيقاف': '⏸ Pause', '↔ قلب للزجاج': '↔ Mirror for windscreen', '✕ خروج': '✕ Exit',
  '⚠ مش متصل بالسيارة — اكبس «اتصل بالقطعة» فوق (أو «تجربة»)': '⚠ Not connected to the car - press "Connect to the adapter" above (or "Try")',
  'الفحص الشامل': 'Full inspection', 'ابدأ الفحص الشامل': 'Start full inspection',
  'بيقرا الأعطال، الفحوصات الذاتية، اختبارات Mode 06، صحة المحرك، الشحن، ووحدات السيارة. خلّي المحرك شغّال إذا بتقدر. قراءة فقط.': 'Reads faults, readiness monitors, Mode 06 tests, engine health, charging and the car modules. Keep the engine running if you can. Read only.',
  'وين المشكلة بالسيارة': 'Where the problem is', 'هاتشباك': 'Hatchback', 'سيدان': 'Sedan', 'ستيشن': 'Estate', 'عائلية': 'MPV', 'كهربائية': 'Electric',
  'اكبس على المشكلة لتشوفها عن قريب.': 'Tap a problem to zoom in.', '⤢ كل السيارة': '⤢ Whole car',
  'اعمل الفحص الشامل أول، وبتطلع المشاكل هون.': 'Run the full inspection first; problems will show here.',
  'الأكواد': 'Codes', 'اقرأ الأكواد': 'Read codes', 'مسح الأكواد…': 'Clear codes…',
  'قراءة فقط — ما بيغيّر ولا بيرمّز شي بالسيارة. التكاليف تقديرية.': 'Read only - it never changes or codes anything in the car. Costs are estimates.',
  'مصادر الصور والبيانات': 'Photo and data sources', 'داشبورد': 'Dashboard', 'الفحص': 'Inspection', 'الرسمة': 'Car map',
  'عم يتصل بالسيارة… (لحد 20 ثانية)': 'Connecting to the car… (up to 20 s)', 'متصل ✔': 'Connected ✔', 'بروتوكول': 'protocol', '(محاكاة)': '(simulator)',
  'القطعة متصلة ✔ بس السيارة ما بترد — السيارة مطفية. شغّل الإشعال (ON) أو المحرك وجرّب كمان مرة.': 'The adapter is connected ✔ but the car does not answer - the car is switched off. Turn the ignition ON or start the engine and try again.',
  'ما زبط الاتصال: ': 'Connection failed: ', 'هالمتصفح ما بيدعم البلوتوث. افتح الصفحة بـ Chrome على أندرويد (مش من داخل تطبيق تاني).': 'This browser has no Bluetooth. Open the page in Chrome on Android (not inside another app).',
  'ما قدرت أفتح القطعة: ': 'Could not open the adapter: ', ' — تأكد إنها مشبوكة وما في تطبيق تاني فاتحها.': ' - check it is plugged in and no other app has it open.',
  'اتصل بالسيارة أول (فوق).': 'Connect to the car first (above).',
  'فحص المحرك': 'Check engine', 'حرارة المحرك': 'Engine temperature', 'الشحن': 'Charging', 'البنزين قليل': 'Low fuel', 'الوسائد': 'Airbags',
  'مضوية — خطير': 'ON - severe', 'مضوية — انتبه': 'ON - caution', 'سليمة': 'OK', 'ما في قراءة': 'no reading',
  'دورات': 'RPM', 'السرعة': 'Speed', 'الحرارة': 'Coolant', 'فولت': 'Volt', 'الحمل': 'Load', 'البنزين': 'Fuel', 'ضغط السحب': 'MAP',
  'التوقيت': 'Timing', 'هواء السحب': 'Intake air', 'الخانق': 'Throttle', 'تصحيح قصير': 'Short trim', 'تصحيح طويل': 'Long trim',
  'من 100': 'of 100', 'ممتازة': 'Excellent', 'جيدة': 'Good', 'مقبولة — بدها تصليح': 'Fair - needs repairs', 'سيئة': 'Poor',
  'التكلفة التقديرية:': 'Estimated cost:', '🚙 شوفها على السيارة': '🚙 See it on the car', 'النتائج': 'Findings',
  'خطير': 'severe', 'انتبه': 'caution', 'سليم': 'ok', 'معلومة': 'info', 'الأسباب:': 'Causes:', 'ما في ملاحظات على هالقطعة.': 'No findings for this part.',
  'عم يقرا…': 'Reading…', 'مخزّن': 'stored', 'معلّق': 'pending', 'دائم': 'permanent', 'ما في أكواد أعطال ✔': 'No fault codes ✔',
  'قراءة الأكواد': 'Reading codes', 'انبعت أمر المسح. اقرأ الأكواد كمان مرة للتأكد.': 'Clear command sent. Read the codes again to check.', 'السيارة ما قبلت المسح.': 'The car did not accept the clear.', 'الفحوصات الذاتية': 'Readiness monitors', 'نتائج الاختبارات الداخلية (Mode 06)': 'Mode 06 tests',
  'صحة المحرك من البيانات الحيّة': 'Engine health from live data', 'فحص وحدات السيارة': 'Module scan', 'انتهى': 'Done', 'وحدة': 'Module',
};
const KEYS = Object.keys(EN).sort((a, b) => b.length - a.length);
const AR = /[؀-ۿ]/;

export function tr(text) {
  if (lang !== 'en' || !text || !AR.test(text)) return text;
  for (const k of KEYS) if (text.includes(k)) text = text.split(k).join(EN[k]);
  return text;
}

function walk(node) {
  if (node.nodeType === 3) { const t = tr(node.nodeValue); if (t !== node.nodeValue) node.nodeValue = t; return; }
  if (node.nodeType !== 1 || node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
  for (const a of ['placeholder', 'title']) if (node.hasAttribute && node.hasAttribute(a)) node.setAttribute(a, tr(node.getAttribute(a)));
  node.childNodes.forEach(walk);
}

export function setupLanguage(button) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
  button.textContent = lang === 'en' ? 'العربية' : 'English';
  button.onclick = () => { try { localStorage.setItem('lang', lang === 'en' ? 'ar' : 'en'); } catch { /* private mode */ } location.reload(); };
  if (lang !== 'en') return;
  const T = { 'title': document.title }; document.title = tr(T.title);
  walk(document.body);
  new MutationObserver(ms => ms.forEach(m => { m.addedNodes.forEach(walk); if (m.type === 'characterData') walk(m.target); }))
    .observe(document.body, { childList: true, subtree: true, characterData: true });
}
