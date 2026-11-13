/**
 * 알림 [답장] — 받는 사람 판정 단일 출처 (2026-09-22)
 *
 * 답장은 SPACEKIJUN 안의 사람(`resource.id`)에게 알림으로 간다. 문제는 **누구에게**인지가
 * 알림마다 다르게 적혀 있다는 것이다. 2026-09-22 라이브 쿨메신저 알림 287건 실측:
 *
 *  | 표기                               | 예                         | 판정          |
 *  |-----------------------------------|----------------------------|---------------|
 *  | 이름 그대로 / 괄호 꼬리            | `황지유`, `임로아(학년부장)` | exact (바로 특정) |
 *  | 교과 등 접두어가 붙음              | `체육황지아`                | partial (후보 제안 → 사용자 확인) |
 *  | 교직원 명단에 없는 이름·부서       | `보건실`, `최요한`          | unknown (사용자가 직접 고름) |
 *  | 여러 쪽지 묶음 — 보낸 사람 없음    | 제목 `새 쪽지 19건`, 본문에 명단 | batch (명단에서 고름) |
 *
 * **이름이 교직원 한 명과 정확히 일치할 때만 확정**한다. 나머지는 전부 사용자가 고른다 —
 * 추정으로 확정하면 엉뚱한 사람에게 답장이 가고, 그건 되돌릴 수 없다.
 *
 * 받는 사람 = 재직 교직원(teacher·staff)만. 학생과 이름이 같은 교사(장재윤)가 실제로 있지만
 * 명단을 교직원으로 한정하므로 모호해지지 않는다. 서버(`send_notification_reply`)도 같은 범위다.
 */

export interface ReplyPerson {
  /** resource.id */
  id: string;
  name: string;
  type: 'teacher' | 'staff';
  /** SPACEKIJUN 계정 연결 여부(user_resource). false 면 로그인하기 전까지 답장을 못 본다 */
  linked: boolean;
}

export type ReplyReason =
  /** 보낸 사람 이름이 교직원 한 명과 정확히 일치 */
  | 'exact'
  /** SPACEKIJUN 답장에 다시 답함 — 보낸 사람 id 를 서버가 기록해 두었다 */
  | 'reply'
  /** 같은 이름의 교직원이 여럿 */
  | 'duplicate'
  /** 표시 이름 안에 교직원 이름이 들어 있다 (접두어·꼬리) */
  | 'partial'
  /** 여러 쪽지를 묶은 알림 — 본문의 보낸 사람 명단에서 고른다 */
  | 'batch'
  /** 이름은 있지만 교직원 명단에 없다 (부서·외부인·퇴직자) */
  | 'unknown'
  /** 보낸 사람 정보가 아예 없다 */
  | 'missing';

export interface ReplyTarget {
  /** 알림에 적힌 보낸 사람 표시 이름. 묶음·정보 없음이면 null */
  senderLabel: string | null;
  reason: ReplyReason;
  /** 확정된 받는 사람 — exact·reply 일 때만 */
  resolved: ReplyPerson | null;
  /** 사용자가 고를 후보 (확정되지 않은 경우) */
  candidates: ReplyPerson[];
  /** 묶음 알림 명단 중 교직원 명단에서 찾지 못한 이름 */
  unmatchedLabels: string[];
  /** 같은 표시 이름에 지난번 이 브라우저에서 고른 사람 — 미리 선택만 하고 확정은 아니다 */
  remembered: ReplyPerson | null;
}

export interface ReplyableNotification {
  type: string;
  title: string;
  message: string;
  meta?: Record<string, unknown> | null;
}

/** [답장] 버튼을 붙이는 알림 유형 */
export const REPLYABLE_NOTIFICATION_TYPES = ['coolmessenger', 'direct_reply'] as const;

export function isReplyableNotification(n: Pick<ReplyableNotification, 'type'>): boolean {
  return (REPLYABLE_NOTIFICATION_TYPES as readonly string[]).includes(n.type);
}

