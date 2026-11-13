// ========================================
// 창체 라벨·색상 단일 출처 (React 비의존 — Node 회귀 테스트가 그대로 import)
//
// 하드코딩 금지. 새 화면은 반드시 이 모듈의 함수를 거친다 —
// `EVENT_LABELS.duty`가 화면마다 '당직'/'근무'로 갈라졌던 교훈.
//
// 색은 데이터 부호다. 영역 색을 장식으로 재사용하지 말 것 —
// 색이 의미를 잃는 순간 카드 스캔이 불가능해진다.
// ========================================

import type {
  ActivityArea,
  ActivityBudgetSource,
  ActivityHostKind,
  ActivityOperatorType,
  ActivityScale,
  ActivityStatus,
  ActivityTeacherRole,
  ParticipationRole,
  ParticipationStatus,
} from '../types';

// ----------------------------------------
// 영역 (자율·동아리·진로·봉사)
// ----------------------------------------

export const ACTIVITY_AREAS: ActivityArea[] = ['autonomy', 'club', 'career', 'service'];

const AREA_LABELS: Record<ActivityArea, string> = {
  autonomy: '자율·자치',
  club: '동아리',
  career: '진로',
  service: '봉사',
};

/** 좁은 자리(칩·배지)용 짧은 라벨 */
const AREA_SHORT_LABELS: Record<ActivityArea, string> = {
  autonomy: '자율',
  club: '동아리',
  career: '진로',
  service: '봉사',
};

/**
 * 영역별 색 토큰. `tone`은 tailwind 색 계열 이름이고,
 * 나머지는 그 계열로 미리 조합한 클래스 문자열이다.
 */
export interface AreaTone {
  tone: 'amber' | 'violet' | 'sky' | 'emerald';
  /** 칩·배지 (배경+글자+테두리) */
  chip: string;
  /** 카드 좌측 강조선 등 (테두리 색만) */
  border: string;
  /** 아이콘·강조 텍스트 */
  text: string;
  /** 진행바·점 등 채움 */
  fill: string;
}

const AREA_TONES: Record<ActivityArea, AreaTone> = {
  autonomy: {
    tone: 'amber',
    chip: 'bg-amber-50 text-amber-700 border-amber-200',
    border: 'border-amber-400',
    text: 'text-amber-600',
    fill: 'bg-amber-500',
  },
  club: {
    tone: 'violet',
    chip: 'bg-violet-50 text-violet-700 border-violet-200',
    border: 'border-violet-400',
    text: 'text-violet-600',
    fill: 'bg-violet-500',
  },
  career: {
    tone: 'sky',
    chip: 'bg-sky-50 text-sky-700 border-sky-200',
    border: 'border-sky-400',
    text: 'text-sky-600',
    fill: 'bg-sky-500',
  },
  service: {
    tone: 'emerald',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    border: 'border-emerald-400',
    text: 'text-emerald-600',
    fill: 'bg-emerald-500',
  },
};

const UNKNOWN_TONE: AreaTone = {
  tone: 'amber',
  chip: 'bg-slate-50 text-slate-600 border-slate-200',
  border: 'border-slate-300',
  text: 'text-slate-500',
  fill: 'bg-slate-400',
};

export function getAreaLabel(area: ActivityArea | null | undefined): string {
  return (area && AREA_LABELS[area]) || '미분류';
}

export function getAreaShortLabel(area: ActivityArea | null | undefined): string {
  return (area && AREA_SHORT_LABELS[area]) || '미분류';
}

export function getAreaTone(area: ActivityArea | null | undefined): AreaTone {
  return (area && AREA_TONES[area]) || UNKNOWN_TONE;
}

