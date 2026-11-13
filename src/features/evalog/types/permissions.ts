/** Evalog 세분화 권한 키 목록 */
export const EVALOG_PERMISSION_KEYS = [
  'attendance',
  'autonomy',
  'club',
  'career_activity',
  'volunteer',
  'seteuk:국어',
  'seteuk:수학',
  'seteuk:영어',
  'seteuk:사회',
  'seteuk:과학',
  'seteuk:한국사',
  'seteuk:체육',
  'seteuk:예술',
  'seteuk:기타',
  'behavior',
] as const;

export type EvalogPermissionKey = (typeof EVALOG_PERMISSION_KEYS)[number];

/** 한글 라벨 맵 */
export const PERMISSION_LABELS: Record<EvalogPermissionKey, string> = {
  attendance: '출결상황',
  autonomy: '자율활동',
  club: '동아리활동',
  career_activity: '진로활동',
  volunteer: '봉사활동',
  'seteuk:국어': '세특 - 국어',
  'seteuk:수학': '세특 - 수학',
  'seteuk:영어': '세특 - 영어',
  'seteuk:사회': '세특 - 사회',
  'seteuk:과학': '세특 - 과학',
  'seteuk:한국사': '세특 - 한국사',
  'seteuk:체육': '세특 - 체육',
  'seteuk:예술': '세특 - 예술',
  'seteuk:기타': '세특 - 기타',
  behavior: '행동특성 및 종합의견',
};

/** UI 그룹 */
export const PERMISSION_GROUPS: { label: string; keys: EvalogPermissionKey[] }[] = [
  {
    label: '비교과 활동',
    keys: ['attendance', 'autonomy', 'club', 'career_activity', 'volunteer'],
  },
  {
    label: '세부능력 및 특기사항',
    keys: [
      'seteuk:국어',
      'seteuk:수학',
      'seteuk:영어',
      'seteuk:사회',
      'seteuk:과학',
      'seteuk:한국사',
      'seteuk:체육',
      'seteuk:예술',
      'seteuk:기타',
    ],
  },
  {
    label: '행동특성',
    keys: ['behavior'],
  },
];

/** subject_group → seteuk 권한 키 매핑 */
export function mapSubjectGroupToPermissionKey(
  subjectGroup: string
): EvalogPermissionKey {
  // 1순위: DB subject_group 값 직접 매핑 (정확히 일치)
  const exactMap: Record<string, EvalogPermissionKey> = {
    '국어': 'seteuk:국어',
    '수학': 'seteuk:수학',
    '영어': 'seteuk:영어',
    '한국사': 'seteuk:한국사',
    '사회(역사/도덕포함)': 'seteuk:사회',
    '과학': 'seteuk:과학',
    '체육': 'seteuk:체육',
    '예술': 'seteuk:예술',
    '기술・가정/제2외국어/한문/교양': 'seteuk:기타',
  };

  if (exactMap[subjectGroup]) return exactMap[subjectGroup];

  // 2순위: 부분 키워드 매칭 (개별 과목명 등)
  const partialMap: [string[], EvalogPermissionKey][] = [
    [['물리', '화학', '생명', '지구과학'], 'seteuk:과학'],
    [['국어', '문학', '화법', '언어', '독서'], 'seteuk:국어'],
    [['수학', '확률', '미적분', '기하'], 'seteuk:수학'],
    [['영어', 'English'], 'seteuk:영어'],
    [['한국사'], 'seteuk:한국사'],
    [['사회', '지리', '윤리', '정치', '경제', '법', '역사', '세계사', '동아시아', '도덕'], 'seteuk:사회'],
    [['체육', '운동'], 'seteuk:체육'],
    [['음악', '미술', '예술'], 'seteuk:예술'],
  ];

  for (const [keywords, key] of partialMap) {
    if (keywords.some(kw => subjectGroup.includes(kw))) return key;
  }

  // 3순위: 폴백
  return 'seteuk:기타';
}

/** 세분화 권한 인터페이스 */
export interface EvalogGranularPermissions {
  attendance: boolean;
  autonomy: boolean;
  club: boolean;
  career_activity: boolean;
  volunteer: boolean;
  behavior: boolean;
  canViewSeteuk: (subjectGroup: string) => boolean;
}
