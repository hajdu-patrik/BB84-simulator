// Egyetlen qubit állapotvektoros szimulációja. A komplex számok [re, im] párok,
// egy állapot pedig [alfa, béta] amplitúdópár a számítási bázisban.
const Quantum = (() => {
  const S = Math.SQRT1_2;
  const c = (re, im = 0) => [re, im];

  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const conj = (a) => [a[0], -a[1]];
  const abs2 = (a) => a[0] * a[0] + a[1] * a[1];

  const Gates = {
    X: [[c(0), c(1)], [c(1), c(0)]],
    H: [[c(S), c(S)], [c(S), c(-S)]],
  };

  const Ry = (theta) => {
    const co = Math.cos(theta / 2);
    const si = Math.sin(theta / 2);
    return [[c(co), c(-si)], [c(si), c(co)]];
  };

  const apply = (U, [a, b]) => [
    add(mul(U[0][0], a), mul(U[0][1], b)),
    add(mul(U[1][0], a), mul(U[1][1], b)),
  ];

  const KET0 = [c(1), c(0)];

  // A mérési bázisok a Bloch-gömb XZ-főkörén: a szög a 0 kimenethez tartozó
  // bázisvektor iránya a Z tengelytől mérve.
  const BASES = {
    Z: { theta: 0, label: '+' },
    X: { theta: Math.PI / 2, label: '×' },
  };

  // Alice kódolása: |0⟩-ból indul, X a bithez, H az átlós bázishoz.
  function prepare(bit, basis) {
    let psi = KET0;
    if (bit === 1) psi = apply(Gates.X, psi);
    if (basis === 'X') psi = apply(Gates.H, psi);
    return psi;
  }

  // A 0 kimenet valószínűsége a megadott bázisban.
  function probZero(psi, basis) {
    return abs2(apply(Ry(-BASES[basis].theta), psi)[0]);
  }

  // Projektív mérés: a Born-szabály szerint sorsol, és az állapot az adott
  // bázisvektorba omlik össze.
  function measure(psi, basis, rng) {
    const p0 = probZero(psi, basis);
    const outcome = rng() < p0 ? 0 : 1;
    const post = apply(Ry(BASES[basis].theta), outcome === 0 ? KET0 : apply(Gates.X, KET0));
    return { outcome, p0, state: post };
  }

  // Bloch-vektor a gömbön; a BB84 állapotai mind az XZ-főkörön maradnak.
  function bloch([a, b]) {
    const cross = mul(conj(a), b);
    return { x: 2 * cross[0], y: 2 * cross[1], z: abs2(a) - abs2(b) };
  }

  const blochAngle = (psi) => {
    const v = bloch(psi);
    return Math.atan2(v.x, v.z);
  };

  // Fizikai polarizációs szög fokban: |0⟩ vízszintes, |1⟩ függőleges, |+⟩ 45°.
  const polarization = (psi) => (blochAngle(psi) * 90) / Math.PI;

  function ketLabel(psi) {
    const angle = Math.round((blochAngle(psi) * 180) / Math.PI);
    const known = { 0: '|0⟩', 180: '|1⟩', '-180': '|1⟩', 90: '|+⟩', '-90': '|−⟩' };
    return known[angle] ?? `${angle}°`;
  }

  return {
    c, add, mul, conj, abs2, Gates, Ry, apply, KET0, BASES,
    prepare, probZero, measure, bloch, blochAngle, polarization, ketLabel,
  };
})();

if (typeof module !== 'undefined') module.exports = Quantum;