// ----------------------------------------
// 영역 그룹 — 화면에서는 자율·진로를 하나로 묶는다 (2026-08-27 사용자 결정)
// ----------------------------------------
//
// 생기부의 자율활동·진로활동은 비슷한 내용이 쓰이는 영역이라 교사가 매번 고르는 것이
// 부담이다. 그래서 **표시·입력만** 3그룹으로 묶고 DB의 `area` CHECK는 4값을 유지한다.
//
// DB를 안 바꾼 이유 두 가지:
//   ① 이미 저장된 `career` 행이 그대로 살아 있어야 한다.
//   ② NEIS 생기부는 자율활동·진로활동을 **여전히 별도 항목으로 기재**한다. Phase 4에서
//      문구 초안을 나눠 만들어야 하면 세분 선택만 되살리면 된다.
// 새 활동이 '자율·진로'로 저장되면 `area = 'autonomy'`가 된다.

export type ActivityAreaGroup = 'autonomy_career' | 'club' | 'service';

export const ACTIVITY_AREA_GROUPS: ActivityAreaGroup[] = ['autonomy_career', 'club', 'service'];

const AREA_GROUP_LABELS: Record<ActivityAreaGroup, string> = {
  autonomy_career: '자율·진로',
  club: '동아리',
  service: '봉사',
};

/** 영역 → 표시 그룹. autonomy와 career가 한 그룹으로 접힌다. */
export function getAreaGroup(area: ActivityArea | null | undefined): ActivityAreaGroup {
  if (area === 'club') return 'club';
  if (area === 'service') return 'service';
  return 'autonomy_career';
}

export function getAreaGroupLabel(group: ActivityAreaGroup | null | undefined): string {
  return (group && AREA_GROUP_LABELS[group]) || '자율·진로';
}

/** 그룹의 대표 색. 그룹에 속한 영역들이 같은 색을 쓰므로 카드가 흔들리지 않는다. */
export function getAreaGroupTone(group: ActivityAreaGroup | null | undefined): AreaTone {
  if (group === 'club') return AREA_TONES.club;
  if (group === 'service') return AREA_TONES.service;
  return AREA_TONES.autonomy;
}

/** 그룹으로 새 활동을 저장할 때 쓸 DB 값. */
export function areaForGroup(group: ActivityAreaGroup): ActivityArea {
  if (group === 'club') return 'club';
  if (group === 'service') return 'service';
  return 'autonomy';
}

/** 생기부 창체 3영역 표기 ↔ 우리 area 값. 봉사는 생기부에서 자율에 합산된다. */
const NEIS_AREA_MAP: Record<string, ActivityArea> = {
  자율활동: 'autonomy',
  '자율·자치활동': 'autonomy',
  동아리활동: 'club',
  진로활동: 'career',
  봉사활동: 'service',
};

export function areaFromNeisLabel(label: string | null | undefined): ActivityArea | null {
  if (!label) return null;
  return NEIS_AREA_MAP[label.replace(/\s/g, '')] ?? null;
}

/** teacher_timetable.activity_type ↔ area. 창체 시간표 슬롯에서 활동을 만들 때 쓴다. */
const TIMETABLE_ACTIVITY_MAP: Record<string, ActivityArea> = {
  club: 'club',
  career: 'career',
  autonomy: 'autonomy',
};

export function areaFromTimetableActivityType(
  activityType: string | null | undefined
): ActivityArea | null {
  if (!activityType) return null;
  return TIMETABLE_ACTIVITY_MAP[activityType] ?? null;
}

// ----------------------------------------
// 주최 맥락
// ----------------------------------------

const HOST_KIND_LABELS: Record<ActivityHostKind, string> = {
  club: '동아리',
  grade: '학년',
  school: '학교',
  department: '부서',
  external: '외부기관',
  teacher: '개인',
};

export function getHostKindLabel(kind: ActivityHostKind | null | undefined): string {
  return (kind && HOST_KIND_LABELS[kind]) || '기타';
}

// ----------------------------------------
// 운영 형태 · 규모 · 예산
// ----------------------------------------

const OPERATOR_LABELS: Record<ActivityOperatorType, string> = {
  internal: '교내 운영',
  external: '외부 업체',
  joint: '공동 운영',
};

export function getOperatorLabel(t: ActivityOperatorType | null | undefined): string {
  return (t && OPERATOR_LABELS[t]) || '교내 운영';
}

const SCALE_LABELS: Record<ActivityScale, string> = {
  school: '전교',
  grade: '학년',
  class: '학급',
  group: '소집단',
  individual: '개별',
};

