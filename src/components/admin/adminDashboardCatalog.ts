import {
  Activity,
  BookOpen,
  ClipboardList,
  GraduationCap,
  Newspaper,
  Building2,
  type LucideIcon,
} from 'lucide-react';

/**
 * 관리자 대시보드 ▸ 기능별 자료 카탈로그.
 *
 * **건수를 세는 표 목록은 여기가 아니라 `get_admin_dashboard_stats()` RPC 의 allowlist 가
 * 정본이다.** 이 파일은 그 키에 붙일 **표시 정보**(라벨·그룹·설명·이동 경로)만 갖는다.
 * 나누어 둔 이유는 둘의 성격이 다르기 때문이다 — 어떤 표를 세도 되는지는 권한 문제라
 * 서버가 정해야 하고, 그것을 뭐라고 부를지는 화면 문제다.
 *
 * RPC 가 돌려준 키가 여기 없으면 화면은 그 키를 **'기타'** 그룹에 그대로 보여 준다
 * (`resolveDatasetEntry`). 조용히 사라지면 새 기능을 추가한 사람이 자기 자료가 왜
 * 대시보드에 없는지 알 길이 없다.
 */

export type DatasetGroupId =
  | 'work'
  | 'school'
  | 'student'
  | 'curriculum'
  | 'usage'
  | 'other';

export interface DatasetGroup {
  id: DatasetGroupId;
  label: string;
  description: string;
  icon: LucideIcon;
  /** 그룹 강조 색 (Tailwind 클래스 조각) */
  tone: string;
}

export const DATASET_GROUPS: DatasetGroup[] = [
  {
    id: 'work',
    label: '업무 · 협업',
    description: '업무 관리, 업무 흐름, 문서 생성, 협업보드',
    icon: ClipboardList,
    tone: 'text-blue-600',
  },
  {
    id: 'school',
    label: '학교 운영 · 행정',
    description: '일정, 공지, 서류함, 결재, 구매 신청, 발급번호',
    icon: Building2,
    tone: 'text-emerald-600',
  },
  {
    id: 'student',
    label: '학생 기록',
    description: '생기부, 지필평가, 지식그래프, 위기 노트, 수시 지원',
    icon: GraduationCap,
    tone: 'text-violet-600',
  },
  {
    id: 'curriculum',
    label: '교육과정 · 시간표',
    description: '교육과정, 과목 개설, 편성, 시간표, 선택과목',
    icon: BookOpen,
    tone: 'text-amber-600',
  },
  {
    id: 'usage',
    label: '학생 이용 기능',
    description: '자습실, 방과후, 암기카드, 실시간 수업, 스마트기기, 아카데미, 다마고찌',
    icon: Activity,
    tone: 'text-cyan-600',
  },
  {
    id: 'other',
    label: '기타',
    description: '카탈로그에 아직 등록되지 않은 항목',
    icon: Newspaper,
    tone: 'text-slate-500',
  },
];

export interface DatasetEntry {
  key: string;
  label: string;
  group: DatasetGroupId;
  /** 카드 아래 회색 보조 설명 (짧게) */
  hint?: string;
  /** 클릭 시 이동할 앱 경로 (없으면 이동 불가) */
  route?: string;
}

