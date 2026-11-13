/**
 * 과목 정렬 — **국어 → 수학 → 영어 → 과학탐구 → 사회탐구 → 한국사** (2026-09-03 사용자 결정).
 *
 * 두 가지를 함께 처리해야 한다:
 *  1. **3학년은 선택과목 키로 온다.** 마킹·성적표에 '국어'/'수학'이 없고 `화법과작문`,
 *     `확률과통계` 같은 이름으로 들어온다. 그래서 이름을 계열(국어/수학)에 매핑해 둔다.
 *  2. **표기가 흔들린다.** `생명과학Ⅰ` / `생명과학1`, `사회·문화` / `사회문화` 가 섞여 온다
 *     (마킹과 성적표가 다른 파일에서 적재된다). 정규화한 뒤 비교한다.
 *
 * 목록에 없는 과목은 그 뒤에 가나다순으로 붙는다 — 새 과목이 생겨도 사라지지 않는다.
 */

/** 표기 흔들림 제거: 가운뎃점·공백 삭제 + 로마숫자 -> 아라비아. */
function canonical(subject: string): string {
  return subject
    .replace(/[·․‧∙・ㆍ]/g, '')
    .replace(/\s+/g, '')
    .replace(/Ⅰ/g, '1')
    .replace(/Ⅱ/g, '2')
    .replace(/Ⅲ/g, '3');
}

/**
 * 표시 순서. 계열 안의 순서는 교육과정 순서를 따른다.
 * (국어·수학의 선택과목은 공통 바로 뒤에 붙는다)
 */
const ORDER: string[] = [
  // 국어 계열
  '국어', '화법과작문', '언어와매체',
  // 수학 계열
  '수학', '확률과통계', '미적분', '기하',
  // 영어
  '영어',
  // 과학탐구 — 1·2학년 성적표(mock_result)는 통합과목을 `공통과학`/`공통사회` 로 적는다
  '과학탐구', '통합과학', '공통과학',
  '물리학1', '화학1', '생명과학1', '지구과학1',
  '물리학2', '화학2', '생명과학2', '지구과학2',
  // 사회탐구
  '사회탐구', '통합사회', '공통사회',
  '생활과윤리', '윤리와사상', '한국지리', '세계지리',
  '동아시아사', '세계사', '경제', '정치와법', '사회문화',
  // 한국사는 맨 뒤
  '한국사',
];

const RANK = new Map<string, number>();
ORDER.forEach((name, i) => RANK.set(canonical(name), i));

/** 3학년 공통 트랙 이름도 같은 자리에 둔다(`공통`은 국어·수학 양쪽에 쓰이나 목록엔 잘 안 온다) */
RANK.set(canonical('공통'), RANK.get(canonical('국어'))!);

/** 과목 분야 — 버튼을 묶어 보여줄 때 쓴다 */
export type SubjectArea = '국어' | '수학' | '영어' | '과학탐구' | '사회탐구' | '한국사' | '기타';
export const SUBJECT_AREAS: SubjectArea[] = ['국어', '수학', '영어', '과학탐구', '사회탐구', '한국사', '기타'];

const AREA_OF: Record<string, SubjectArea> = {};
{
  const assign = (area: SubjectArea, names: string[]) => {
    for (const n of names) AREA_OF[canonical(n)] = area;
  };
  assign('국어', ['국어', '화법과작문', '언어와매체']);
  assign('수학', ['수학', '확률과통계', '미적분', '기하']);
  assign('영어', ['영어']);
  assign('과학탐구', ['과학탐구', '통합과학', '공통과학', '물리학1', '화학1', '생명과학1', '지구과학1', '물리학2', '화학2', '생명과학2', '지구과학2']);
  assign('사회탐구', ['사회탐구', '통합사회', '공통사회', '생활과윤리', '윤리와사상', '한국지리', '세계지리', '동아시아사', '세계사', '경제', '정치와법', '사회문화']);
  assign('한국사', ['한국사']);
}

/** 과목 -> 분야. 3학년 선택과목·표기 흔들림을 모두 흡수한다. */
export function subjectArea(subject: string): SubjectArea {
  return AREA_OF[canonical(subject)] ?? '기타';
}

/**
 * 분야별로 묶어 정렬한다. 빈 분야는 돌려주지 않는다.
 * 과목 버튼을 분야로 구분해 보여줄 때 쓴다(학년·학급 분석).
 */
export function groupSubjectsByArea(subjects: string[]): { area: SubjectArea; subjects: string[] }[] {
  const buckets = new Map<SubjectArea, string[]>();
  for (const s of subjects) {
    const area = subjectArea(s);
    const list = buckets.get(area) ?? [];
    list.push(s);
    buckets.set(area, list);
  }
  return SUBJECT_AREAS
    .filter((a) => (buckets.get(a)?.length ?? 0) > 0)
    .map((area) => ({ area, subjects: sortSubjects(buckets.get(area)!) }));
}

export function sortSubjects(subjects: string[]): string[] {
  return [...subjects].sort((a, b) => {
    const ra = RANK.get(canonical(a));
    const rb = RANK.get(canonical(b));
    // 목록에 없는 과목은 뒤로, 그들끼리는 가나다순
    if (ra == null && rb == null) return a.localeCompare(b, 'ko');
    if (ra == null) return 1;
    if (rb == null) return -1;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b, 'ko');
  });
}
