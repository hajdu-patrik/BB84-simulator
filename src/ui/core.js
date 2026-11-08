// A felület közös alapjai: az állapot, a nyelv, a formázás és az animációs
// segédfüggvények. A többi ui/ modul ezekre épül. Minden állapot az `app`
// objektumban él; a motor előre kiszámolt jegyzőkönyvéből az aktuális lépésig
// tartó részt jeleníti meg a felület.
const UI = (() => {
  const { phaseIndex } = BB84;
  const $ = (id) => document.getElementById(id);

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* csak kényelmi funkció */ } },
  };

  let lang = store.get('bb84-lang') === 'en' ? 'en' : 'hu';
  const t = () => I18N[lang];
  const getLang = () => lang;
  function setLang(next) {
    lang = next;
    store.set('bb84-lang', lang);
  }

  const pct = (x, digits = 1) => `${(x * 100).toFixed(digits).replace('.', t().decimal)}%`;
  const label = (basis) => Quantum.BASES[basis].label;
  const glyph = (psi) => `<svg class="pol" style="transform:rotate(${-Quantum.polarization(psi)}deg)"><use href="#i-pol"/></svg>`;

  const narrowScreen = window.matchMedia('(max-width: 640px)');
  const motionOn = () => $('in-motion').checked;

  const app = {
    cfg: { ...BB84.DEFAULTS },
    plan: null,
    res: null,
    steps: [],
    cursor: 0,
    shown: 0,
    flying: false,
    fadeEve: false,
    animToken: 0,
  };

  const step = () => app.steps[app.cursor];
  const phaseNow = () => phaseIndex(step().phase);
  const reached = (id) => phaseNow() >= phaseIndex(id);
  const sampleShown = () => reached('ec') || step().phase === 'sample';
  const isLast = () => app.cursor === app.steps.length - 1;

  /* ---------- Animáció ---------- */

  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  const animate = (el, frames, options) => (motionOn()
    ? el.animate(frames, { easing: 'cubic-bezier(.22, 1, .36, 1)', ...options }) : null);
  const riseIn = (el, duration = 300) => animate(el, [
    { opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration });
  const fadeIn = (el, duration = 280) => animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration });
  const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  // Egy érték lágy átmenete; ha közben új lépés indul (más token), megáll.
  function tween(from, to, ms, token, onFrame) {
    return new Promise((resolve) => {
      const start = performance.now();
      const frame = () => {
        if (token !== app.animToken) { resolve(false); return; }
        const x = Math.min(1, (performance.now() - start) / ms);
        onFrame(from + (to - from) * easeInOut(x));
        if (x < 1) requestAnimationFrame(frame);
        else resolve(true);
      };
      requestAnimationFrame(frame);
    });
  }

  return {
    $, store, t, getLang, setLang, pct, label, glyph, narrowScreen, motionOn, app,
    step, phaseNow, reached, sampleShown, isLast, animate, riseIn, fadeIn, sleep, tween,
  };
})();
