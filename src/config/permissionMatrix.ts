/**
 * 태그 기반 권한 매트릭스 — Single Source of Truth
 * ================================================
 *
 * 이 앱의 "진짜" 권한 시스템은 `resource_tags` + `resource_tag_assignments` 이다.
 * 교직원에게 붙은 태그가 여러 기능의 접근을 제어하는데, 그 규칙은 원래
 * 6개 이상의 훅(useRescueAccess, useWishlistAccess, useClassManagementAccess,
 * useEvalogPermissions, useIsTrainingManager, supervisionService 등)에
 * 하드코딩되어 흩어져 있었다.
 *
 * 이 파일은 그 규칙들을 한 곳에 선언적으로 모은 것이다. 관리자 "권한 관리"
 * 페이지가 이 데이터를 직접 렌더하므로, 새 권한 기능이 추가되면 해당 훅을
 * 만든 뒤 여기에 한 항목만 추가하면 매트릭스/기능 뷰에 자동으로 반영된다.
 *
 * ⚠️ 주의: 이 파일은 "열람용 매핑"이다. 실제 권한 판정은 각 훅과 서버 RLS/RPC가
 * 수행한다. 여기 내용을 바꾼다고 실제 권한이 바뀌지 않는다(규칙은 코드에 있음).
 * 실제 권한을 바꾸려면 태그 ↔ 교직원 "할당"을 수정해야 하며, 그건 이 페이지의
 * 할당 편집 기능(resource_tag_assignments)으로 가능하다.
 */

/**
 * 태그를 매칭하는 방식.
 * - exact:   고정된 태그 이름 하나와 정확히 일치 (예: "상담교사")
 * - pattern: 정규식 패턴으로 매칭되는 태그군 (예: "N학년 M반", "N학년 부장")
 */
export type TagRuleKind = 'exact' | 'pattern';

/** 한 기능이 인식하는 하나의 태그 규칙 + 그 규칙이 부여하는 권한 */
export interface TagRule {
  kind: TagRuleKind;
  /** exact: 태그 이름. pattern: 사람이 읽는 라벨(예: "N학년 M반") */
  label: string;
  /** pattern 일 때만: 태그 이름을 검사할 정규식 */
  pattern?: RegExp;
  /** 이 규칙에 매칭되는 태그가 부여하는 권한(짧은 셀 라벨, 예: "전체", "담임반", "학년", "제외") */
  grant: string;
  /** 권한에 대한 상세 설명(툴팁/기능 뷰용) */
  detail: string;
  /**
   * 셀 강조 톤.
   * - full:    전체 접근 (강한 강조)
   * - scoped:  범위 제한 접근 (담임 반 / 학년 등)
   * - exclude: 제외(이 기능에서 빠짐) — 부정적 의미
   */
  tone: 'full' | 'scoped' | 'exclude';
}

/** 권한이 적용되는 하나의 기능(매트릭스의 열) */
export interface FeaturePermission {
  /** 안정적 식별자 */
  key: string;
  /** 기능 이름 (예: "위기 노트") */
  label: string;
  /** 매트릭스 열 헤더용 짧은 이름 */
  shortLabel: string;
  /** 이 기능이 하는 일 한 줄 설명 */
  description: string;
  /** 권한을 판정하는 코드 위치(개발자 추적용) */
  source: string;
  /** admin 이 항상 전체 접근을 갖는가 */
  adminFullAccess: boolean;
  /** 이 기능이 인식하는 태그 규칙들 */
  rules: TagRule[];
}

// ── 공통 패턴 (코드 전반에서 동일하게 쓰이는 규칙) ──────────────────
// useRescueAccess / useWishlistAccess / parseTeacherTag 와 동일한 정규식.
const HOMEROOM_PATTERN = /^(\d+)학년\s*(\d+)반$/; // "2학년 3반" → 담임
const GRADE_HEAD_PATTERN = /^(\d+)학년\s*부장$/; // "2학년 부장" → 그 학년 한정
// 학년 접두사가 없는 "부장"만(교무부장 등) → 전체 접근.
// parseTeacherTag/parseTag 가 GRADE_HEAD_PATTERN 을 먼저 검사하고 떨어지는 것과
// 동일하게, 여기서도 "N학년 부장" 형태는 제외한다(negative lookahead).
const ANY_HEAD_PATTERN = /^(?!\d+학년).*부장/;

