export type DocType = 'gajeong' | 'volunteer_personal' | 'volunteer_class' | 'volunteer_club';

/**
 * 발급 상태. active(기본)=정상, cancelled=삭제(취소) — 행은 유지하되 발급번호만 남기고
 * 대장에서 내용은 숨긴다(감사 추적·결번 방지 목적). 삭제 버튼은 이제 이 status를
 * 'cancelled'로 바꾸는 UPDATE만 수행하고, 실제 DELETE는 UI에서 더 이상 호출하지 않는다.
 */
export type IssueStatus = 'active' | 'cancelled';

export interface ParticipantSnapshot {
  resource_id: string;
  code?: string;       // resource.meta.id (학번)
  grade?: number;
  class?: number;
  number?: number;     // 출석번호
  name: string;
  hours?: number;      // 인정시간
}

export type VolunteerArea = '이웃돕기활동' | '환경보호활동' | '캠페인활동';
export type VolunteerScope = '정규교육과정 내' | '정규교육과정 외';

export interface VolunteerFormData {
  period_start: string;   // ISO date (봉사 시작일)
  period_end?: string;    // ISO date (봉사 종료일) — 선택. 비우면 단일 일자.
  org: string;
  org_tel: string;
  area: VolunteerArea;
  place: string;
  content: string;
  scope: VolunteerScope;
  hours?: number;         // 인정시간 — 발급 전체 공통, 명단 전 행에 동일 기입(미설정 시 1)
}

// ── 동아리 단체 봉사활동 (volunteer_club) ───────────────────────────────
export type ClubArea = '자율자치' | '동아리' | '진로';   // 봉사 주관 영역

/** 활동 일시 1건 — 발급 공통(모달서 입력). 모든 동아리가 공유하는 봉사 날짜·시간. */
export interface ClubScheduleEntry {
  date: string;       // ISO 'YYYY-MM-DD'
  hours: number;      // 시간
}

/** 활동 내용 1건 (확인서 채우기용 — schedule + 동아리별 content 결합 결과). */
export interface ClubActivityEntry {
  date: string;       // ISO 'YYYY-MM-DD'
  hours: number;      // 시간
  content: string;    // 봉사 내용 (동아리별)
}

/**
 * 발급 1건에 포함된 동아리 1개 — 명단·담당교사는 club_info에서 스냅샷,
 * 활동 내용은 발급 후 대장 아코디언의 각 동아리 행에서 작성한다.
 */
export interface ClubEntry {
  club_id: string;
  club_name: string;
  teacher_name?: string;             // 동아리 담당교사(확인자) 성명
  teacher_resource_id?: string;      // 담당교사 resource.id — 서버 권한 판정(담당교사 수정)용
  students: ParticipantSnapshot[];   // 이 동아리의 명단 스냅샷 (발급 시점)
  /** 이 동아리의 활동(날짜·시간·내용) — 대장 아코디언에서 작성. 확인서의 출처. */
  activities: ClubActivityEntry[];
  /** 확인서 출력 설정(다운로드 미리보기에서 저장). resource_id → 활동날짜(ISO) → 참가 여부. 없으면 전원·전일 참가. */
  attendance?: Record<string, Record<string, boolean>>;
  /** 확인서에서 제외할 학생 resource_id (다운로드 미리보기에서 저장). */
  excludedResourceIds?: string[];
}

export interface ClubVolunteerFormData {
  kind: 'club';                 // VolunteerFormData와 구분하는 discriminator
  scope: VolunteerScope;        // 정규교육과정 내 | 외 (발급 공통)
  area: ClubArea;               // 봉사 주관 영역 (발급 공통)
  org: string;                  // 발급 공통
  org_tel: string;
  place: string;
  /** 활동 일시(날짜·시간) 시드 — 발급 모달서 입력(선택). 발급 시 각 동아리 활동에 채워 넣는다. */
  schedule: ClubScheduleEntry[];
  clubs: ClubEntry[];              // 이 발급에 포함된 동아리들 (각자 명단·활동)
}

/**
 * 공통 일시(schedule)를 동아리 활동에 병합 — 기존 활동/내용 보존, 없는 날짜만 추가,
 * 같은 날짜는 시간만 시드값으로 갱신(시간은 발급 공통). 동아리가 따로 추가한 날짜는 유지.
 */
export function seedClubActivities(
  prior: ClubActivityEntry[], schedule: ClubScheduleEntry[],
): ClubActivityEntry[] {
  const out = prior.map(a => ({ ...a }));
  for (const s of schedule) {
    const hit = out.find(a => a.date === s.date);
    if (hit) hit.hours = s.hours;
    else out.push({ date: s.date, hours: s.hours, content: '' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** form_data 판별 — kind 필드로 동아리 양식 여부 구분. */
export function isClubFormData(
  fd: VolunteerFormData | ClubVolunteerFormData | PersonalVolunteerFormData | null | undefined,
): fd is ClubVolunteerFormData {
  return !!fd && (fd as ClubVolunteerFormData).kind === 'club';
}

// ── 개인 봉사활동 (volunteer_personal) ───────────────────────────────
/**
 * 개인 봉사활동 계획 및 확인서 양식 데이터. 학생 1명 = document_issue 1행 = 발급번호 1개.
 * 같은 내용을 여러 학생이 함께 수행했더라도 발급 모달에서만 다중 선택으로 입력 편의를
 * 제공할 뿐, 저장은 학생별로 분리된다(같은 제출 묶음은 meta.batch_id로 그룹).
 */
export interface PersonalVolunteerFormData {
  period_start: string;
  period_end?: string;
  org: string;
  org_tel: string;
  place: string;
  area: VolunteerArea;
  content: string;
  hours?: number;
  note?: string;               // 유의사항 — 선택
  opinion?: string;            // 의견 — 선택
  confirmer_title: string;     // 확인자 직급 — 기본값 "교사"
  confirmer_name?: string;     // 확인자 성명 — 담임 자동 시딩 또는 직접 입력
}

/** document_issue.meta — 확장 필드. 현재는 개인 봉사 배치(batch) 식별자만 사용. */
export interface DocumentIssueMeta {
  batch_id?: string;
}

export interface DocumentIssue {
  id: string;
  doc_type: DocType;
  issue_no: string;
  issue_year: number;
  title: string;
  issued_on: string;
  department: string | null;
  students: ParticipantSnapshot[];
  grade: number | null;
  class_number: number | null;
  form_data: VolunteerFormData | ClubVolunteerFormData | PersonalVolunteerFormData | null;
  remarks: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  meta: DocumentIssueMeta;
  status: IssueStatus;
}

export interface CreateIssueInput {
  doc_type: DocType;
  title: string;
  issued_on: string;
  department?: string | null;
  students?: ParticipantSnapshot[];
  grade?: number | null;
  class_number?: number | null;
  form_data?: VolunteerFormData | ClubVolunteerFormData | PersonalVolunteerFormData | null;
  remarks?: string | null;
  meta?: DocumentIssueMeta;
}
