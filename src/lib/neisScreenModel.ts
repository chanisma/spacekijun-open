// ========================================
// NEIS 화면 지식 — 순수 로직 (2026-10-05)
//
// 나이스 메뉴목록(`neisScreens.ts`)이 **어디에 있는 화면인가**를 답한다면, 이 모듈은
// **그 화면 안에 무엇이 있는가**와 **어떻게 쓰는가**를 답한다. 두 층으로 나눈다.
//
//   수집본(capture)  기계가 화면을 열어 기록한 사실 — 필드·버튼·섹션·그리드 머리글·안내문·
//                    안쪽 탭과 그 자리(좌표). `scripts/neis-kb/collect.py` 가 덮어쓴다.
//   안내(guide)      사람·AI 가 쓴 의미 — 용도·절차·주의. 수집본의 **요소 ID** 를 가리킨다.
//                    재수집해도 덮어쓰지 않는다.
//
// 둘을 섞지 않는 이유: 나이스 화면은 바뀐다. 사실은 다시 긁으면 되지만 의미는 사람이
// 쓴 것이라 날아가면 안 된다. 대신 재수집 뒤 `validateGuide` 가 «안내가 가리키는 요소가
// 화면에서 사라졌다»를 잡아 고칠 자리를 알려 준다.
//
// ⚠️ 수집본에는 **데이터 값을 담지 않는다** — 화면을 여는 것만으로 교원 이름·아이디가
// 그리드에 채워지는 화면이 있다(학급담임편성관리, 2026-10-05 실측). 값 대신 `valueKind`
// (year·grade …)만 남기고, 그리드는 머리글만 남긴다. 스크린샷을 저장하지 않는 것도 같은 이유다.
//
// 이 파일은 React·Vite 에 의존하지 않는다(회귀 테스트·스크립트가 그대로 쓴다).
// ========================================

/** 수집본 스키마 — 모양을 바꾸면 숫자를 올리고 collect.py 의 SCHEMA 와 함께 바꾼다 */
export const NEIS_CAPTURE_SCHEMA = 'neis-capture/1';
export const NEIS_GUIDE_SCHEMA = 'neis-guide/1';

export type NeisBox = [x: number, y: number, w: number, h: number];

export type NeisControl =
  | 'combobox' | 'input' | 'date' | 'number' | 'textarea' | 'search' | 'mask' | 'spinner' | 'file';

/** 값 대신 남기는 «값의 종류» — 자동화할 때 매개변수의 타입이 된다 */
export type NeisValueKind = 'year' | 'semester' | 'grade' | 'class' | 'date' | 'number' | 'text' | 'empty';

export interface NeisGridColumn {
  id: string;
  label: string;
  box: NeisBox;
  /** 머리글 몇째 줄인가(0 = 맨 위) — 묶음 머리글 아래 칸은 1 */
  depth: number;
  /** 묶음 머리글이 덮는 칸 수 */
  span?: number;
}

interface ElementBase {
  /** 화면(view) 안에서 유일한 식별자 — `${kind}:${label}` + 같은 것이 또 있으면 `#2` … */
  id: string;
  label: string;
  /** 나이스가 단 접근성 이름 — 자동화 때 셀렉터가 된다 */
  aria?: string | null;
  /** 화면 루트 기준 CSS px */
  box: NeisBox;
  /** 조회 조건 띠 안인가 */
  region: 'search' | 'body';
  /** 화면을 막 열었을 때 꺼져 있다 — 행을 고르거나 조회해야 켜진다 */
  disabled?: boolean;
}

