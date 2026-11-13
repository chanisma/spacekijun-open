// ========================================
// NEIS 화면 카탈로그 — 순수 로직 (2026-09-23)
//
// 할 일에 붙이는 "NEIS 업무 화면" 실행(`neis.screen`)의 단일 출처.
// 웹에서는 NEIS 작업을 자동으로 실행할 수 없으므로, 이 실행은 **어느 화면에서
// 무엇을 하는지**를 정확히 가리키고 사람이 처리한 뒤 완료를 기록하게 한다.
//
// 데이터(`src/data/neisScreens.generated.ts`)는 업무포털 「학교업무분장 메뉴목록」
// 엑셀에서 `scripts/neis-catalog/build.mts` 가 만든다. 화면을 긁어 모은 목록이 아니라
// 학교가 내려받는 **정본**이다 — 긁은 목록은 폴더 이름(`출결관리`)이 화면인 척 섞여
// 들어오는 사고가 NEIS_helper 에서 실제로 났다.
//
// 이 파일은 카탈로그를 정적으로 import 하지 않는다(수백 KB — 러너가 필요할 때만
// 동적으로 불러온다). 그래서 회귀 테스트도 이 파일만으로 돈다.
// ========================================

/** 엑셀 `업무분장구분` 에 적히는 담임 역할. 빈 칸 = 업무분장으로 받은 담당자 메뉴 */
export const NEIS_HOMEROOM_ROLES = ['교과담임', '학급담임', '동아리담임'] as const;
export type NeisRole = (typeof NEIS_HOMEROOM_ROLES)[number];

/** 전북 나이스 — 로그인은 인증서로 사람이 한다 */
export const NEIS_URL = 'https://jbe.neis.go.kr/';

export interface NeisInnerTab {
  name: string;
  roles: NeisRole[];
}

export interface NeisScreen {
  /** 안정 식별자 — `단위업무›세부업무›메뉴그룹›화면`. 같은 화면 이름이 여러 단위업무에 있다 */
  key: string;
  /** 업무영역 — 교무업무·학교행정·일반행정·공통관리 */
  area: string;
  /** 단위업무 — 교무학사(고)·급식·방과후학교… */
  unit: string;
  /** 세부업무(1단계 묶음) */
  section: string;
  /** 메뉴그룹(2단계 폴더) */
  group: string;
  /** 화면(3단계) */
  name: string;
  /** 이 화면을 쓰는 담임 역할. 빈 배열 = 업무분장 담당자 메뉴 */
  roles: NeisRole[];
  /** 화면 안쪽 탭 */
  inner: NeisInnerTab[];
  /** 한 줄 용도 — 실제로 화면을 열어 보고 적은 것만(NEIS_helper 용도 사전) */
  purpose?: string;
  /** 교사가 실제로 쓰는 말 */
  aliases?: string[];
}

export interface NeisCatalog {
  /** 원본 엑셀 파일명 — 언제 기준의 메뉴인지 화면이 말할 수 있어야 한다 */
  source: string;
  builtAt: string;
  screens: NeisScreen[];
}

export function neisScreenKey(parts: {
  unit: string; section: string; group: string; name: string;
}): string {
  return [parts.unit, parts.section, parts.group, parts.name].join('›');
}

/**
 * 화면에 보일 이름 — 세부업무 이름에 붙는 적용 범위 표시(`방과후학교#학교`,
 * `PAPS#고등학교`)는 나이스 메뉴에 보이지 않으므로 뗀다. 식별자(key)에는 그대로 둔다.
 */
