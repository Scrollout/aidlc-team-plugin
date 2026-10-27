// Globs: `**` spans folders, `*` and `?` stay in one, no `/` means any depth unless anchored by a leading `/`.

function segments(glob) {
  const anchored = /^\.?\//.test(glob);
  let g = glob.replace(/^\.?\//, '');
  if (g.endsWith('/')) g += '**';
  if (!anchored && !g.includes('/')) g = '**/' + g;
  return g.split('/');
}

const tokens = (seg) => [...seg];

// Memoised walk over two token lists; `step(i, j, go)` decides each state.
function walk(a, b, step) {
  const memo = new Map();
  const go = (i, j) => {
    const key = i * (b.length + 1) + j;
    if (!memo.has(key)) {
      memo.set(key, false);
      memo.set(key, i === a.length && j === b.length ? true : step(i, j, go));
    }
    return memo.get(key);
  };
  return go(0, 0);
}

// Some string matches both patterns. `star` is the any-run token, `one` matches one token of the other side.
function intersects(a, b, star, one) {
  return walk(a, b, (i, j, go) => {
    if (a[i] === star) return go(i + 1, j) || (j < b.length && go(i, j + 1));
    if (b[j] === star) return go(i, j + 1) || (i < a.length && go(i + 1, j));
    return i < a.length && j < b.length && one(a[i], b[j]) && go(i + 1, j + 1);
  });
}

// Every string matching `a` matches `b` (sufficient check: `b` must cover each token of `a`).
function within(a, b, star, one) {
  return walk(a, b, (i, j, go) => {
    if (b[j] === star) return go(i, j + 1) || (i < a.length && go(i + 1, j));
    return i < a.length && j < b.length && a[i] !== star && one(a[i], b[j]) && go(i + 1, j + 1);
  });
}

const charOverlap = (x, y) => x === '?' || y === '?' || x === y;
const charWithin = (x, y) => y === '?' ? x !== '*' : x === y;
const segOverlap = (x, y) => intersects(tokens(x), tokens(y), '*', charOverlap);
const segWithin = (x, y) => within(tokens(x), tokens(y), '*', charWithin);

export const overlaps = (a, b) => intersects(segments(a), segments(b), '**', segOverlap);
export const inside = (a, b) => within(segments(a), segments(b), '**', segWithin);
// A glob as a regex whose single `*` segments are captured, for `same: false` boundaries.
export function globRegex(glob) {
  let g = glob.replace(/^\.?\//, '');
  if (!glob.startsWith('/') && !g.includes('/')) g = '**/' + g;
  const body = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?|\*|\?/g, (t) => (t.startsWith('**') ? (t.endsWith('/') ? '(?:.*/)?' : '.*') : t === '*' ? '([^/]*)' : '[^/]'));
  return new RegExp(`^${body}$`);
}
