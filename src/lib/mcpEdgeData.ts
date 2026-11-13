/**
 * MCP 데이터 카탈로그 중 **엣지 함수가 채우는** 데이터셋 (2026-10-20) — DB 에 없는 것.
 *   extensions — 교내 전화번호(내선). 단일 출처 = src/data/extensionDirectory.ts(앱 «전화번호부»와 같은 자료)
 *   meals      — 급식 식단. NEIS 를 부른다(앱도 NEIS 를 직접 부른다 — DB 에 식단 표가 없다)
 *
 * ⚠️ 이 파일은 supabase/functions/_shared/mcpEdgeData.bundle.js 로 묶인다(scripts/mcp-docgen/build-bundle.mts).
 *    전화번호부·식단 규칙을 고치면 다시 묶고 엣지 함수 mcp 를 배포할 것. 그래서 `@/` 별칭 대신 상대 경로를 쓴다.
 */
import { extensionData, quickDialContacts } from '../data/extensionDirectory';
import { normalizeText } from './callsDirectory';

export interface ExtensionRow {
  group: string;
  name: string;
  duty?: string;
  extension?: string;
  phone?: string;
  note?: string;
}

export function extensionRows(): ExtensionRow[] {
  const rows: ExtensionRow[] = [];
  for (const q of quickDialContacts) rows.push({ group: '대표 번호', name: q.label, phone: q.phone });
  for (const g of extensionData) {
    for (const e of g.entries) {
      rows.push({
        group: g.title, name: e.name,
        ...(e.duty ? { duty: e.duty } : {}),
        ...(e.extension ? { extension: e.extension } : {}),
        ...(e.phone ? { phone: e.phone } : {}),
        ...(e.note || e.isFax ? { note: [e.isFax ? '팩스' : '', e.note ?? ''].filter(Boolean).join(' · ') } : {}),
      });
    }
  }
  return rows;
}

/** 전화번호부 검색과 같은 규칙 — 하이픈·공백·괄호를 지우고 이름·업무·번호·비고·부서를 본다(callsDirectory.normalizeText) */
export function searchExtensions(query: string | null | undefined, limit: number) {
  const all = extensionRows();
  const q = normalizeText(String(query ?? '').trim());
  const rows = q
    ? all.filter((r) => [r.group, r.name, r.duty, r.extension, r.phone, r.note].some((v) => v && normalizeText(v).includes(q)))
    : all;
  return { count: rows.length, rows: rows.slice(0, limit), ...(rows.length > limit ? { truncated: true } : {}) };
}

export interface MealRow {
  date: string;
  meal: string;
  menu: string[];
  calories?: string;
}

/** NEIS mealServiceDietInfo 응답 → 행. 알레르기 번호를 지운다(앱 neisMealService 와 같은 정리). 자료 없음(INFO-200)은 빈 목록 */
export function parseNeisMeals(json: unknown): MealRow[] {
  const root = (json as { mealServiceDietInfo?: unknown[] })?.mealServiceDietInfo;
  if (!Array.isArray(root)) return [];
  const rows = (root[1] as { row?: Record<string, string>[] })?.row ?? [];
  return rows.map((r) => ({
    date: `${r.MLSV_YMD.slice(0, 4)}-${r.MLSV_YMD.slice(4, 6)}-${r.MLSV_YMD.slice(6, 8)}`,
    meal: r.MMEAL_SC_NM,
    menu: String(r.DDISH_NM ?? '')
      .split(/<br\s*\/?>/i)
      // 알레르기 번호 — 두 표기가 온다: «미역국 5.6.»(앱 neisMealService 가 지우는 «숫자.») · «떡국 (15)»·«(1.5.9)»(괄호 —
      // 2026-10-20 운영 시험에서 앱 규칙으로는 남았다). 괄호는 숫자·점·쉼표만 든 것만 지운다(«(망고d.)» 같은 설명은 둔다)
      .map((item) => item.replace(/\(\s*[\d.,\s]+\)/g, '').replace(/\d+\./g, '').replace(/\(\s*\)/g, '').trim())
      .filter(Boolean),
    ...(r.CAL_INFO ? { calories: r.CAL_INFO } : {}),
  })).sort((a, b) => a.date.localeCompare(b.date) || mealOrder(a.meal) - mealOrder(b.meal));
}

const mealOrder = (m: string) => (m === '조식' ? 0 : m === '중식' ? 1 : m === '석식' ? 2 : 3);

/** 날짜 범위 — 하루(date) 또는 기간(from~to, 31일까지). 비우면 오늘(한국 시간) */
export function mealRange(filter: { date?: unknown; from?: unknown; to?: unknown }, today: string): { from: string; to: string } {
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const pick = (v: unknown, name: string) => {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string' || !DATE.test(v)) throw new Error(`조건 ${name} 는 YYYY-MM-DD 입니다.`);
    return v;
  };
  const date = pick(filter.date, 'date');
  const from = pick(filter.from, 'from') ?? date ?? today;
  const to = pick(filter.to, 'to') ?? date ?? from;
  if (to < from) throw new Error('to 가 from 보다 앞입니다.');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 31) throw new Error('기간은 31일까지입니다.');
  return { from, to };
}