export function displayNeisPart(part: string): string {
  return part.replace(/#.*$/, '').trim();
}

/** 화면에 보일 메뉴 경로 — 같은 이름이 연달아 나오면 한 번만 */
export function neisScreenPath(screen: Pick<NeisScreen, 'unit' | 'section' | 'group' | 'name'>): string[] {
  const out: string[] = [];
  for (const raw of [screen.unit, screen.section, screen.group, screen.name]) {
    const part = displayNeisPart(raw);
    if (part && out[out.length - 1] !== part) out.push(part);
  }
  return out;
}

// ── 검색 ────────────────────────────────────────────────

/**
 * 비교용 정규화 — 공백·가운뎃점·괄호·구분 기호를 지운다. 메뉴 이름은 띄어쓰기가
 * 제멋대로라(`기여금 기본사항(개인별)` / `과목별출결관리`) 사용자가 친 말과 공백이
 * 다르면 못 찾는다.
 */
export function normalizeNeisText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s·ㆍ・()（）[\]/_\-.,:]+/g, '');
}

const SCORE = {
  nameExact: 100,
  namePrefix: 60,
  name: 40,
  alias: 30,
  inner: 20,
  path: 10,
  purpose: 5,
} as const;

/** 한 낱말이 화면 어디에 걸리는가 — 0 = 안 걸림 */
function scoreToken(screen: NeisScreen, token: string): number {
  const name = normalizeNeisText(screen.name);
  if (name === token) return SCORE.nameExact;
  if (name.startsWith(token)) return SCORE.namePrefix;
  if (name.includes(token)) return SCORE.name;
  if (screen.aliases?.some((alias) => normalizeNeisText(alias).includes(token))) return SCORE.alias;
  if (screen.inner.some((tab) => normalizeNeisText(tab.name).includes(token))) return SCORE.inner;
  if ([screen.unit, screen.section, screen.group].some((part) => normalizeNeisText(part).includes(token))) {
    return SCORE.path;
  }
  if (screen.purpose && normalizeNeisText(screen.purpose).includes(token)) return SCORE.purpose;
  return 0;
}

export interface NeisSearchOptions {
  /** 업무영역으로 좁힌다(없으면 전체) */
  area?: string | null;
  /** 결과 상한 — 목록이 1,500개라 전부 그리면 느리다 */
  limit?: number;
}

/**
 * 띄어쓰기로 나눈 낱말이 **모두** 걸리는 화면만(AND). 점수가 같으면 원본 순서
 * (엑셀 순서 = 나이스 메뉴 순서)를 지킨다 — 정렬이 흔들리면 같은 검색어의 결과가
 * 매번 달라 보인다.
 */
