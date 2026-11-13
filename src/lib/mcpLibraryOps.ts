/**
 * MCP 에이전트 — 나이스 안내 · 코드 공유 (2026-10-24). 엣지 함수 mcp 가 묶음(`_shared/mcpLibraryOps.bundle.js`)으로 쓴다.
 *
 * 웹과 같은 규칙을 쓰려는 모듈이다(규칙을 두 벌로 쓰지 않는다):
 *   나이스 — 메뉴목록 검색 = searchNeisScreens(작업 «NEIS 화면» 고르기와 같은 점수) · 안내 본문 검색 = /neis-guide 와 같은
 *            «낱말을 모두 품은 안내». 안내 자료(neis-kb/guides)는 묶을 때 NEIS_GUIDES_RAW 로 함께 실린다(build-bundle).
 *   코드 공유 — 경로 정리·무시 목록·종류·진입 파일 = src/lib/codeShare.ts 그대로. 서버(mcp_private.code_path_ok)가 다시 확인한다.
 *
 * ⚠️ 이 파일이나 neisScreens · neisScreenModel · codeShare · neis-kb/guides 를 고치면
 *    `npx tsx scripts/mcp-docgen/build-bundle.mts` 로 다시 묶고 mcp 를 배포할 것(안 하면 웹과 에이전트가 오류 없이 다른 답).
 */
import { NEIS_CATALOG } from '../data/neisScreens.generated';
import { neisScreenPath, searchNeisScreens, toNeisScreenRef, type NeisScreen, type NeisScreenRef } from './neisScreens';
import { neisStepTargets, parseNeisGuide, type NeisGuide } from './neisScreenModel';
import {
  CODE_SHARE_LIMITS, detectEntryPath, detectProjectKind, isIgnoredProjectPath, normalizeProjectPath,
} from './codeShare';

// ── 나이스 안내 ──────────────────────────────────────────────────────────────────

export interface NeisGuideIndex {
  guides: NeisGuide[];
  byKey: Map<string, NeisGuide>;
  screenByKey: Map<string, NeisScreen>;
  haystack: Map<string, string>;
}

