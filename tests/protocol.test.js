const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../src/engine/quantum.js');
const R = require('../src/engine/random.js');
const P = require('../src/engine/postprocess.js');
const B = require('../src/engine/protocol.js');
const I18N = require('../src/ui/i18n.js');

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} !~ ${b} (±${eps})`);
const config = (over = {}) => ({ ...B.DEFAULTS, ...over });
const run = (over = {}) => {
  const cfg = config(over);
  return B.runProtocol(B.createPlan(cfg), cfg);
};

test('a Hadamard önmaga inverze és az állapotok normáltak', () => {
  const psi = Q.apply(Q.Gates.H, Q.apply(Q.Gates.H, Q.KET0));
  near(Q.abs2(psi[0]), 1, 1e-12);
  near(Q.abs2(psi[1]), 0, 1e-12);
  for (const bit of [0, 1]) {
    for (const basis of ['Z', 'X']) {
      const s = Q.prepare(bit, basis);
      near(Q.abs2(s[0]) + Q.abs2(s[1]), 1, 1e-12);
    }
  }
});

test('a négy BB84-állapot a várt Bloch-irányba és polarizációba kerül', () => {
  assert.equal(Q.ketLabel(Q.prepare(0, 'Z')), '|0⟩');
  assert.equal(Q.ketLabel(Q.prepare(1, 'Z')), '|1⟩');
  assert.equal(Q.ketLabel(Q.prepare(0, 'X')), '|+⟩');
  assert.equal(Q.ketLabel(Q.prepare(1, 'X')), '|−⟩');
  near(Q.polarization(Q.prepare(0, 'X')), 45, 1e-9);
  near(Q.polarization(Q.prepare(1, 'X')), -45, 1e-9);
});

test('a Born-szabály valószínűségei: azonos bázis biztos, eltérő 50%', () => {
  near(Q.probZero(Q.prepare(0, 'Z'), 'Z'), 1, 1e-12);
  near(Q.probZero(Q.prepare(1, 'X'), 'X'), 0, 1e-12);
  near(Q.probZero(Q.prepare(0, 'Z'), 'X'), 0.5, 1e-12);
  near(Q.probZero(Q.prepare(1, 'X'), 'Z'), 0.5, 1e-12);
});

test('a mérés az adott bázisvektorba omlaszt, az ismételt mérés determinisztikus', () => {
  const rng = R.mulberry32(5);
  for (let i = 0; i < 200; i++) {
    const m = Q.measure(Q.prepare(1, 'X'), 'Z', rng);
    assert.equal(Q.measure(m.state, 'Z', rng).outcome, m.outcome);
  }
});

test('zavartalan csatornán az azonos bázisú bitek mind egyeznek', () => {
  const r = run({ n: 4000 });
  assert.equal(r.trueQber, 0);
  near(r.sifted.length / 4000, 0.5, 0.03, 'átszűrt arány');
  assert.equal(r.abort, null);
  assert.deepEqual(r.pa.alice, r.pa.bob);
});

test('eltérő bázisnál Bob eredménye véletlen', () => {
  const r = run({ n: 8000 });
  const other = r.qubits.filter((q) => !q.match);
  near(other.filter((q) => q.aBit === q.bobBit).length / other.length, 0.5, 0.03);
});

test('a teljes elfogás-továbbküldés 25% QBER-t okoz', () => {
  const r = run({ n: 40000, eveEnabled: true, eveRate: 1 });
  near(r.trueQber, 0.25, 0.012);
  assert.equal(r.abort, 'qber');
  assert.equal(r.ec, null);
});

test('részleges lehallgatásnál a QBER az elfogási aránnyal arányos', () => {
  const r = run({ n: 40000, eveEnabled: true, eveRate: 0.5 });
  near(r.trueQber, 0.125, 0.01);
});

test('Éva a jó bázisban mérve nem okoz hibát', () => {
  const cfg = config({ n: 2000, eveEnabled: true });
  const plan = B.createPlan(cfg);
  const r = B.runProtocol({ ...plan, eveBases: plan.aliceBases }, cfg);
  assert.equal(r.trueQber, 0);
});

test('azonos mag azonos futást ad', () => {
  const a = run({ eveEnabled: true });
  const b = run({ eveEnabled: true });
  assert.deepEqual(a.qubits.map((q) => q.bobBit), b.qubits.map((q) => q.bobBit));
  assert.deepEqual(a.sample, b.sample);
});

test('a kézi terv szerint fut: |1⟩ azonos bázisban biztosan 1', () => {
  const cfg = config({ n: 3 });
  const plan = { aliceBits: [1, 0, 1], aliceBases: ['Z', 'X', 'Z'], bobBases: ['Z', 'X', 'X'], eveBases: ['-', '-', '-'] };
  const r = B.runProtocol(plan, cfg);
  assert.equal(r.qubits[0].bobBit, 1);
  assert.equal(r.qubits[1].bobBit, 0);
  assert.deepEqual(r.sifted, [0, 1]);
});

test('a hibajavítás megszünteti az eltéréseket és számolja a szivárgást', () => {
  const rng = R.mulberry32(42);
  const alice = Array.from({ length: 2000 }, () => (rng() < 0.5 ? 0 : 1));
  const bob = alice.map((bit) => (rng() < 0.03 ? bit ^ 1 : bit));
  const out = P.reconcile(alice, bob, 0.03, { ecPasses: 4, verifyBits: 16 }, rng);
  assert.ok(out.leak > 0);
  const fixed = out.passes.flatMap((p) => p.fixed).length;
  assert.ok(fixed > 0);
  const left = alice.filter((bit, i) => bit !== out.bob[i]).length;
  assert.ok(left <= 2, `maradék hiba: ${left}`);
});

test('a korábbi körök blokkjai is rendbe jönnek a javítás után', () => {
  const rng = R.mulberry32(7);
  for (let t = 0; t < 200; t++) {
    const alice = Array.from({ length: 300 }, () => (rng() < 0.5 ? 0 : 1));
    const bob = alice.map((bit) => (rng() < 0.03 ? bit ^ 1 : bit));
    const out = P.reconcile(alice, bob, 0.03, { ecPasses: 3, verifyBits: 0 }, rng);
    const flips = out.passes.flatMap((p) => p.fixed);
    assert.equal(new Set(flips).size, flips.length);
    flips.forEach((i) => assert.notEqual(bob[i], alice[i]));
  }
});

test('a titkosságerősítés a kivonásnak megfelelő hosszú közös kulcsot ad', () => {
  let finished = 0;
  let mismatched = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const r = run({ seed, n: 128, eveEnabled: true, eveRate: 0.08 });
    if (!r.pa?.alice) continue;
    finished++;
    assert.equal(r.pa.alice.length, r.pa.length);
    assert.equal(r.pa.length, Math.floor(r.pa.entropy - r.pa.leak - r.pa.safety));
    if (!r.pa.keysMatch) mismatched++;
  }
  assert.ok(finished > 200, `sikeres futás: ${finished}`);
  assert.ok(mismatched / finished < 0.02, `eltérő kulcs: ${mismatched}/${finished}`);
});

test('a Toeplitz-hash lineáris GF(2) felett', () => {
  const rng = R.mulberry32(9);
  const bits = (len) => Array.from({ length: len }, () => (rng() < 0.5 ? 0 : 1));
  const a = bits(32);
  const b = bits(32);
  const seed = bits(32 + 12 - 1);
  const sum = P.toeplitzHash(a.map((x, i) => x ^ b[i]), 12, seed);
  const parts = P.toeplitzHash(a, 12, seed).map((x, i) => x ^ P.toeplitzHash(b, 12, seed)[i]);
  assert.deepEqual(sum, parts);
});

test('Éva egy cellája csak a saját qubitjét változtatja', () => {
  const cfg = config({ eveEnabled: true });
  const plan = { ...B.createPlan(cfg), eveBases: Array(cfg.n).fill('-') };
  const before = B.runProtocol(plan, cfg);
  const eveBases = plan.eveBases.slice();
  eveBases[5] = 'Z';
  const after = B.runProtocol({ ...plan, eveBases }, cfg);
  before.qubits.forEach((q, i) => {
    if (i !== 5) assert.equal(after.qubits[i].bobBit, q.bobBit);
  });
  assert.deepEqual(after.sample, before.sample);
  eveBases[5] = plan.aliceBases[5];
  const same = B.runProtocol({ ...plan, eveBases }, cfg);
  assert.deepEqual(same.pa?.alice, before.pa?.alice);
});

test('titkos bit nélkül nincs titkosságerősítési lépés', () => {
  let seen = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const r = run({ seed, eveEnabled: true, eveRate: 0.1 });
    if (r.abort !== 'no-secret') continue;
    seen++;
    assert.ok(!B.buildTimeline(r).some((s) => s.phase === 'pa'));
  }
  assert.ok(seen > 0);
});

test('az idővonal követi a kimenetet: megszakításnál nincs hibajavítás', () => {
  const clean = run();
  const cleanPhases = B.buildTimeline(clean).map((s) => s.phase);
  assert.ok(cleanPhases.includes('ec') && cleanPhases.includes('pa'));
  assert.equal(cleanPhases.filter((p) => p === 'transmit').length, 64);

  const attacked = run({ eveEnabled: true });
  assert.equal(attacked.abort, 'qber');
  const phases = B.buildTimeline(attacked).map((s) => s.phase);
  assert.ok(!phases.includes('ec') && !phases.includes('pa'));
  assert.equal(phases.at(-1), 'done');
});

test('átszűrt bit nélkül is lezárul a futás', () => {
  const cfg = config({ n: 2 });
  const plan = { aliceBits: [0, 1], aliceBases: ['Z', 'Z'], bobBases: ['X', 'X'], eveBases: ['-', '-'] };
  const r = B.runProtocol(plan, cfg);
  assert.equal(r.abort, 'no-sifted');
  assert.equal(r.qber, null);
  assert.equal(B.buildTimeline(r).at(-1).phase, 'done');
});

test('a magyar és az angol szövegek kulcsai azonosak', () => {
  const keys = (obj) => Object.entries(obj).flatMap(([key, value]) => (
    value && typeof value === 'object' ? keys(value).map((k) => `${key}.${k}`) : [key])).sort();
  assert.deepEqual(keys(I18N.en), keys(I18N.hu));
  B.PHASES.forEach((p) => assert.ok(I18N.hu.phases[p.id] && I18N.en.phases[p.id]));
});