export function getScaleLabel(s: ActivityScale | null | undefined): string {
  return (s && SCALE_LABELS[s]) || '소집단';
}

const BUDGET_LABELS: Record<ActivityBudgetSource, string> = {
  school: '학교 일반예산',
  office: '교육청 사업',
  grant: '공모 사업',
  external: '외부 기관',
  self: '자부담',
  none: '예산 없음',
};

export function getBudgetSourceLabel(b: ActivityBudgetSource | null | undefined): string {
  return (b && BUDGET_LABELS[b]) || '미지정';
}

export const BUDGET_SOURCES: ActivityBudgetSource[] = [
  'school', 'office', 'grant', 'external', 'self', 'none',
];

export const OPERATOR_TYPES: ActivityOperatorType[] = ['internal', 'external', 'joint'];
export const ACTIVITY_SCALES: ActivityScale[] = ['school', 'grade', 'class', 'group', 'individual'];

// ----------------------------------------
// 상태 — 텍스트가 아니라 색으로 읽힌다 (dialogDesign 규약)
// ----------------------------------------

const STATUS_LABELS: Record<ActivityStatus, string> = {
  planned: '예정',
  running: '진행 중',
  done: '완료',
  cancelled: '취소',
};

const STATUS_CLASSES: Record<ActivityStatus, string> = {
  planned: 'bg-slate-50 text-slate-600 border-slate-200',
  running: 'bg-blue-50 text-blue-700 border-blue-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function getStatusLabel(s: ActivityStatus | null | undefined): string {
  return (s && STATUS_LABELS[s]) || '예정';
}

export function getStatusClass(s: ActivityStatus | null | undefined): string {
  return (s && STATUS_CLASSES[s]) || STATUS_CLASSES.planned;
}

export const ACTIVITY_STATUSES: ActivityStatus[] = ['planned', 'running', 'done', 'cancelled'];

// ----------------------------------------
// 참여 · 담당
// ----------------------------------------

const PARTICIPATION_ROLE_LABELS: Record<ParticipationRole, string> = {
  member: '참여',
  leader: '리더',
  presenter: '발표',
  staff: '운영',
};

export function getParticipationRoleLabel(r: ParticipationRole | null | undefined): string {
  return (r && PARTICIPATION_ROLE_LABELS[r]) || '참여';
}

const PARTICIPATION_STATUS_LABELS: Record<ParticipationStatus, string> = {
  applied: '신청',
  active: '참여',
  completed: '이수',
  withdrawn: '중도 이탈',
};

export function getParticipationStatusLabel(s: ParticipationStatus | null | undefined): string {
  return (s && PARTICIPATION_STATUS_LABELS[s]) || '참여';
}

/** 시수·이수 집계에 포함되는 참여 상태. 신청·이탈은 제외한다. */
export const COUNTED_PARTICIPATION_STATUSES: ParticipationStatus[] = ['active', 'completed'];

const TEACHER_ROLE_LABELS: Record<ActivityTeacherRole, string> = {
  lead: '주담당',
  co: '공동',
  support: '보조',
};

export function getTeacherRoleLabel(r: ActivityTeacherRole | null | undefined): string {
  return (r && TEACHER_ROLE_LABELS[r]) || '주담당';
}

// ----------------------------------------
// 기간 표기
// ----------------------------------------

/** '2026-03-27' → '3.27' / 기간이면 '3.27–3.29' */
export function formatActivityPeriod(
  startsOn: string | null | undefined,
  endsOn?: string | null
): string {
  if (!startsOn) return '';
  const short = (iso: string) => {
    const [, m, d] = iso.split('-');
    if (!m || !d) return iso;
    return `${Number(m)}.${Number(d)}`;
  };
  if (!endsOn || endsOn === startsOn) return short(startsOn);
  return `${short(startsOn)}–${short(endsOn)}`;
}

/** 하루짜리 활동인가 */
export function isSingleDay(startsOn: string, endsOn: string | null | undefined): boolean {
  return !endsOn || endsOn === startsOn;
}
