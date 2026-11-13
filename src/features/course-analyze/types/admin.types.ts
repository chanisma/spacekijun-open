/**
 * Course Analyze Admin Types
 * 관리자 기능을 위한 타입 정의
 */

// ============================================================================
// File Types
// ============================================================================

export type FileType = 'riroschool' | 'education-office' | 'custom';

export interface FileSlotInfo {
  year: 1 | 2;           // 학년
  round: 1 | 2 | 3;      // 차수 (1차, 2차, 최종)
  label: string;         // 표시 라벨 (e.g., "1학년 1차")
}

export const FILE_SLOTS: FileSlotInfo[] = [
  { year: 1, round: 1, label: '1학년 1차' },
  { year: 1, round: 2, label: '1학년 2차' },
  { year: 1, round: 3, label: '1학년 최종' },
  { year: 2, round: 1, label: '2학년 1차' },
  { year: 2, round: 2, label: '2학년 2차' },
  { year: 2, round: 3, label: '2학년 최종' },
];

export interface UploadedFile {
  file: File;
  fileName: string;
  fileSize: number;
  uploadedAt: Date;
  parsedData: ParsedFileData | null;
  status: 'pending' | 'parsing' | 'completed' | 'error';
  error?: string;
}

export interface ParsedFileData {
  students: ParsedStudent[];
  subjects: {
    semester1: string[];
    semester2: string[];
  };
  totalSubjects: number;
  uploadInfo: {
    year: number;
    round: number;
    name: string;
    fileType?: FileType;
  };
}

export interface ParsedStudent {
  id: string;
  name: string;
  contact?: string;
  submitTime?: string;
  modifyTime?: string;
  year: number;
  class?: number;
  number?: number;
  grade: number;
  semester1: string[];
  semester2: string[];
}

// ============================================================================
// Admin File Storage
// ============================================================================

export type FileKey = `${1 | 2}-${1 | 2 | 3}`; // "year-round" format

export interface AdminFileStorage {
  files: Map<FileKey, UploadedFile>;
  fileType: FileType;
}

// ============================================================================
// Subject Category Types
// ============================================================================

export interface SubjectCategory {
  name: string;
  code: string;
  subjects: string[];
  type: 'required' | 'elective';
  maxSelections: number;
  minSelections: number;
  description: string;
  prerequisites?: Record<string, string[]>;
  created?: string;
  modified?: string;
}

export interface SubjectConfiguration {
  categories: Record<string, SubjectCategory>;
  uncategorized: string[];
  lastModified?: string;
  version?: string;
}

