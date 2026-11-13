/**
 * 작업 「외부 시스템에서 처리」(`external.screen`) — 설정값의 단일 출처 (2026-09-24).
 *
 * 왜 `neis.screen` 을 일반화하지 않고 유형을 하나 더 두는가:
 *   NEIS 는 **화면 1,384개짜리 카탈로그**를 갖고 있어서 «고르는» 경험이고(동적 import 383KB),
 *   에듀파인·리로스쿨·교육청 업무포털에는 그런 목록이 없어 «적는» 경험이다. 한 유형에 합치면
 *   설정 화면이 «카탈로그가 있는 시스템인가»를 먼저 묻는 갈림길부터 시작하고, NEIS 쪽 라이브
 *   15건의 설정 모양(`config.neis`)도 건드려야 한다. 저장 칸을 나누면 둘 다 안 건드린다.
 *
 * 실측 근거: 라이브 작업 30건의 절반(15건)이 `neis.screen` 이다 — 학교 업무의 본체는
 * «밖에 나가서 사람이 처리하는 일»인데, 지금은 **NEIS 밖을 가리킬 방법이 아예 없다**.
 *
 * 저장 = `task_action.config.external`. 쓰기 RLS 가 `created_by` 전용이라 연결을 만든
 * 사람만 바꾼다(NEIS 와 같다).
 *
 * ⚠️ 에이전트(MCP `public.mcp_add_action`·`mcp_update_action`)도 이 모양으로 쓴다 — 칸을 바꾸면 그 SQL 도 고치고
 *    scripts/mcp-agent-test/contract.mts --db 로 확인할 것.
 */

/** 자주 쓰는 시스템 — 고르면 이름이 채워진다. 목록에 없으면 직접 적는다(닫힌 목록이 아니다) */
/**
 * 자주 쓰는 시스템 — **실측 순서**다 (2026-09-25).
 *
 * 공문 본문을 읽은 19개 업무의 제출 방법을 세 보니 교데통 **25%** · 온라인 설문 **20%** ·
 * 공문(업무관리) 17% · K-에듀파인 5% · **나이스 4%** 였다
 * (`docs/plans/2026-09-25-work-efficiency-research.md` §2-⑥).
 *
 * ⚠️ 1·2위인 교데통·온라인 설문이 **목록에 없었다** — 나이스만 전용 기능(`neis.screen`,
 * 메뉴 1,384개)을 만들어 두고 정작 제출의 45%를 가리키는 자리가 비어 있었다.
 * **무엇을 지원할지 정할 때는 실제 쓰임을 먼저 셀 것.**
 */
export const EXTERNAL_SYSTEM_PRESETS = [
  { name: '교육행정데이터통합관리(교데통)', url: '' },
  { name: '온라인 설문·URL', url: '' },
  { name: '교육청 업무포털', url: '' },
  { name: 'K-에듀파인', url: 'https://klef.go.kr' },
  { name: '교육시설통합정보망', url: '' },
  { name: '리로스쿨', url: 'https://www.riroschool.kr' },
  { name: '나이스 대국민서비스', url: 'https://www.neis.go.kr' },
  { name: '에듀파인(구)', url: '' },
] as const;

export interface ExternalScreenRef {
  /** 화면·메뉴 이름 — "지출품의 등록" 같은 것 */
  name: string;
  /** 메뉴 경로(선택) — "학교회계 > 지출 > 품의" 처럼 사람이 적는다 */
  path?: string;
  /** 바로 열 수 있는 주소(선택). http(s) 만 받는다 */
  url?: string;
}

export interface ExternalActionConfig {
  version: 1;
  /** 어느 시스템인가 — 이것이 비면 작업이 아무것도 가리키지 못한다 */
  system: string;
  /** 시스템 대문 주소(선택) */
  systemUrl?: string;
  screens: ExternalScreenRef[];
  /** 매니저가 적는 처리 안내 */
  note?: string;
}

export const EXTERNAL_NOTE_MAX = 1000;
export const EXTERNAL_SCREENS_MAX = 10;
export const EXTERNAL_NAME_MAX = 120;