export const DATASET_CATALOG: DatasetEntry[] = [
  // 업무 · 협업
  { key: 'events', label: '업무', group: 'work', hint: '할 일 묶음(프로젝트)', route: '/tasks/mine' },
  { key: 'tasks', label: '세부 할 일', group: 'work', route: '/tasks/mine' },
  { key: 'task_submissions', label: '할 일 제출물', group: 'work', hint: '파일 · 값 제출' },
  { key: 'workflows', label: '업무 흐름', group: 'work', route: '/tasks/workflow' },
  { key: 'work_runs', label: '실행 기록', group: 'work' },
  { key: 'work_documents', label: '생성 문서', group: 'work', hint: 'HWPX 스펙 문서' },
  { key: 'doc_templates', label: '문서 양식', group: 'work', route: '/document-generation' },
  { key: 'docgen_contexts', label: '맥락 정보', group: 'work', hint: '문서 생성 참고 자료' },
  { key: 'collab_boards', label: '협업보드', group: 'work', route: '/collab' },
  { key: 'collab_notes', label: '협업 노트', group: 'work', route: '/collab' },

  // 학교 운영 · 행정
  { key: 'meetings', label: '일정', group: 'school', hint: '학사일정 · 출장 · 연수 · 근무', route: '/schedule' },
  { key: 'notices', label: '부서 공지', group: 'school', route: '/notices' },
  { key: 'documents', label: '서류함 문서', group: 'school', route: '/documents' },
  { key: 'document_folders', label: '서류함 폴더', group: 'school' },
  { key: 'approvals', label: '결재 문서', group: 'school' },
  { key: 'purchase_pages', label: '구매 신청 게시판', group: 'school', route: '/purchase-requests' },
  { key: 'purchase_requests', label: '구매 신청', group: 'school', route: '/purchase-requests' },
  { key: 'document_issues', label: '발급번호', group: 'school', route: '/issue-register/gajeong' },
  { key: 'training_certificates', label: '연수 이수증', group: 'school', route: '/training-certificates' },
  { key: 'departments', label: '부서', group: 'school' },

  // 학생 기록
  { key: 'students', label: '학생 기본정보', group: 'student', hint: '졸업생 포함', route: '/evalog' },
  { key: 'detailed_activities', label: '세부능력 특기사항', group: 'student', route: '/evalog' },
  { key: 'career_submissions', label: '진로 과제 제출', group: 'student' },
  { key: 'school_exam_results', label: '지필평가 응시 기록', group: 'student', route: '/evalearn' },
  { key: 'school_exam_questions', label: '지필평가 문항', group: 'student', route: '/evalearn' },
  { key: 'kg_versions', label: '지식그래프 버전', group: 'student', route: '/knowledge-graph' },
  { key: 'kg_entities', label: '지식그래프 노드', group: 'student' },
  { key: 'kg_relations', label: '지식그래프 관계', group: 'student' },
  { key: 'rescue_notes', label: '위기 노트', group: 'student', route: '/rescue-note' },
  { key: 'admission_wishlists', label: '수시 지원 목록', group: 'student', route: '/admission-wishlist' },
  { key: 'inquiry_designs', label: '탐구 설계', group: 'student', route: '/inquiry-design' },
  { key: 'activities', label: '창의적 체험활동', group: 'student', route: '/activities' },
  { key: 'activity_participation', label: '창체 참여 기록', group: 'student', route: '/activities' },
  { key: 'teacher_memos', label: '교사 메모', group: 'student' },
  { key: 'class_memos', label: '수업 학생 메모', group: 'student' },

  // 교육과정 · 시간표
  { key: 'curriculum', label: '교육과정 편제', group: 'curriculum' },
  { key: 'achievement_standards', label: '성취기준', group: 'curriculum' },
  { key: 'offerings', label: '과목 개설', group: 'curriculum' },
  { key: 'enrollments', label: '학생 편성', group: 'curriculum' },
  { key: 'teacher_timetable', label: '교사 시간표 슬롯', group: 'curriculum', route: '/timetable' },
  { key: 'student_timetable', label: '학생 시간표 슬롯', group: 'curriculum', route: '/timetable' },
  { key: 'sections', label: '분반(섹션)', group: 'curriculum' },
  { key: 'selection_submissions', label: '선택과목 제출', group: 'curriculum' },
  { key: 'selection_items', label: '선택과목 선택 항목', group: 'curriculum' },
  { key: 'exam_schedules', label: '시험 시간표', group: 'curriculum' },
  { key: 'timetable_plans', label: '시간표 생성 계획', group: 'curriculum' },
  { key: 'class_swaps', label: '수업 교체 · 대체', group: 'curriculum', route: '/timetable' },
  { key: 'mock_problems', label: '모의고사 문항', group: 'curriculum' },

  // 학생 이용 기능
  { key: 'seat_reservations', label: '자습실 예약', group: 'usage' },
  { key: 'afterschool', label: '방과후 수강', group: 'usage' },
  { key: 'srs_cards', label: '암기카드', group: 'usage', route: '/spaced-repetition' },
  { key: 'live_sessions', label: '실시간 수업 세션', group: 'usage' },
  { key: 'student_devices', label: '학생 스마트기기', group: 'usage', route: '/smart-devices' },
  { key: 'device_logs', label: '스마트기기 사용 기록', group: 'usage' },
  { key: 'univ_admissions', label: '대학 전형 정보', group: 'usage', hint: '리로스쿨 수집', route: '/ipsi' },
  { key: 'educational_news', label: '교육 뉴스', group: 'usage', route: '/ipsi' },
  { key: 'educational_videos', label: '교육 영상', group: 'usage', route: '/videos' },
  // 별빛 탐구 아카데미. **kidon 에서 이름만 바꿔 온 표(academy_user_stats·plans·tasks 등)는
  // 여기 넣지 않는다** — 2025년 레거시 행이 대부분이라 아카데미 이용량으로 읽히면 틀린다.
  // 장별 진행 현황은 따로 있다(`adminDashboardAcademy.ts` + 대시보드 아카데미 카드).
  { key: 'academy_chapters', label: '아카데미 챕터 진행', group: 'usage', hint: '학생 × 장 기록', route: '/academy' },
  { key: 'academy_daily', label: '아카데미 오늘의 만남', group: 'usage', hint: 'NPC 일일 대화', route: '/academy' },
  { key: 'academy_workshop', label: '아카데미 공방 주문', group: 'usage', hint: '맞춤 제작 의뢰' },
  // 다마고찌(2026-10-06 출시). 일기는 **건수만** 센다 — 본문은 본인만 읽는다.
  { key: 'tama_pets', label: '다마고찌 펫', group: 'usage', hint: '쉬는 펫 포함', route: '/tamagotchi' },
  { key: 'tama_album', label: '다마고찌 앨범', group: 'usage', hint: '부화 · 진화 · 병 기록' },
  { key: 'tama_diary', label: '다마고찌 펫 일기', group: 'usage', hint: '건수만(본문은 본인만)' },
  { key: 'tama_gacha', label: '다마고찌 가챠', group: 'usage' },
  { key: 'tama_focus', label: '다마고찌 함께 집중', group: 'usage' },
];

