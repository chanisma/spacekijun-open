// ========================================
// 일괄 업무(duty) CSV 파싱 — 담당자 칸에 여러 명 (2026-08-12)
//
// 담당자 칸에 이름을 쉼표로 구분해 여러 명을 배정할 수 있다. 문제는 **CSV의 열 구분자도
// 쉼표**라는 것 — 구 파서는 줄을 그냥 `split(',')` 해서 `홍길동,김철수`를 두 개의 열로 읽고
// 그 뒤 열이 전부 한 칸씩 밀렸다(근무일 자리에 이름이 들어가는 식). 그래서 두 가지를
// 함께 지원한다:
//   1) **따옴표로 감싼 칸** `"홍길동,김철수"` — 엑셀이 쉼표가 든 셀을 저장할 때 쓰는 표준
//      형식이라, 사용자가 셀에 `홍길동,김철수`라고 치고 저장하면 자동으로 이 형태가 된다.
//   2) **담당자 칸 전용 대체 구분자** `;` `/` `·` 등 — 메모장에서 손으로 쓸 때 안전한 길.
// 여기에 더해 담당자가 **마지막 열**이면 따옴표 없는 여분 쉼표도 담당자로 합친다(기본 양식
// dutyform.csv가 근무자를 마지막 열에 두므로 손으로 편집하는 흔한 경우). 담당자가 마지막
// 열이 아니면 여분 쉼표가 어느 열에서 왔는지 알 수 없으므로 **합치지 않고 오류로 알린다**
// — 조용히 잘못된 행을 만드느니 고치라고 말하는 편이 낫다.
//
// 하류(`convertAssigneeToJsonb`)는 쉼표로 구분된 이름/ID 문자열을 이미 지원하므로
// `담당자`는 정규화된 쉼표 결합 문자열로 돌려준다(그대로 넘기면 담당자 N명이 배정된다).
// ========================================

export interface DutyRecord {
  /** 하류 전달용 — 정규화된 쉼표 결합 문자열(`convertAssigneeToJsonb`가 다시 분리한다) */
  담당자: string;
  /** 표시·검증용 이름 목록(중복 제거) */
  담당자목록: string[];
  근무일: string;
  시작시간: string;
  종료시간: string;
  근무내용: string;
  비고?: string;
}

export interface DutyCsvResult {
  records: DutyRecord[];
  errors: string[];
}

import { parseCsvRows } from './csv';

/** 담당자 칸 안에서 이름을 나누는 구분자: 쉼표(따옴표 안)·세미콜론·슬래시·가운뎃점·모점·전각쉼표 */
const ASSIGNEE_SEPARATORS = /[,;/·‧・、，]+/;

/**
 * RFC 4180 CSV 파싱. 구현은 `@/lib/csv`로 옮겼다 — NEIS 지필평가 CSV 파서가 같은
 * "칸 안의 쉼표" 문제를 겪어서, 두 곳이 각자 파서를 갖지 않도록 공용화했다.
 * 기존 호출부·회귀 테스트가 이 모듈에서 계속 import 하므로 여기서 re-export 한다.
 */
export { parseCsvRows };

/** 담당자 칸 → 이름 목록(빈 값·중복 제거) */
export function splitAssigneeNames(cell: string): string[] {
  const names = cell
    .split(ASSIGNEE_SEPARATORS)
    .map((name) => name.trim())
    .filter(Boolean);
  return [...new Set(names)];
}

/** 헤더 매칭 — 표기 흔들림(근무일/근무일자/날짜…)을 흡수하는 기존 규칙 유지 */
function findColumnIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = headers.findIndex((header) => header.includes(candidate) || candidate.includes(header));
    if (index !== -1) return index;
  }
  return -1;
}

/** YYYY-MM-DD 이면서 실재하는 날짜인지(2026-02-31 같은 값이 3/3으로 굴러가지 않게) */
function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** HH:mm 이면서 실재하는 시각인지 */
function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function validateRecord(record: DutyRecord, rowLabel: string): string[] {
  const errors: string[] = [];

  if (record.담당자목록.length === 0) errors.push(`${rowLabel}: 담당자가 비어있습니다.`);
  if (!record.근무일) errors.push(`${rowLabel}: 근무일이 비어있습니다.`);
  if (!record.시작시간) errors.push(`${rowLabel}: 시작시간이 비어있습니다.`);
  if (!record.종료시간) errors.push(`${rowLabel}: 종료시간이 비어있습니다.`);

  if (record.근무일 && !isRealDate(record.근무일)) {
    errors.push(`${rowLabel}: 근무일이 올바르지 않습니다. (YYYY-MM-DD 형식의 실제 날짜 필요: ${record.근무일})`);
  }

  const start = record.시작시간 ? parseTime(record.시작시간) : null;
  const end = record.종료시간 ? parseTime(record.종료시간) : null;
  if (record.시작시간 && !start) {
    errors.push(`${rowLabel}: 시작시간이 올바르지 않습니다. (HH:mm 형식 필요: ${record.시작시간})`);
  }
  if (record.종료시간 && !end) {
    errors.push(`${rowLabel}: 종료시간이 올바르지 않습니다. (HH:mm 형식 필요: ${record.종료시간})`);
  }

  // 하루를 넘어서는 근무(19:00~07:00)는 시작·종료를 같은 날짜에 기록하는 현 모델로 표현 불가
  if (start && end && end.hour * 60 + end.minute <= start.hour * 60 + start.minute) {
    errors.push(
      `${rowLabel}: 하루를 넘어서는 근무시간입니다. (${record.시작시간}~${record.종료시간}) - 현재 시스템에서는 지원되지 않습니다.`
    );
  }

  return errors;
}