// Default subject categories
export const DEFAULT_SUBJECT_CATEGORIES: Record<string, SubjectCategory> = {
  '국어': {
    name: '국어',
    code: 'KOR',
    subjects: ['화법과 언어', '독서와 작문', '문학', '주제 탐구 독서', '문학과 영상', '직무 의사소통',
      '독서 토론과 글쓰기', '매체 의사소통', '언어생활 탐구', '고전 읽기', '화법과 작문', '독서',
      '언어와 매체', '실용 국어', '심화 국어'],
    type: 'required',
    maxSelections: 3,
    minSelections: 1,
    description: '국어 영역 과목'
  },
  '영어': {
    name: '영어',
    code: 'ENG',
    subjects: ['영어Ⅰ', '영어Ⅱ', '영어 독해와 작문', '직무 영어', '영어 발표와 토론', '심화 영어', '영미 문학 읽기',
      '심화 영어 독해와 작문', '실생활 영어 회화', '미디어 영어', '세계 문화와 영어',
      '심화 영어 독해Ⅰ', '영어권 문화', '심화영어Ⅰ'],
    type: 'required',
    maxSelections: 3,
    minSelections: 1,
    description: '영어 영역 과목'
  },
  '수학': {
    name: '수학',
    code: 'MATH',
    subjects: ['대수', '미적분Ⅰ', '확률과 통계', '미적분Ⅱ', '기하', '경제수학', '인공지능 수학',
      '직무 수학', '수학과 문화', '실용 통계', '수학과제 탐구',
      '미적분', '통합수학Ⅰ', '통합수학Ⅱ'],
    type: 'required',
    maxSelections: 3,
    minSelections: 1,
    description: '수학 영역 과목',
    prerequisites: {
      '미적분': ['수학Ⅱ'],
      '미적분Ⅱ': ['미적분'],
      '기하': ['수학Ⅰ']
    }
  },
  '역사': {
    name: '역사',
    code: 'HIS',
    subjects: ['세계사', '동아시아 역사 기행', '역사로 탐구하는 현대 세계'],
    type: 'elective',
    maxSelections: 2,
    minSelections: 0,
    description: '역사 영역 과목'
  },
  '사회': {
    name: '사회',
    code: 'SOC',
    subjects: ['세계시민과 지리', '사회와 문화', '현대사회와 윤리',
      '정치', '법과 사회', '경제', '국제 관계의 이해', '한국지리 탐구', '도시의 미래 탐구',
      '윤리와 사상', '인문학과 윤리',
      '금융과 경제생활', '사회문제 탐구', '여행지리', '기후변화와 지속가능한 세계',
      '윤리문제 탐구', '고전과 윤리', '한국지리', '정치와 법'],
    type: 'elective',
    maxSelections: 4,
    minSelections: 0,
    description: '사회 영역 과목'
  },
  '물리': {
    name: '물리',
    code: 'PHY',
    subjects: ['물리학', '역학과 에너지', '전자기와 양자', '물리학Ⅱ'],
    type: 'elective',
    maxSelections: 3,
    minSelections: 0,
    description: '물리 영역 과목',
    prerequisites: {
      '물리학Ⅱ': ['물리학'],
      '전자기와 양자': ['물리학'],
      '역학과 에너지': ['물리학']
    }
  },
  '화학': {
    name: '화학',
    code: 'CHE',
    subjects: ['화학', '물질과 에너지', '화학Ⅱ', '화학 반응의 세계'],
    type: 'elective',
    maxSelections: 3,
    minSelections: 0,
    description: '화학 영역 과목',
    prerequisites: {
      '화학Ⅱ': ['화학'],
      '화학 반응의 세계': ['화학'],
      '물질과 에너지': ['화학']
    }
  },
  '생명': {
    name: '생명',
    code: 'BIO',
    subjects: ['생명과학', '세포와 물질대사', '생명과학Ⅱ', '생물의 유전', '고급 생명과학'],
    type: 'elective',
    maxSelections: 3,
    minSelections: 0,
    description: '생명과학 영역 과목',
    prerequisites: {
      '생명과학Ⅱ': ['생명과학'],
      '생물의 유전': ['생명과학'],
      '고급 생명과학': ['생명과학Ⅱ'],
      '세포와 물질대사': ['생명과학']
    }
  },
  '지구과학': {
    name: '지구과학',
    code: 'EARTH',
    subjects: ['지구과학', '지구시스템과학', '지구과학Ⅱ', '행성우주과학', '기후변화와 환경생태'],
    type: 'elective',
    maxSelections: 3,
    minSelections: 0,
    description: '지구과학 영역 과목',
    prerequisites: {
      '지구과학Ⅱ': ['지구과학'],
      '행성우주과학': ['지구과학'],
      '지구시스템과학': ['지구과학']
    }
  },
  '기타': {
    name: '기타',
    code: 'ETC',
    subjects: ['생활과학 탐구', '과학사', '융합과학 탐구', '프로그래밍', '인공지능과 피지컬컴퓨팅',
      '정보과제연구', '소프트웨어와 생활', '음악사', '미술사', '중국어', '중국 문화', '중국어Ⅱ',
      '일본어', '일본 문화', '일본어Ⅱ', '한문', '언어생활과 한자', '한문Ⅱ', '매체 의사소통',
      '아동발달과 부모', '가정과학', '기술·가정', '교육학', '보건', '진로와 직업', '생태와 환경', '교육의 이해'],
    type: 'elective',
    maxSelections: 5,
    minSelections: 0,
    description: '기타 영역 과목 (예술, 체육, 교양, 제2외국어 등)'
  }
};

// ============================================================================
// Export Types
// ============================================================================

export type ExportType = 'combined' | 'categories' | 'gradeAnalysis' | 'config' | 'unified';
export type ExportFormat = 'excel' | 'csv' | 'json';

export interface ExportOptions {
  types: ExportType[];
  format: ExportFormat;
}

export interface ExportedFile {
  name: string;
  type: ExportType;
  blob: Blob;
  size: number;
}

// ============================================================================
// Admin Dashboard State
// ============================================================================

export type AdminStep = 1 | 2 | 3 | 4;

export interface AdminDashboardState {
  currentStep: AdminStep;
  fileType: FileType;
  files: Map<FileKey, UploadedFile>;
  subjectConfig: SubjectConfiguration;
  isProcessing: boolean;
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface SystemStatistics {
  totalFiles: number;
  totalStudents: number;
  totalUniqueSubjects: number;
  categorizedSubjects: number;
  uncategorizedSubjects: number;
  avgSubjectsPerStudent: number;
}
