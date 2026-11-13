import { SchoolCurriculum } from '../../types';

// 샘플고등학교 2022학년도 입학생 3개년 교육과정
export const jeonjuGijeonGirls2022: SchoolCurriculum = {
  schoolName: '샘플고등학교',
  academicYear: 2022,
  subjects: [
    // 국어
    {
      category: '국어',
      subject: '국어',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 8,
      semesters: { '1-1': 4, '1-2': 4 },
      totalCredits: 8,
      minCredits: 8
    },
    {
      category: '국어',
      subject: '독서',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 5,
      semesters: { '3-1': 5 },
      totalCredits: 5,
      minCredits: 5
    },
    {
      category: '국어',
      subject: '문학',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '국어',
      subject: '화법과 작문',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '국어',
      subject: '언어와 매체',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '국어',
      subject: '고전 읽기',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '2-1': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '국어',
      subject: '현대문학 감상',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '2-1': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '국어',
      subject: '고전 읽기',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '2-2': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '국어',
      subject: '현대문학 감상',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '2-2': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '국어',
      subject: '실용 국어',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 5,
      semesters: { '3-2': 5 },
      totalCredits: 5,
      minCredits: 5
    },
    {
      category: '국어',
      subject: '심화 국어',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 5,
      semesters: { '3-2': 5 },
      totalCredits: 5,
      minCredits: 5
    },
    // 수학
    {
      category: '수학',
      subject: '수학',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 8,
      semesters: { '1-1': 4, '1-2': 4 },
      totalCredits: 8,
      minCredits: 8
    },
    {
      category: '수학',
      subject: '수학Ⅰ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '수학',
      subject: '수학Ⅱ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '수학',
      subject: '확률과 통계',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 2, '2-2': 2 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '수학',
      subject: '미적분',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 5,
      semesters: { '3-1': 5 },
      totalCredits: 5,
      minCredits: 5
    },
    {
      category: '수학',
      subject: '경제 수학',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 5,
      semesters: { '3-1': 5 },
      totalCredits: 5,
      minCredits: 5
    },
    {
      category: '수학',
      subject: '통합수학Ⅰ(타시도-대구)',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 5,
      semesters: { '3-2': 5 },
      totalCredits: 5,
      minCredits: 5
    },
    {
      category: '수학',
      subject: '통합수학Ⅱ(타시도-대구)',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 5,
      semesters: { '3-2': 5 },
      totalCredits: 5,
      minCredits: 5
    },
    {
      category: '수학',
      subject: '기하',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '수학',
      subject: '기하',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '3-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    // 영어
    {
      category: '영어',
      subject: '영어',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 8,
      semesters: { '1-1': 4, '1-2': 4 },
      totalCredits: 8,
      minCredits: 8
    },
    {
      category: '영어',
      subject: '영어Ⅰ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '영어',
      subject: '영어 독해와 작문',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '영어',
      subject: '영어Ⅱ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '영어',
      subject: '영어권 문화',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '3-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '영어',
      subject: '심화 영어Ⅰ',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '3-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '영어',
      subject: '영미 문학 읽기',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '2-1': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '영어',
      subject: '영미 문학 읽기',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '2-2': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '영어',
      subject: '심화 영어 독해Ⅰ',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '영어',
      subject: '심화 영어 독해Ⅰ',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '3-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    // 한국사
    {
      category: '한국사',
      subject: '한국사',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 6,
      semesters: { '1-1': 3, '1-2': 3 },
      totalCredits: 6,
      minCredits: 6
    },
    // 사회
    {
      category: '사회',
      subject: '통합사회',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 6,
      semesters: { '1-1': 3, '1-2': 3 },
      totalCredits: 6,
      minCredits: 6
    },
    {
      category: '사회',
      subject: '사회문제 탐구',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '2-1': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '사회',
      subject: '사회문제 탐구',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '2-2': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '사회',
      subject: '세계지리',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '동아시아사',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '경제',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '사회·문화',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '생활과 윤리',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '세계지리',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '동아시아사',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '경제',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '사회·문화',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '생활과 윤리',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '여행지리',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '사회',
      subject: '여행지리',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '3-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '사회',
      subject: '한국지리',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '세계사',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '정치와 법',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '윤리와 사상',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '고전과 윤리',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '한국지리',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '세계사',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '정치와 법',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '윤리와 사상',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '사회',
      subject: '고전과 윤리',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    // 과학
    {
      category: '과학',
      subject: '통합과학',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 8,
      semesters: { '1-1': 4, '1-2': 4 },
      totalCredits: 8,
      minCredits: 8
    },
    {
      category: '과학',
      subject: '과학탐구실험',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '1-1': 1, '1-2': 1 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '과학',
      subject: '생활과 과학',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '2-1': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '과학',
      subject: '생활과 과학',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '2-2': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '과학',
      subject: '물리학Ⅰ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '화학Ⅰ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '생명과학Ⅰ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '지구과학Ⅰ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '물리학Ⅰ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '화학Ⅰ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '생명과학Ⅰ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '지구과학Ⅰ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '과학사',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '과학',
      subject: '과학사',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '3-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '과학',
      subject: '물리학Ⅱ',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '화학Ⅱ',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '생명과학Ⅱ',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '지구과학Ⅱ',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '물리학Ⅱ',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '화학Ⅱ',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '생명과학Ⅱ',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '지구과학Ⅱ',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '고급 화학',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '3-1': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '과학',
      subject: '고급 생명과학',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '3-1': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    // 체육
    {
      category: '체육',
      subject: '체육',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '1-1': 2, '1-2': 2 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '체육',
      subject: '스포츠 생활',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 2, '2-2': 2 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '체육',
      subject: '체육 탐구',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-1': 2, '3-2': 2 },
      totalCredits: 4,
      minCredits: 4
    },
    // 예술
    {
      category: '예술',
      subject: '음악 연주',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '1-1': 1, '1-2': 1 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '예술',
      subject: '음악 감상과 비평',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '3-1': 1, '3-2': 1 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '예술',
      subject: '미술 창작',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '1-1': 1, '1-2': 1 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '예술',
      subject: '미술 감상과 비평',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '2-1': 1, '2-2': 1 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '예술',
      subject: '연극의 이해',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '1-1': 1, '1-2': 1 },
      totalCredits: 2,
      minCredits: 2
    },
    // 기술·가정
    {
      category: '기술·가정',
      subject: '기술·가정',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '1-1': 2, '1-2': 2 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '기술·가정',
      subject: '정보',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '1-1': 2, '1-2': 2 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '기술·가정',
      subject: '프로그래밍',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '기술·가정',
      subject: '프로그래밍',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '3-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '기술·가정',
      subject: '가정과학',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-1': 2, '3-2': 2 },
      totalCredits: 4,
      minCredits: 4
    },
    // 교양
    {
      category: '교양',
      subject: '종교학(학년연계1학년)',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '1-1': 1, '1-2': 1 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '교양',
      subject: '철학(학년연계1학년)',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '1-1': 1, '1-2': 1 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '교양',
      subject: '종교학(학년연계2학년)',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '2-1': 1, '2-2': 1 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '교양',
      subject: '철학(학년연계2학년)',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '2-1': 1, '2-2': 1 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '교양',
      subject: '종교학(학년연계3학년)',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '3-1': 1, '3-2': 1 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '교양',
      subject: '철학(학년연계3학년)',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 2,
      semesters: { '3-1': 1, '3-2': 1 },
      totalCredits: 2,
      minCredits: 2
    },
    // 한문
    {
      category: '한문',
      subject: '한문Ⅰ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 2, '2-2': 2 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '한문',
      subject: '한문Ⅱ',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-1': 2, '3-2': 2 },
      totalCredits: 4,
      minCredits: 4
    },
    // 제2외국어
    {
      category: '제2외국어',
      subject: '일본어Ⅰ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 2, '2-2': 2 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '제2외국어',
      subject: '중국어Ⅰ',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 2, '2-2': 2 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '제2외국어',
      subject: '일본어Ⅱ',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-1': 2, '3-2': 2 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '제2외국어',
      subject: '중국어Ⅱ',
      subjectType: '진로 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-1': 2, '3-2': 2 },
      totalCredits: 4,
      minCredits: 4
    },
  ]
};