/**
 * 주소는 **http(s) 만** 받는다.
 * ⚠️ `javascript:` 같은 것을 그대로 링크에 넣으면 누르는 순간 스크립트가 된다 —
 * 설정값은 다른 교직원이 적은 것이라 «우리가 쓴 값»이 아니다.
 */
export function safeExternalUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : '';
  } catch {
    return '';
  }
}

function readText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function parseExternalActionConfig(config: unknown): ExternalActionConfig {
  const raw = ((config ?? {}) as { external?: unknown }).external as Record<string, unknown> | undefined;
  const screensRaw = Array.isArray(raw?.screens) ? raw!.screens : [];
  const screens: ExternalScreenRef[] = [];
  for (const item of screensRaw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = readText(row.name, EXTERNAL_NAME_MAX);
    if (!name) continue;
    const path = readText(row.path, EXTERNAL_NAME_MAX);
    const url = safeExternalUrl(row.url);
    screens.push({ name, ...(path ? { path } : {}), ...(url ? { url } : {}) });
    if (screens.length >= EXTERNAL_SCREENS_MAX) break;
  }
  return {
    version: 1,
    system: readText(raw?.system, EXTERNAL_NAME_MAX),
    ...(safeExternalUrl(raw?.systemUrl) ? { systemUrl: safeExternalUrl(raw?.systemUrl) } : {}),
    screens,
    ...(readText(raw?.note, EXTERNAL_NOTE_MAX) ? { note: readText(raw?.note, EXTERNAL_NOTE_MAX) } : {}),
  };
}

/** 저장할 config 조각 — `mergeTaskActionConfig` 에 그대로 넘긴다(다른 키는 보존된다) */
export function buildExternalActionPatch(next: ExternalActionConfig): Record<string, unknown> {
  const clean = parseExternalActionConfig({ external: next });
  return { external: clean };
}

/**
 * 작업 제목 — 목록에서 «무엇을 가리키는지»가 제목만으로 읽혀야 한다.
 * 시스템을 아직 안 정했으면 그렇게 말한다(빈 제목보다 낫다).
 */
export function externalActionTitle(config: ExternalActionConfig): string {
  if (!config.system) return '외부 시스템 — 미지정';
  if (config.screens.length === 0) return config.system;
  if (config.screens.length === 1) return `${config.system} · ${config.screens[0].name}`;
  return `${config.system} · ${config.screens[0].name} 외 ${config.screens.length - 1}개`;
}

/** 관리 보기 한 줄 요약 — 설정이 덜 됐으면 무엇이 빠졌는지 말한다 */
export function externalActionSummary(config: ExternalActionConfig): string {
  if (!config.system) return '시스템 미지정 — 설정에서 어디서 처리하는지 적으세요';
  if (config.screens.length === 0) {
    return `${config.system}${config.note ? ' · 안내 있음' : ' · 화면 미지정'}`;
  }
  return `${config.system} · 화면 ${config.screens.length}개${config.note ? ' · 안내 있음' : ''}`;
}

/** 설정이 담당자에게 쓸모 있는 상태인가 — 시스템 이름만이라도 있어야 한다 */
export function isExternalActionConfigured(config: ExternalActionConfig): boolean {
  return config.system.trim().length > 0;
}

/**
 * 시스템 칩을 바꿀 때의 주소. 새 칩에 주소가 있으면 그것, 없으면 — 지금 주소가 **앞 칩의 기본 주소**였다면 비우고
 * (그대로 두면 «교데통 열기»가 에듀파인을 연다), 사람이 직접 적은 주소면 지킨다.
 */
export function presetUrlAfterSwitch(prevSystem: string, prevUrl: string | undefined, nextPresetUrl: string): string {
  if (nextPresetUrl) return nextPresetUrl;
  const prevPresetUrl = EXTERNAL_SYSTEM_PRESETS.find((preset) => preset.name === prevSystem)?.url ?? '';
  return prevUrl && prevUrl !== prevPresetUrl ? prevUrl : '';
}