export interface NeisFieldElement extends ElementBase {
  kind: 'field';
  control: NeisControl;
  required: boolean;
  valueKind: NeisValueKind;
}
export interface NeisButtonElement extends ElementBase {
  kind: 'button';
  variant: 'primary' | 'secondary' | 'plain' | 'link' | 'setting';
}
export interface NeisHeadingElement extends ElementBase { kind: 'heading' }
export interface NeisNoteElement extends ElementBase { kind: 'note' }
export interface NeisCheckElement extends ElementBase { kind: 'check'; checked: boolean }
export interface NeisRadioElement extends ElementBase { kind: 'radio'; options: string[] }
export interface NeisGridElement extends ElementBase {
  kind: 'grid';
  columns: NeisGridColumn[];
  /** 맨 앞에 행 선택 체크박스 칸이 있는가 */
  selectable: boolean;
  /**
   * 나이스가 선언한 칸 수(aria-colcount). 잡은 칸보다 많으면 가로 스크롤 밖 칸이 빠졌을 수 있다
   * (그리드가 보이는 칸만 그린다). 선택 칸·숨은 칸이 들어가 1~2 차이는 흔하다.
   */
  declaredColumns?: number;
}
/**
 * 보고서 뷰어 — 본문이 나이스 컨트롤이 아니라 iframe 안의 출력용 문서다(시간표·급식 통계·출석부 등).
 * [조회]하면 문서가 쪽 단위로 그려지고 위에 쪽 넘김·확대·저장·인쇄·찾기 도구 막대가 붙는다(2026-10-05 실측).
 * 문서 내용은 자료라 수집하지 않는다 — «여기가 보고서»라는 사실만 남긴다.
 */
export interface NeisReportElement extends ElementBase { kind: 'report' }

export interface NeisTabsElement extends ElementBase {
  kind: 'tabs';
  items: string[];
  active: string;
  /** 탭 모양 — 없으면 탭 폴더, `buttons` 면 본문 윗줄의 큰 단계 버튼(전출관리: 요청접수 → … → 학적반영) */
  via?: 'buttons';
}

export type NeisElement =
  | NeisFieldElement | NeisButtonElement | NeisHeadingElement | NeisNoteElement
  | NeisCheckElement | NeisRadioElement | NeisGridElement | NeisTabsElement | NeisReportElement;
export type NeisElementKind = NeisElement['kind'];

export interface NeisCaptureView {
  /** `main` 또는 `tab:<안쪽 탭 이름>`, 조회 후 모습이면 뒤에 `+조회` */
  id: string;
  tab?: string;
  /** `query` = [조회]를 누른 뒤의 모습(본문 구조가 새로 생겼을 때만 따로 남긴다) */
  after?: 'query';
  /**
   * [조회]를 눌러 봤을 때(collect.py --query). 알림은 그 화면의 **선행 조건**이다 —
   * «현재 공시차수 3차는 조사가능일이 아닙니다»(조사 기간에만 열림), «담당자 지정이 되어 있는지 확인»(먼저 할 일).
   * `opened` = 본문 구조가 새로 생겼는가(표에 행만 채워진 것은 아니다).
   */
  query?: { alerts: string[]; opened: boolean };
  /** 화면 루트 크기(CSS px) */
  size: [w: number, h: number];
  elements: NeisElement[];
}

export type NeisCaptureStatus =
  /** 열고 기록했다 */
  | 'ok'
  /** 이 계정의 메뉴 검색에 없다 — 화면이 없어서가 아니라 **권한이 없어서**인 경우가 대부분 */
  | 'not_found'
  /** 2차 인증을 요구해 본문을 볼 수 없었다 */
  | 'auth_required'
  | 'error';

export interface NeisCapture {
  schema: typeof NEIS_CAPTURE_SCHEMA;
  key: string;
  name: string;
  status: NeisCaptureStatus;
  error?: string;
  capturedAt: string;
  collector: string;
  /** 어느 메뉴목록 기준으로 찾아 들어갔나 */
  menuSource: string;
  /** 실제로 연 나이스 메뉴 경로 — `부서장(나이스부) > 교육과정 > …` */
  reachedVia?: string;
  /** 같은 화면이 보이는 다른 상단 탭(검색 결과) */
  alsoVia?: string[];
  viewport?: [w: number, h: number];
  views: NeisCaptureView[];
}

// ── 파일 위치 ───────────────────────────────────────────

