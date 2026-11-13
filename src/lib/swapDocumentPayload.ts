import type { LessonFillInput, LessonRow } from '@/components/toolbox/hwpx/lessonExchangeFormFill';

/**
 * 결강시 보강 계획서 ↔ 결재 payload 변환 (React 비의존 순수 모듈).
 *
 * 결재 요청은 상신 시점의 문서 내용을 `approval_request.payload`에 **스냅샷**으로 담는다.
 * 결재 문서 목록에서 문서를 다시 만들 때는 그 스냅샷이 정본이다 — 결재자들이 보고 서명한
 * 내용이 그것이고, 그 사이 원본 `class_swap`이 바뀌었더라도 결재된 문서는 변하면 안 된다.
 *
 * **표기 차이 주의**: payload는 사람이 읽는 `reasonLabels`(문자열)를 담는데,
 * 문서 채움기(`fillLessonSection0`)는 `reasons`(**인덱스** 0..8)를 받는다. 그래서
 * 라운드트립에 이 변환이 필요하다. 인덱스의 의미는 `ABSENCE_REASONS`의 순서가 정한다 —
 * **이 배열의 순서를 바꾸면 이미 저장된 결재의 사유 ○표가 통째로 어긋난다.**
 *
 * 회귀 테스트: `npx tsx scripts/swap-document-payload-test/run.mts`
 */

/** 결강 사유 — 순서가 곧 양식 결강사유 표의 열 순서(colAddr 1..9)다. 재배열 금지. */
export const ABSENCE_REASONS = [
  '공가',
  '조퇴',
  '오전출장',
  '오후출장',
  '연가',
  '특별휴가',
  '병가',
  '오전외출',
  '오후외출',
] as const;

/**
 * payload에 담는 형태. 미리보기(`registry.tsx`)가 읽는 키와 같아야 한다.
 *
 * `interface`가 아니라 **type 별칭**이어야 한다 — interface는 암묵적 인덱스 시그니처를 얻지
 * 못해 `Record<string, unknown>`(=`ApprovalButton.payload`)에 대입되지 않는다.
 */
export type SwapDocumentPayload = {
  teacherName: string;
  subject: string;
  reasonLabels: string[];
  rows: LessonRow[];
};

const ROW_FIELDS: (keyof LessonRow)[] = [
  'grade',
  'absenceDate',
  'absenceDay',
  'absencePeriod',
  'absenceSubject',
  'swapType',
  'makeupSubject',
  'makeupTeacher',
  'makeupDate',
  'makeupDay',
  'makeupPeriod',
  'makeupLocation',
];

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

/** 결재 상신 시 저장할 payload를 만든다. `reasons`는 인덱스, payload는 라벨. */
export function buildSwapDocumentPayload(input: LessonFillInput): SwapDocumentPayload {
  return {
    teacherName: input.teacherName,
    subject: input.subject,
    reasonLabels: input.reasons
      .map((index) => ABSENCE_REASONS[index])
      .filter((label): label is (typeof ABSENCE_REASONS)[number] => !!label),
    rows: input.rows,
  };
}

/**
 * 저장된 payload로 문서를 다시 만들기 위한 입력을 복원한다.
 * 문서를 그릴 수 없으면(모양이 아예 다르면) `null` — 호출부가 "읽을 수 없음"을 알려야 한다.
 *
 * 모르는 사유 라벨은 **조용히 버린다**(양식에 그 칸이 없으므로 찍을 자리가 없다).
 */
export function parseSwapDocumentPayload(payload: unknown): LessonFillInput | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  if (!Array.isArray(source.rows)) return null;

  const labels = Array.isArray(source.reasonLabels) ? source.reasonLabels : [];
  const reasons = labels
    .map((label) => (ABSENCE_REASONS as readonly string[]).indexOf(asText(label)))
    .filter((index) => index >= 0);

  const rows: LessonRow[] = source.rows.map((raw) => {
    const cell = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const row = {} as LessonRow;
    for (const field of ROW_FIELDS) row[field] = asText(cell[field]);
    return row;
  });

  return {
    teacherName: asText(source.teacherName),
    subject: asText(source.subject),
    // 중복 라벨이 들어와도 ○는 한 번만 찍히지만, 인덱스 집합을 깔끔히 유지한다.
    reasons: Array.from(new Set(reasons)),
    rows,
  };
}