/** 쿨메신저 알림 제목 머리 — 로컬 감시기가 `[쿨메신저] 보낸사람` 으로 넣는다 */
const COOLMSG_TITLE_PREFIX = /^\s*\[\s*쿨메신저\s*\]\s*/;
/** 여러 쪽지를 묶은 알림 제목 — `[쿨메신저] 새 쪽지 19건` */
const BATCH_TITLE = /새\s*쪽지\s*\d+\s*건/;

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

/**
 * 사람 이름 비교용 정규화 — 괄호 꼬리(`(학년부장)`·`(1-8)`)·공백·호칭을 걷어낸다.
 * 반대쪽(명단 이름)도 반드시 같은 함수를 거칠 것 — 한쪽만 정규화하면 조용히 0건이 된다.
 */
export function normalizePersonName(raw: string): string {
  return raw
    .replace(/[(（][^)）]*[)）]/g, '')
    .replace(/\s+/g, '')
    .replace(/(선생님|선생|님)$/u, '')
    .trim();
}

/**
 * 알림에 적힌 보낸 사람 표시 이름. 우선순위 = `meta.sender_plain` → `meta.sender` →
 * 제목의 `[쿨메신저] X`(묶음 제목은 제외). 감시기 버전에 따라 meta 가 비어 있기도 해서
 * 제목을 마지막 출처로 쓴다.
 */
export function extractSenderLabel(n: ReplyableNotification): string | null {
  const plain = str(n.meta?.sender_plain);
  if (plain) return normalizePersonName(plain) || null;

  const sender = str(n.meta?.sender);
  if (sender) return normalizePersonName(sender) || null;

  if (!COOLMSG_TITLE_PREFIX.test(n.title)) return null;
  const fromTitle = n.title.replace(COOLMSG_TITLE_PREFIX, '').trim();
  if (!fromTitle || BATCH_TITLE.test(fromTitle)) return null;
  return normalizePersonName(fromTitle) || null;
}

export function isBatchNotification(n: ReplyableNotification): boolean {
  return BATCH_TITLE.test(n.title);
}

