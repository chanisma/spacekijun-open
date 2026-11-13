/**
 * 토스트의 "어떤 색으로, 어떤 문장으로 보일 것인가"를 정하는 **순수 판정 단일 출처**.
 *
 * 이 모듈은 의도적으로 의존성이 0이다(React·sonner 모두 import 하지 않는다).
 * 실제 표시는 `src/lib/toast.ts`가 하고, 여기서는 값만 계산한다 —
 * 그래야 회귀 테스트가 브라우저 없이 `tsx`로 돌아간다.
 *
 * ## 왜 tone 을 유추하는가
 * 구 shadcn `toast({ title, description, variant })` API 에는 **success variant 가
 * 없다**. 그래서 이 저장소의 작성자들은 성공 알림을 `variant` 없이 썼다
 * (`toast({ title: '저장 완료', ... })`). 즉 **variant 부재는 "중립"이라는 뜻이 아니라
 * "표현할 수단이 없었다"는 뜻**이다. 실측: 실패 토스트 622건 중 619건이
 * `variant: 'destructive'` 를 갖고 있고(신호는 신뢰할 만하다), variant 없는 토스트
 * 300건 중 실패를 말하는 것은 3건뿐이었다(그 3건은 destructive 로 교정했다).
 * 따라서 아래 유추는 **의도를 복원**하는 것이지 없는 정보를 지어내는 것이 아니다.
 *
 * 판정 순서가 안전장치다 — **실패를 먼저 본다**. '삭제 실패' 가 '삭제' 때문에
 * 성공(에메랄드)으로 칠해지면 안 된다.
 */

export type ToastTone = 'success' | 'error' | 'warning' | 'info' | 'neutral';

/**
 * 지속 시간. 오류가 가장 길다 — 읽고 이해해야 하는 문장이 길고, 사라지면
 * 다시 부를 방법이 없다. 성공은 이미 화면이 결과를 보여 주므로 짧다.
 */
export const TOAST_DURATION_MS: Record<ToastTone, number> = {
  success: 3000,
  neutral: 4000,
  info: 4500,
  warning: 6000,
  error: 8000,
};

/**
 * 정보를 담지 않는 제목들. 아이콘과 색이 이미 같은 말을 하므로 한 줄을
 * 통째로 먹을 이유가 없다 — 이 제목이 오면 버리고 description 을 본문으로 올린다.
 * (실측 빈도: '오류' 222 · '성공' 82 · '알림' 12 · '완료' 11 · '경고' 8)
 */
const GENERIC_TITLES: Record<string, ToastTone> = {
  오류: 'error',
  에러: 'error',
  실패: 'error',
  Error: 'error',
  경고: 'warning',
  주의: 'warning',
  성공: 'success',
  완료: 'success',
  Success: 'success',
  알림: 'neutral',
  안내: 'neutral',
  확인: 'neutral',
  정보: 'info',
};

/** 제목이 실패를 말하는가. **성공 판정보다 먼저** 적용된다. */
const FAILURE_RE = /실패|오류|에러|없습니다|없음|못했|못합니다|않습니다|불가|거부|초과|만료|잘못/;
const WARNING_RE = /경고|주의|확인이 필요/;
/** 제목이 "무언가를 해냈다"를 말하는가. */
const SUCCESS_RE = /완료|성공|되었습니다|했습니다|됐습니다|추가됨|삭제됨|저장됨|반영됨/;

/**
 * 제목을 그대로 되풀이하는 설명문인가.
 *
 * 이 저장소에서 가장 흔한 동어반복이 정확히 이 모양이다 —
 * `{ title: '노트 삭제 완료', description: '노트가 삭제되었습니다.' }`.
 * 두 줄이 같은 한 가지를 말하므로 설명문을 버리고 한 줄로 만든다.
 *
 * 판정은 **양방향 일치**다(한쪽이 다른 쪽을 포함하는 것으로는 부족하다).
 * `{ title: '서명 완료', description: '연수 참석 서명이 저장되었습니다.' }` 처럼
 * 설명문이 어떤 서명인지를 더 말해 주는 경우까지 지워 버리면 정보를 잃는다.
 */
const PARTICLES = /(이|가|을|를|은|는|의|에서|에게|에|으로|로|와|과|도|만|부터|까지)$/;
const ENDINGS = /(되었습니다|됐습니다|하였습니다|했습니다|되었어요|했어요|합니다|됩니다|하세요|시켰습니다|시켰어요|되어|되었|했|됨|함)$/;
/** 그 자체로는 뜻을 더하지 않는 낱말 — 아이콘과 색이 이미 말한다. */
const FILLER = new Set(['완료', '성공', '성공적으로', '성공적', '정상적으로', '정상적', '새로운', '모든', '해당', '기존']);

function contentTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.split(/[^\p{Script=Hangul}\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    let t = raw;
    for (let i = 0; i < 3; i++) {
      const next = t.replace(ENDINGS, '').replace(PARTICLES, '');
      if (next === t) break;
      t = next;
    }
    if (t.length < 2 || FILLER.has(t)) continue;
    out.add(t);
  }
  return out;
}

export function isRestatement(title: string, description: string): boolean {
  const a = contentTokens(title);
  const b = contentTokens(description);
  if (a.size === 0 || b.size === 0) return false;
  if (a.size !== b.size) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

export interface LegacyToastInput {
  title?: unknown;
  description?: unknown;
  variant?: string | null;
}

export interface ResolvedToast {
  tone: ToastTone;
  /** 본문 첫 줄(굵게). 비어 있을 수 있다. */
  message: string;
  /** 둘째 줄. 제목만 있는 토스트에서는 undefined. */
  description?: string;
}

const asText = (v: unknown): string | undefined =>
  typeof v === 'string' ? v.trim() || undefined : v == null ? undefined : String(v).trim() || undefined;

/** 제목 문자열에서만 tone 을 유추한다(설명문까지 보면 '변경 사항이 없습니다' 같은 꼬리에 걸린다). */
export function inferToneFromTitle(title: string | undefined): ToastTone | undefined {
  if (!title) return undefined;
  const generic = GENERIC_TITLES[title];
  if (generic) return generic;
  if (FAILURE_RE.test(title)) return 'error';
  if (WARNING_RE.test(title)) return 'warning';
  if (SUCCESS_RE.test(title)) return 'success';
  return undefined;
}

/**
 * 구 `toast({ title, description, variant })` 호출을 sonner 가 쓰는 모양으로 바꾼다.
 *
 * - `variant: 'destructive'` 는 작성자가 명시한 신호이므로 **무조건 이긴다**.
 * - 제목이 정보 없는 상투어이고 설명문이 있으면 제목을 버린다(중복 제거).
 */
export function resolveLegacyToast(input: LegacyToastInput): ResolvedToast {
  const title = asText(input.title);
  const description = asText(input.description);

  const explicitError = input.variant === 'destructive';
  const inferred = inferToneFromTitle(title);
  const tone: ToastTone = explicitError ? 'error' : (inferred ?? 'neutral');

  // 상투어 제목 + 설명문 → 설명문만 남긴다.
  if (title && description && title in GENERIC_TITLES) {
    return { tone, message: description };
  }
  // 제목이 없으면 설명문이 곧 본문이다.
  if (!title) return { tone, message: description ?? '' };
  // 설명문이 제목을 되풀이할 뿐이면 버린다.
  if (description && isRestatement(title, description)) {
    return { tone, message: title };
  }

  return { tone, message: title, description };
}