export function searchNeisScreens(
  screens: NeisScreen[],
  query: string,
  options: NeisSearchOptions = {},
): NeisScreen[] {
  const limit = options.limit ?? 80;
  const pool = options.area ? screens.filter((screen) => screen.area === options.area) : screens;
  const tokens = query.split(/\s+/).map(normalizeNeisText).filter(Boolean);
  if (tokens.length === 0) return pool.slice(0, limit);

  const scored: Array<{ screen: NeisScreen; score: number; index: number }> = [];
  pool.forEach((screen, index) => {
    let total = 0;
    for (const token of tokens) {
      const score = scoreToken(screen, token);
      if (score === 0) return;
      total += score;
    }
    scored.push({ screen, score: total, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map((entry) => entry.screen);
}

/** 업무영역 목록 — 원본 순서 */
export function neisAreas(screens: NeisScreen[]): string[] {
  return [...new Set(screens.map((screen) => screen.area))];
}

// ── 실행 설정값(task_action.config.neis) ─────────────────

/**
 * 할 일에 걸어 둔 화면 한 개. 카탈로그를 참조만 하지 않고 **경로를 복사해 둔다** —
 * 메뉴목록을 새로 받으면 화면이 없어지거나 이름이 바뀌는데, 참조만 했다면 이미 만든
 * 할 일이 무엇을 가리켰는지 잃는다.
 */
export interface NeisScreenRef {
  key: string;
  name: string;
  /** [업무영역, 단위업무, 세부업무, 메뉴그룹] */
  path: string[];
  /** 화면 안에서 눌러야 할 탭(선택) */
  innerTab?: string;
}

export interface NeisActionConfig {
  version: 1;
  screens: NeisScreenRef[];
  /** 매니저가 적는 처리 안내 — "과목별 세특 입력 후 마감까지" 같은 것 */
  note?: string;
}

export const NEIS_NOTE_MAX = 1000;
/**
 * 한 작업의 화면 상한. 한 작업에 여러 화면을 담는 것은 괜찮다(2026-09-23 사용자 정정 — 문제는
 * NEIS 작업을 **하나 더 추가할 수 없던 것**이었다, 그건 instance_key 로 풀었다).
 */
export const NEIS_SCREENS_MAX = 10;

export function toNeisScreenRef(screen: NeisScreen, innerTab?: string): NeisScreenRef {
  return {
    key: screen.key,
    name: screen.name,
    path: [screen.area, screen.unit, screen.section, screen.group],
    ...(innerTab ? { innerTab } : {}),
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * `task_action.config` → NEIS 설정. DB 값은 누구든 손댈 수 있으므로 모양을 검사하고,
 * 어긋난 항목은 **그 항목만** 버린다(하나가 깨졌다고 전부 사라지면 안 된다).
 * ⚠️ 에이전트(MCP)는 `toNeisScreenRef` 로 같은 모양을 만든다(`mcpLibraryOps.neisScreenRefs`) — 화면 모양을 바꾸면
 *    묶음을 다시 만들고 mcp 배포 + `scripts/mcp-agent-test/contract.mts --db`.
 */
export function parseNeisActionConfig(config: unknown): NeisActionConfig {
  const raw = (config && typeof config === 'object'
    ? (config as { neis?: unknown }).neis
    : null) as Record<string, unknown> | null | undefined;
  if (!raw || typeof raw !== 'object') return { version: 1, screens: [] };

  const screens: NeisScreenRef[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(raw.screens) ? raw.screens : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const ref = item as Record<string, unknown>;
    if (typeof ref.key !== 'string' || typeof ref.name !== 'string' || !isStringArray(ref.path)) continue;
    if (seen.has(ref.key)) continue;
    seen.add(ref.key);
    screens.push({
      key: ref.key,
      name: ref.name,
      path: ref.path,
      ...(typeof ref.innerTab === 'string' && ref.innerTab ? { innerTab: ref.innerTab } : {}),
    });
    if (screens.length >= NEIS_SCREENS_MAX) break;
  }
  const note = typeof raw.note === 'string' ? raw.note.slice(0, NEIS_NOTE_MAX) : '';
  return { version: 1, screens, ...(note.trim() ? { note } : {}) };
}

/**
 * 기존 config 에 NEIS 설정만 병합한다 — config 에는 다른 키(`origin` 등)가 함께 살 수
 * 있어 통째로 덮으면 조용히 사라진다(`bindTaskAction` 주석의 사고와 같은 부류).
 */
export function mergeNeisActionConfig(
  current: Record<string, unknown> | null | undefined,
  next: NeisActionConfig,
): Record<string, unknown> {
  const normalized = parseNeisActionConfig({ neis: next });
  return { ...(current ?? {}), neis: normalized };
}

/** 목록 카드에 보일 실행 제목 — DB CHECK: 1~120자 */
export function neisActionTitle(config: NeisActionConfig): string {
  const [first, ...rest] = config.screens;
  if (!first) return 'NEIS 업무 화면';
  const title = rest.length > 0 ? `NEIS · ${first.name} 외 ${rest.length}개` : `NEIS · ${first.name}`;
  return title.length > 120 ? `${title.slice(0, 119)}…` : title;
}

/** 화면에 보일 경로(업무영역은 빼고, 연달아 같은 이름은 한 번) */
export function neisRefPath(ref: NeisScreenRef): string[] {
  const [, unit = '', section = '', group = ''] = ref.path;
  return neisScreenPath({ unit, section, group, name: ref.name });
}

/** 누가 이 화면을 보나 — 담임 역할이 없으면 업무분장 담당자 메뉴다 */
export function neisAudienceLabel(roles: NeisRole[]): string {
  return roles.length > 0 ? roles.join(' · ') : '업무분장 담당자';
}
