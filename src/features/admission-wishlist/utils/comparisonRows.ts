// 지망 비교표의 **행 정의 단일 출처**.
//
// 화면 렌더·인쇄·엑셀 내보내기가 모두 이 정의를 읽는다. 행 목록을 화면과 내보내기에
// 각각 적으면 "화면엔 있는데 엑셀엔 없는 항목"이 조용히 생기고, 상담 자료로 뽑은
// 파일이 화면과 다른 문서가 된다.
//
// 각 행은 `text()` 를 **항상** 가진다(내보내기·인쇄가 쓰는 평문). 배지처럼 모양이
// 필요한 행만 화면에서 별도 렌더를 얹는다.
//
// React 비의존 순수 모듈 — Node 회귀 테스트가 그대로 import 한다.

import type { WishlistItem, CsatCheckValue } from '../types';
import { selectSubjectVariant } from './naesinRule';
import { FIT_LABELS, TRACK_LABELS } from '../types';
import { CSAT_LABELS } from './csat';
import {
  CSAT_ROUND_MONTHS, HISTORY_YEARS, yearStatsOf,
  type HistoryYear, type ItemInsight,
} from './itemInsight';
import {
  changesFullText, summarizeChanges, type AdmissionChange,
} from './admissionChange';
import {
  announceSummary, formatExamDate, formatSchedule, formatSchedules,
  isMySchedule, matchesAdmissionName, resolveAnnounceDate, scheduleRelevance,
  type AdmissionSchedule,
} from './admissionSchedule';
import {
  MULTI_APPLY_LABELS, multiApplyWarning, urlHost,
  type UnivInfoMatch,
} from './admissionUnivInfo';

/** 한 열(=한 지망)의 데이터 */
export interface ComparisonColumn {
  item: WishlistItem;
  insight: ItemInsight;
  /** 사용자가 편집 중인 값 (저장 전 초안). 없으면 item 의 저장값 */
  draft?: PlanDraft;
  /**
   * 이 대학의 전형 변경사항 (`get_admission_changes`).
   * **`undefined` = 아직 안 불러옴 / `[]` = 자료 없음**을 구분해야 한다 —
   * 자료 출처가 전국 주요 대학 64곳뿐이라 빈 배열이 "변경 없음"을 뜻하지 않는다.
   */
  changes?: AdmissionChange[];
  /**
   * 이 대학의 고사 일정 (`get_admission_schedules`).
   * `changes` 와 같은 규칙 — **`undefined` = 아직 안 불러옴 / `[]` = 자료 없음**.
   */
  schedules?: AdmissionSchedule[];
  /** 일정 날짜의 기준 연도 (원본이 월·일만 담고 있어 밖에서 받아야 한다) */
  scheduleYear?: number;
  /**
   * 이 대학의 기본 정보 — 입학처 사이트·복수지원 (`get_admission_university_info`).
   * 다른 자료와 같은 규칙 — **`undefined` = 아직 안 불러옴 / 매칭 실패는 `info: null`**.
   */
  univInfo?: UnivInfoMatch;
  /**
   * **이 학생의 지망 목록**에 같은 대학이 몇 곳 들어 있는지 (자기 자신 포함).
   *
   * 복수지원은 **한 사람의 6칸** 안의 문제다 — 표가 한 학생의 지망만 담으므로
   * 열들을 세면 그대로 이 값이 된다. 자료 혼자서는 "본교 내 3회까지"라고만 말하지만
   * 이 숫자와 대면 실제로 넘겼는지 알 수 있다.
   */
  sameUniversityCount?: number;
}

/**
 * 사용자가 직접 입력하는 항목의 초안.
 * 수능최저 판정 2개는 `''`(=자동 판정을 따름) | `'meet'` | `'fail'` 세 값을 갖는다 —
 * 빈 문자열이 곧 "저장된 수동 판정 없음"이라 저장 시 NULL 로 내려간다.
 */
export interface PlanDraft {
  convertedScore: string;
  interviewDate: string;
  firstAnnounceDate: string;
  finalAnnounceDate: string;
  memo: string;
  csatCheck6: string;
  csatCheck9: string;
}

/** 편집 가능한 필드 키 */
export type PlanField = keyof PlanDraft;

/**
 * 셀을 눌렀을 때 펼칠 **근거**.
 *
 * 표의 칸은 좁아 요약만 담기지만, 상담에서는 "왜 그런가"를 바로 대야 한다
 * (어느 과목이 반영됐는지, 어느 영역 등급 합으로 충족을 판정했는지, 원문이 뭔지).
 * JSX 가 아니라 **데이터로** 돌려주므로 이 모듈은 순수하게 남고 회귀 테스트가 검사할 수 있다.
 */
export interface CellDetail {
  title: string;
  /** 부제 (대학·학과 등 맥락) */
  subtitle?: string;
  sections: CellDetailSection[];
}

export interface CellDetailSection {
  heading?: string;
  /** 문단 (원문 등) */
  text?: string;
  /** 목록 — `label` 은 왼쪽, `value` 는 오른쪽에 정렬해 그린다 */
  items?: Array<{ label: string; value?: string; muted?: boolean }>;
  /** 옅은 안내문 */
  note?: string;
}

export type RowKind =
  | 'plain' | 'fit' | 'grade' | 'csatRound' | 'edit' | 'changes' | 'schedule'
  /** 바깥 사이트로 나가는 링크 (입학처) — `<a target="_blank">` 로 그린다 */
  | 'link'
  /** 복수지원 — 상한을 넘겼으면 색으로 경고한다 */
  | 'multiApply';

/**
 * 표의 영역.
 *
 * 행을 한 줄로 늘어놓으면 30줄이 넘어 "지금 보는 게 내신 얘기인지 수능 얘기인지"가
 * 사라진다. 판단의 축(내신 / 수능최저 / 경쟁 / 일정)으로 묶어야 상담 중에 원하는
 * 구간으로 바로 눈이 간다.
 */