/**
 * 일괄 업무 CSV 전체 파싱. 오류가 하나라도 있으면 `records`는 비우고 `errors`만 돌려준다
 * (일부만 생성되어 나머지를 손으로 메우는 상황을 만들지 않기 위해 — 기존 동작 유지).
 */
export function parseDutyCsv(text: string): DutyCsvResult {
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    return { records: [], errors: ['CSV에 데이터 행이 없습니다. (첫 줄은 머리글이어야 합니다)'] };
  }

  const headers = rows[0];
  const assigneeIndex = findColumnIndex(headers, ['담당자', '근무자', '이름']);
  const dateIndex = findColumnIndex(headers, ['근무일', '근무일자', '날짜', '일자']);
  const startTimeIndex = findColumnIndex(headers, ['시작시간', '시작 시간']);
  const endTimeIndex = findColumnIndex(headers, ['종료시간', '종료 시간']);
  const contentIndex = findColumnIndex(headers, ['근무내용', '내용', '업무']);
  const noteIndex = findColumnIndex(headers, ['비고', '메모']);

  const missing: string[] = [];
  if (assigneeIndex === -1) missing.push('담당자(근무자)');
  if (dateIndex === -1) missing.push('근무일자');
  if (startTimeIndex === -1) missing.push('시작 시간');
  if (endTimeIndex === -1) missing.push('종료 시간');
  if (missing.length > 0) {
    return { records: [], errors: [`머리글에서 다음 열을 찾을 수 없습니다: ${missing.join(', ')}`] };
  }

  // 담당자가 마지막 열일 때만 따옴표 없는 여분 쉼표를 담당자로 합칠 수 있다
  const assigneeIsLastColumn = assigneeIndex === headers.length - 1;
  const requiredWidth = Math.max(assigneeIndex, dateIndex, startTimeIndex, endTimeIndex) + 1;

  const records: DutyRecord[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const rowLabel = `${i + 1}행`;

    if (cells.length > headers.length && !assigneeIsLastColumn) {
      errors.push(
        `${rowLabel}: 열 개수(${cells.length})가 머리글(${headers.length})보다 많습니다. ` +
          `담당자 칸에 여러 명을 넣으려면 "홍길동,김철수"처럼 큰따옴표로 감싸거나 세미콜론(;)으로 구분해 주세요.`
      );
      continue;
    }

    if (cells.length < requiredWidth) {
      errors.push(`${rowLabel}: 열이 부족합니다. (필요 ${requiredWidth}개, 실제 ${cells.length}개)`);
      continue;
    }

    // 담당자가 마지막 열이면 그 뒤 여분 값들은 전부 담당자 이름으로 본다
    const assigneeCell = assigneeIsLastColumn
      ? cells.slice(assigneeIndex).join(',')
      : cells[assigneeIndex] ?? '';
    const 담당자목록 = splitAssigneeNames(assigneeCell);

    const record: DutyRecord = {
      담당자: 담당자목록.join(','),
      담당자목록,
      근무일: cells[dateIndex] ?? '',
      시작시간: cells[startTimeIndex] ?? '',
      종료시간: cells[endTimeIndex] ?? '',
      근무내용: (contentIndex !== -1 ? cells[contentIndex] : '') || '업무',
      비고: noteIndex !== -1 ? cells[noteIndex] ?? '' : '',
    };

    errors.push(...validateRecord(record, rowLabel));
    records.push(record);
  }

  if (errors.length > 0) return { records: [], errors };
  if (records.length === 0) return { records: [], errors: ['CSV에서 읽을 수 있는 근무 행이 없습니다.'] };
  return { records, errors: [] };
}

/** 일정 제목에 붙일 담당자 표기 — 인원이 많으면 제목이 길어지므로 요약한다 */
export function formatAssigneeTitle(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length <= 3) return names.join(', ');
  return `${names[0]} 외 ${names.length - 1}명`;
}
