export interface RescueScholarship {
  id: string;
  studentCode: string;
  scholarshipNo: string | null; // 자동 번호 (YYYY-NNN)
  name: string;                 // 장학금명
  awardedOn: string;            // 수여일 'YYYY-MM-DD'
  remarks: string | null;       // 비고
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  meta: Record<string, unknown>;
}

export interface RescueScholarshipInput {
  studentCode: string;
  name: string;
  awardedOn: string;
  remarks?: string | null;
  meta?: Record<string, unknown>;
}
