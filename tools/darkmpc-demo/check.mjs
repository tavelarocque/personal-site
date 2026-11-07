import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;
const { matchBatch, share, reconstruct, held, openChecked, MASK } = await import('../../projects/darkmpc/core.js');
const lines = readFileSync(process.argv[2] || new URL('./cases.jsonl', import.meta.url), 'utf8').trim().split('\n');
let bad = 0, failSafe = 0, filled = 0;
for (const [n, line] of lines.entries()) {
  const c = JSON.parse(line);
  const orders = c.orders.map(([symbol, side, size, minFill]) => ({ symbol, side: side ? 'sell' : 'buy', size: BigInt(size), minFill: BigInt(minFill) }));
  const r = matchBatch(orders, 3);
  const got = r.fills.map(String), want = c.fills;
  if (got.join() !== want.join()) { if (bad++ < 3) console.log('MISMATCH', n, line, got); }
  failSafe += r.traces.filter((t) => t.failSafe).length; filled += got.filter((x) => x !== '0').length;
}
console.log(`matcher: ${lines.length - bad}/${lines.length} batches identical to the Rust reference; ${failSafe} symbols hit the pass cap; ${filled} non-zero fills`);
// sharing
let sbad = 0;
for (let i = 0; i < 20000; i++) {
  const x = BigInt.asUintN(64, BigInt(Math.floor(Math.random() * 2 ** 52)) * 4099n);
  const p = share(x);
  if (reconstruct(p) !== x || p.some((v) => v < 0n || v > MASK)) sbad++;
  for (let s = 0; s < 3; s++) { const [a, b] = held(p, s); if (a !== p[s] || b !== p[(s + 1) % 3]) sbad++; }
  const v = openChecked(p); if (!v.every((w) => w.ok && w.value === x)) sbad++;
  for (let srv = 0; srv < 3; srv++) for (const piece of [srv, (srv + 1) % 3]) {
    const t = openChecked(p, { server: srv, piece, delta: 1n + BigInt(i) });
    const victims = t.filter((w) => !w.ok);
    if (victims.length !== 1 || t.some((w) => w.ok && w.value !== x)) sbad++; // exactly the server receiving the bad copy aborts; nobody outputs a wrong value
  }
}
console.log(`sharing: ${sbad === 0 ? 'all' : 'NOT all'} 20000 values reconstruct, servers hold the right pairs, honest openings agree, a tampered opening is caught`);
// uniformity sanity: bit balance of share x0 for a fixed secret
let ones = 0; const N = 4000;
for (let i = 0; i < N; i++) { const p = share(42n); ones += p[0].toString(2).split('').filter((c) => c === '1').length; }
console.log('mean set bits per share word (expect ~32):', (ones / N).toFixed(2));