/** 묶음 알림 본문(`임로아(학년부장), 보건실, 황지유`)을 이름 목록으로 — 순서 보존·중복 제거 */
export function parseSenderList(message: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of message.split(/[,，、\n]/)) {
    const name = normalizePersonName(token);
    // 이름 목록이 아닌 긴 문장 조각은 버린다 (묶음 형식이 바뀌어도 쓰레기 후보가 안 생기게)
    if (!name || name.length > 20 || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function byName(roster: ReplyPerson[]): Map<string, ReplyPerson[]> {
  const map = new Map<string, ReplyPerson[]>();
  for (const p of roster) {
    const key = normalizePersonName(p.name);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(p);
    else map.set(key, [p]);
  }
  return map;
}

/**
 * 표시 이름 안에 들어 있는 교직원 — `체육황지아` ⊃ `황지아`.
 * 뒤에 붙은 이름(접두어 형태)을 앞에, 그다음 긴 이름을 앞에 둔다. 두 글자 미만은 보지 않는다.
 */
function partialMatches(label: string, roster: ReplyPerson[]): ReplyPerson[] {
  return roster
    .filter((p) => {
      const key = normalizePersonName(p.name);
      return key.length >= 2 && key !== label && label.includes(key);
    })
    .sort((a, b) => {
      const ka = normalizePersonName(a.name);
      const kb = normalizePersonName(b.name);
      const ea = label.endsWith(ka) ? 1 : 0;
      const eb = label.endsWith(kb) ? 1 : 0;
      if (ea !== eb) return eb - ea;
      if (ka.length !== kb.length) return kb.length - ka.length;
      return a.name.localeCompare(b.name, 'ko');
    });
}

const EMPTY: Omit<ReplyTarget, 'reason'> = {
  senderLabel: null,
  resolved: null,
  candidates: [],
  unmatchedLabels: [],
  remembered: null,
};

/**
 * 답장 받는 사람 판정. 답장할 수 없는 알림이면 null.
 *
 * @param roster     재직 교직원 명단
 * @param remembered 표시 이름 → 지난번 고른 resource.id (이 브라우저에만 있는 편의 기억)
 */
export function resolveReplyTarget(
  n: ReplyableNotification,
  roster: ReplyPerson[],
  remembered: Record<string, string> = {},
): ReplyTarget | null {
  if (!isReplyableNotification(n)) return null;

  // SPACEKIJUN 답장에 대한 답장: 보낸 사람 id 를 서버가 적어 두었다 → 이름을 추측할 필요가 없다
  if (n.type === 'direct_reply') {
    const senderId = str(n.meta?.sender_resource_id);
    const senderName = str(n.meta?.sender_name);
    if (!senderId) return { ...EMPTY, senderLabel: senderName, reason: 'missing' };
    const person = roster.find((p) => p.id === senderId)
      // 명단에서 빠졌어도(퇴직 등) 판정은 id 로 한다 — 서버가 재직 여부를 다시 검사해 거절한다
      ?? { id: senderId, name: senderName ?? '보낸 사람', type: 'teacher' as const, linked: true };
    return { ...EMPTY, senderLabel: senderName, reason: 'reply', resolved: person };
  }

  const names = byName(roster);
  const rosterById = new Map(roster.map((p) => [p.id, p]));
  const label = extractSenderLabel(n);

  const rememberedFor = (key: string | null): ReplyPerson | null => {
    if (!key) return null;
    const id = remembered[key];
    return id ? rosterById.get(id) ?? null : null;
  };

  if (label) {
    const exact = names.get(label) ?? [];
    if (exact.length === 1) {
      return { ...EMPTY, senderLabel: label, reason: 'exact', resolved: exact[0] };
    }
    if (exact.length > 1) {
      return {
        ...EMPTY, senderLabel: label, reason: 'duplicate', candidates: exact, remembered: rememberedFor(label),
      };
    }
    const partial = partialMatches(label, roster);
    return {
      ...EMPTY,
      senderLabel: label,
      reason: partial.length > 0 ? 'partial' : 'unknown',
      candidates: partial,
      remembered: rememberedFor(label),
    };
  }

  // 보낸 사람 이름이 없다. 묶음 알림일 때만 본문을 명단으로 읽는다 — 자유 본문을 쉼표로
  // 쪼개 후보를 만들면 문장 조각이 우연히 누군가의 이름과 같을 때 엉뚱한 후보가 생긴다.
  if (!isBatchNotification(n)) {
    return { ...EMPTY, reason: 'missing' };
  }

  const listed = parseSenderList(n.message ?? '');
  const candidates: ReplyPerson[] = [];
  const unmatched: string[] = [];
  const picked = new Set<string>();
  for (const name of listed) {
    const hit = names.get(name) ?? [];
    if (hit.length === 0) {
      unmatched.push(name);
      continue;
    }
    for (const p of hit) {
      if (picked.has(p.id)) continue;
      picked.add(p.id);
      candidates.push(p);
    }
  }

  // 묶음이지만 전부 한 사람이 보낸 경우 — 사실상 정확 일치
  if (candidates.length === 1 && unmatched.length === 0) {
    return { ...EMPTY, reason: 'exact', resolved: candidates[0] };
  }
  return { ...EMPTY, reason: 'batch', candidates, unmatchedLabels: unmatched };
}

/** 사용자가 받는 사람을 **직접 골라야** 하는 판정인가 */
export function needsRecipientChoice(target: ReplyTarget): boolean {
  return target.resolved === null;
}

/**
 * 고른 사람을 기억할 표시 이름 키. 확정 판정(exact·reply)은 기억할 필요가 없고,
 * 표시 이름이 없는 묶음·정보 없음은 다음에 같은 이름으로 다시 오지 않으므로 기억할 수 없다.
 */
export function rememberKeyFor(target: ReplyTarget): string | null {
  if (target.resolved || !target.senderLabel) return null;
  return target.senderLabel;
}
