// 평가 워크시트 타입
export interface WorksheetItem {
    name: string;
    score: number;
}

export interface WorksheetCategory {
    category: string;
    score: number;
    maxScore: number;
    comment: string;
    subItems: WorksheetItem[];
}

// 평가 문서 타입
export interface EvaluationDocument {
    type: string;
    name: string;
    hasContent: boolean;
    highlights: string[];
}

// 평가 노트 타입
export interface EvaluationNote {
    id: string;
    timestamp: string;
    content: string;
    author: string;
    color?: string; // 형광펜 색상
}

// 전체 평가 타입
export interface Evaluation {
    studentId: string;
    worksheets: WorksheetCategory[];
    documents: EvaluationDocument[];
    notes: EvaluationNote[];
}

// 평가 기준 타입
export interface EvaluationCriteria {
    name: string;
    weight: number;
    description: string;
}