const BY_KEY = new Map(DATASET_CATALOG.map((entry) => [entry.key, entry]));

/**
 * RPC 가 돌려준 키를 카탈로그 항목으로 바꾼다.
 * 등록되지 않은 키는 '기타' 그룹에 키 이름 그대로 노출한다(누락 감지).
 */
export function resolveDatasetEntry(key: string): DatasetEntry {
  return BY_KEY.get(key) ?? { key, label: key, group: 'other' };
}

/**
 * `recent` 가 비어 있는 이유. null 이면 정상적으로 계산된 것.
 *
 * 셋을 구분하는 이유: 화면이 "0건"과 "못 셌음"을 같은 회색 글씨로 뭉개면,
 * 관리자는 그 기능이 안 쓰이는 건지 지표가 없는 건지 알 수 없다.
 */
export type DatasetSkipReason = 'no_timestamp' | 'too_large' | 'budget' | null;

/**
 * 한 표의 건수.
 *
 * **`exact` 가 이 타입의 핵심이다.** `authenticated` 의 statement_timeout 이 8초라
 * 서버는 큰 표를 실제로 세지 않고 `pg_stat` 추정치를 준다(자세한 이유는 마이그레이션
 * `20260903_admin_dashboard_stats_budget.sql`). 추정치를 정확한 값처럼 그리면
 * 운영 지표가 조용히 거짓말을 하므로, 화면은 반드시 `exact` 를 읽어 표시를 달리해야 한다.
 */
export interface DatasetCount {
  total: number;
  /** 최근 30일 신규. 못 구했으면 null — 이유는 `skipped` */
  recent: number | null;
  /** total 이 실제 count(*) 인가. false = pg_stat 추정치 */
  exact: boolean;
  skipped: DatasetSkipReason;
  /** 추정치일 때 그 통계가 갱신된 시각 */
  as_of: string | null;
}

/**
 * 스냅샷을 만들 때의 집계 기록 (2026-10-08 — 자료 건수는 매번 세지 않는다).
 *
 * `generated_at`·`source` 가 없는 응답은 스냅샷 이전 서버가 **지금 막 센** 값이다.
 */
export interface DatasetCounting {
  counted: number;
  estimated: number;
  elapsed_ms: number;
  budget_hit: boolean;
  size_cap_mb: number;
  generated_at?: string;
  /** nightly = 매일 04:30 야간 집계(큰 표까지 정확) · manual = [지금 다시 세기] · bootstrap = 배포 직후 첫 조회 */
  source?: 'nightly' | 'manual' | 'bootstrap';
}

/** 야간 집계가 하루에 한 번이므로, 이보다 오래되면 크론이 멈춘 것이다 */
export const DATASET_STALE_HOURS = 36;

const SOURCE_LABEL: Record<NonNullable<DatasetCounting['source']>, string> = {
  nightly: '야간 집계',
  manual: '수동 집계',
  bootstrap: '첫 집계',
};

