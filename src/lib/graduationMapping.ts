// 졸업 익명화 매핑 CSV — 생성·검증 **단일 출처** (2026-09-04).
//
// 왜 이 파일이 있나:
// `process_graduated_student_cohort` 는 실명을 익명명으로 바꾸고 되돌릴 수 없다. 실명↔익명명
// 매핑은 RPC 안의 `create temporary table graduate_name_map (... ON COMMIT DROP)` 에만 있고
// **영구 테이블이 없다**(public 스키마 확인: %graduat%/%anonym% 0건). 즉 관리자가 내려받는
// 이 CSV 가 실명을 되찾을 **유일한 사본**이다.
//
// 그런데 종전 구현은 `anchor.click()` 으로 다운로드를 *시작만* 하고(게다가 곧바로
// `URL.revokeObjectURL`) 성공 여부를 확인하지 않은 채 RPC 를 실행했다. 브라우저 정책·저장공간·
// 조직 정책으로 파일이 안 떨어져도 익명화는 그대로 진행된다 — 복구 키 없이.
//
// 그래서 흐름을 둘로 나눴다: ①내려받기 → ②**내려받은 파일을 다시 선택**해 내용이 대상과
// 정확히 일치할 때만 실행 버튼이 열린다. 파일이 실제로 디스크에 있다는 것을 브라우저가
// 증명할 방법은 "그 파일을 다시 읽는 것"뿐이다.
//
// 생성과 검증이 같은 모듈에 있어야 포맷이 어긋나지 않는다(헤더 하나만 달라져도 검증이
// 영원히 실패해 관리자가 졸업 처리를 못 하게 된다). React 비의존 순수 모듈 — 회귀 테스트용.

export interface GraduationMappingEntry {
  /** resource.id — 대조의 기준 키 */
  resourceId: string;
  /** 학적 코드(resource.meta.id) */
  studentCode: string;
  /** 익명화 전 실명 */
  realName: string;
  /** `YYYY입학NNN` 별칭 */
  anonymousName: string;
  sequence: number;
}

export const GRADUATION_CSV_HEADER = [
  '입학연도',
  '순번',
  '학생코드',
  '실명',
  '익명명',
  '리소스ID',
] as const;

function escapeCsvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** 매핑 CSV 본문(BOM 제외). 열 순서는 `GRADUATION_CSV_HEADER` 와 반드시 같다. */
export function buildGraduationMappingCsv(
  admissionYear: number,
  entries: GraduationMappingEntry[],
): string {
  const rows = entries.map((e) => [
    admissionYear,
    e.sequence,
    e.studentCode,
    e.realName,
    e.anonymousName,
    e.resourceId,
  ]);
  return [GRADUATION_CSV_HEADER as unknown as (string | number)[], ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n');
}

/**
 * RFC 4180 한 줄 파서. 따옴표 안의 콤마·줄바꿈·이스케이프된 따옴표를 지킨다.
 * 실명에 콤마가 든 경우(드물지만 가능)에도 열이 밀리지 않아야 한다.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  // BOM 제거 + 개행 정규화
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export interface GraduationCsvVerification {
  ok: boolean;
  /** 실패 사유 — 관리자가 무엇을 하면 되는지 알 수 있게 구체적으로 */
  reason?: string;
  /** 파일에서 읽은 유효 행 수 */
  parsedCount: number;
}

/**
 * 내려받은 CSV 가 지금 처리하려는 대상과 **정확히 같은지** 확인한다.
 *
 * 느슨하게 통과시키면 안 되는 이유: 다른 연도의 예전 CSV 를 골라도 통과해 버리면
 * 이 단계가 "확인했다는 착각"만 만들고 복구 키는 여전히 없다. 그래서 개수·구성 모두
 * 정확히 일치해야 한다(부분집합·상위집합 모두 거부).
 */
export function verifyGraduationMappingCsv(
  csvText: string,
  expected: GraduationMappingEntry[],
): GraduationCsvVerification {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return { ok: false, reason: '빈 파일입니다. 내려받은 매핑 CSV를 선택해 주세요.', parsedCount: 0 };
  }

  const header = rows[0].map((c) => c.trim());
  const headerMatches =
    header.length === GRADUATION_CSV_HEADER.length &&
    GRADUATION_CSV_HEADER.every((name, i) => header[i] === name);
  if (!headerMatches) {
    return {
      ok: false,
      reason: '매핑 CSV 형식이 아닙니다. 방금 내려받은 파일을 그대로 선택해 주세요.',
      parsedCount: 0,
    };
  }

  const body = rows.slice(1);
  // 대조 키 = 리소스ID + 익명명. 익명명까지 보는 이유: 순번이 바뀌면 별칭도 바뀌는데
  // 그 CSV 로는 실제 저장될 이름을 되찾을 수 없다.
  const seen = new Map<string, string>();
  for (const r of body) {
    const resourceId = (r[5] ?? '').trim();
    const anonymousName = (r[4] ?? '').trim();
    if (!resourceId) continue;
    seen.set(resourceId, anonymousName);
  }

  if (seen.size !== expected.length) {
    return {
      ok: false,
      reason: `대상 ${expected.length}명과 파일의 ${seen.size}건이 다릅니다. `
        + '검색 조건을 바꿨다면 CSV를 다시 내려받아 주세요.',
      parsedCount: seen.size,
    };
  }

  for (const e of expected) {
    const got = seen.get(e.resourceId);
    if (got === undefined) {
      return {
        ok: false,
        reason: `${e.realName}(${e.studentCode})이(가) 파일에 없습니다. CSV를 다시 내려받아 주세요.`,
        parsedCount: seen.size,
      };
    }
    if (got !== e.anonymousName) {
      return {
        ok: false,
        reason: `${e.realName}의 익명명이 파일(${got})과 처리 예정(${e.anonymousName})에서 다릅니다. `
          + 'CSV를 다시 내려받아 주세요.',
        parsedCount: seen.size,
      };
    }
  }

  return { ok: true, parsedCount: seen.size };
}
