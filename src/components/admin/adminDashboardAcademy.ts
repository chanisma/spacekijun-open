/**
 * 관리자 대시보드 ▸ 별빛 탐구 아카데미 진행 현황.
 *
 * `adminDashboardCatalog.ts` 와 같은 분업을 따른다 — **무엇을 세는지는 서버**
 * (`get_admin_dashboard_stats()` 의 `academy` 블록), **뭐라고 부르는지는 여기**.
 * 그래서 이 파일에는 단계 수(`final_step`)가 없다: 서버가 돌려준 값을 쓴다.
 * 값을 여기 또 적으면 이야기가 길어졌을 때 둘이 조용히 어긋난다.
 *
 * ## 이 화면이 답하려는 것
 *
 * "아카데미가 쓰이고 있는가"는 표 건수로는 알 수 없다. 이야기는 **순서대로 열리는
 * 다섯 장**이고(제2장은 제1장을 마쳐야 열린다), 관리자가 알고 싶은 것은
 * **어느 장에서 사람이 멈췄는가**다. 그래서 깔때기(funnel)로 그린다.
 * 아래로 갈수록 인원이 주는 것은 고장이 아니라 설계다.
 *
 * ## 학생과 교직원을 반드시 갈라 센다
 *
 * 아카데미는 학생용이지만 교사·관리자도 들어가 볼 수 있다. 2026-09-14 실측 기준
 * 챕터 기록을 가진 사람이 **학생 1명 + 관리자 1명**이라, 합쳐서 세면 "2명이 하고 있다"로
 * 보인다 — 절반이 만든 사람 본인이다. 참여 지표는 **학생 수가 본문**이고 교직원은
 * 괄호 안 보조 숫자다.
 *
 * ## ⚠️ 참여자를 kidon 표로 세지 말 것
 *
 * `academy_user_stats`·`academy_plans`·`academy_tasks`·`academy_user_goals` 등은
 * kidon 앱의 표를 **이름만 바꿔** 온 것이고 기존 행을 전부 보존했다
 * (`docs/features/academy-dormitory.md`). `academy_user_stats` 37행 중 36행이 2025년
 * 생성이고 그중 2명은 `profiles` 에도 없다. 아카데미가 실제로 만드는 것은
 * `academy_chapters` 와 `academy_prologues` 둘뿐이다.
 */

/** 서버 `academy.chapters[]` 한 항목. 모든 수치는 정확한 count 다(표가 작다). */
export interface AcademyChapterStat {
  key: string;
  /** 그 장의 마지막 단계. 서버 선언에 없는 장(=새로 생긴 장)이면 null */
  final_step: number | null;
  student_total: number;
  student_done: number;
  /** **진행 중인** 학생들의 step 합계. 완료자는 빠져 있다 */
  student_progress_sum: number;
  faculty_total: number;
  faculty_done: number;
  /** 관측된 최대 step. `final_step` 을 넘으면 서버 선언이 낡은 것이다 */
  step_max: number | null;
  last_activity: string | null;
}

/**
 * 서버 `academy.players_list[]` 한 항목 — **최근 활동순, 상한 200명**.
 *
 * 깔때기는 "어느 장에서 멈췄나"에 답하지만 "그게 누구냐"에는 답하지 못한다.
 * 참여자가 두세 명인 초기에는 그 숫자가 사실상 아무 정보가 아니라, 명단을 함께 준다.
 */
export interface AcademyPlayer {
  user_id: string;
  /**
   * `profiles.name`. 졸업 처리가 이 컬럼을 별칭(`YYYY입학NNN`)으로 덮으므로
   * **익명화가 자동으로 따라온다**. 프로필이 없는 옛 기록이면 null.
   */
  name: string | null;
  is_student: boolean;
  /** 학생만. `resource.meta` 에 든 값 그대로라 **문자열**이다(숫자로 가정하지 말 것) */
  grade: string | null;
  class: string | null;
  number: string | null;
  /** 도달한 장 중 가장 먼 장. 챕터 기록이 없으면 `'prologue'` */
  stage_key: string;
  stage_step: number | null;
  /** 프롤로그는 null — 장면 수가 클라이언트 스토리 파일에만 있어 서버가 모른다 */
  stage_final_step: number | null;
  stage_done: boolean;
  /** 프롤로그 행이 없으면 null. **건너뛰기도 `completed_at` 을 찍으므로** 따로 온다 */
  prologue_skipped: boolean | null;
  last_seen: string | null;
}