/**
 * «기능별 자료 현황»의 기준 시각 문구.
 *
 * 스냅샷은 **낡아도 자동으로 다시 세지 않는다**(그러면 크론 실패가 곧 매 조회의 비용이 된다).
 * 대신 화면이 기준 시각을 늘 말하고, 하루 반을 넘으면 `stale` 로 앰버 경고를 띄운다 —
 * 숫자가 언제 것인지 말하지 않는 대시보드는 조용히 거짓말을 한다.
 */
export function describeDatasetFreshness(
  counting: DatasetCounting,
  now: Date = new Date(),
): { label: string; stale: boolean } {
  if (!counting.generated_at) return { label: '방금 집계', stale: false };
  const at = new Date(counting.generated_at);
  if (Number.isNaN(at.getTime())) return { label: '기준 시각 알 수 없음', stale: true };
  const pad = (n: number) => String(n).padStart(2, '0');
  const when = `${at.getMonth() + 1}/${at.getDate()} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const source = counting.source ? SOURCE_LABEL[counting.source] : '집계';
  const hours = (now.getTime() - at.getTime()) / 3_600_000;
  return { label: `${when} ${source} 기준`, stale: hours > DATASET_STALE_HOURS };
}

/** 추정치 표시용 접두 — 숫자만 보고 정확한 값으로 오해하지 않게 */
export function formatDatasetTotal(count: DatasetCount): string {
  const n = count.total.toLocaleString('ko-KR');
  return count.exact ? n : `약 ${n}`;
}

export const SKIP_REASON_LABEL: Record<Exclude<DatasetSkipReason, null>, string> = {
  no_timestamp: '기록 시각 없음',
  too_large: '큰 표라 생략',
  budget: '시간 초과로 생략',
};

export interface DatasetRow extends DatasetEntry {
  count: DatasetCount;
}

/**
 * RPC 응답을 화면 그룹으로 접는다.
 *
 * 그룹 안 순서는 **카탈로그에 적은 순서**를 유지한다 — 건수 내림차순으로 정렬하면
 * 관련 항목(업무 이벤트 ↔ 세부 업무)이 흩어져 목록이 읽히지 않는다. 크기 비교는
 * 옆의 상대 규모 막대가 맡는다.
 */
export function groupDatasets(
  datasets: Record<string, DatasetCount>,
): Array<{ id: DatasetGroupId; rows: DatasetRow[] }> {
  const buckets = new Map<DatasetGroupId, DatasetRow[]>();
  for (const entry of DATASET_CATALOG) {
    const count = datasets[entry.key];
    if (!count) continue; // RPC 가 세지 않은(=표가 없는) 항목은 그리지 않는다
    const list = buckets.get(entry.group) ?? [];
    list.push({ ...entry, count });
    buckets.set(entry.group, list);
  }
  // 카탈로그에 없는 키는 순서를 정할 근거가 없으므로 뒤에 붙인다
  for (const [key, count] of Object.entries(datasets)) {
    if (BY_KEY.has(key)) continue;
    const entry = resolveDatasetEntry(key);
    const list = buckets.get(entry.group) ?? [];
    list.push({ ...entry, count });
    buckets.set(entry.group, list);
  }
  return DATASET_GROUPS.filter((g) => buckets.has(g.id)).map((g) => ({
    id: g.id,
    rows: buckets.get(g.id)!,
  }));
}

/**
 * KPI·상위 목록용 합계. `top` = 최근 30일 신규가 많은 순.
 *
 * `allApproximate` 는 합계 안에 추정치가 섞였는지 — 섞였으면 KPI 도 '약'으로 적어야 한다.
 * `recent` 합계는 못 센 표를 0으로 취급하므로 **하한**이다(과대평가는 하지 않는다).
 */
export function summarizeDatasets(
  datasets: Record<string, DatasetCount>,
  topN = 8,
): { all: number; recent: number; top: DatasetRow[]; allApproximate: boolean } {
  let all = 0;
  let recent = 0;
  let allApproximate = false;
  const rows: DatasetRow[] = [];
  for (const [key, count] of Object.entries(datasets)) {
    all += count.total;
    recent += count.recent ?? 0;
    if (!count.exact) allApproximate = true;
    rows.push({ ...resolveDatasetEntry(key), count });
  }
  const top = rows
    .filter((r) => (r.count.recent ?? 0) > 0)
    .sort((a, b) => (b.count.recent ?? 0) - (a.count.recent ?? 0))
    .slice(0, topN);
  return { all, recent, top, allApproximate };
}
