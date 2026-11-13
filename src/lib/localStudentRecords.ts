/**
 * 생기부(학교생활기록부) 로컬 파일 읽기 — 공개판 원칙: 생기부 본문·성적은 DB 에 올리지 않는다.
 *
 * 교사 PC 의 «생기부 폴더»를 브라우저가 그 자리에서 읽는다. 서버로 보내지 않는다.
 * 폴더 구조·칸 정의 = docs/student-records-local.md, 예시 = local-records.example/
 *
 *   local-records/
 *     students/<학생코드>.json   ← 학생 한 명 = 파일 하나 (학생코드 = resource.meta->>'id')
 *
 * DB 에 남는 것은 명단(resource type='student': 학번·이름·학년·반·번호)뿐이다.
 * 이 모듈은 «자리»다 — 기존 화면은 아직 DB 표를 읽는다. 화면을 옮길 때 여기 함수를 쓴다.
 */

export const LOCAL_RECORD_SCHEMA = 1;

/** 창체·세특·행특 등 서술 한 줄 (옛 표 student_detailed_activities 한 행과 같은 모양) */
export interface LocalActivity {
  category: string; // 예: '세특' | '자율' | '동아리' | '진로' | '행특'
  subject_name?: string | null;
  content: string;
  grade: number;
  semester?: number | null;
}

/** 학생 한 명의 생기부 파일. 칸 이름은 옛 표 student_basic_info 의 칸과 같다(옮기기 쉽게). */
export interface LocalStudentRecord {
  schema: number;
  student_code: string;
  grade_info?: unknown; // 교과 성적(학기별 과목·등급·원점수)
  attendance?: unknown;
  volunteer?: unknown;
  reading?: unknown;
  academic_development?: unknown; // 교과학습발달상황(세특 원문 포함)
  mock_result?: unknown; // 모의고사 성적
  mock_marking?: unknown; // 모의고사 문항별 답안
  activities?: LocalActivity[];
}

export interface LocalRecordsSource {
  /** 폴더에 있는 학생코드 목록 */
  listStudentCodes(): Promise<string[]>;
  /** 학생 한 명의 파일. 없으면 null */
  read(studentCode: string): Promise<LocalStudentRecord | null>;
}

// 학생코드는 파일 이름이 된다 — 경로 문자를 막는다
const CODE_RE = /^[0-9A-Za-z_-]{1,40}$/;
const FILE_RE = /^([0-9A-Za-z_-]{1,40})\.json$/;

export function parseLocalStudentRecord(text: string, expectedCode?: string): LocalStudentRecord {
  const data = JSON.parse(text) as LocalStudentRecord;
  if (!data || typeof data !== 'object') throw new Error('생기부 파일이 JSON 객체가 아닙니다');
  if (data.schema !== LOCAL_RECORD_SCHEMA) throw new Error(`지원하지 않는 생기부 파일 형식(schema ${data.schema})`);
  if (typeof data.student_code !== 'string' || !CODE_RE.test(data.student_code)) throw new Error('student_code 가 없거나 형식이 틀립니다');
  if (expectedCode && data.student_code !== expectedCode) throw new Error(`파일 이름(${expectedCode})과 student_code(${data.student_code})가 다릅니다`);
  if (data.activities !== undefined && !Array.isArray(data.activities)) throw new Error('activities 는 배열이어야 합니다');
  return data;
}

// ── File System Access API (Chrome·Edge) — 타입이 lib.dom 에 아직 없는 부분만 최소 선언
interface DirHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string }>;
  getDirectoryHandle(name: string): Promise<DirHandle>;
  getFileHandle(name: string): Promise<{ getFile(): Promise<File> }>;
}
type PickerWindow = Window & { showDirectoryPicker?: (opts?: { mode?: 'read' }) => Promise<DirHandle> };

export function isFolderPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function';
}

/** 교사가 생기부 폴더(local-records)를 고른다. 읽기 전용. */
export async function pickLocalRecordsFolder(): Promise<LocalRecordsSource> {
  const w = window as PickerWindow;
  if (!w.showDirectoryPicker) throw new Error('이 브라우저는 폴더 열기를 지원하지 않습니다 — fromFileList() 를 쓰세요');
  const root = await w.showDirectoryPicker({ mode: 'read' });
  const students = await root.getDirectoryHandle('students');
  const cache = new Map<string, LocalStudentRecord | null>();
  return {
    async listStudentCodes() {
      const codes: string[] = [];
      for await (const e of students.values()) {
        const m = e.kind === 'file' ? FILE_RE.exec(e.name) : null;
        if (m) codes.push(m[1]);
      }
      return codes.sort();
    },
    async read(code) {
      if (!CODE_RE.test(code)) throw new Error('학생코드 형식이 틀립니다');
      if (cache.has(code)) return cache.get(code)!;
      let rec: LocalStudentRecord | null = null;
      try {
        const file = await (await students.getFileHandle(`${code}.json`)).getFile();
        rec = parseLocalStudentRecord(await file.text(), code);
      } catch (e) {
        if ((e as DOMException)?.name !== 'NotFoundError') throw e;
      }
      cache.set(code, rec);
      return rec;
    },
  };
}

/**
 * 폴더 열기를 못 쓰는 브라우저(Firefox·Safari)용 — `<input type="file" webkitdirectory>` 로 고른 파일 목록.
 * 메모리에만 두고, 탭을 닫으면 사라진다.
 */
export function fromFileList(files: FileList | File[]): LocalRecordsSource {
  const byCode = new Map<string, File>();
  for (const f of Array.from(files)) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const parts = rel.split('/');
    const m = FILE_RE.exec(parts[parts.length - 1]);
    if (m && (parts.length < 2 || parts[parts.length - 2] === 'students')) byCode.set(m[1], f);
  }
  const cache = new Map<string, LocalStudentRecord>();
  return {
    async listStudentCodes() {
      return [...byCode.keys()].sort();
    },
    async read(code) {
      if (cache.has(code)) return cache.get(code)!;
      const f = byCode.get(code);
      if (!f) return null;
      const rec = parseLocalStudentRecord(await f.text(), code);
      cache.set(code, rec);
      return rec;
    },
  };
}