/** Windows 가 금지하는 글자와 경로 구분자를 바꾼다. key 의 `/`(`기준/반정보관리`)가 대표적이다 */
function safeSegment(part: string): string {
  // ⚠️ `#`·`%` 도 바꾼다 — 앱은 이 경로를 import 지정자로 쓰는데 `#` 뒤는 URL 조각으로 잘린다.
  // 세부업무 `대입전형#고등학교` 파일 **하나** 때문에 로더 모듈 전체가 500 이 되어 모든 화면의 사용 방법이
  // 함께 죽었다(2026-10-05 — 오류는 개발 서버 로그에만 남고 화면은 그냥 비었다).
  return part.replace(/[<>:"/\\|?*#%]/g, '_').replace(/\s+/g, ' ').trim() || '_';
}

/**
 * 화면 key → 지식 파일 경로(`neis-kb/` 아래 상대 경로, 확장자 없음).
 * `교무학사(고)›교육과정›학사일정관리›학사일정관리` → `교무학사(고)/교육과정/학사일정관리__학사일정관리`
 * 수집기(collect.py)는 이 경로를 직접 계산하지 않고 `targets.json` 에서 받는다 — 규칙이 한 곳에만 있다.
 */
export function neisKbPath(key: string): string {
  const [unit = '_', section = '_', group = '_', name = '_'] = key.split('›');
  return `${safeSegment(unit)}/${safeSegment(section)}/${safeSegment(group)}__${safeSegment(name)}`;
}

// ── 요소 ID ─────────────────────────────────────────────

/**
 * 요소 ID 규칙 — `${kind}:${label}`, 같은 것이 또 있으면 화면 읽는 순서대로 `#2`, `#3`.
 * collect.py 가 같은 규칙으로 ID 를 적고, `validateCapture` 가 다시 계산해 어긋나면 알린다
 * (두 언어에 규칙이 있으므로 어긋남을 잡는 것이 테스트의 일이다).
 */
export function assignElementIds<T extends { kind: string; label: string }>(elements: T[]): string[] {
  const seen = new Map<string, number>();
  return elements.map((element) => {
    const base = `${element.kind}:${element.label}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  });
}

/** 그리드 칸 ID — 묶음 머리글 아래 칸은 `묶음>칸` */
export function gridColumnId(gridLabel: string, path: string[]): string {
  return `col:${gridLabel}/${path.join('>')}`;
}

// ── 버튼 성격 ───────────────────────────────────────────

/**
 * 버튼이 무엇을 하는가 — **이름으로 추정한 것**이다. 자동화의 안전선이 여기 걸린다:
 * AI 는 `read`·`export`·`navigate` 만 스스로 누르고, `write` 는 사람의 확인 없이는 누르지 않는다.
 * 모르면 `write` 로 본다(안전한 쪽으로 틀린다).
 */
export type NeisButtonEffect = 'read' | 'export' | 'navigate' | 'write';

const EFFECT_RULES: Array<[RegExp, NeisButtonEffect]> = [
  // 먼저 본다 — `조회취소`·`출력설정저장` 같은 합성어가 앞 규칙에 먹히지 않게 쓰기를 앞에 둔다
  [/저장|삭제|마감|확정|반영|등록|생성|이관|전송|상신|승인|반려|추가|일괄|부여|배정|편성|적용|해제|복사|가져오기|올리기|초기화|채점|산출|정정|변경|수정|입력|처리|요청|접수|취소|발급|연계|재연계|잠금/, 'write'],
  [/출력|엑셀|다운로드|내려받기|인쇄|미리보기|PDF|한글/i, 'export'],
  [/조회|검색|찾기|보기|확인$|현황|통계/, 'read'],
  [/닫기|이전|다음|펼치기|접기|전체화면/, 'navigate'],
];

export function neisButtonEffect(label: string): NeisButtonEffect {
  const text = label.replace(/\s+/g, '');
  for (const [pattern, effect] of EFFECT_RULES) if (pattern.test(text)) return effect;
  return 'write';
}

export const NEIS_EFFECT_LABEL: Record<NeisButtonEffect, string> = {
  read: '조회',
  export: '출력·내려받기',
  navigate: '이동',
  write: '자료를 바꿈',
};

// ── 수집본 읽기 ─────────────────────────────────────────

export interface NeisValidationIssue {
  level: 'error' | 'warn';
  where: string;
  message: string;
}

/**
 * 수집본이 약속한 모양인가 — 파일은 다른 프로그램(파이썬)이 쓴 것이라 «우리가 쓴 값»이 아니다.
 * 특히 ID 규칙이 두 언어에 있으므로 다시 계산해 대조한다.
 */
export function validateCapture(capture: NeisCapture): NeisValidationIssue[] {
  const issues: NeisValidationIssue[] = [];
  if (capture.schema !== NEIS_CAPTURE_SCHEMA) {
    issues.push({ level: 'error', where: capture.key, message: `스키마가 다릅니다: ${capture.schema}` });
  }
  if (capture.status === 'ok' && capture.views.length === 0) {
    issues.push({ level: 'error', where: capture.key, message: '열었다고 했는데 화면(view)이 없습니다' });
  }
  const viewIds = new Set<string>();
  for (const view of capture.views) {
    const where = `${capture.key} · ${view.id}`;
    if (viewIds.has(view.id)) issues.push({ level: 'error', where, message: '같은 view id 가 둘입니다' });
    viewIds.add(view.id);
    const expected = assignElementIds(view.elements);
    view.elements.forEach((element, index) => {
      if (element.id !== expected[index]) {
        issues.push({ level: 'error', where, message: `요소 ID 규칙 불일치: ${element.id} ≠ ${expected[index]}` });
      }
      if (element.kind === 'grid') {
        const cols = new Set<string>();
        for (const column of element.columns) {
          if (cols.has(column.id)) issues.push({ level: 'warn', where, message: `그리드 칸 ID 중복: ${column.id}` });
          cols.add(column.id);
        }
      }
    });
  }
  return issues;
}

/** 화면 view 하나에서 ID 로 요소·그리드 칸을 찾는다 */
export function findNeisTarget(
  view: NeisCaptureView,
  target: string,
): { element: NeisElement; column?: NeisGridColumn } | null {
  for (const element of view.elements) {
    if (element.id === target) return { element };
    if (element.kind === 'grid') {
      const column = element.columns.find((col) => col.id === target);
      if (column) return { element, column };
    }
    if (element.kind === 'tabs' && target.startsWith('tab:') && element.items.includes(target.slice(4))) {
      return { element };
    }
  }
  return null;
}

/**
 * 구조 지문 — 값·좌표를 빼고 «무엇이 있는가»만으로 만든다. 재수집 때 지문이 같으면
 * 안내를 다시 볼 필요가 없고, 다르면 안내의 `basedOn` 과 비교해 «검토 필요»가 된다.
 * 좌표를 넣지 않는 이유: 창 크기만 달라도 바뀌어 거짓 경보가 난다.
 */
export function neisCaptureFingerprint(capture: Pick<NeisCapture, 'views'>): string {
  const parts: string[] = [];
  for (const view of capture.views) {
    parts.push(`[${view.id}]`);
    for (const element of view.elements) {
      parts.push(element.id);
      if (element.kind === 'grid') parts.push(...element.columns.map((column) => column.id));
      if (element.kind === 'tabs') parts.push(...element.items.map((item) => `tab:${item}`));
    }
  }
  return fnv1a(parts.join('\n'));
}

/** 짧고 결정적인 해시(FNV-1a 32bit) — 보안용이 아니라 «바뀌었나»를 보는 용도 */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// ── 안내(guide) ─────────────────────────────────────────

export type NeisGuideSource =
  /** 화면을 실제로 써 보고 적었다 */
  | 'observed'
  /** 나이스 매뉴얼·도움말에서 옮겼다 */
  | 'manual'
  /** AI 가 수집본을 보고 쓴 초안 — 사람이 검토하기 전에는 «초안»으로 보인다 */
  | 'ai-draft';

/**
 * 안내의 한 단계 = 사용 방법 모달(`WalkthroughDialog`)의 한 장. 왼쪽 시연은 `targets` 로
 * 포인터가 가는 자리를 정하고, 오른쪽은 `text`(제목)·`detail`(문단)·`points`(요점)를 쓴다.
 * 글은 시연을 되풀이하지 않는다 — «왜 그렇게 되어 있는지·오해하기 쉬운 것·모르면 손해 보는 것».
 */
export interface NeisGuideStep {
  /** 단계 표시줄의 짧은 이름(2~5자) — 없으면 첫 대상의 라벨 */
  label?: string;
  /** 한 줄 — 이 단계에서 하는 일 */
  text: string;
  /** 한 문단 — 왜 그렇게 하는지 */
  detail?: string;
  /** 요점 3~4개 */
  points?: string[];
  /** 요소 ID(`field:학년도`)·그리드 칸 ID(`col:…`)·안쪽 탭(`tab:…`) — 포인터가 차례로 누른다 */
  target?: string;
  targets?: string[];
}

/** 단계가 가리키는 대상 전부 — `target` 하나와 `targets` 여럿을 함께 받는다 */
export function neisStepTargets(step: NeisGuideStep): string[] {
  return [...(step.target ? [step.target] : []), ...(step.targets ?? [])];
}

export interface NeisGuideFlow {
  title: string;
  /** 어느 view 에서 하는 일인가 — 없으면 첫 view */
  view?: string;
  /** 언제 하는 일인가 — `3월 학기 초`, `매 학기말` */
  when?: string;
  steps: NeisGuideStep[];
}

export interface NeisGuide {
  schema: typeof NEIS_GUIDE_SCHEMA;
  key: string;
  /** 한 줄 용도 */
  purpose: string;
  /** 업무 맥락 — 이 화면이 학교 업무 흐름의 어디에 있는가 */
  context?: string;
  flows: NeisGuideFlow[];
  cautions?: string[];
  related?: Array<{ key: string; why: string }>;
  /** 화면 지식이 어디서 왔나 */
  source: NeisGuideSource;
  author?: string;
  writtenAt: string;
  reviewedAt?: string;
  /** 안내를 쓸 때 본 수집본의 지문 — 재수집으로 지문이 바뀌면 검토 대상이 된다 */
  basedOn?: string;
  // ── 업무 맥락(2026-10-11, 나이스 사용자 설명서에서) — 화면 구조로는 알 수 없는 것 ──
  /** 누가 하는 일인가 — 설명서의 «업무담당». 학교마다 다를 수 있다(설명서 일러두기) */
  who?: string;
  /** 이 화면을 쓰기 전에 끝나 있어야 하는 일 — «선행처리». 모르면 «화면이 비어 있다»로 막힌다 */
  before?: string[];
  /** 이 화면 다음에 이어지는 일 — «후행처리» */
  after?: string[];
  /** 현장 문의와 나이스지원 답변 — 설명서의 묻고 답하기 */
  faq?: NeisGuideFaq[];
  /** 근거 — 설명서의 절·쪽(`neis-kb/manual/` 의 절 ID) */
  refs?: NeisGuideRef[];
}

export interface NeisGuideFaq {
  q: string;
  a: string;
}

export interface NeisGuideRef {
  /** `neis-kb/manual/*.json` 의 절 ID(`2-06` = 2장 6절) */
  section: string;
  title: string;
  /** 설명서 인쇄 쪽 — `151-161` */
  pages: string;
}

/**
 * 안내가 수집본과 맞는가 — 재수집 뒤 돌린다.
 *   error = 가리키는 요소가 사라졌다(나이스 화면이 바뀌었다) → 안내를 고쳐야 한다
 *   warn  = 지문이 바뀌었다(요소는 남아 있지만 화면 구성이 달라졌다) → 다시 읽어 볼 것
 */
export function validateGuide(guide: NeisGuide, capture: NeisCapture | null): NeisValidationIssue[] {
  const issues: NeisValidationIssue[] = [];
  const where = guide.key;
  if (guide.schema !== NEIS_GUIDE_SCHEMA) issues.push({ level: 'error', where, message: `스키마가 다릅니다: ${guide.schema}` });
  if (!capture) {
    issues.push({ level: 'warn', where, message: '수집본이 없습니다 — 안내의 대상 요소를 확인할 수 없습니다' });
    return issues;
  }
  if (capture.status !== 'ok') {
    issues.push({ level: 'warn', where, message: `수집본 상태가 ${capture.status} 입니다` });
    return issues;
  }
  const fingerprint = neisCaptureFingerprint(capture);
  if (guide.basedOn && guide.basedOn !== fingerprint) {
    issues.push({ level: 'warn', where, message: `화면 구성이 바뀌었습니다(${guide.basedOn} → ${fingerprint}) — 안내를 다시 읽어 보세요` });
  }
  for (const flow of guide.flows) {
    const view = flow.view
      ? capture.views.find((item) => item.id === flow.view)
      : capture.views[0];
    if (!view) {
      issues.push({ level: 'error', where, message: `「${flow.title}」의 view(${flow.view})가 화면에 없습니다` });
      continue;
    }
    for (const step of flow.steps) {
      for (const target of neisStepTargets(step)) {
        if (!findNeisTarget(view, target)) {
          issues.push({ level: 'error', where, message: `「${flow.title}」이 가리키는 ${target} 이(가) ${view.id} 에 없습니다` });
        }
      }
    }
  }
  return issues;
}

/** 안내 파일 모양 검사 — 깨진 항목은 그 항목만 버린다(하나 때문에 안내 전체가 사라지면 안 된다) */
export function parseNeisGuide(raw: unknown): NeisGuide | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.schema !== NEIS_GUIDE_SCHEMA || typeof value.key !== 'string' || typeof value.purpose !== 'string') return null;
  const flows: NeisGuideFlow[] = [];
  for (const item of Array.isArray(value.flows) ? value.flows : []) {
    if (!item || typeof item !== 'object') continue;
    const flow = item as Record<string, unknown>;
    if (typeof flow.title !== 'string' || !Array.isArray(flow.steps)) continue;
    const steps = flow.steps
      .filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === 'object')
      .filter((step) => typeof step.text === 'string')
      .map((step): NeisGuideStep => {
        const targets = Array.isArray(step.targets) ? step.targets.filter((t): t is string => typeof t === 'string' && Boolean(t)) : [];
        const points = Array.isArray(step.points) ? step.points.filter((t): t is string => typeof t === 'string') : [];
        return {
          text: step.text as string,
          ...(typeof step.label === 'string' && step.label ? { label: step.label } : {}),
          ...(typeof step.detail === 'string' && step.detail ? { detail: step.detail } : {}),
          ...(points.length ? { points } : {}),
          ...(typeof step.target === 'string' && step.target ? { target: step.target } : {}),
          ...(targets.length ? { targets } : {}),
        };
      });
    flows.push({
      title: flow.title,
      steps,
      ...(typeof flow.view === 'string' ? { view: flow.view } : {}),
      ...(typeof flow.when === 'string' ? { when: flow.when } : {}),
    });
  }
  const source = (['observed', 'manual', 'ai-draft'] as const).find((item) => item === value.source) ?? 'ai-draft';
  const strings = (list: unknown) => (Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : []);
  const records = <T extends string>(list: unknown, fields: readonly T[]) =>
    (Array.isArray(list) ? list : []).filter((item): item is Record<T, string> =>
      Boolean(item) && typeof item === 'object'
      && fields.every((field) => typeof (item as Record<string, unknown>)[field] === 'string'))
      .map((item) => Object.fromEntries(fields.map((field) => [field, item[field]])) as Record<T, string>);
  const before = strings(value.before);
  const after = strings(value.after);
  const faq = records(value.faq, ['q', 'a'] as const);
  const refs = records(value.refs, ['section', 'title', 'pages'] as const);
  return {
    schema: NEIS_GUIDE_SCHEMA,
    key: value.key,
    purpose: value.purpose,
    ...(typeof value.context === 'string' ? { context: value.context } : {}),
    flows,
    cautions: strings(value.cautions),
    related: (Array.isArray(value.related) ? value.related : [])
      .filter((r): r is { key: string; why: string } =>
        Boolean(r) && typeof (r as { key?: unknown }).key === 'string' && typeof (r as { why?: unknown }).why === 'string'),
    source,
    ...(typeof value.author === 'string' ? { author: value.author } : {}),
    writtenAt: typeof value.writtenAt === 'string' ? value.writtenAt : '',
    ...(typeof value.reviewedAt === 'string' ? { reviewedAt: value.reviewedAt } : {}),
    ...(typeof value.basedOn === 'string' ? { basedOn: value.basedOn } : {}),
    ...(typeof value.who === 'string' && value.who ? { who: value.who } : {}),
    ...(before.length ? { before } : {}),
    ...(after.length ? { after } : {}),
    ...(faq.length ? { faq } : {}),
    ...(refs.length ? { refs } : {}),
  };
}

// ── 그리기 보조 ─────────────────────────────────────────

/**
 * 와이어프레임에 그릴 영역 — 화면 머리(제목·도구 단추)는 수집하지 않으므로 요소들이 실제로
 * 차지한 범위만 잘라 그린다. 여백을 조금 둔다.
 */
/** 필드 라벨을 컨트롤 왼쪽에 그릴 자리(폭 140 + 간격 8) — 그림(NeisViewLayer)과 범위 계산이 함께 쓴다 */
export const NEIS_SIDE_LABEL_SPACE = 148;

export function neisViewBounds(view: NeisCaptureView, pad = 12): NeisBox {
  if (view.elements.length === 0) return [0, 0, view.size[0], Math.min(view.size[1], 200)];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const element of view.elements) {
    const [x, y, w, h] = element.box;
    // 필드·라디오의 라벨은 컨트롤 왼쪽에 그린다(수집본에 라벨 자리는 없다) — 범위에 넣지 않으면 잘린다
    const labelX = element.kind === 'field' || element.kind === 'radio' ? x - NEIS_SIDE_LABEL_SPACE : x;
    minX = Math.min(minX, labelX); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  return [x, y, Math.min(view.size[0], maxX + pad) - x, maxY + pad - y];
}

/** 수집 상태를 사람 말로 */
export function neisCaptureStatusLabel(status: NeisCaptureStatus): string {
  switch (status) {
    case 'ok': return '화면 구조 수집됨';
    case 'not_found': return '수집 계정에 이 메뉴가 없음';
    case 'auth_required': return '2차 인증이 필요한 화면';
    default: return '수집 실패';
  }
}

/** 할 일에 지정한 «화면 안 탭»(메뉴목록 표기) → 수집본의 view id. 띄어쓰기가 서로 달라 정규화해 맞춘다 */
export function neisViewForInnerTab(capture: Pick<NeisCapture, 'views'>, innerTab?: string): string | undefined {
  if (!innerTab) return undefined;
  const want = innerTab.replace(/[\s·ㆍ()（）]/g, '');
  return capture.views.find((view) => (view.tab ?? '').replace(/[\s·ㆍ()（）]/g, '') === want)?.id;
}

export const NEIS_VALUE_KIND_LABEL: Record<NeisValueKind, string> = {
  year: '학년도',
  semester: '학기',
  grade: '학년',
  class: '반',
  date: '날짜',
  number: '숫자',
  text: '선택·입력',
  empty: '비어 있음',
};

export const NEIS_CONTROL_LABEL: Record<NeisControl, string> = {
  combobox: '선택 상자',
  input: '입력칸',
  date: '날짜 입력',
  number: '숫자 입력',
  textarea: '여러 줄 입력',
  search: '검색 입력',
  mask: '형식 입력',
  spinner: '숫자 증감',
  file: '파일 올리기',
};

/** 요소 하나를 사람 말로 — 와이어프레임에서 요소를 눌렀을 때 보이는 설명 */
export function describeNeisElement(element: NeisElement): string {
  switch (element.kind) {
    case 'field':
      return `${NEIS_CONTROL_LABEL[element.control]}${element.required ? ' · 필수' : ''}`
        + `${element.valueKind !== 'empty' && element.valueKind !== 'text' ? ` · ${NEIS_VALUE_KIND_LABEL[element.valueKind]} 값` : ''}`;
    case 'button':
      return `버튼 · ${NEIS_EFFECT_LABEL[neisButtonEffect(element.label)]}`;
    case 'grid':
      return `표 · 칸 ${element.columns.filter((col) => !element.columns.some((c) => c.depth > col.depth && c.id.startsWith(`${col.id}>`))).length}개${element.selectable ? ' · 행 선택 체크' : ''}`;
    case 'heading': return '구역 제목';
    case 'note': return '화면 안내문';
    case 'check': return `체크 상자${element.checked ? ' · 처음에 켜짐' : ''}`;
    case 'radio': return `하나 고르기 · ${element.options.join(' / ')}`;
    case 'tabs': return `화면 안 탭 ${element.items.length}개`;
    case 'report': return '보고서 뷰어 — 조회하면 출력용 문서가 그려진다(쪽 넘김·확대·저장·인쇄·찾기)';
  }
}

/**
 * 세로 접기 — 나이스 그리드는 화면 높이를 다 채워 그림의 대부분이 빈 «자료 영역»이 된다.
 * 다른 요소가 하나도 걸치지 않은 그리드 몸통 구간만 `limit` px 로 줄이는 구간별 사상을 돌려준다.
 * 요소의 위아래 끝은 그대로 이어지므로 배치(무엇이 무엇 옆·아래에 있나)는 바뀌지 않는다.
 */
export function neisVerticalMap(view: NeisCaptureView, limit = 120): { map: (y: number) => number; height: number } {
  const bodies: Array<[number, number]> = [];
  const spans: Array<[number, number]> = [];
  const points = new Set<number>();
  for (const element of view.elements) {
    const [, y, , h] = element.box;
    points.add(y);
    points.add(y + h);
    if (element.kind === 'grid') {
      const headerBottom = Math.max(y + 30, ...element.columns.map((c) => c.box[1] + c.box[3]));
      points.add(headerBottom);
      bodies.push([headerBottom, y + h]);
    } else {
      spans.push([y, y + h]);
    }
  }
  const sorted = [...points].sort((a, b) => a - b);
  const segments: Array<{ from: number; to: number; length: number }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const [a, b] = [sorted[i], sorted[i + 1]];
    const mid = (a + b) / 2;
    const empty = bodies.some(([s, e]) => mid > s && mid < e) && !spans.some(([s, e]) => mid > s && mid < e);
    segments.push({ from: a, to: b, length: empty ? Math.min(b - a, limit) : b - a });
  }
  const map = (y: number) => {
    if (sorted.length === 0 || y <= sorted[0]) return y;
    let out = sorted[0];
    for (const segment of segments) {
      if (y <= segment.from) break;
      const part = Math.min(y, segment.to) - segment.from;
      out += (part * segment.length) / (segment.to - segment.from || 1);
    }
    if (y > sorted[sorted.length - 1]) out += y - sorted[sorted.length - 1];
    return out;
  };
  return { map, height: map(view.size[1]) };
}

/**
 * 조회해야 본문이 그려지는 화면인가 — 조회 조건과 [조회]는 있는데 본문 요소가 하나도 없다.
 * 정보공시 «자료등록»처럼 화면을 막 열면 본문 자리가 통째로 비어 있는 화면이 많다(2026-10-05 실측).
 * 수집 실패가 아니라 화면의 성질이다 — 본문 구조를 알려면 [조회]를 눌러야 한다.
 */
export function neisBodyAfterQuery(view: NeisCaptureView): boolean {
  if (view.after === 'query') return false;
  const hasQuery = view.elements.some((e) => e.kind === 'button' && e.label === '조회');
  const body = view.elements.filter((e) => e.region === 'body' && e.kind !== 'tabs' && e.kind !== 'note');
  return hasQuery && body.length === 0;
}
