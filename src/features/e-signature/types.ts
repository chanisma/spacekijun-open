/**
 * 전자서명 도메인 타입 — DB 스키마의 거울.
 *
 * DB 는 snake_case, 화면은 camelCase 를 쓴다. 변환은 `services/signatureService.ts`
 * 한 곳에서만 하고, 그 밖에서는 이 타입만 본다.
 */
import type { SignaturePlacement } from './lib/signatureField';
import type { RequestStatus, SignerStatus } from './lib/signatureFlow';

export type { SignaturePlacement, RequestStatus, SignerStatus };

/** 다룰 수 있는 원본 문서 종류. 각각 날인 엔진이 하나씩 있다. */
export type SourceKind = 'hwpx' | 'pdf' | 'image';

/**
 * 끝난 문서(완료·거절·취소)를 며칠 뒤 정리하는가. **서버 `signature_purge_days()` 와 같아야 한다** —
 * 어긋나면 화면이 남은 일수를 틀리게 말한다.
 */
export const PURGE_DAYS = 7;

/**
 * 서명 마감(2026-10-25) — 요청마다 요청자가 정한다. 기본 = 요청 후 `PURGE_DAYS` 일,
 * 범위 = 지금부터 1시간 뒤 ~ 요청 시각 + `DUE_MAX_DAYS` 일. **서버 `set_signature_due`·`signature_due_max_days()` 와 짝.**
 * 마감까지 서명이 끝나지 않으면 만료되고 문서가 정리된다.
 */
export const DUE_MAX_DAYS = 60;
export const DUE_MIN_LEAD_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 새 요청의 기본 마감 — 7일 뒤 같은 시각 */
export function defaultDueAt(now = new Date()): Date {
  return new Date(now.getTime() + PURGE_DAYS * DAY_MS);
}

/** 고를 수 있는 마감 범위. `createdAt` 이 없으면(새 요청) 지금 기준 */
export function dueRange(createdAt?: string | null, now = new Date()): { min: Date; max: Date } {
  const base = createdAt ? new Date(createdAt) : now;
  return { min: new Date(now.getTime() + DUE_MIN_LEAD_MS), max: new Date(base.getTime() + DUE_MAX_DAYS * DAY_MS) };
}

/** 마감 값이 범위 안인가 — 서버가 다시 확인하지만 저장 버튼을 미리 막는다 */
export function dueError(due: Date, createdAt?: string | null, now = new Date()): string | null {
  if (Number.isNaN(due.getTime())) return '날짜를 골라 주세요.';
  const { min, max } = dueRange(createdAt, now);
  if (due < min) return '마감은 지금부터 1시간 뒤 이후로 정해 주세요.';
  if (due > max) return `마감은 요청한 날부터 ${DUE_MAX_DAYS}일 안으로 정해 주세요.`;
  return null;
}

/**
 * 정리 시각 — 정리될 문서가 아니면 null.
 *
 * **진행 중인 건은 서명 마감(`dueAt`), 완료된 건은 완료 후 `PURGE_DAYS` 일**(서버 규칙과 동일).
 * `dueAt` 이 없으면(옛 캐시) 요청 후 `PURGE_DAYS` 일 — 서버의 기존 행 채움과 같다.
 * 이미 정리됐거나 Drive 로 옮겼으면 대상이 아니다.
 */
export function purgeDeadline(request: {
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  purgedAt: string | null;
  dueAt?: string | null;
  meta: Record<string, unknown>;
}): Date | null {
  if (request.purgedAt) return null;
  if (request.meta?.drive) return null;
  if (request.status !== 'pending' && request.status !== 'completed') return null;

  if (request.status === 'pending' && request.dueAt) {
    const due = new Date(request.dueAt);
    return Number.isNaN(due.getTime()) ? null : due;
  }
  const base = request.status === 'completed' && request.decidedAt
    ? new Date(request.decidedAt)
    : new Date(request.createdAt);
  if (Number.isNaN(base.getTime())) return null;

  return new Date(base.getTime() + PURGE_DAYS * DAY_MS);
}

/**
 * 정리까지 남은 **달력 일수**. 0 = 오늘, 1 = 내일. 대상이 아니면 null.
 *
 * 시간 차이를 그대로 나누면 "3일 12시간 남음"이 반올림 방향에 따라 3 이 되기도 4 가 되기도
 * 한다. 사람은 **날짜로 센다** — 오늘이 4일이고 기한이 11일이면 그냥 "7일"이다.
 * 그래서 양쪽을 자정으로 내려 비교한다(화면에 함께 적는 날짜와도 어긋나지 않는다).
 */
export function daysUntilPurge(request: Parameters<typeof purgeDeadline>[0]): number | null {
  const deadline = purgeDeadline(request);
  if (!deadline) return null;

  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((midnight(deadline) - midnight(new Date())) / (24 * 60 * 60 * 1000));
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** `9월 11일(목) 14:30` — 언제 지워지는지 **정확히** 말한다 */
export function formatPurgeDeadline(deadline: Date): string {
  const hh = String(deadline.getHours()).padStart(2, '0');
  const mm = String(deadline.getMinutes()).padStart(2, '0');
  return `${deadline.getMonth() + 1}월 ${deadline.getDate()}일(${WEEKDAYS[deadline.getDay()]}) ${hh}:${mm}`;
}

/** `3일 남음` · `내일` · `오늘` — 남은 기간을 사람 말로 */
export function formatDaysLeft(days: number): string {
  if (days <= 0) return '오늘';
  if (days === 1) return '내일';
  return `${days}일 남음`;
}

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  hwpx: '한글',
  pdf: 'PDF',
  image: '이미지',
};