export type RowSection = 'basic' | 'naesin' | 'csat' | 'competition' | 'change' | 'schedule' | 'note';

export const SECTION_ORDER: RowSection[] = [
  // 경쟁률이 내신보다 앞인 이유(2026-09-01 사용자 결정): 지원 여부를 가릴 때
  // 모집인원·경쟁률을 먼저 보고 그다음에 내 성적을 대 본다.
  'basic', 'competition', 'naesin', 'csat', 'change', 'schedule', 'note',
];

export const SECTION_LABELS: Record<RowSection, string> = {
  basic: '기본 정보',
  naesin: '내신',
  csat: '수능최저',
  competition: '전형·경쟁률',
  change: '전형 변경사항',
  schedule: '일정',
  note: '메모',
};

/** 영역별 한 줄 설명 (헤더 우측 옅은 글씨) */
export const SECTION_HINTS: Record<RowSection, string> = {
  basic: '',
  naesin: '내 성적으로 판단하는 축',
  csat: '수능 성적으로 판단하는 축',
  competition: '어디가 공개 자료 · 과년도 3개년',
  change: '전국 주요 대학 64곳 한정',
  schedule: '대학별고사 일정 자료 · 직접 입력이 우선',
  note: '',
};

export interface ComparisonRow {
  key: string;
  /** 어느 영역에 속하는지 (표가 영역 머리글로 구분해 그린다) */
  section: RowSection;
  /** 좌측 '항목' 열 라벨 */
  label: string;
  /** 좌측 '세부' 열 (연도·회차). 없으면 label 이 두 열을 합쳐 차지한다 */
  sub?: string;
  /** 같은 label 을 rowSpan 으로 묶기 위한 그룹 키 */
  group?: string;
  kind: RowKind;
  /** 편집 행일 때 대상 필드 */
  field?: PlanField;
  /**
   * 편집 행 입력 타입.
   * `textarea` 는 **내용에 맞춰 높이가 자라는** 여러 줄 입력 — 메모처럼 길이를 미리
   * 알 수 없는 칸에 쓴다. 한 줄 `text` 로 두면 적은 내용이 좌우로 흘러 나가 보이지 않고,
   * 인쇄물에서는 아예 잘린다.
   */
  inputType?: 'text' | 'date' | 'textarea';
  /** 편집 행 자리표시자 */
  placeholder?: string;
  /** 평문 값 — 화면·인쇄·엑셀 공통 */
  text: (col: ComparisonColumn) => string;
  /**
   * 이 칸의 근거 (있으면 화면이 클릭 가능한 셀로 그리고 모달로 펼친다).
   * 근거가 없으면 `null` 을 돌려주어 **클릭할 수 없는 평범한 칸**으로 남긴다 —
   * 눌러도 아무 일 없는 칸이 섞이면 어디를 눌러야 할지 알 수 없게 된다.
   */
  detail?: (col: ComparisonColumn) => CellDetail | null;
  /**
   * 편집 행에서 **자료로 채울 수 있는 값**(있으면 화면이 "자료 …" 칩을 띄워 한 번에 넣게 한다).
   * 자동으로 덮어쓰지 않는 이유: 대학이 일정을 바꾸거나 매칭이 어긋났을 때
   * 사람이 적어 둔 값이 조용히 사라지면 안 된다. 제안만 하고 결정은 사람이 한다.
   */
  autoValue?: (col: ComparisonColumn) => string | null;
}

const DASH = '-';

/**
 * 등급·경쟁률 표기 — **소수 2자리 고정**.
 *
 * 표의 일은 열을 가로로 훑는 것이라 자릿수가 들쭉날쭉하면(3.5 / 3.25 / 4) 눈이
 * 소수점을 다시 찾아야 한다. 값이 정수여도 `3.00` 으로 채워 자리를 맞춘다.
 * (카드는 한 번에 한 값만 보이므로 종전 표기를 유지한다 — 같은 수를 다르게 적는
 *  것이지 다른 수가 아니다.)
 */
function n(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(Number(v))) return DASH;
  return Number(v).toFixed(digits);
}

/** 경쟁률 — 실질 경쟁률이 있으면 괄호로 병기 (참고 사이트와 같은 표기) */
function competitionText(comp: number | null, real: number | null): string {
  if (comp == null && real == null) return DASH;
  const head = comp != null ? `${n(comp)}:1` : DASH;
  return real != null ? `${head} (실질 ${n(real)}:1)` : head;
}

/** 추합 인원 — 충원율이 있으면 % 로 병기 */
function waitlistText(waitlist: number | null, fillRate: number | null): string {
  if (waitlist == null && fillRate == null) return DASH;
  const head = waitlist != null ? `${waitlist}명` : DASH;
  return fillRate != null ? `${head} (${Math.round(fillRate * 100)}%)` : head;
}

/** 저장값 위에 편집 초안을 덮어 읽는다 (저장 전에도 표·내보내기가 최신 입력을 반영) */
export function planValue(col: ComparisonColumn, field: PlanField): string {
  if (col.draft) return col.draft[field] ?? '';
  const item = col.item;
  switch (field) {
    case 'convertedScore': return item.convertedScore ?? '';
    case 'interviewDate': return item.interviewDate ?? '';
    case 'firstAnnounceDate': return item.firstAnnounceDate ?? '';
    case 'finalAnnounceDate': return item.finalAnnounceDate ?? '';
    case 'memo': return item.memo ?? '';
    case 'csatCheck6': return item.csatCheck6 ?? '';
    case 'csatCheck9': return item.csatCheck9 ?? '';
  }
}

/** 초안 문자열 → 저장 가능한 판정 값 (`''` = 자동 판정을 따름) */
export function toCsatCheck(v: string): CsatCheckValue | null {
  return v === 'meet' || v === 'fail' ? v : null;
}

