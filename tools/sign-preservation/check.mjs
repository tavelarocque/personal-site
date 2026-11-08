import { readFileSync } from 'node:fs';
import { makeSolver } from '../../projects/sign-preservation/spr.js';
const csv = readFileSync(process.argv[2], 'utf8').trim().split('\n').slice(1).map((l) => l.split(',').map(Number));
const want = new Map(csv.map(([n, s, v]) => [`${n},${s}`, v]));
const NMAX = +(process.argv[3] || 8);
let ok = 0, bad = 0;
for (let n = 1; n <= NMAX; n++) {
  const S = makeSolver(); const t0 = performance.now();
  for (let s = 1; s <= 2 * n; s++) {
    const v = S.V(new Array(n).fill(0), s);
    if (v === want.get(`${n},${s}`)) ok++; else { bad++; console.log('MISMATCH', n, s, v, want.get(`${n},${s}`)); }
  }
  // the move values at the root must agree with V
  const root = new Array(n).fill(0); const mv = S.moves(root, 2 * n);
  if (Math.max(...mv.map((m) => m.value)) !== S.V(root, 2 * n)) { bad++; console.log('root move max != V', n); }
  console.log(`n=${n}: ${((performance.now() - t0) / 1000).toFixed(2)} s, ${S.size()} memo entries`);
}
console.log(`values: ${ok} match data/values_full_v1.csv, ${bad} mismatches`);
