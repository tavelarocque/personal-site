// darkmpc demo core: replicated three-way secret sharing over Z_2^64 and a
// port of the Stage 1 reference matcher (crates/reference/src/matcher.rs,
// darkmpc commit 618fd31), checked against the Rust code on random batches.
// Plain arithmetic only: the browser does not run the three-party protocol.

export const MASK = (1n << 64n) - 1n;
export const MAX_SIZE = (1n << 40n) - 1n;
export const PASSES = 3; // pass cap k used by the benchmark runs

const mod = (x) => x & MASK;

// Uniform 64-bit word from the browser's cryptographic generator.
export function randomWord() {
  const a = new BigUint64Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

// x = x0 + x1 + x2 mod 2^64, with x0 and x1 uniform.
export function share(x) {
  const x0 = randomWord(), x1 = randomWord();
  return [x0, x1, mod(x - x0 - x1)];
}

// Server i holds pieces (x_i, x_{i+1}).
export const held = (pieces, i) => [pieces[i], pieces[(i + 1) % 3]];

// Two servers together hold all three pieces.
export function reconstruct(pieces) {
  return mod(pieces[0] + pieces[1] + pieces[2]);
}

// Opening with the malicious-mode check: each server receives the piece it is
// missing from both servers that hold it, and aborts if the copies differ.
// `sent[j][i]` is what server j sends for piece i (honest: pieces[i]).
export function openChecked(pieces, tamper = null) {
  const views = [];
  for (let s = 0; s < 3; s++) {
    const missing = (s + 2) % 3; // server s holds s and s+1, misses s+2
    const holders = [(missing + 2) % 3, missing].filter((j) => j !== s); // the two servers holding piece `missing`
    const copies = holders.map((j) => (tamper && tamper.server === j && tamper.piece === missing ? mod(pieces[missing] + tamper.delta) : pieces[missing]));
    const ok = copies[0] === copies[1];
    views.push({ server: s, missing, holders, copies, ok, value: ok ? mod(pieces[s] + pieces[(s + 1) % 3] + copies[0]) : null });
  }
  return views;
}

// ---- Stage 1 reference matcher -------------------------------------------------
// orders: [{symbol, side: 'buy'|'sell', size: BigInt, minFill: BigInt}] in arrival order.

export function validate(orders) {
  orders.forEach((o, i) => {
    if (o.size < 1n || o.size > MAX_SIZE) throw new Error(`order ${i}: size not in 1..2^40-1`);
    if (o.minFill < 1n || o.minFill > o.size) throw new Error(`order ${i}: minimum fill not in 1..size`);
  });
}

function allocatePrefix(book) {
  const total = (s) => book.filter((b) => b.side === s).reduce((a, b) => a + b.size, 0n);
  const buyT = total('buy'), sellT = total('sell');
  const t = buyT < sellT ? buyT : sellT;
  let aheadBuy = 0n, aheadSell = 0n;
  return book.map((b) => {
    const ahead = b.side === 'buy' ? aheadBuy : aheadSell;
    const rest = t > ahead ? t - ahead : 0n;
    const f = b.size < rest ? b.size : rest;
    if (b.side === 'buy') aheadBuy += b.size; else aheadSell += b.size;
    return f;
  });
}

function matchSymbol(orders, members, passes) {
  const n = members.length;
  const eligible = new Array(n).fill(true);
  const trace = [];
  for (let pass = 0; pass < passes; pass++) {
    const slots = [];
    for (let j = 0; j < n; j++) if (eligible[j]) slots.push(j);
    const alloc = allocatePrefix(slots.map((j) => orders[members[j]]));
    const fills = new Array(n).fill(0n);
    const violators = [];
    slots.forEach((j, k) => {
      fills[j] = alloc[k];
      const f = alloc[k];
      if (f > 0n && f < orders[members[j]].minFill) violators.push(j);
    });
    trace.push(violators.map((j) => members[j]));
    if (violators.length === 0) return { fills, trace, failSafe: false };
    violators.forEach((j) => { eligible[j] = false; });
  }
  return { fills: new Array(n).fill(0n), trace, failSafe: true };
}

// Returns {fills, traces}: one fill per order, plus per-symbol pass traces.
export function matchBatch(orders, passes = PASSES) {
  validate(orders);
  const groups = new Map();
  orders.forEach((o, i) => { if (!groups.has(o.symbol)) groups.set(o.symbol, []); groups.get(o.symbol).push(i); });
  const fills = new Array(orders.length).fill(0n);
  const traces = [];
  for (const sym of [...groups.keys()].sort((a, b) => a - b)) {
    const members = groups.get(sym);
    const r = matchSymbol(orders, members, passes);
    members.forEach((i, k) => { fills[i] = r.fills[k]; });
    traces.push({ symbol: sym, removed: r.trace, failSafe: r.failSafe });
  }
  return { fills, traces };
}