/** 항목의 저장값으로 초안을 만든다 */
export function draftFromItem(item: WishlistItem): PlanDraft {
  return {
    convertedScore: item.convertedScore ?? '',
    interviewDate: item.interviewDate ?? '',
    firstAnnounceDate: item.firstAnnounceDate ?? '',
    finalAnnounceDate: item.finalAnnounceDate ?? '',
    memo: item.memo ?? '',
    csatCheck6: item.csatCheck6 ?? '',
    csatCheck9: item.csatCheck9 ?? '',
  };
}

/** 전형요소 — 교과는 반영방법, 종합은 서류/면접 구성을 한 줄로 */
function admissionMethodText(item: WishlistItem): string {
  if (item.track === 'gyogwa') return item.gyogwa?.method?.trim() || DASH;
  const j = item.jonghap;
  if (!j) return DASH;
  const parts: string[] = [];
  if (j.has_doc_eval) {
    const factors = (j.doc_top_factors ?? [])
      .filter((f) => f?.name)
      .map((f) => (f.value != null ? `${f.name} ${f.value}` : f.name));
    parts.push(factors.length > 0 ? `서류: ${factors.join(' / ')}` : '서류평가');
  }
  if (j.has_interview) {
    const how = (j.interview_methods ?? []).join(', ');
    parts.push(`면접${how ? ` (${how})` : ''}${j.interview_status ? ` · ${j.interview_status}` : ''}`);
  } else if (j.has_interview === false) {
    parts.push('면접 없음');
  }
  return parts.length > 0 ? parts.join(' + ') : DASH;
}

/**
 * 반영 교과 — **이 전형에 적용되는 규칙 하나만**.
 *
 * `subjects_all` 은 그 대학의 모든 전형 규칙을 담고 있어(라이브 60개 전형이 2건 이상)
 * 그대로 이어 붙이면 남의 전형 반영 교과가 섞인다. 전형명으로 하나를 고를 수 있으면
 * 그것만 적고, **못 고르면(ambiguous) 전체를 적는다** — 확실하지 않은 것을 골라 놓으면
 * 그게 그 전형의 반영 교과인 줄 읽는다. 계산(`naesinRule`)도 그때 보류한다.
 */
function reflectedSubjectsText(item: WishlistItem): string {
  const { variant, ambiguous, all } = selectSubjectVariant(item.gyogwa ?? null);
  if (all.length === 0) return DASH;
  if (!ambiguous && variant) {
    return variant.ratio ? `${variant.subjects} (학년비율 ${variant.ratio})` : variant.subjects;
  }
  const seen: string[] = [];
  for (const v of all) {
    const label = v.ratio ? `${v.subjects} (학년비율 ${v.ratio})` : v.subjects;
    if (!seen.includes(label)) seen.push(label);
  }
  return seen.join(' / ');
}

/** 진로선택 반영 — 환산 기준 원문 */
function careerText(item: WishlistItem): string {
  const careers = (item.gyogwa?.careers ?? []).filter((c) => c.method || c.criteria);
  if (careers.length === 0) return DASH;
  return careers
    .map((c) => [c.method, c.criteria].filter(Boolean).join(': '))
    .join(' / ');
}

/** 학교 일정 — 사용자 입력이 없으면 종합전형 면접 시간 정보를 참고값으로 */
function scheduleFallback(item: WishlistItem): string {
  const t = item.jonghap?.interview_primary_time?.trim();
  return t || '';
}

/**
 * 자동 판정이 없을 때 대신 보여줄 사유.
 * "모름"이 아니라 **왜 모르는지**를 적어야 사용자가 직접 판정할지 판단할 수 있다.
 */
export function autoFallbackText(col: ComparisonColumn, examMonth: number | null): string {
  if (col.item.track === 'jonghap') return '모집요강 확인';
  if (!col.item.gyogwa?.has_csat) return '해당 없음';
  if (examMonth == null) return '성적 없음';
  return '판정 보류';
}

/** 한 열·한 연도쌍의 변경사항만 추린다 */
export function changesFor(col: ComparisonColumn, comparison: string): AdmissionChange[] {
  return (col.changes ?? []).filter((c) => c.comparison === comparison);
}

/**
 * 변경사항 셀의 평문 (인쇄·엑셀).
 *
 * **화면은 요약, 내보내기는 전문**이다 — 표에 원문을 그대로 넣으면(한 건 최대 251자에
 * 여러 건) 표가 세로로 무너지지만, 뽑아 놓은 상담 자료에서 "여기 뭐가 바뀌었더라"를
 * 다시 앱에서 찾게 만들면 안 된다.
 *
 * 자료를 아직 안 불러왔을 때와 자료가 없을 때를 **다르게 적는다** — 출처가 주요 대학
 * 64곳뿐이라 빈 값이 "변경 없음"으로 읽히면 오답이다.
 */
export function changeTextFor(col: ComparisonColumn, comparison: string): string {
  if (col.changes === undefined) return '…';
  const hit = changesFor(col, comparison);
  if (hit.length === 0) return '자료 없음';
  return changesFullText(hit);
}

/** 변경사항 셀의 화면 요약 (키워드 + 건수) */
export function changeSummaryFor(col: ComparisonColumn, comparison: string): string {
  return summarizeChanges(changesFor(col, comparison));
}

/**
 * 이 항목의 고사 일정 — **내 전형 것만**.
 *
 * 전형 이름으로 거르는 것이 맞다(2026-09-01 라이브 46건 실측으로 확정).
 * 한때 "거르면 실제 일정이 사라진다"고 보고 전부 보여줬는데 **오판이었다**:
 * 매칭 0건은 자료 결손이 아니라 **그 전형에 고사가 원래 없다**는 뜻이었다.
 *   · 전북대 `학생부교과(일반학생 전형)` → 전북대 일정 7건이 전부 종합·실기 (교과는 고사 없음)
 *   · 인하대 `인하미래인재(서류형)`     → 일정에는 `(면접형)`만 (서류형이라 면접이 없다)
 * 거르지 않으면 **남의 전형 날짜를 내 일정으로 읽는다** — 그게 더 위험하다.
 *
 * 이름 표기 차이는 `normalizeAdmissionName` 이 흡수한다
 * (`학생부종합(큰사람 전형)` ↔ `학생부종합(큰사람)`).
 * 위시리스트에 전형명이 없으면 거르지 않는다(판단 근거가 없다).
 */
