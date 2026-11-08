// Determinisztikus véletlen: ugyanaz a mag mindig ugyanazt a futást adja, ezért a
// visszalépés és az újrajátszás is pontosan ugyanazt mutatja.
const Random = (() => {
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const randBit = (rng) => (rng() < 0.5 ? 0 : 1);
  const randBasis = (rng) => (rng() < 0.5 ? 'Z' : 'X');

  function shuffled(items, rng) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  return { mulberry32, randBit, randBasis, shuffled };
})();

if (typeof module !== 'undefined') module.exports = Random;
