import { ExtensionGroup } from '@/types/calls';

/**
 * 교내 전화번호부 — **예시 데이터**
 *
 * 공개판에는 가상의 번호만 들어 있다. 학교의 전화번호 목록으로 바꿔 쓸 것.
 * 개인 휴대전화 번호는 넣지 않는다(CLAUDE.md «개인 전화번호 저장 금지»).
 */
export const extensionData: ExtensionGroup[] = [
  {
    id: 'admin',
    title: '운영실',
    category: 'admin',
    description: '교장실·교무실',
    entries: [
      { id: 'admin-principal', name: '교장실', extension: '301', phone: '000-0000', isLead: true },
      { id: 'admin-office-1', name: '교무실 1', extension: '306', phone: '000-0000' },
      { id: 'admin-office-2', name: '교무실 2', extension: '305' },
    ],
  },
  {
    id: 'grade-1',
    title: '1학년 교무실',
    category: 'grade',
    description: '부장 및 담임 직통',
    entries: [
      { id: 'grade-1-lead', name: '1학년 부장', extension: '311', isLead: true },
      { id: 'grade-1-1', name: '1학년 1반', extension: '312' },
      { id: 'grade-1-2', name: '1학년 2반', extension: '313' },
    ],
  },
  {
    id: 'staff',
    title: '업무 담당',
    category: 'staff',
    entries: [
      { id: 'staff-1', name: '홍길동', extension: '320', duty: '정보 업무' },
    ],
  },
  {
    id: 'facility',
    title: '부속실',
    category: 'facility',
    entries: [
      { id: 'facility-health', name: '보건실', extension: '330', phone: '000-0000' },
      { id: 'facility-library', name: '도서관', extension: '331' },
    ],
  },
  {
    id: 'office',
    title: '행정실',
    category: 'office',
    entries: [
      { id: 'office-main', name: '행정실', extension: '340', phone: '000-0000' },
      { id: 'office-fax', name: '행정실 팩스', phone: '000-0000', isFax: true },
    ],
  },
];

/** 헤더의 빠른 연결 버튼 */
export const quickDialContacts = [
  { label: '교무실 1', phone: '000-0000' },
  { label: '행정실', phone: '000-0000' },
  { label: '보건실', phone: '000-0000' },
] as const;

/** 전화기 사용 방법 (원본 문서 우측 안내 박스) */
export const phoneGuide = [
  {
    title: '수화기를 들고',
    steps: ['내선 연결: 내선번호 + #', '발신 전화: 발신번호'],
  },
  {
    title: '단축번호 설정',
    steps: [
      '수화기를 내려 놓은 상태에서 내선번호를 누른다',
      '전화기 상단 숫자 1~8 중 하나 선택',
      '사용함 → 확인',
    ],
  },
  {
    title: '착신번호 설정',
    steps: [
      '전환하기: 착신전환 버튼 → 착신번호 입력 → 확인 (화면에 "착신전환" 깜박임)',
      '해제하기: 착신전환 버튼을 다시 누르면 "착신전환" 표시가 사라지며 해제',
    ],
  },
] as const;