export function schedulesFor(col: ComparisonColumn): AdmissionSchedule[] {
  const list = col.schedules ?? [];
  if (list.length === 0) return [];
  return list
    .filter((s) => matchesAdmissionName(s.admissionName, col.item.admissionName))
    .sort(
      (a, b) =>
        scheduleRelevance(b, col.item.admissionName, col.item.department) -
        scheduleRelevance(a, col.item.admissionName, col.item.department),
    );
}

/**
 * 같은 대학의 **다른 전형** 일정.
 * 셀에는 내 전형 것만 보여주되, 근거 모달에서는 "이 대학에 이런 고사들이 있다"를
 * 함께 보여 준다 — 전형명 표기가 어긋나 못 잡은 경우를 사람이 알아볼 수 있어야 한다.
 */
export function otherSchedulesFor(col: ComparisonColumn): AdmissionSchedule[] {
  const list = col.schedules ?? [];
  if (list.length === 0) return [];
  return list.filter((s) => !matchesAdmissionName(s.admissionName, col.item.admissionName));
}

/** 자료가 아직인지 / 없는지를 구분한 안내 문구 */
function scheduleFallbackText(col: ComparisonColumn): string {
  if (col.schedules === undefined) return '…';
  return '자료 없음';
}

/**
 * 이 칸이 **입력 컨트롤을 그리는가** (`<select>`/`<input>`).
 *
 * 근거 모달을 붙일 때 셀을 통째로 `<button>` 으로 감싸는데, 그 안에 컨트롤이 있으면
 * **드롭다운을 고르는 클릭이 부모 버튼까지 올라가 모달이 함께 열린다**
 * (2026-09-01 최저 충족여부에서 실제로 발생). HTML 상으로도 상호작용 요소 중첩이라
 * 잘못이다. 이런 칸은 감싸지 말고 옆에 작은 근거 버튼만 붙인다.
 */
export function cellHasControl(row: ComparisonRow, canEdit: boolean): boolean {
  // `link` 는 `canEdit` 과 무관하게 셀 안에 `<a>` 가 들어간다 — `<button>` 안의 `<a>` 는
  // 상호작용 요소 중첩이라 키보드 이동이 깨지고 클릭이 부모까지 올라간다(입력 칸과 같은 문제).
  if (row.kind === 'link') return true;
  return canEdit && (row.kind === 'edit' || row.kind === 'csatRound');
}

/** 셀 전체를 클릭 영역으로 감싸도 되는가 (근거가 있고 컨트롤이 없을 때만) */
export function shouldWrapCell(row: ComparisonRow, canEdit: boolean, hasDetail: boolean): boolean {
  return hasDetail && !cellHasControl(row, canEdit);
}

/**
 * 복수지원 경고 수준 — 표가 색을 정할 때 쓴다.
 * `null` 이면 평범한 칸이다(자료가 없거나 담은 곳이 하나뿐).
 */
export function multiApplyLevel(col: ComparisonColumn): 'over' | 'blocked' | 'info' | null {
  if (!col.univInfo || col.univInfo.ambiguous) return null;
  return multiApplyWarning(col.univInfo.info, col.sameUniversityCount ?? 0).level;
}

/** 캠퍼스를 특정하지 못했을 때의 공통 근거 (두 행이 같은 사정을 말한다) */
function ambiguousDetail(col: ComparisonColumn, title: string): CellDetail {
  return {
    title,
    subtitle: col.item.university,
    sections: [
      {
        heading: '어느 캠퍼스인지 특정하지 못했습니다',
        note:
          '자료는 캠퍼스별로 나뉘어 있는데 목록의 대학명에는 캠퍼스가 없습니다. ' +
          '캠퍼스마다 입학처 주소도 복수지원 규정도 다를 수 있어 임의로 고르지 않았습니다.',
      },
      {
        heading: `후보 ${col.univInfo?.candidates.length ?? 0}곳`,
        items: (col.univInfo?.candidates ?? []).map((c) => ({
          label: c.university,
          value: c.multiApplySummary,
        })),
      },
    ],
  };
}

/** 입학처 칸의 근거 — 연락처·원서접수처까지 한자리에 (상담 중 다시 찾지 않게) */
function detailOfUnivInfo(col: ComparisonColumn): CellDetail | null {
  if (!col.univInfo) return null;
  if (col.univInfo.ambiguous) return ambiguousDetail(col, '입학처');
  const info = col.univInfo.info;
  if (!info) return null;

  const items: Array<{ label: string; value?: string; muted?: boolean }> = [];
  if (info.homeUrl) items.push({ label: '입학처', value: info.homeUrl });
  else if (info.homeRaw) items.push({ label: '입학처', value: info.homeRaw, muted: true });
  if (info.applyUrl) items.push({ label: '원서접수', value: info.applyUrl });
  else if (info.applyRaw) items.push({ label: '원서접수', value: info.applyRaw, muted: true });
  if (info.phone) items.push({ label: '전화', value: info.phone });
  if (info.address) items.push({ label: '주소', value: info.address, muted: true });

  const sections: CellDetailSection[] = [{ heading: info.university, items }];

  // 주소가 아닌 값이 온 경우 — 링크가 없는 이유를 화면이 말해야 한다.
  if (!info.homeUrl) {
    sections.push({
      note: info.homeRaw
        ? '자료의 입학처 칸이 주소가 아니라 안내 문구라 링크를 만들지 않았습니다.'
        : '자료에 입학처 주소가 없습니다. 대학 홈페이지에서 확인하세요.',
    });
  }
  // 캠퍼스를 버리고 찾았으면 **무엇과 붙었는지** 밝힌다(캠퍼스가 다르면 값도 다르다).
  if (col.univInfo.viaBase) {
    sections.push({ note: `목록의 '${col.item.university}' 를 자료의 '${info.university}' 로 보고 있습니다.` });
  }
  sections.push({
    note: `대교협 2027학년도 수시모집 자료${info.baseDate ? ` · 대학 기준일 ${info.baseDate}` : ''}`,
  });
  return { title: '입학처 · 연락처', subtitle: col.item.university, sections };
}