/** 확장자·MIME 으로 종류를 정한다. 모르는 형식은 null(업로드 거부). */
export function detectSourceKind(fileName: string, mime?: string | null): SourceKind | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  /*
    **`.hwp` 는 받지 않는다.** `.hwpx` 는 zip(OPC 패키지)이지만 `.hwp` 는 한글 97~2007 의
    복합 바이너리(CFB)로 완전히 다른 포맷이고, 이 기능의 한글 처리(rhwp 레이아웃 · zip+XML
    편집)는 **전부 zip 전제**다. 종전에는 `.hwp` 를 'hwpx' 로 분류해 통과시켰고, 그 결과
    날인 단계에서 JSZip 이 "Can't find end of central directory" 를 던졌다 — 파일을 올릴
    때가 아니라 **서명을 다 받은 뒤에** 터지는 자리라 가장 나쁜 시점이었다.
    거절은 `SOURCE_KIND_REJECT` 가 이유와 해결책을 함께 말한다.
  */
  if (ext === 'hwpx') return 'hwpx';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
  // 확장자가 없거나 이상한 경우 MIME 폴백
  if (mime?.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return null;
}

/**
 * 받을 수 없는 파일에 대한 **구체적인** 안내. 그냥 "지원하지 않습니다" 라고만 하면
 * 사용자는 뭘 해야 할지 모른다 — `.hwp` 는 한글에서 다시 저장하면 되는 문제다.
 */
export function sourceRejectReason(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'hwp') {
    return '한글 97~2007 형식(.hwp)은 서명할 수 없습니다. 한글에서 [다른 이름으로 저장] → 한/글 문서(*.hwpx)로 저장한 뒤 올려 주세요.';
  }
  if (ext === 'doc' || ext === 'docx') {
    return 'Word 문서는 서명할 수 없습니다. PDF 로 저장한 뒤 올려 주세요.';
  }
  return '한글(hwpx)·PDF·이미지 파일만 서명할 수 있습니다.';
}

export interface SignatureSigner {
  id: string;
  requestId: string;
  /** 같은 값 = 동시 서명 그룹 */
  orderIndex: number;
  /** 결재처럼 직위 칸이 있는 형태에서만(계·부장·교감·교장). 일반 서명은 null */
  roleLabel: string | null;
  signerUserId: string | null;
  signerResourceId: string | null;
  signerName: string;
  status: SignerStatus;
  /** 획 좌표 서명(연수·결재와 같은 형식) */
  signature: unknown;
  comment: string | null;
  actedAt: string | null;
  /** 이 사람의 서명이 찍힐 자리들 */
  fields: SignaturePlacement[];
}

export interface SignatureRequest {
  id: string;
  title: string;
  message: string | null;

  /** 다른 기능에 붙였을 때만 채워진다 */
  subjectType: string | null;
  subjectId: string | null;

  sourceKind: SourceKind;
  sourcePath: string;
  sourceName: string;
  sourceMime: string | null;
  pageCount: number | null;

  /** 완성본 경로. 없으면 아직 굽지 않았다 */
  signedPath: string | null;
  /**
   * 원본·완성본을 Storage 에서 지운 시각.
   * 설정돼 있으면 **파일이 없다** — 화면은 내려받기를 막고 이유를 설명해야 한다.
   */
  purgedAt: string | null;

  status: RequestStatus;
  currentOrder: number;

  requesterUserId: string;
  requesterResourceId: string | null;
  requesterName: string;

  meta: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
  /** 서명 마감 — 진행 중일 때 이때까지 끝나지 않으면 만료·정리(2026-10-25, 요청자가 바꿀 수 있다) */
  dueAt: string;

  signers: SignatureSigner[];
}

/** 요청을 만들 때 화면이 모으는 값 */
export interface SignerDraft {
  /** 화면에서만 쓰는 임시 키 */
  key: string;
  orderIndex: number;
  roleLabel?: string | null;
  signerResourceId: string | null;
  signerName: string;
  fields: SignaturePlacement[];
}

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: '서명 중',
  completed: '완료',
  rejected: '거절됨',
  cancelled: '취소됨',
  // 기한이 지나 파일이 정리되며 끝난 것 — "완료되지 않았다"가 핵심이라 그렇게 읽히게 적는다
  expired: '미서명 만료',
};

/**
 * 상태 색 — 앱 전역 규약을 따른다(에메랄드=완료 · 블루=진행 · 슬레이트=대기 · 로즈=취소·거절).
 * 색이 곧 의미이므로 장식으로 다른 색을 쓰지 말 것.
 */
export const REQUEST_STATUS_TONE: Record<RequestStatus, string> = {
  pending: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
  // 완료가 아니므로 에메랄드를 쓰면 안 된다. 취소와 같은 계열이되 조금 더 눈에 띄게
  expired: 'bg-slate-100 text-slate-600 border-slate-300',
};
