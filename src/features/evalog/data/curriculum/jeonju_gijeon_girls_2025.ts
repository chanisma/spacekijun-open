import { SchoolCurriculum } from '../../types';

// 샘플고등학교 2025학년도 입학생 3개년 교육과정
export const jeonjuGijeonGirls2025: SchoolCurriculum = {
  schoolName: '샘플고등학교',
  academicYear: 2025,
  subjects: [
    // 국어
    {
      category: '국어',
      subject: '공통국어1',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '1-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '국어',
      subject: '공통국어2',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '1-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '국어',
      subject: '화법과 언어',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '1-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '국어',
      subject: '독서와 작문',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '국어',
      subject: '문학',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '국어',
      subject: '독서 토론과 글쓰기',
      subjectType: '융합 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '국어',
      subject: '주제 탐구 독서',
      subjectType: '진로 선택',
      selectionGroup: '선택3',
      credits: 4,
      semesters: { '2-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '국어',
      subject: '문학과 영상',
      subjectType: '진로 선택',
      selectionGroup: '선택3',
      credits: 4,
      semesters: { '2-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '국어',
      subject: '매체 의사소통',
      subjectType: '융합 선택',
      selectionGroup: '선택9',
      credits: 4,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },

    // 수학
    {
      category: '수학',
      subject: '공통수학1',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '1-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '수학',
      subject: '공통수학2',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '1-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '수학',
      subject: '대수',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '2-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '수학',
      subject: '미적분Ⅰ',
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
      semesters: { '3-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '수학',
      subject: '수학과제 탐구',
      subjectType: '융합 선택',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '3-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '수학',
      subject: '인공지능 수학',
      subjectType: '진로 선택',
      selectionGroup: '선택3',
      credits: 4,
      semesters: { '2-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '수학',
      subject: '미적분Ⅱ',
      subjectType: '진로 선택',
      selectionGroup: '선택9',
      credits: 4,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '수학',
      subject: '경제 수학',
      subjectType: '진로 선택',
      selectionGroup: '선택9',
      credits: 4,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },

    // 영어
    {
      category: '영어',
      subject: '공통영어1',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '1-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '영어',
      subject: '공통영어2',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '1-2': 3 },
      totalCredits: 3,
      minCredits: 3
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
      subject: '미디어 영어',
      subjectType: '융합 선택',
      selectionGroup: '선택3',
      credits: 4,
      semesters: { '2-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '영어',
      subject: '영미 문학 읽기',
      subjectType: '진로 선택',
      selectionGroup: '선택4',
      credits: 4,
      semesters: { '2-2': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '영어',
      subject: '심화 영어',
      subjectType: '진로 선택',
      selectionGroup: '선택9',
      credits: 4,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },

    // 사회(역사/도덕 포함)
    {
      category: '사회',
      subject: '한국사1',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '1-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '사회',
      subject: '한국사2',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '1-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '사회',
      subject: '세계시민과 지리',
      subjectType: '진로 선택',
      selectionGroup: '선택3',
      credits: 4,
      semesters: { '2-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '사회',
      subject: '사회와 문화',
      subjectType: '일반 선택',
      selectionGroup: '선택4',
      credits: 4,
      semesters: { '2-2': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '사회',
      subject: '현대사회와 윤리',
      subjectType: '일반 선택',
      selectionGroup: '선택4',
      credits: 4,
      semesters: { '2-2': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '사회',
      subject: '도시의 미래 탐구',
      subjectType: '진로 선택',
      selectionGroup: '선택4',
      credits: 4,
      semesters: { '2-2': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '사회',
      subject: '동아시아 역사 기행',
      subjectType: '진로 선택',
      selectionGroup: '선택4',
      credits: 4,
      semesters: { '2-2': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '사회',
      subject: '정치',
      subjectType: '진로 선택',
      selectionGroup: '선택4',
      credits: 4,
      semesters: { '2-2': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '사회',
      subject: '법과 사회',
      subjectType: '진로 선택',
      selectionGroup: '선택9',
      credits: 4,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '사회',
      subject: '인문학과 윤리',
      subjectType: '진로 선택',
      selectionGroup: '선택9',
      credits: 4,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '사회',
      subject: '한국지리 탐구',
      subjectType: '진로 선택',
      selectionGroup: '선택10',
      credits: 4,
      semesters: { '3-2': 3 },
      totalCredits: 3,
      minCredits: 12
    },

    // 과학
    {
      category: '과학',
      subject: '통합과학1',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '1-1': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '통합과학2',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 4,
      semesters: { '1-2': 4 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '과학',
      subject: '과학탐구실험1',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 1,
      semesters: { '1-1': 1 },
      totalCredits: 1,
      minCredits: 1
    },
    {
      category: '과학',
      subject: '과학탐구실험2',
      subjectType: '공통 과목',
      selectionGroup: '지정',
      credits: 1,
      semesters: { '1-2': 1 },
      totalCredits: 1,
      minCredits: 1
    },
    {
      category: '과학',
      subject: '생명과학',
      subjectType: '일반 선택',
      selectionGroup: '선택4',
      credits: 4,
      semesters: { '2-2': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '과학',
      subject: '지구과학',
      subjectType: '일반 선택',
      selectionGroup: '선택4',
      credits: 4,
      semesters: { '2-2': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '과학',
      subject: '역학과 에너지',
      subjectType: '진로 선택',
      selectionGroup: '선택4',
      credits: 4,
      semesters: { '2-2': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '과학',
      subject: '전자기와 양자',
      subjectType: '진로 선택',
      selectionGroup: '선택9',
      credits: 4,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '과학',
      subject: '화학 반응의 세계',
      subjectType: '진로 선택',
      selectionGroup: '선택9',
      credits: 4,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '과학',
      subject: '생물의 유전',
      subjectType: '진로 선택',
      selectionGroup: '선택9',
      credits: 4,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },

    // 체육
    {
      category: '체육',
      subject: '체육1',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '1-1': 2, '1-2': 2 },
      totalCredits: 4,
      minCredits: 4
    },
    {
      category: '체육',
      subject: '체육2',
      subjectType: '일반 선택',
      selectionGroup: '지정',
      credits: 3,
      semesters: { '2-1': 2, '2-2': 2, '3-1': 2, '3-2': 2 },
      totalCredits: 8,
      minCredits: 8
    },

    // 예술
    {
      category: '예술',
      subject: '음악',
      subjectType: '일반 선택',
      selectionGroup: '선택7',
      credits: 3,
      semesters: { '2-1': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '예술',
      subject: '미술',
      subjectType: '일반 선택',
      selectionGroup: '선택8',
      credits: 3,
      semesters: { '2-2': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '예술',
      subject: '음악 감상과 비평',
      subjectType: '진로 선택',
      selectionGroup: '선택13',
      credits: 3,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '예술',
      subject: '미술 창작',
      subjectType: '진로 선택',
      selectionGroup: '선택13',
      credits: 3,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '예술',
      subject: '음악 감상과 비평',
      subjectType: '진로 선택',
      selectionGroup: '선택14',
      credits: 3,
      semesters: { '3-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '예술',
      subject: '미술 창작',
      subjectType: '진로 선택',
      selectionGroup: '선택14',
      credits: 3,
      semesters: { '3-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },

    // 기술·가정/정보
    {
      category: '기술·가정',
      subject: '기술·가정',
      subjectType: '일반 선택',
      selectionGroup: '선택1',
      credits: 4,
      semesters: { '1-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '기술·가정',
      subject: '정보',
      subjectType: '일반 선택',
      selectionGroup: '선택1',
      credits: 4,
      semesters: { '1-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '기술·가정',
      subject: '기술·가정',
      subjectType: '일반 선택',
      selectionGroup: '선택2',
      credits: 4,
      semesters: { '1-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '기술·가정',
      subject: '인공지능 기초',
      subjectType: '진로 선택',
      selectionGroup: '선택2',
      credits: 4,
      semesters: { '1-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '기술·가정',
      subject: '생활과학 탐구',
      subjectType: '진로 선택',
      selectionGroup: '선택3',
      credits: 4,
      semesters: { '2-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '기술·가정',
      subject: '생활과학 탐구',
      subjectType: '진로 선택',
      selectionGroup: '선택4',
      credits: 4,
      semesters: { '2-2': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '기술·가정',
      subject: '소프트웨어와 생활',
      subjectType: '융합 선택',
      selectionGroup: '선택4',
      isShared: true,
      credits: 4,
      semesters: { '2-2': 3 },
      totalCredits: 3,
      minCredits: 12
    },
    {
      category: '기술·가정',
      subject: '아동발달과 부모',
      subjectType: '융합 선택',
      selectionGroup: '선택9',
      credits: 4,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 12
    },

    // 교양
    {
      category: '교양',
      subject: '보건',
      subjectType: '진로 선택',
      selectionGroup: '선택1',
      credits: 3,
      semesters: { '1-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '교양',
      subject: '보건',
      subjectType: '진로 선택',
      selectionGroup: '선택2',
      credits: 3,
      semesters: { '1-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '교양',
      subject: '인간과 철학',
      subjectType: '진로 선택',
      selectionGroup: '선택15',
      credits: 3,
      semesters: { '1-1': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '교양',
      subject: '삶과 종교',
      subjectType: '진로 선택',
      selectionGroup: '선택15',
      credits: 3,
      semesters: { '1-1': 2 },
      totalCredits: 2,
      minCredits: 2
    },
    {
      category: '교양',
      subject: '진로와 직업',
      subjectType: '일반 선택',
      selectionGroup: '선택11',
      credits: 3,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '교양',
      subject: '생태와 환경',
      subjectType: '일반 선택',
      selectionGroup: '선택11',
      credits: 3,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '교양',
      subject: '교육의 이해',
      subjectType: '진로 선택',
      selectionGroup: '선택11',
      credits: 3,
      semesters: { '3-1': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '교양',
      subject: '진로와 직업',
      subjectType: '일반 선택',
      selectionGroup: '선택12',
      credits: 3,
      semesters: { '3-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '교양',
      subject: '생태와 환경',
      subjectType: '일반 선택',
      selectionGroup: '선택12',
      credits: 3,
      semesters: { '3-2': 3 },
      totalCredits: 3,
      minCredits: 3
    },
    {
      category: '교양',
      subject: '교육의 이해',
      subjectType: '진로 선택',
      selectionGroup: '선택12',
      credits: 3,
      semesters: { '3-2': 3 },
      totalCredits: 3,
      minCredits: 3
    }
  ]
};