/** 복수지원 칸의 근거 — **원문을 항상 함께 펼친다** */
function detailOfMultiApply(col: ComparisonColumn): CellDetail | null {
  if (!col.univInfo) return null;
  if (col.univInfo.ambiguous) return ambiguousDetail(col, '복수지원 가능 여부');
  const info = col.univInfo.info;
  if (!info) return null;

  const count = col.sameUniversityCount ?? 0;
  const warn = multiApplyWarning(info, count);
  const sections: CellDetailSection[] = [];

  const items: Array<{ label: string; value?: string; muted?: boolean }> = [
    { label: '판정', value: MULTI_APPLY_LABELS[info.multiApplyStatus] },
  ];
  if (info.multiApplyLimit != null) {
    items.push({
      label: '본교 내 최대 지원 횟수',
      value: info.multiApplyLimit < 6
        ? `${info.multiApplyLimit}회`
        : `${info.multiApplyLimit}회 (전국 공통 6회와 같음 = 이 대학만의 추가 제한 없음)`,
    });
  }
  if (count >= 1) items.push({ label: '내 지망 목록의 이 대학', value: `${count}곳` });
  sections.push({ heading: info.university, items });

  if (warn.level === 'over' || warn.level === 'blocked') {
    sections.push({ heading: '확인이 필요합니다', note: warn.message });
  }

  if (info.multiApplyText) {
    sections.push({ heading: '자료 원문', text: info.multiApplyText });
  }
  // 판정은 원문을 규칙으로 읽은 것이라 틀릴 수 있다 — 원문이 정본임을 밝힌다.
  sections.push({
    note:
      info.multiApplyStatus === 'unknown'
        ? '규칙으로 가능·불가를 단정할 수 없어 원문을 그대로 싣습니다. 위 원문을 읽고 판단하세요.'
        : '판정은 위 원문을 규칙으로 요약한 값입니다. 최종 확인은 대학 모집요강 원문으로 하세요.',
  });
  return { title: '복수지원 가능 여부', subtitle: col.item.university, sections };
}

/**
 * 비교표 행 목록.
 * 편집 행(`kind:'edit'`)은 `field` 가 가리키는 초안 값을 그대로 평문으로 낸다.
 *
 * `changeComparisons` = 표시할 변경사항 연도쌍 라벨(예: `['2028↔2027','2027↔2026']`).
 * **하드코딩하지 않고 실제 적재된 자료에서 받는다** — 매년 연도쌍이 늘어나는데 코드에
 * 박아 두면 해가 바뀔 때 조용히 빈 행이 남는다. 빈 배열이면 변경사항 행을 아예 만들지 않는다.
 */