/** 담임 규칙(여러 기능이 공유) */
const homeroomRule = (grant: string, detail: string): TagRule => ({
  kind: 'pattern',
  label: 'N학년 M반',
  pattern: HOMEROOM_PATTERN,
  grant,
  detail,
  tone: 'scoped',
});

/** 학년 부장 규칙(여러 기능이 공유) */
const gradeHeadRule = (grant: string, detail: string): TagRule => ({
  kind: 'pattern',
  label: 'N학년 부장',
  pattern: GRADE_HEAD_PATTERN,
  grant,
  detail,
  tone: 'scoped',
});

/**
 * 권한이 적용되는 모든 기능 목록 (매트릭스/기능 뷰의 데이터 소스).
 * 새 권한 기능이 생기면 여기에 항목을 추가한다.
 */
export const FEATURE_PERMISSIONS: FeaturePermission[] = [
  {
    key: 'rescue-note',
    label: '위기 노트',
    shortLabel: '위기노트',
    description:
      '학생 민감 정보·상담일지·장학금 수여 관리. 상담교사/위기관리담당자는 전교, 담임은 자기 반, 학년부장은 자기 학년 학생을 열람·기록한다.',
    source: 'src/features/rescue-note/hooks/useRescueAccess.ts',
    adminFullAccess: true,
    rules: [
      {
        kind: 'exact',
        label: '상담교사',
        grant: '전체',
        detail: '전교 학생 위기 노트 열람·기록 (상담교사 권한)',
        tone: 'full',
      },
      {
        kind: 'exact',
        label: '위기관리담당자',
        grant: '전체',
        detail: '전교 학생 위기 노트 + 위기 태그 정의 관리 (최고 권한)',
        tone: 'full',
      },
      gradeHeadRule('학년', '자기 학년 전체 학생의 위기 노트 열람·기록'),
      homeroomRule('담임반', '자기 반 학생의 위기 노트 열람·기록'),
    ],
  },
  {
    key: 'admission-wishlist',
    label: '수시 지원',
    shortLabel: '수시',
    description:
      '학생 수시 지원 학교(교과·종합) 대리 신청·수정. 담임은 자기 반, 학년부장은 자기 학년 학생을 대신 신청한다.',
    source: 'src/features/admission-wishlist/hooks/useWishlistAccess.ts',
    adminFullAccess: true,
    rules: [
      gradeHeadRule('학년', '자기 학년 전체 학생 수시 지원 대리 신청·수정(R/W)'),
      homeroomRule('담임반', '자기 반 학생 수시 지원 대리 신청·수정(R/W)'),
    ],
  },
  {
    key: 'evalog-activities',
    label: '생기부 비교과',
    shortLabel: '생기부',
    description:
      '생기부 분석의 비교과(출결·자율·동아리·진로·봉사·행특·세특) 영역 열람. 태그-학년반 매칭 시 접근하며, evalog_tag_permissions 테이블로 영역별 세분 설정도 가능하다.',
    source: 'src/features/evalog/hooks/useEvalogPermissions.ts',
    adminFullAccess: true,
    rules: [
      {
        kind: 'pattern',
        label: '부장',
        pattern: ANY_HEAD_PATTERN,
        grant: '전체',
        detail: '학년 없는 "부장"(교무부장 등) → 전 학년 생기부 비교과 전체 접근',
        tone: 'full',
      },
      // "N학년 부장" → 그 학년 전체 학생의 생기부 비교과 열람(학년 한정).
      gradeHeadRule('학년', '자기 학년 전체 학생의 생기부 비교과 열람'),
      homeroomRule('담임반', '매칭되는 학년/반 학생의 생기부 비교과 열람'),
    ],
  },
  {
    key: 'class-management',
    label: '학급 관리(교과 분석)',
    shortLabel: '학급관리',
    description:
      '교과 분석에서 현재 차수 학급 학생의 선택과목을 대신 편집. 부장은 전체 반, 담임은 자기 반을 관리한다.',
    source: 'src/features/course-analyze/hooks/useClassManagementAccess.ts',
    adminFullAccess: true,
    rules: [
      {
        kind: 'pattern',
        label: '부장',
        pattern: ANY_HEAD_PATTERN,
        grant: '전체',
        detail: '학년 없는 "부장"(교무부장 등) → 전체 반 선택과목 편집',
        tone: 'full',
      },
      // "N학년 부장" → 그 학년 전체 반 선택과목 편집(학년 한정).
      gradeHeadRule('학년', '자기 학년 전체 반 선택과목 편집'),
      homeroomRule('담임반', '자기 반 학생 선택과목 편집'),
    ],
  },
  {
    key: 'training-cert',
    label: '연수 이수증',
    shortLabel: '연수',
    description:
      '연수 이수증 전체 목록 열람 및 연수 종류 관리. "연수담당자" 태그 보유자가 관리자 권한을 가진다.',
    source: 'src/features/training-certificate/hooks/useIsTrainingManager.ts',
    adminFullAccess: true,
    rules: [
      {
        kind: 'exact',
        label: '연수담당자',
        grant: '관리',
        detail: '전체 연수 이수증 목록 열람 + 연수 종류 관리',
        tone: 'full',
      },
    ],
  },
  {
    key: 'exam-supervision',
    label: '시험 감독 배정',
    shortLabel: '감독',
    description:
      '시험 감독 자동 배정. 담임은 첫·마지막 교시 자기 반에 고정 배정되고, 학교관리자·고사운영교사 태그는 감독 풀에서 항상 제외된다.',
    source: 'src/features/exam-schedule/services/supervisionService.ts',
    adminFullAccess: false,
    rules: [
      homeroomRule('담임', '모의고사 첫·마지막 교시 자기 반 감독 고정'),
      {
        kind: 'exact',
        label: '학교관리자',
        grant: '제외',
        detail: '감독 자동 배정 풀에서 항상 제외(교장·교감 등)',
        tone: 'exclude',
      },
      {
        kind: 'exact',
        label: '고사운영교사',
        grant: '제외',
        detail: '감독 자동 배정 풀에서 항상 제외(고사 본부 운영)',
        tone: 'exclude',
      },
    ],
  },
];