/** /neis-guide 의 haystack 과 같은 칸 — 화면 이름·용도·맥락·절차·주의·묻고 답하기 */
function guideHaystack(guide: NeisGuide): string {
  return [
    guide.key, guide.purpose, guide.context, guide.who,
    ...(guide.before ?? []), ...(guide.after ?? []), ...(guide.cautions ?? []),
    ...guide.flows.flatMap((flow) => [flow.title, flow.when, ...flow.steps.flatMap((step) => [step.text, step.detail, ...(step.points ?? [])])]),
    ...(guide.faq ?? []).flatMap((item) => [item.q, item.a]),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function buildNeisIndex(rawGuides: unknown[]): NeisGuideIndex {
  const order = new Map(NEIS_CATALOG.screens.map((screen, index) => [screen.key, index]));
  const guides = rawGuides
    .map((raw) => parseNeisGuide(raw))
    .filter((guide): guide is NeisGuide => Boolean(guide))
    .sort((a, b) => (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9));
  return {
    guides,
    byKey: new Map(guides.map((guide) => [guide.key, guide])),
    screenByKey: new Map(NEIS_CATALOG.screens.map((screen) => [screen.key, screen])),
    haystack: new Map(guides.map((guide) => [guide.key, guideHaystack(guide)])),
  };
}

const unitOf = (key: string) => key.split('›')[0]?.replace(/#.*$/, '') ?? '';

function screenSummary(index: NeisGuideIndex, key: string) {
  const screen = index.screenByKey.get(key);
  const guide = index.byKey.get(key);
  return {
    key,
    menu_path: screen ? neisScreenPath(screen).join(' › ') : key.split('›').map((p) => p.replace(/#.*$/, '')).join(' › '),
    purpose: guide?.purpose ?? screen?.purpose,
    has_guide: Boolean(guide),
    ...(screen?.roles.length ? { roles: screen.roles } : {}),
    ...(guide?.who ? { who: guide.who } : {}),
  };
}

/**
 * 검색 — 메뉴목록(화면 이름·별칭·안쪽 탭·경로·용도 점수) 결과를 앞에, 안내 본문에만 걸리는 화면을 뒤에 붙인다.
 * unit = 단위업무(예: «교무학사(고)»)로 좁히기.
 */
export function neisSearch(index: NeisGuideIndex, query: string, unit: string | null, limit: number) {
  const q = query.trim();
  const pool = unit ? NEIS_CATALOG.screens.filter((screen) => unitOf(screen.key) === unit) : NEIS_CATALOG.screens;
  const byMenu = q ? searchNeisScreens(pool, q, { limit }) : [];
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const byGuide = words.length
    ? index.guides.filter((guide) => (!unit || unitOf(guide.key) === unit)
      && words.every((word) => index.haystack.get(guide.key)!.includes(word)))
    : [];
  const seen = new Set<string>();
  const results: Array<ReturnType<typeof screenSummary> & { matched: 'menu' | 'guide' }> = [];
  for (const screen of byMenu) {
    if (seen.has(screen.key)) continue;
    seen.add(screen.key);
    results.push({ ...screenSummary(index, screen.key), matched: 'menu' });
  }
  for (const guide of byGuide) {
    if (seen.has(guide.key)) continue;
    seen.add(guide.key);
    results.push({ ...screenSummary(index, guide.key), matched: 'guide' });
  }
  return {
    query: q,
    ...(unit ? { unit } : {}),
    count: Math.min(results.length, limit),
    truncated: results.length > limit,
    results: results.slice(0, limit),
    units: unit ? undefined : [...new Set(index.guides.map((guide) => unitOf(guide.key)))],
  };
}

/** 대상 ID(`field:학년도`·`col:…`·`tab:…`) → 사람이 읽는 이름 */
const targetLabel = (target: string) => target.replace(/^[a-z]+:/, '');

/** 화면 하나 — 메뉴 경로·안쪽 탭·용도와 (있으면) 안내 전문 */
export function neisGuideDetail(index: NeisGuideIndex, key: string) {
  const exact = index.screenByKey.has(key) || index.byKey.has(key);
  if (!exact) return null;
  const screen = index.screenByKey.get(key);
  const guide = index.byKey.get(key);
  return {
    ...screenSummary(index, key),
    ...(screen?.inner.length ? { inner_tabs: screen.inner.map((tab) => tab.name) } : {}),
    ...(screen?.aliases?.length ? { aliases: screen.aliases } : {}),
    ...(guide
      ? {
        context: guide.context,
        before: guide.before,
        after: guide.after,
        flows: guide.flows.map((flow) => ({
          title: flow.title,
          ...(flow.when ? { when: flow.when } : {}),
          steps: flow.steps.map((step) => ({
            text: step.text,
            ...(step.detail ? { detail: step.detail } : {}),
            ...(step.points?.length ? { points: step.points } : {}),
            ...(neisStepTargets(step).length ? { where: neisStepTargets(step).map(targetLabel) } : {}),
          })),
        })),
        cautions: guide.cautions,
        faq: guide.faq,
        related: guide.related?.map((item) => ({ ...screenSummary(index, item.key), why: item.why })),
        refs: guide.refs,
        source: guide.source === 'ai-draft' ? 'AI 초안(검토 전)' : guide.source === 'manual' ? '나이스 사용자 설명서' : '화면을 직접 써 보고 적음',
      }
      : { note: '이 화면은 아직 안내가 없다 — 메뉴 위치와 용도만 있다.' }),
  };
}

/**
 * 작업 «NEIS 화면»(`neis.screen`)에 저장할 화면 목록 — 웹이 고를 때와 **같은 모양**(`toNeisScreenRef`) (2026-10-25).
 * 웹 parseNeisActionConfig 는 key 가 없는 화면을 조용히 버린다 — 에이전트가 {name, path} 만 넘기면
 * 작업이 저장은 되는데 화면에는 «화면 없음»으로 보였다. 그래서 에이전트는 search_neis_guide 의 key 만 넘기고
 * 이름·경로는 카탈로그에서 채운다. 모르는 key·없는 안쪽 탭은 거부한다.
 */
export function neisScreenRefs(index: NeisGuideIndex, items: unknown): NeisScreenRef[] {
  if (!Array.isArray(items)) throw new Error('screens 는 [{key, inner_tab?}] 배열입니다.');
  return items.map((item) => {
    const raw = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const key = typeof raw.key === 'string' ? raw.key.trim() : '';
    const screen = key ? index.screenByKey.get(key) : undefined;
    if (!screen) {
      throw new Error(`나이스 화면 key 를 찾지 못했습니다: ${key || '(없음)'} — search_neis_guide 결과의 key 를 그대로 넘기세요.`);
    }
    const innerTab = typeof raw.inner_tab === 'string' ? raw.inner_tab.trim() : '';
    if (innerTab && !screen.inner.some((tab) => tab.name === innerTab)) {
      throw new Error(`«${screen.name}» 화면에 «${innerTab}» 탭이 없습니다 — 있는 탭: ${screen.inner.map((tab) => tab.name).join(', ') || '없음'}`);
    }
    return toNeisScreenRef(screen, innerTab || undefined);
  });
}

// ── 코드 공유 ────────────────────────────────────────────────────────────────────

export interface CodeFileInput { path: string; content: string }

/**
 * 에이전트가 보낸 파일 → 저장할 파일. 웹 업로드와 같은 순서(경로 정리 → 무시 목록)로 거르고, 무엇을 뺐는지 돌려준다.
 * (공통 루트 벗기기는 하지 않는다 — 에이전트는 폴더 째 올리지 않고 경로를 직접 적는다)
 */
export function planCodeFiles(files: CodeFileInput[]) {
  const kept: CodeFileInput[] = [];
  const ignored: Array<{ path: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const file of files) {
    const path = normalizeProjectPath(String(file.path ?? ''));
    if (!path) { ignored.push({ path: String(file.path), reason: '경로 오류' }); continue; }
    if (isIgnoredProjectPath(path)) { ignored.push({ path, reason: '무시 목록(점으로 시작하는 폴더·node_modules·잠금 파일)' }); continue; }
    if (seen.has(path)) { ignored.push({ path, reason: '같은 경로가 두 번' }); continue; }
    seen.add(path);
    kept.push({ path, content: String(file.content ?? '') });
  }
  return { kept, ignored };
}

/** 파일 목록 → 종류·진입 파일(웹 detectProjectKind · detectEntryPath) */
export function codeProjectShape(paths: string[]) {
  return { kind: detectProjectKind(paths), entry_path: detectEntryPath(paths) };
}

export const CODE_LIMITS = CODE_SHARE_LIMITS;
