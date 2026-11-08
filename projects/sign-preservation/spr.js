// Exact solver for the full sign-preservation-with-reuse game, ported from
// reference/spr_ref.py in spr-calibration-code (commit 09d4059): the plain,
// memoised reference the Rust solver is checked against. Small boards only.
//
// A board is an array of cells: 0 empty, 1 '+', 2 '-'. Each round the Pointer
// names an empty cell (or stops and keeps the signs it has); the Labeler may
// first erase any subset of the '-' signs left of that cell and the '+' signs
// right of it, then writes '+' or '-' in it. The Pointer wants many signs left.

export const count = (x) => x.reduce((a, c) => a + (c === 1 || c === 2 ? 1 : 0), 0);

// Reflection symmetry: reverse the strip and swap + and -. Values are equal.
const SW = [0, 2, 1];
function canonKey(x) {
  const a = x.join('');
  const b = x.map((c) => SW[c]).reverse().join('');
  return a < b ? a : b;
}

export const erasable = (x, j) => x.flatMap((c, i) => ((i < j && c === 2) || (i > j && c === 1) ? [i] : []));

// All subsets of a list, smallest first (matches combinations by size).
export function* subsets(list) {
  for (let k = 0; k <= list.length; k++) yield* combos(list, k, 0);
}
function* combos(list, k, start) {
  if (k === 0) { yield []; return; }
  for (let i = start; i <= list.length - k; i++) for (const rest of combos(list, k - 1, i + 1)) yield [list[i], ...rest];
}

export function makeSolver() {
  const memo = new Map();
  // Exact value with r rounds left, same pruning as the reference.
  function V(x, r) {
    const key = canonKey(x) + '|' + r;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let best = count(x); // the Pointer may stop
    if (r > 0) {
      for (let j = 0; j < x.length; j++) {
        if (x[j] !== 0) continue;
        let worst = null;
        outer: for (const E of subsets(erasable(x, j))) {
          const y = x.slice();
          for (const i of E) y[i] = 0;
          for (const sgn of [1, 2]) {
            y[j] = sgn;
            const v = V(y, r - 1);
            if (worst === null || v < worst) {
              worst = v;
              if (worst <= best) break outer;
            }
          }
        }
        if (worst > best) best = worst;
      }
    }
    memo.set(key, best);
    return best;
  }
  // Every Labeler reply to pointing at j, each with its exact value (no pruning).
  function replies(x, r, j) {
    const out = [];
    for (const E of subsets(erasable(x, j))) {
      for (const sgn of [1, 2]) {
        const y = x.slice();
        for (const i of E) y[i] = 0;
        y[j] = sgn;
        out.push({ erase: E, sign: sgn, board: y, value: V(y, r - 1) });
      }
    }
    // best for the Labeler first; ties: fewer erasures, then '+'
    out.sort((a, b) => a.value - b.value || a.erase.length - b.erase.length || a.sign - b.sign);
    return out;
  }
  // Exact value of each Pointer option at this position.
  function moves(x, r) {
    const out = [{ stop: true, value: count(x) }];
    if (r > 0) for (let j = 0; j < x.length; j++) if (x[j] === 0) out.push({ cell: j, value: replies(x, r, j)[0].value });
    return out;
  }
  return { V, replies, moves, size: () => memo.size };
}