export function buildComparisonRows(changeComparisons: string[] = []): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  const add = (r: ComparisonRow) => rows.push(r);

  /* ───── 기본 정보 ───── */
  add({ key: 'university', section: 'basic', label: '대학', kind: 'plain', text: (c) => c.item.university || DASH });
  add({ key: 'department', section: 'basic', label: '세부전공', kind: 'plain', text: (c) => c.item.department || DASH });
  add({
    key: 'admission', section: 'basic', label: '전형', kind: 'plain',
    text: (c) => {
      const track = TRACK_LABELS[c.item.track];
      const name = c.item.admissionName?.trim();
      return name ? `${track} · ${name}` : track;
    },
  });
  add({
    key: 'field', section: 'basic', label: '계열', kind: 'plain',
    text: (c) => [c.item.adiga?.field, c.item.adiga?.domain ? `${c.item.adiga.domain}계열` : null]
      .filter(Boolean).join(' · ') || DASH,
  });
  add({
    key: 'admissionSite', section: 'basic', label: '입학처', kind: 'link',
    text: (c) => {
      if (c.univInfo === undefined) return '…';
      if (c.univInfo.ambiguous) return '캠퍼스 확인 필요';
      const info = c.univInfo.info;
      if (!info) return '자료 없음';
      // 원문이 주소가 아닐 수 있다(`'입학처(해오름관 2층)'`) — 그때는 링크가 아니라 글이다.
      return info.homeUrl ? urlHost(info.homeUrl) : (info.homeRaw ?? '자료 없음');
    },
    detail: (c) => detailOfUnivInfo(c),
  });
  add({
    key: 'multiApply', section: 'basic', label: '복수지원', kind: 'multiApply',
    text: (c) => {
      if (c.univInfo === undefined) return '…';
      if (c.univInfo.ambiguous) return '캠퍼스 확인 필요';
      const info = c.univInfo.info;
      if (!info) return '자료 없음';
      const n = c.sameUniversityCount ?? 0;
      // 담은 개수는 자료가 모르는 값이라 여기서만 붙는다 — 상한과 나란히 놓아야 뜻이 산다.
      return n >= 2 ? `${info.multiApplySummary} · 목록에 ${n}곳` : info.multiApplySummary;
    },
    detail: (c) => detailOfMultiApply(c),
  });

  /* ───── 전형·경쟁률 ───── */
  add({ key: 'method', section: 'competition', label: '전형요소', kind: 'plain', text: (c) => admissionMethodText(c.item) });
  for (const g of [
    { label: '모집인원', key: 'recruit', pick: (y: HistoryYear, st: ReturnType<typeof yearStatsOf>) => (st[y].recruit != null ? `${st[y].recruit}명` : DASH) },
    { label: '경쟁률', key: 'competition', pick: (y: HistoryYear, st: ReturnType<typeof yearStatsOf>) => competitionText(st[y].competition, st[y].realCompetition) },
    { label: '추합인원', key: 'waitlist', pick: (y: HistoryYear, st: ReturnType<typeof yearStatsOf>) => waitlistText(st[y].waitlist, st[y].fillRate) },
  ]) {
    for (const y of HISTORY_YEARS) {
      add({
        key: `${g.key}-${y}`, section: 'competition', label: g.label, sub: `${y.slice(2)}년도`,
        group: g.key, kind: 'plain', text: (c) => g.pick(y, yearStatsOf(c.item.adiga)),
      });
    }
  }

  /* ───── 내신 (내 성적으로 판단하는 축) ───── */
  add({ key: 'fit', section: 'naesin', label: '지원 수준', kind: 'fit', text: (c) => FIT_LABELS[c.insight.fit] });
  add({
    key: 'myGrade', section: 'naesin', label: '내 내신 vs 70%컷', kind: 'grade',
    text: (c) => {
      const mine = c.insight.comparableGrade;
      const cut = c.item.adiga?.grade70 ?? null;
      if (mine == null && cut == null) return DASH;
      return `${mine != null ? mine.toFixed(2) : DASH} vs ${cut != null ? n(cut) : DASH}`;
    },
    detail: (c) => {
      const rn = c.insight.ruleNaesin;
      if (!rn) return null;
      const sections: CellDetailSection[] = [];
      sections.push({
        heading: '판정',
        items: [
          { label: c.insight.gradeLabel, value: c.insight.effectiveGrade != null ? c.insight.effectiveGrade.toFixed(2) : '–' },
          ...(c.insight.convertedGrade != null
            ? [{ label: '9등급 환산 (컷과 같은 척도)', value: c.insight.convertedGrade.toFixed(2) }]
            : []),
          { label: '합격자 70% 컷', value: c.item.adiga?.grade70 != null ? n(c.item.adiga.grade70) : '–' },
          { label: '합격자 50% 컷', value: c.item.adiga?.grade50 != null ? n(c.item.adiga.grade50) : '–' },
          { label: '지원 수준', value: FIT_LABELS[c.insight.fit] },
        ],
      });
      if (c.insight.naesinWithheld) {
        sections.push({
          heading: '전형 반영 내신 계산 보류',
          note: '이 전형의 반영방법을 그대로 재현할 수 없어 계산하지 않았습니다. 위 숫자는 전형과 무관한 전체 내신 평균입니다.',
          items: rn.uncertainties.map((u) => ({ label: u })),
        });
      }
      if (rn.usedSubjects.length > 0) {
        sections.push({
          heading: `계산에 반영된 과목 (${rn.usedSubjects.length}과목)`,
          items: rn.usedSubjects.map((u) => ({
            label: `${u.grade}학년 ${u.semester}학기 · ${u.subject}`,
            value: `${u.appliedGrade}등급 · ${u.units}단위`,
          })),
        });
      }
      if (rn.excludedSubjects.length > 0) {
        sections.push({
          heading: `제외된 과목 (${rn.excludedSubjects.length}과목)`,
          items: rn.excludedSubjects.slice(0, 30).map((u) => ({
            label: `${u.subject}`,
            value: u.reason,
            muted: true,
          })),
        });
      }
      return {
        title: '반영 내신 계산 근거',
        subtitle: [c.item.university, c.item.department].filter(Boolean).join(' · '),
        sections,
      };
    },
  });
  add({
    key: 'reflected', section: 'naesin', label: '반영 교과', kind: 'plain',
    text: (c) => reflectedSubjectsText(c.item),
    detail: (c) => {
      const { variant, ambiguous, all } = selectSubjectVariant(c.item.gyogwa ?? null);
      if (all.length === 0) return null;
      const sections: CellDetailSection[] = [];
      if (!ambiguous && variant) {
        sections.push({
          heading: '이 전형에 적용되는 반영 교과',
          text: variant.ratio ? `${variant.subjects}  (학년비율 ${variant.ratio})` : variant.subjects,
          note: variant.admission ? `전형: ${variant.admission}` : undefined,
        });
      } else {
        sections.push({
          heading: '어느 규칙이 이 전형의 것인지 가려내지 못했습니다',
          note: '전형명이 맞아떨어지지 않아 확정하지 않았습니다. 내신 계산도 보류하고 전체를 보여줍니다 — 모집요강에서 직접 확인하세요.',
        });
      }
      if (all.length > 1) {
        sections.push({
          heading: `이 대학에 실린 규칙 전체 (${all.length}건)`,
          items: all.map((v) => ({
            label: [v.admission || '(전형 미상)', v.unit ? `· ${v.unit}` : ''].join(' ').trim(),
            value: v.subjects,
            muted: !ambiguous && v.subjects !== variant?.subjects,
          })),
          note: '자료가 대학 단위로 실려 있어 다른 전형 규칙도 함께 들어 있습니다.',
        });
      }
      return {
        title: '반영 교과',
        subtitle: [c.item.university, c.item.department].filter(Boolean).join(' · '),
        sections,
      };
    },
  });
  add({ key: 'career', section: 'naesin', label: '진로선택 반영', kind: 'plain', text: (c) => careerText(c.item) });
  for (const g of [
    { label: '합격자 70%', key: 'g70', pick: (y: HistoryYear, st: ReturnType<typeof yearStatsOf>) => n(st[y].grade70) },
    { label: '합격자 50%', key: 'g50', pick: (y: HistoryYear, st: ReturnType<typeof yearStatsOf>) => n(st[y].grade50) },
  ]) {
    for (const y of HISTORY_YEARS) {
      add({
        key: `${g.key}-${y}`, section: 'naesin', label: g.label, sub: `${y.slice(2)}년도`,
        group: g.key, kind: 'plain', text: (c) => g.pick(y, yearStatsOf(c.item.adiga)),
      });
    }
  }
  add({
    key: 'convertedScore', section: 'naesin', label: '환산점수', kind: 'edit', field: 'convertedScore',
    inputType: 'text', placeholder: '예: 987.5 / 1000',
    text: (c) => planValue(c, 'convertedScore') || DASH,
  });

  /* ───── 수능최저 (수능 성적으로 판단하는 축) ───── */
  add({
    key: 'csat', section: 'csat', label: '최저 기준', kind: 'plain',
    // **내 세부전공에 적용되는 조건만** 보여준다.
    // 원문은 한 칸에 8~9개 분기가 들어 있는 경우가 흔해(전북대 일반학생 등) 그대로 두면
    // 셀이 문단이 되고 "그래서 내 학과는 뭔데?"를 사람이 눈으로 찾아야 한다.
    // 구조화 규칙이 범위를 갈라 뒀으면 그 조건 하나만, 못 갈랐으면 원문 전체를 보여준다.
    text: (c) => {
      if (c.item.track === 'jonghap') return '모집요강 확인';
      if (!c.item.gyogwa?.has_csat) return '없음';
      const applied = c.insight.csatApplied;
      if (applied) {
        const scope = applied.scopeLabels.length > 0 ? `[${applied.scopeLabels.join(',')}] ` : '[공통] ';
        return `${scope}${applied.conditionText}`;
      }
      return c.item.gyogwa.csat?.trim() || '있음';
    },
    detail: (c) => {
      const raw = c.item.gyogwa?.csat?.trim();
      if (!raw) return null;
      const applied = c.insight.csatApplied;
      const sections: CellDetailSection[] = [];
      if (applied) {
        sections.push({
          heading: '내 모집단위에 적용되는 조건',
          text: applied.conditionText,
          note: applied.scopeLabels.length > 0
            ? `적용 범위: ${applied.scopeLabels.join(', ')}`
            : '학과 구분 없이 적용되는 공통 조건입니다.',
        });
      } else {
        sections.push({
          heading: '적용 조건을 가려내지 못했습니다',
          note: '학과 분기를 자동으로 구분할 수 없어 원문 전체를 보여줍니다. 아래에서 내 모집단위 조건을 직접 확인하세요.',
        });
      }
      sections.push({ heading: '원문 (전체)', text: raw });
      return {
        title: '수능최저 기준',
        subtitle: [c.item.university, c.item.department].filter(Boolean).join(' · '),
        sections,
      };
    },
  });
  for (const spec of CSAT_ROUND_MONTHS) {
    add({
      key: `csat-${spec.label}`, section: 'csat', label: '충족여부', sub: spec.label,
      group: 'csatRounds', kind: 'csatRound', field: spec.field,
      text: (c) => {
        // 저장 전 초안까지 반영해야 화면·인쇄·엑셀이 같은 값을 낸다.
        const manual = toCsatCheck(planValue(c, spec.field));
        if (manual) return `${CSAT_LABELS[manual]} (직접)`;
        const r = c.insight.csatRounds.find((x) => x.month === spec.month);
        if (r?.autoVerdict) return CSAT_LABELS[r.autoVerdict];
        return autoFallbackText(c, r?.examMonth ?? null);
      },
      detail: (c) => {
        const r = c.insight.csatRounds.find((x) => x.month === spec.month);
        const judge = r?.result?.judge;
        if (!judge || judge.verdict === 'unknown') return null;
        const modeLabel = judge.mode === 'sum' ? '등급 합' : judge.mode === 'avg' ? '등급 평균' : '각 영역 등급';
        return {
          title: `${spec.label} 모의고사 기준 수능최저 판정`,
          subtitle: [c.item.university, c.item.department].filter(Boolean).join(' · '),
          sections: [
            {
              heading: '판정',
              items: [
                { label: '결과', value: CSAT_LABELS[judge.verdict] },
                { label: `${modeLabel} (선택 ${judge.count}개)`, value: judge.value != null ? String(judge.value) : '–' },
                { label: '기준', value: `${judge.threshold} 이내` },
              ],
              note: toCsatCheck(planValue(c, spec.field))
                ? '직접 저장한 판정이 적용 중이라 위 자동 계산과 다를 수 있습니다.'
                : undefined,
            },
            {
              heading: '계산에 쓴 영역',
              items: judge.used.map((u) => ({ label: `${u.area} · ${u.subject}`, value: `${u.grade}등급` })),
            },
            {
              heading: '내 영역별 등급 (전체)',
              items: judge.byArea.map((u) => ({
                label: `${u.area} · ${u.subject}`,
                value: `${u.grade}등급`,
                muted: !judge.used.some((x) => x.area === u.area && x.subject === u.subject),
              })),
            },
            { heading: '적용 조건', text: r?.result?.appliedText ?? undefined },
          ],
        };
      },
    });
  }

  /* ───── 전형 변경사항 (자료에 있는 연도쌍만) ───── */
  for (const comparison of changeComparisons) {
    add({
      key: `change-${comparison}`, section: 'change', label: '변경사항', sub: comparison,
      group: 'changes', kind: 'changes', text: (c) => changeTextFor(c, comparison),
      detail: (c) => {
        const hit = changesFor(c, comparison);
        if (hit.length === 0) return null;
        return {
          title: `전형 변경사항 ${comparison}`,
          subtitle: [c.item.university, c.item.department].filter(Boolean).join(' · '),
          sections: hit.map((x) => ({
            heading: [x.changeType, x.keywords.map((k) => k.replace(/^#/, '')).join('·'), x.admissionItem]
              .filter(Boolean).join(' · '),
            text: x.beforeText ? `${x.beforeText}\n  ↓\n${x.afterText}` : x.afterText,
          })),
        };
      },
    });
  }

  /* ───── 일정 ───── */
  add({
    key: 'examSchedule', section: 'schedule', label: '고사 일정', kind: 'schedule',
    text: (c) => {
      if (c.schedules === undefined) return '…';
      const list = schedulesFor(c);
      if (list.length > 0) return formatSchedules(list);
      // 매칭 0건은 자료 결손이 아니라 **이 전형에 고사가 없다**는 뜻이다(실측 확인).
      return otherSchedulesFor(c).length > 0 ? '이 전형은 고사 없음' : '자료 없음';
    },
    detail: (c) => {
      const list = schedulesFor(c);
      const others = otherSchedulesFor(c);
      if (list.length === 0 && others.length === 0) return null;
      if (list.length === 0) {
        return {
          title: '대학별고사 일정',
          subtitle: [c.item.university, c.item.department].filter(Boolean).join(' · '),
          sections: [
            {
              heading: '이 전형은 고사 일정이 없습니다',
              note: '교과 전형처럼 면접·논술·실기를 치르지 않는 전형이거나, 전형명 표기가 달라 못 찾았을 수 있습니다. 아래 목록에서 확인하세요.',
            },
            {
              heading: `이 대학의 다른 전형 (${others.length}건)`,
              items: others.map((sc) => ({
                label: `${formatSchedule(sc)} · ${sc.admissionName}`,
                muted: true,
              })),
            },
          ],
        } as CellDetail;
      }
      return {
        title: '대학별고사 일정',
        subtitle: [c.item.university, c.item.department].filter(Boolean).join(' · '),
        sections: list.map((sc) => ({
          heading: `${formatSchedule(sc)}${
            isMySchedule(sc, c.item.admissionName, c.item.department) ? '  · 내 전형' : ''
          }`,
          items: [
            { label: '전형', value: sc.admissionName },
            ...(sc.units.length > 0 ? [{ label: '모집단위', value: sc.units.join(', ') }] : []),
            ...(sc.applyStart ? [{ label: '원서접수', value: `${formatExamDate(sc.applyStart)} ~ ${formatExamDate(sc.applyEnd)}` }] : []),
            ...(sc.announceText ? [{ label: '합격자 발표', value: sc.announceText }] : []),
            ...(sc.note ? [{ label: '비고', value: sc.note, muted: true }] : []),
          ],
        })),
        note: others.length > 0
          ? `이 대학에는 다른 전형 고사가 ${others.length}건 더 있습니다(내 전형이 아니라 제외).`
          : undefined,
      } as CellDetail;
    },
  });
  add({
    key: 'applyPeriod', section: 'schedule', label: '원서접수', kind: 'schedule',
    text: (c) => {
      const list = schedulesFor(c).filter((x) => x.applyStart);
      if (list.length === 0) return scheduleFallbackText(c);
      const seen: string[] = [];
      for (const x of list) {
        const t = `${formatExamDate(x.applyStart)} ~ ${formatExamDate(x.applyEnd)}`;
        if (!seen.includes(t)) seen.push(t);
      }
      return seen.join(' · ');
    },
  });
  add({
    key: 'firstAnnounceDate', section: 'schedule', label: '1차 발표일', kind: 'edit', field: 'firstAnnounceDate',
    inputType: 'date',
    // 1차(면접 대상자) 발표일은 수집한 일정 자료에 없다 — 자동 제안 없이 수동 입력만.
    text: (c) => planValue(c, 'firstAnnounceDate') || DASH,
  });
  add({
    key: 'finalAnnounceDate', section: 'schedule', label: '최종 발표일', kind: 'edit', field: 'finalAnnounceDate',
    inputType: 'date',
    text: (c) => {
      const manual = planValue(c, 'finalAnnounceDate');
      if (manual) return manual;
      const auto = resolveAnnounceDate(schedulesFor(c), c.scheduleYear ?? 0);
      if (auto) return auto;
      // 자동 판단을 보류했어도 원문은 보여 준다(모집단위별 상이 등)
      const raw = announceSummary(schedulesFor(c));
      return raw ? `${raw} (모집단위 확인)` : DASH;
    },
    autoValue: (c) => resolveAnnounceDate(schedulesFor(c), c.scheduleYear ?? 0),
  });

  /* ───── 메모 ───── */
  add({
    key: 'memo', section: 'note', label: '메모', kind: 'edit', field: 'memo',
    inputType: 'textarea', placeholder: '상담 메모',
    text: (c) => planValue(c, 'memo') || DASH,
  });

  return rows;
}

/**
 * 내보내기용 2차원 배열 (첫 행 = 헤더).
 * 화면 표와 **같은 행 정의**를 쓰므로 어긋날 수 없다.
 */
export function toExportMatrix(
  columns: ComparisonColumn[],
  slotCount: number,
  changeComparisons: string[] = [],
): string[][] {
  const rows = buildComparisonRows(changeComparisons);
  const header = ['항목', '세부', ...Array.from({ length: slotCount }, (_, i) => `${i + 1}지망`)];
  const body = rows.map((r) => [
    r.label,
    r.sub ?? '',
    ...Array.from({ length: slotCount }, (_, i) => {
      const col = columns[i];
      return col ? r.text(col) : DASH;
    }),
  ]);
  return [header, ...body];
}

/**
 * 좌측 '항목' 열의 rowSpan — 같은 `group` 이 연속되는 구간의 첫 행에 구간 길이,
 * 나머지 행에는 0(=셀을 그리지 않음).
 *
 * 값이 어긋나면 표의 열이 통째로 한 칸씩 밀리므로(HTML 표는 조용히 밀린다) 회귀
 * 테스트가 "spans 합 == 행 수" 불변식을 고정한다.
 */
export function computeLabelSpans(rows: ComparisonRow[]): number[] {
  const spans = new Array(rows.length).fill(0);
  let i = 0;
  while (i < rows.length) {
    const g = rows[i].group;
    if (!g) {
      spans[i] = 1;
      i += 1;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j].group === g) j += 1;
    spans[i] = j - i;
    i = j;
  }
  return spans;
}
