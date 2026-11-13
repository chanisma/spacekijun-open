// verify: 채움 결과에 대한 기계 검증. 실패는 CHECK(fail)로 표면화되어
// 국소 재시도 또는 사람 검수(needs_review)로 이어진다.

import type { CheckResult, WorkSpec } from './types';
import { parseHwpxSection } from './hwpxIndex';
import { makeResolver, toNum, evaluateFormula } from './formula';
import { resolveLocator, resolvedRegionText } from './locator';
import type { FillOutput } from './engine';

export interface VerifyInput {
  spec: WorkSpec;
  filled: FillOutput;
  plan: Record<string, unknown>;
  knowledge?: Record<string, unknown>;
}

export function verifyDocument(input: VerifyInput): CheckResult[] {
  const { spec, filled, plan } = input;
  const knowledge = input.knowledge ?? {};
  const checks: CheckResult[] = [];
  const indexes = filled.sections.map(parseHwpxSection);
  const ctx = { plan, knowledge, target: filled.values, rows: filled.rows, ...filled.values };
  const resolve = makeResolver(ctx);

  // 1) 채움 보고 자체의 실패
  for (const r of filled.report) {
    if (r.status === 'stale' || r.status === 'error') {
      checks.push({ key: `fill:${r.targetId}`, status: 'fail', message: `${r.status}: ${r.detail ?? ''}` });
    }
  }

  // 2) required 미충족
  for (const t of spec.targets) {
    if (!t.required) continue;
    const rep = filled.report.find((r) => r.targetId === t.id);
    if (!rep || rep.status !== 'filled') {
      if (t.kind !== 'keep') checks.push({ key: `required:${t.id}`, status: 'fail', message: `필수 타깃 미채움(${rep?.status ?? 'missing'})` });
    }
  }

  // 3) keep 불변성: 채움 전 스냅샷 == 채움 후 텍스트
  for (const t of spec.targets) {
    if (t.kind !== 'keep') continue;
    const before = filled.keepSnapshots[t.id];
    if (before == null) continue;
    const res = resolveLocator(indexes, t.locator);
    const after = res.kind === 'stale' ? null : resolvedRegionText(res, indexes);
    if (after == null || normalize(after) !== normalize(before)) {
      checks.push({ key: `keep:${t.id}`, status: 'fail', message: '유지 구역이 변경됨' });
    } else {
      checks.push({ key: `keep:${t.id}`, status: 'pass', message: '유지 구역 불변' });
    }
  }

  /*
   * 4) 잔여물 검사는 **폐지했다** (2026-09-03 사용자 결정).
   *
   * 패턴은 사람이 적은 것이 아니라 `detectSpecDraft` 가 양식을 훑어 자동으로 시드한
   * 추측이었고, 지울 화면조차 없었다(입력칸은 2026-09-02에 제거). 실제 라이브 양식에서
   * `시스코`·`08:00~22:00` 처럼 **그 문서의 정상 내용**이 패턴으로 잡혀 있었다 —
   * 원본 텍스트를 내용으로 쓰지 않기로 한 뒤(그래서 그 구역이 원문 그대로 남는다)
   * 이 검사는 **맞는 문서를 fail 로 보고**한다.
   *
   * 그래서 `spec.residualPatterns` 와 `no-residual` 제약은 **읽지 않는다**.
   * 저장된 스펙에 남아 있어도 무해하도록 필드는 타입에 남겨 뒀다(파싱 호환).
   */

  // 5) 선언 제약
  for (const c of spec.constraints ?? []) {
    try {
      switch (c.kind) {
        case 'equals': {
          const ok = looseEquals(resolve(c.a), resolve(c.b));
          checks.push(result(`equals:${c.a}`, ok, c.message ?? `${c.a} == ${c.b}`));
          break;
        }
        case 'sum-equals': {
          const arr = asArray(resolve(c.of)).map(toNum);
          const sum = arr.reduce((a, b) => a + b, 0);
          const ok = looseEquals(sum, resolve(c.equals));
          checks.push(result(`sum-equals:${c.of}`, ok, c.message ?? `Σ${c.of}=${sum} vs ${String(resolve(c.equals))}`));
          break;
        }
        case 'percent-sum': {
          const arr = asArray(resolve(c.of)).map(toNum);
          const sum = arr.reduce((a, b) => a + b, 0);
          checks.push(result(`percent-sum:${c.of}`, sum === c.equals, c.message ?? `Σ=${sum} (기대 ${c.equals})`));
          break;
        }
        case 'subset': {
          const sub = asArray(resolve(c.of)).map(String);
          const sup = new Set(asArray(resolve(c.in)).map(String));
          const missing = sub.filter((x) => !sup.has(x));
          checks.push(result(`subset:${c.of}`, missing.length === 0, c.message ?? (missing.length ? `미포함: ${missing.slice(0, 5).join(', ')}` : '부분집합 충족')));
          break;
        }
        case 'exactly-one': {
          const v = filled.values[c.target];
          checks.push(result(`exactly-one:${c.target}`, v != null, c.message ?? `선택값 ${v != null ? '있음' : '없음'}`));
          break;
        }
        case 'no-residual': // 폐지 — 위 주석 참고. 오래된 스펙에 남아 있어도 무시한다
        case 'all-required-filled':
          break; // all-required-filled 는 위 2)에서 처리
      }
    } catch (e) {
      checks.push({ key: `constraint:${c.kind}`, status: 'fail', message: `평가 오류: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  // 키 유일화: 같은 타깃이 report에 여러 항목을 남길 수 있어(행×열 오류 격리 등)
  // fill:<id> 등이 중복될 수 있다 — task_action_check의 unique(run_id, check_key) 보호.
  const seen = new Map<string, number>();
  return checks.map((c) => {
    const n = (seen.get(c.key) ?? 0) + 1;
    seen.set(c.key, n);
    return n === 1 ? c : { ...c, key: `${c.key}#${n}` };
  });
}

/** 재시도 대상 타깃 id 추출(fill/keep 실패만 — 제약 실패는 plan 수정 사안) */
export function retryableTargets(checks: CheckResult[]): string[] {
  return checks
    .filter((c) => c.status === 'fail' && c.key.startsWith('fill:'))
    .map((c) => c.key.slice('fill:'.length));
}

function result(key: string, ok: boolean, message: string): CheckResult {
  return { key, status: ok ? 'pass' : 'fail', message };
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

function looseEquals(a: unknown, b: unknown): boolean {
  try { return toNum(a) === toNum(b); } catch { return String(a) === String(b); }
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export { evaluateFormula };
