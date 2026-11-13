// computed·constraints 공용 미니 식 언어. 화이트리스트 연산만 — eval 금지.
// 문법: 숫자, 'str', 참조(plan.x / row.y / target.z / knowledge.k / <rowGroupId>.<col>),
//       sum(ref), count(ref), round(x, n), + - * /, 비교(== != <= >= < >)

export type Resolver = (path: string) => unknown;

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ref'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const ops = ['==', '!=', '<=', '>=', '+', '-', '*', '/', '<', '>'];
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { toks.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { toks.push({ t: 'rp' }); i++; continue; }
    if (c === ',') { toks.push({ t: 'comma' }); i++; continue; }
    const op = ops.find((o) => src.startsWith(o, i));
    if (op) { toks.push({ t: 'op', v: op }); i += op.length; continue; }
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0) throw new Error('unterminated string');
      toks.push({ t: 'str', v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const m = /^[0-9][0-9_,]*(\.[0-9]+)?/.exec(src.slice(i))!;
      toks.push({ t: 'num', v: Number(m[0].replace(/[,_]/g, '')) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z가-힣_]/.test(c)) {
      const m = /^[A-Za-z가-힣_][A-Za-z0-9가-힣_.[\]]*/.exec(src.slice(i))!;
      toks.push({ t: 'ref', v: m[0] });
      i += m[0].length;
      continue;
    }
    throw new Error(`formula: unexpected char '${c}'`);
  }
  return toks;
}

const FUNCS = new Set(['sum', 'count', 'round', 'min', 'max']);

export function evaluateFormula(src: string, resolve: Resolver): unknown {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];

  function primary(): unknown {
    const t = next();
    if (!t) throw new Error('formula: unexpected end');
    if (t.t === 'num') return t.v;
    if (t.t === 'str') return t.v;
    if (t.t === 'lp') {
      const v = comparison();
      if (next()?.t !== 'rp') throw new Error('formula: expected )');
      return v;
    }
    if (t.t === 'ref') {
      if (FUNCS.has(t.v) && peek()?.t === 'lp') {
        next(); // (
        const args: unknown[] = [comparison()];
        while (peek()?.t === 'comma') { next(); args.push(comparison()); }
        if (next()?.t !== 'rp') throw new Error('formula: expected )');
        return callFunc(t.v, args);
      }
      return resolve(t.v);
    }
    if (t.t === 'op' && t.v === '-') return -toNum(primary());
    throw new Error(`formula: unexpected token`);
  }

  function callFunc(name: string, args: unknown[]): unknown {
    const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);
    switch (name) {
      case 'sum': return arr(args[0]).reduce((a: number, x) => a + toNum(x), 0);
      case 'count': return arr(args[0]).length;
      case 'round': {
        const n = args.length > 1 ? toNum(args[1]) : 0;
        const f = 10 ** n;
        return Math.round(toNum(args[0]) * f) / f;
      }
      case 'min': return Math.min(...arr(args[0]).map(toNum));
      case 'max': return Math.max(...arr(args[0]).map(toNum));
      default: throw new Error(`formula: unknown fn ${name}`);
    }
  }

  function mul(): unknown {
    let v = primary();
    while (peek()?.t === 'op' && ['*', '/'].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      const r = primary();
      v = op === '*' ? toNum(v) * toNum(r) : toNum(v) / toNum(r);
    }
    return v;
  }
  function add(): unknown {
    let v = mul();
    while (peek()?.t === 'op' && ['+', '-'].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      const r = mul();
      v = op === '+' ? toNum(v) + toNum(r) : toNum(v) - toNum(r);
    }
    return v;
  }
  function comparison(): unknown {
    const l = add();
    if (peek()?.t === 'op' && ['==', '!=', '<=', '>=', '<', '>'].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v;
      const r = add();
      switch (op) {
        case '==': return looseEq(l, r);
        case '!=': return !looseEq(l, r);
        case '<=': return toNum(l) <= toNum(r);
        case '>=': return toNum(l) >= toNum(r);
        case '<': return toNum(l) < toNum(r);
        case '>': return toNum(l) > toNum(r);
      }
    }
    return l;
  }

  const out = comparison();
  if (pos !== toks.length) throw new Error('formula: trailing tokens');
  return out;
}

export function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[,\s원%]/g, ''));
    if (!Number.isNaN(n)) return n;
  }
  if (v == null) return 0;
  throw new Error(`formula: not a number: ${String(v)}`);
}

function looseEq(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' || typeof b === 'number') {
    try { return toNum(a) === toNum(b); } catch { /* fallthrough */ }
  }
  return String(a) === String(b);
}

/**
 * 경로 참조 해석기 생성. 컨텍스트 형태:
 * { plan, knowledge, target(채워진 값), rows(rowGroupId→행 객체 배열), row(행 컨텍스트) }
 * "budgetRows.금액" 같은 rowGroup.col 참조는 rows에서 배열 추출.
 */
export function makeResolver(ctx: Record<string, unknown>): Resolver {
  return (path: string) => {
    const parts = path.split('.');
    // rowGroupId.col 단축 참조: rows에 있으면 열 배열로
    const rows = ctx.rows as Record<string, Record<string, unknown>[]> | undefined;
    if (rows && parts.length === 2 && rows[parts[0]]) {
      return rows[parts[0]].map((r) => r[parts[1]]);
    }
    let cur: unknown = ctx;
    for (const p of parts) {
      if (cur == null) return undefined;
      const m = /^([^[]+)\[(\d+)\]$/.exec(p);
      if (m) {
        cur = (cur as Record<string, unknown>)[m[1]];
        cur = Array.isArray(cur) ? cur[Number(m[2])] : undefined;
      } else if (Array.isArray(cur)) {
        // 배열 안 필드 추출: plan.itemsKey.c4 → 각 행의 c4 배열(sum/count 인자용).
        // rowGroup id가 식별자 제약을 못 지켜도 plan 경로로 합계 참조가 가능해진다.
        cur = cur.map((item) =>
          item && typeof item === 'object' ? (item as Record<string, unknown>)[p] : undefined);
      } else {
        cur = (cur as Record<string, unknown>)[p];
      }
    }
    return cur;
  };
}