export interface AcademyStats {
  chapters: AcademyChapterStat[];
  players: {
    total: number;
    student: number;
    faculty: number;
    student_active_7d: number;
    active_7d: number;
  };
  /**
   * 참여자 명단. 서버가 이 키를 돌려주기 전에 배포된 클라이언트가 있을 수 있어 optional
   * (`AdminDashboardStats.academy` 와 같은 이유).
   */
  players_list?: AcademyPlayer[];
  prologue: {
    student_total: number;
    student_done: number;
    /**
     * **`student_done` 에 포함된 값이다.** 건너뛰기도 `completed_at` 을 찍기 때문에
     * (라이브 확인: `skipped=true` 인 행도 `completed_at is not null`), 이 수를 따로
     * 빼지 않으면 31장을 다 읽은 사람과 첫 화면에서 건너뛴 사람이 같은 '완료'가 된다.
     */
    student_skipped: number;
    faculty_total: number;
    faculty_done: number;
  };
}

export interface AcademyStageEntry {
  key: string;
  label: string;
  /** 라벨 아래 회색 한 줄 — 그 장에서 학생이 실제로 하는 일 */
  hint?: string;
  /**
   * 장이 아니라 장 **사이**의 관문(현재 막간 하나).
   * 화면에서 들여쓰고 작게 그려, 번호가 붙은 장과 섞이지 않게 한다.
   * 깔때기 분모(첫 항목)를 고를 때도 건너뛴다.
   */
  interlude?: boolean;
}

/** 프롤로그는 `academy_chapters` 가 아니라 `academy_prologues` 에 있어 서버가 따로 준다 */
export const ACADEMY_PROLOGUE_KEY = 'prologue';

/**
 * 장 이름은 게임 안 문구와 같아야 한다. 원본은 `src/features/academy/game/*Story.ts` 의
 * `*Title` 이고, 여기 옮겨 적은 값이 그것과 일치하는지는 회귀
 * (`scripts/admin-dashboard-test/run.mts`)가 검사한다.
 *
 * **게임 모듈에서 import 하지 않는 이유**: 스토리 파일은 대사·삽화 참조를 통째로 들고 있어
 * 관리자 번들이 아카데미 에셋 그래프를 끌어오게 된다. 문자열 여섯 개를 옮겨 적고 기계가
 * 대조하는 편이 싸다.
 */
export const ACADEMY_STAGE_CATALOG: AcademyStageEntry[] = [
  { key: ACADEMY_PROLOGUE_KEY, label: '프롤로그 · 아직 이름 없는 별', hint: '31개 장면으로 아카데미에 들어서는 이야기' },
  { key: 'first_star', label: '제1장 · 나의 첫 별', hint: '연구시설에서 첫 탐구를 설계한다' },
  { key: 'library_questions', label: '제2장 · 이야기 속에서 자라는 질문', hint: '도서관에서 활동을 읽고 나의 질문을 남긴다' },
  { key: 'dorm_first_plan', label: '제3장 · 내일을 위한 작은 약속', hint: '기숙사에서 첫 목표와 계획을 세운다' },
  { key: 'post_first_letter', label: '제4장 · 아침의 편지, 새로운 가능성', hint: '우편국에서 기사를 읽고 관측 일지를 쓴다' },
  { key: 'postlude', label: '막간 · 루온과의 약속', hint: '제5장 해금 조건 — 광장 대화 9단계 + 계획 다섯 개 실천', interlude: true },
  { key: 'sky_first_light', label: '제5장 · 서로 끌어당기는 별', hint: '창가의 하늘에서 나의 첫 별을 새긴다' },
];

const BY_KEY = new Map(ACADEMY_STAGE_CATALOG.map((s) => [s.key, s]));

