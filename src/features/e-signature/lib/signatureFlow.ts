/**
 * 서명 진행 판정 — **순수 로직 단일 출처**.
 *
 * 핵심 규칙 하나: **같은 `order_index` = 한 그룹 = 동시 서명**. 그룹 전원이 끝나야 다음
 * 그룹으로 넘어간다. 전원이 같은 값이면 완전 동시, 전부 다르면 완전 순차, 섞으면 혼합이다.
 * 세 가지를 별도 모드로 두지 않은 이유 — 하나의 규칙으로 전부 표현되고, 모드를 따로
 * 저장하면 데이터와 규칙이 어긋날 수 있다.
 *
 * 서버(`act_on_signature_request`)와 **같은 규칙**이어야 한다. 화면이 "내 차례"라고
 * 했는데 서버가 거부하거나 그 반대면 사용자는 이유를 알 수 없다.
 *
 * React 비의존(회귀 테스트 = `npx tsx scripts/signature-flow-test/run.mts`).
 */
import type { SignaturePlacement } from './signatureField';

export type SignerStatus = 'pending' | 'signed' | 'rejected';
/**
 * `expired` = 기한(7일)이 지나 **파일이 정리되면서 종료된** 상태.
 * 서명이 끝나지 않은 채 끝났다는 뜻이라 화면은 "미서명"으로 읽히게 그려야 한다.
 */
export type RequestStatus = 'pending' | 'completed' | 'rejected' | 'cancelled' | 'expired';

export interface SignerLike {
  id: string;
  orderIndex: number;
  roleLabel: string | null;
  signerUserId: string | null;
  signerName: string;
  status: SignerStatus;
  fields: SignaturePlacement[];
  actedAt?: string | null;
}

/** 요청 전체가 어떤 형태인가 — 화면 설명 문구에 쓴다. 저장하지 않고 매번 파생한다. */
export type FlowShape = 'single' | 'parallel' | 'sequential' | 'mixed';

export function flowShape(signers: SignerLike[]): FlowShape {
  if (signers.length <= 1) return 'single';
  const groups = new Set(signers.map((s) => s.orderIndex));
  if (groups.size === 1) return 'parallel';
  if (groups.size === signers.length) return 'sequential';
  return 'mixed';
}

export const FLOW_SHAPE_LABEL: Record<FlowShape, string> = {
  single: '단독 서명',
  parallel: '동시 서명',
  sequential: '순차 서명',
  mixed: '혼합(동시+순차)',
};

/** order_index 로 묶은 그룹. 오름차순. */
export interface SignerGroup {
  orderIndex: number;
  signers: SignerLike[];
}

export function groupSigners(signers: SignerLike[]): SignerGroup[] {
  const map = new Map<number, SignerLike[]>();
  for (const s of signers) {
    const list = map.get(s.orderIndex) ?? [];
    list.push(s);
    map.set(s.orderIndex, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([orderIndex, list]) => ({
      orderIndex,
      // 그룹 안 순서는 화면 안정성만 좌우한다 — 이름순으로 고정
      signers: [...list].sort((a, b) => a.signerName.localeCompare(b.signerName, 'ko')),
    }));
}

/**
 * 지금 서명 차례인 그룹의 order_index.
 *
 * 저장된 `current_order` 를 그대로 믿지 않고 **서명자 상태에서 다시 구한다** — 요청이
 * 만들어진 뒤 서명자가 바뀌거나, 화면이 낡은 스냅샷을 들고 있을 때 서버와 어긋나지 않게.
 * 끝났으면 null.
 */
export function activeOrder(signers: SignerLike[]): number | null {
  const pending = signers.filter((s) => s.status === 'pending');
  if (pending.length === 0) return null;
  return Math.min(...pending.map((s) => s.orderIndex));
}

export interface MyTurn {
  /** 지금 내가 서명해야 하는가 */
  isMyTurn: boolean;
  /** 나에게 배정된 서명자 행(있으면). 차례가 아니어도 채워진다 */
  signer: SignerLike | null;
  /** 차례가 아닌 이유 — 화면에 그대로 보여 준다 */
  reason: 'not-assigned' | 'already-acted' | 'waiting-turn' | 'closed' | null;
}

/**
 * 내 차례인가.
 *
 * `userId` 우선, 없으면 **이름 폴백**(계정 연결이 아직 없는 사람도 서명할 수 있어야 한다 —
 * 서버 RPC 도 같은 폴백을 쓴다).
 */
export function myTurn(
  signers: SignerLike[],
  requestStatus: RequestStatus,
  me: { userId: string | null; name: string | null },
): MyTurn {
  const mine = signers.filter(
    (s) =>
      (me.userId != null && s.signerUserId === me.userId) ||
      (s.signerUserId == null && me.name != null && s.signerName === me.name),
  );
  if (mine.length === 0) return { isMyTurn: false, signer: null, reason: 'not-assigned' };

  // 여러 칸에 배정됐다면 아직 안 한 것을 먼저 잡는다
  const pending = mine.find((s) => s.status === 'pending') ?? mine[0];

  if (requestStatus !== 'pending') return { isMyTurn: false, signer: pending, reason: 'closed' };
  if (pending.status !== 'pending') return { isMyTurn: false, signer: pending, reason: 'already-acted' };

  const active = activeOrder(signers);
  if (active == null || pending.orderIndex !== active) {
    return { isMyTurn: false, signer: pending, reason: 'waiting-turn' };
  }
  return { isMyTurn: true, signer: pending, reason: null };
}

export interface SignProgress {
  total: number;
  signed: number;
  /** 0~100 */
  percent: number;
  /** 아직 서명하지 않은 사람 이름(현재 그룹 우선) */
  waitingOn: string[];
}

export function signProgress(signers: SignerLike[]): SignProgress {
  const total = signers.length;
  const signed = signers.filter((s) => s.status === 'signed').length;
  const active = activeOrder(signers);
  const waitingOn = signers
    .filter((s) => s.status === 'pending' && (active == null || s.orderIndex === active))
    .map((s) => s.signerName);
  return {
    total,
    signed,
    percent: total === 0 ? 0 : Math.round((signed / total) * 100),
    waitingOn,
  };
}

/**
 * 서명 요청을 만들 수 있는 상태인가 — 저장 전 검증.
 *
 * **칸이 없는 서명자를 허용하지 않는다**. 칸이 없으면 서명을 받아도 문서에 찍을 자리가
 * 없어, 서명은 했는데 결과물에 아무것도 나타나지 않는 상태가 된다(오류 없이 조용히).
 */
export function validateSigners(
  signers: Array<Pick<SignerLike, 'signerName' | 'orderIndex' | 'fields'>>,
): string | null {
  if (signers.length === 0) return '서명자를 한 명 이상 지정하세요.';
  if (signers.length > 30) return '서명자는 최대 30명입니다.';

  for (const s of signers) {
    if (!s.signerName.trim()) return '이름이 비어 있는 서명자가 있습니다.';
    if (!Number.isInteger(s.orderIndex) || s.orderIndex < 0) {
      return `${s.signerName}님의 서명 순서가 올바르지 않습니다.`;
    }
    if (s.fields.length === 0) {
      return `${s.signerName}님의 서명 위치를 지정하세요. 위치가 없으면 서명이 문서에 표시되지 않습니다.`;
    }
  }

  const names = signers.map((s) => s.signerName.trim());
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return `${dup}님이 중복 지정됐습니다.`;

  return null;
}