/** 매트릭스 행에 표시할, 코드가 인식하는 "알려진 태그" 한 개 */
export interface KnownTag {
  /** 태그 이름(exact) 또는 패턴 라벨 */
  label: string;
  kind: TagRuleKind;
  pattern?: RegExp;
  /** 이 태그가 부여하는 (기능 key → 권한 셀) 매핑 */
  grants: Record<string, { grant: string; detail: string; tone: TagRule['tone'] }>;
}

/**
 * FEATURE_PERMISSIONS 를 "태그 중심"으로 뒤집어, 매트릭스의 행(=알려진 태그) 목록을
 * 만든다. exact 태그는 이름으로, pattern 태그는 라벨로 묶인다.
 *
 * 결과 순서: 패턴 태그(담임/학년부장/부장) 먼저, 그 다음 고정 이름 태그.
 */
export function buildKnownTagRows(): KnownTag[] {
  const map = new Map<string, KnownTag>();

  for (const feature of FEATURE_PERMISSIONS) {
    for (const rule of feature.rules) {
      const id = `${rule.kind}:${rule.label}`;
      if (!map.has(id)) {
        map.set(id, {
          label: rule.label,
          kind: rule.kind,
          pattern: rule.pattern,
          grants: {},
        });
      }
      map.get(id)!.grants[feature.key] = {
        grant: rule.grant,
        detail: rule.detail,
        tone: rule.tone,
      };
    }
  }

  const rows = Array.from(map.values());
  // 패턴 태그 먼저(담임/부장 류), 그 다음 고정 이름 태그
  return rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'pattern' ? -1 : 1;
    return a.label.localeCompare(b.label, 'ko');
  });
}

/**
 * 실제 DB의 태그 이름이 코드가 인식하는 "알려진 태그" 중 어디에 해당하는지 찾는다.
 * exact 는 이름 동일, pattern 은 정규식 매칭. 없으면 null(= 권한과 무관한 일반 태그).
 */
export function matchKnownTag(tagName: string, rows: KnownTag[]): KnownTag | null {
  // exact 우선
  for (const row of rows) {
    if (row.kind === 'exact' && row.label === tagName) return row;
  }
  for (const row of rows) {
    if (row.kind === 'pattern' && row.pattern?.test(tagName)) return row;
  }
  return null;
}