/**
 * 서버가 돌려준 장 키를 표시 정보로 바꾼다.
 * 등록되지 않은 키는 **키 이름 그대로** 보여 준다 — 제6장이 생겼을 때 조용히 사라지면
 * 만든 사람이 자기 장이 왜 대시보드에 없는지 알 길이 없다(`resolveDatasetEntry` 와 같은 이유).
 */
export function resolveAcademyStage(key: string): AcademyStageEntry {
  return BY_KEY.get(key) ?? { key, label: key };
}

export interface AcademyFunnelRow extends AcademyStageEntry {
  stat: AcademyChapterStat;
  /**
   * **끝까지 간** 학생 인원. 프롤로그에서는 `student_done − student_skipped` 다 —
   * 건너뛰기도 `completed_at` 을 찍으므로 그대로 쓰면 첫 화면에서 건너뛴 사람이
   * 31장을 다 읽은 사람과 같은 칸에 들어간다. 다른 단계에서는 `student_done` 과 같다.
   */
  studentCompleted: number;
  /** 학생 진행 중 인원 = 도달 − 완료(건너뜀 포함) */
  studentInProgress: number;
  /** 교직원 진행 중 인원 */
  facultyInProgress: number;
  /**
   * 진행 중인 학생들의 평균 진행률(0~1). 완료자는 빼고 센다 —
   * 섞으면 "완료 1 · 진행 1" 이 평균 50% 로 뭉개져 **어디까지 갔는지**가 사라진다.
   * 진행 중이 없거나 단계 수를 모르면 null.
   */
  inProgressRatio: number | null;
  /** 첫 항목(프롤로그)에 도달한 학생 대비 이 단계에 도달한 학생 비율(0~1). 깔때기 막대 */
  reachRatio: number;
  /**
   * 프롤로그 전용. `student_done` 중 **건너뛴** 인원이라 "끝까지 본" 인원은
   * `student_done − student_skipped` 다. 다른 단계에서는 null.
   */
  skipped: number | null;
  /** `step_max > final_step` — 서버의 단계 수 선언이 DB CHECK 보다 낡았다 */
  stepDrift: boolean;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * 서버 응답을 화면 한 줄씩으로 편다. 프롤로그를 맨 앞에 붙여 **한 줄기 깔때기**로 만든다
 * (프롤로그는 다른 표에 살지만 학생이 겪는 순서로는 제1장 바로 앞이다).
 *
 * 장 순서는 **서버가 준 순서를 그대로 쓴다**(서버가 이야기 순서를 알고 정렬해 준다).
 * 여기서 다시 정렬하면 새 장이 끼어들 때 두 곳을 고쳐야 한다.
 *
 * 깔때기 분모는 **첫 단계(프롤로그)에 도달한 학생 수**다. 전교생을 분모로 쓰면 막대가
 * 전부 0에 붙어 장 사이의 이탈을 못 읽는다 — 이 막대가 답해야 할 질문은
 * "몇 %가 하고 있나"가 아니라 "**어느 단계에서 멈췄나**"다.
 */
export function buildAcademyFunnel(academy: AcademyStats): AcademyFunnelRow[] {
  const prologue: AcademyChapterStat = {
    key: ACADEMY_PROLOGUE_KEY,
    final_step: null, // 장면 수는 클라이언트 스토리 파일에만 있고, 서버는 세지 않는다
    student_total: academy.prologue.student_total,
    student_done: academy.prologue.student_done,
    student_progress_sum: 0,
    faculty_total: academy.prologue.faculty_total,
    faculty_done: academy.prologue.faculty_done,
    step_max: null,
    last_activity: null,
  };

  const stats = [prologue, ...academy.chapters];
  const base = stats.find((s) => !BY_KEY.get(s.key)?.interlude)?.student_total ?? 0;

  return stats.map((stat) => {
    const studentInProgress = Math.max(stat.student_total - stat.student_done, 0);
    const skipped = stat.key === ACADEMY_PROLOGUE_KEY ? academy.prologue.student_skipped : null;
    const denominator = studentInProgress * (stat.final_step ?? 0);
    return {
      ...resolveAcademyStage(stat.key),
      stat,
      studentCompleted: Math.max(stat.student_done - (skipped ?? 0), 0),
      studentInProgress,
      facultyInProgress: Math.max(stat.faculty_total - stat.faculty_done, 0),
      inProgressRatio: denominator > 0 ? clamp01(stat.student_progress_sum / denominator) : null,
      reachRatio: base > 0 ? clamp01(stat.student_total / base) : 0,
      skipped,
      stepDrift: stat.final_step !== null && stat.step_max !== null && stat.step_max > stat.final_step,
    };
  });
}

/* ------------------------------------------------------------- 참여자 명단 */

export interface AcademyPlayerRow {
  /** 화면 key = `user_id` */
  key: string;
  /** 이름이 없는 계정도 줄이 사라지지 않게 자리표시자를 준다 */
  name: string;
  isStudent: boolean;
  /** `3-3 15번`. 학생이 아니거나 학반을 못 풀면 null */
  classLabel: string | null;
  /** 지금 있는 장(라벨 해석 완료). 미등록 키는 키 이름 그대로 */
  stage: AcademyStageEntry;
  stageDone: boolean;
  stageStep: number | null;
  stageFinalStep: number | null;
  /**
   * 진행 중일 때만 0~1. **완료했거나 단계 수를 모르면 null** —
   * 완료를 100%로 그리면 "다 한 사람"과 "마지막 단계에 있는 사람"이 같아 보인다.
   */
  progressRatio: number | null;
  /** 프롤로그를 건너뛴 사람(완료로 세면 안 읽은 이야기가 '완료'가 된다) */
  skippedPrologue: boolean;
  lastSeen: string | null;
}

export interface AcademyPlayerList {
  rows: AcademyPlayerRow[];
  /**
   * 상한(200명)에 걸려 명단에 없는 인원. 총계(`players.total`)는 상한과 무관하게
   * 정확하므로 그 차이가 곧 가려진 수다. **명단 자체가 없으면 0** —
   * 옛 서버에 붙은 클라이언트가 "외 N명"만 덩그러니 말하지 않게 한다.
   */
  hidden: number;
}

const clampRatio = (step: number, final: number) => clamp01(step / final);

/**
 * 서버 명단을 화면 한 줄씩으로 편다. **순서는 서버가 준 그대로**(최근 활동순) —
 * 여기서 다시 정렬하면 상한 200명을 고른 기준과 화면 순서가 갈린다.
 *
 * 학생·교직원을 섞어 두되 줄마다 표시한다. 활동 시각순이 "지금 누가 하고 있나"에
 * 가장 곧게 답하고, 교직원만 걷어내면 시험 플레이가 안 보여 이상 동작을 놓친다.
 */
export function buildAcademyPlayers(academy: AcademyStats): AcademyPlayerList {
  const list = academy.players_list;
  if (!list || list.length === 0) return { rows: [], hidden: 0 };

  const rows = list.map((p): AcademyPlayerRow => {
    const step = p.stage_step;
    const final = p.stage_final_step;
    return {
      key: p.user_id,
      name: p.name?.trim() || '이름 없음',
      isStudent: p.is_student,
      classLabel: formatAcademyClassLabel(p),
      stage: resolveAcademyStage(p.stage_key),
      stageDone: p.stage_done,
      stageStep: step,
      stageFinalStep: final,
      progressRatio:
        p.stage_done || step === null || final === null || final <= 0 ? null : clampRatio(step, final),
      skippedPrologue: p.prologue_skipped === true,
      lastSeen: p.last_seen,
    };
  });

  return { rows, hidden: Math.max(academy.players.total - rows.length, 0) };
}

/**
 * `3-3 15번`. 학반은 **이메일 prefix ↔ `resource.meta->>'id'`** 로만 풀리므로
 * (학생은 `user_resource` 를 쓰지 않는다) 못 푼 경우가 정상적으로 존재한다 —
 * 그때는 이름만 보여 주고 빈 칸을 지어내지 않는다.
 */
export function formatAcademyClassLabel(p: AcademyPlayer): string | null {
  if (!p.is_student) return null;
  const grade = p.grade?.trim();
  const cls = p.class?.trim();
  const num = p.number?.trim();
  if (!grade) return null;
  if (!cls) return `${grade}학년`;
  return num ? `${grade}-${cls} ${num}번` : `${grade}-${cls}`;
}
