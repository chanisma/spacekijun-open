/**
 * 교사 계정 관리 공용 유틸
 *
 * 교사가 사용하는 외부 서비스 계정(구글, 웨일스페이스, 인공지능용, 리로스쿨, 마이크로소프트 등)을
 * 표 `resource_accounts.accounts`(JSONB)에 저장한다 — **2026-10-13 전엔 `resource.meta.accounts`**
 * 였는데, `resource` 는 로그인한 누구나 읽을 수 있어 비밀번호가 학생에게도 보였다. 지금 표는
 * 본인·관리자만 읽는다(`services/resourceAccountsService.ts`). 이 파일의 함수들은 여전히
 * `{ accounts }` 모양의 "meta" 를 받으므로 `accountsAsMeta(행.accounts)` 로 넘기면 된다.
 *
 * 저장 형태 (resource_accounts.accounts) — **종류별 배열**:
 * {
 *   "google": [{ "id": "user@myschool.hs.kr", "password": "****", "note": "" }],
 *   "ai": [
 *     { "label": "Claude", "id": "claude440@...", "password": "...", "note": "기관 발급 · 2026-08-28" },
 *     { "label": "GPT",    "id": "gpt1147@...",   "password": "...", "note": "" }
 *   ]
 * }
 *
 * 한 종류에 계정이 여러 개일 수 있다(예: 인공지능용 = 교내 발급 + Claude + GPT).
 * `label` 은 같은 종류 안에서 계정을 구분하는 이름이며 선택 항목이다.
 *
 * ## 레거시 호환
 * 2026-08 이전에는 종류별로 계정 하나(`"ai": { "id": ... }`)만 저장했다. 라이브에 그 형태가
 * 그대로 남아 있으므로 **읽기는 객체·배열을 모두 받고, 쓰기는 항상 배열로** 통일한다.
 * (읽는 쪽이 두 형태를 모두 처리하므로 일괄 마이그레이션은 하지 않는다 — 편집된 행부터
 *  자연히 배열로 바뀐다.)
 */

/** 계정 종류 키 */
export type AccountKind =
  | 'google'
  | 'whalespace'
  | 'ai'
  | 'riroschool'
  | 'microsoft';

/** 한 계정의 필드 */
export interface TeacherAccount {
  /** 같은 종류 안에서 계정을 구분하는 이름 (예: 'Claude', 'GPT'). 계정이 하나면 비어 있어도 된다. */
  label?: string;
  id?: string;
  password?: string;
  note?: string;
}

/** 값이 들어가는 필드(라벨 제외) */
export type AccountField = 'id' | 'password' | 'note';

export const ACCOUNT_FIELDS: AccountField[] = ['id', 'password', 'note'];

/** resource.meta.accounts 전체 구조 — 종류별 계정 "목록" */
export type TeacherAccounts = Partial<Record<AccountKind, TeacherAccount[]>>;

/** 계정 종류 메타데이터 (표시 순서 = 배열 순서) */
export interface AccountKindMeta {
  key: AccountKind;
  label: string;
  /** 엑셀 헤더 및 별칭 매칭용 (소문자 비교) */
  aliases: string[];
}

export const ACCOUNT_KINDS: AccountKindMeta[] = [
  { key: 'google', label: '구글 계정', aliases: ['google', '구글', '구글계정', 'gmail'] },
  { key: 'whalespace', label: '웨일스페이스 계정', aliases: ['whalespace', 'whale', '웨일', '웨일스페이스'] },
  {
    key: 'ai',
    label: '인공지능용 계정',
    // 개별 AI 서비스명도 '인공지능용' 종류로 모은다. 서비스 구분은 아래 label 로 한다.
    aliases: [
      'ai', '인공지능', '인공지능용',
      'gpt', 'chatgpt', '지피티',
      'claude', '클로드',
      'gemini', '제미나이', '제미니',
      'copilot', '코파일럿',
      'perplexity', '퍼플렉시티',
      'wrtn', '뤼튼',
    ],
  },
  { key: 'riroschool', label: '리로스쿨 계정', aliases: ['riroschool', 'riro', '리로', '리로스쿨'] },
  { key: 'microsoft', label: '마이크로소프트 계정', aliases: ['microsoft', 'ms', '마이크로소프트', 'msoffice', 'outlook'] },
];

const KIND_BY_KEY = new Map<AccountKind, AccountKindMeta>(
  ACCOUNT_KINDS.map((k) => [k.key, k])
);

/**
 * 헤더에서 서비스 이름을 읽어 계정 라벨로 쓴다.
 * 같은 종류(특히 인공지능용)에 열이 여러 벌인 표를 여러 계정으로 갈라 넣기 위한 것.
 * `chatgpt` 가 `gpt` 를 포함하므로 더 구체적인 패턴을 앞에 둔다.
 */
const SERVICE_LABELS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /claude|클로드/, label: 'Claude' },
  { pattern: /gemini|제미나이|제미니/, label: 'Gemini' },
  { pattern: /copilot|코파일럿/, label: 'Copilot' },
  { pattern: /perplexity|퍼플렉시티/, label: 'Perplexity' },
  { pattern: /wrtn|뤼튼/, label: '뤼튼' },
  { pattern: /chatgpt|gpt|지피티/, label: 'GPT' },
];

/** 계정 키 → 한글 라벨 */
export function accountLabel(kind: AccountKind): string {
  return KIND_BY_KEY.get(kind)?.label ?? kind;
}

/** 내용(아이디·비밀번호·비고)이 하나도 없는 계정인가 — 라벨만 있는 항목은 빈 것으로 본다. */
function isEmptyAccount(acc: TeacherAccount): boolean {
  return !(acc.id || acc.password || acc.note);
}

/** 임의 값 → TeacherAccount (내용이 없으면 null) */
function parseAccountEntry(raw: unknown): TeacherAccount | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  const acc: TeacherAccount = {};
  if (typeof e.label === 'string') acc.label = e.label;
  if (typeof e.id === 'string') acc.id = e.id;
  if (typeof e.password === 'string') acc.password = e.password;
  if (typeof e.note === 'string') acc.note = e.note;
  return isEmptyAccount(acc) ? null : acc;
}

/**
 * resource.meta(any) 에서 accounts 서브 객체를 안전하게 파싱.
 * meta 가 문자열(JSON)인 경우, null 인 경우 모두 방어.
 * 종류별 값이 레거시 단일 객체든 배열이든 **항상 배열**로 돌려준다.
 */
export function parseAccounts(meta: unknown): TeacherAccounts {
  if (!meta) return {};
  let obj: Record<string, unknown>;
  if (typeof meta === 'string') {
    try {
      obj = JSON.parse(meta);
    } catch {
      return {};
    }
  } else if (typeof meta === 'object') {
    obj = meta as Record<string, unknown>;
  } else {
    return {};
  }

  const raw = obj.accounts;
  if (!raw || typeof raw !== 'object') return {};

  const result: TeacherAccounts = {};
  for (const { key } of ACCOUNT_KINDS) {
    const entry = (raw as Record<string, unknown>)[key];
    if (entry == null) continue;
    const list = Array.isArray(entry) ? entry : [entry];
    const parsed = list
      .map(parseAccountEntry)
      .filter((a): a is TeacherAccount => a !== null);
    if (parsed.length) result[key] = parsed;
  }
  return result;
}

/** 한 종류의 계정 목록 (없으면 빈 배열) */
export function accountEntries(
  accounts: TeacherAccounts,
  kind: AccountKind
): TeacherAccount[] {
  return accounts[kind] ?? [];
}

/** 아이디나 비밀번호가 실제로 등록된 계정 수 (표의 '등록' 배지 기준) */
export function countRegisteredAccounts(
  accounts: TeacherAccounts,
  kind: AccountKind
): number {
  return accountEntries(accounts, kind).filter((a) => a.id || a.password).length;
}

/**
 * 같은 종류 안에서 계정을 구분해 보여줄 이름.
 * 라벨이 있으면 라벨, 없고 계정이 여러 개면 `계정 N`, 하나뿐이면 빈 문자열.
 */
export function accountEntryLabel(
  entry: TeacherAccount,
  index: number,
  total: number
): string {
  const label = entry.label?.trim();
  if (label) return label;
  return total > 1 ? `계정 ${index + 1}` : '';
}

/** 빈 값(공백만) 제거 후 실제로 내용이 있는 계정만 남긴다. */
export function normalizeAccounts(accounts: TeacherAccounts): TeacherAccounts {
  const out: TeacherAccounts = {};
  for (const { key } of ACCOUNT_KINDS) {
    const list = accounts[key];
    if (!list?.length) continue;
    const cleaned: TeacherAccount[] = [];
    for (const acc of list) {
      if (!acc) continue;
      const label = acc.label?.trim() || '';
      const id = acc.id?.trim() || '';
      const password = acc.password?.trim() || '';
      const note = acc.note?.trim() || '';
      if (id || password || note) {
        cleaned.push({
          ...(label && { label }),
          ...(id && { id }),
          ...(password && { password }),
          ...(note && { note }),
        });
      }
    }
    if (cleaned.length) out[key] = cleaned;
  }
  return out;
}

/** 내용이 있는 계정이 하나라도 있는지 */
export function hasAnyAccount(accounts: TeacherAccounts): boolean {
  return ACCOUNT_KINDS.some(({ key }) =>
    (accounts[key] ?? []).some((acc) => acc && !isEmptyAccount(acc))
  );
}

/**
 * 기존 meta 를 보존하면서 accounts 만 교체한 새 meta 를 반환.
 * meta 가 문자열이면 파싱해서 병합하고, 실패 시 새 객체로 시작한다.
 * accounts 가 비면 meta 에서 accounts 키를 제거한다.
 */
export function mergeAccountsIntoMeta(
  meta: unknown,
  accounts: TeacherAccounts
): Record<string, unknown> {
  let base: Record<string, unknown> = {};
  if (typeof meta === 'string') {
    try {
      base = JSON.parse(meta);
    } catch {
      base = {};
    }
  } else if (meta && typeof meta === 'object') {
    base = { ...(meta as Record<string, unknown>) };
  }
  delete base.phone;
  delete base.hp;

  const normalized = normalizeAccounts(accounts);
  if (hasAnyAccount(normalized)) {
    base.accounts = normalized;
  } else {
    delete base.accounts;
  }
  return base;
}

/** patch 항목이 base 목록의 어느 계정을 가리키는지 + 무엇으로 찾았는지 */
interface AccountMatch {
  index: number;
  /** 'sole' = 계정이 하나뿐이라 그것으로 간주 */
  matchedBy: 'id' | 'label' | 'sole';
}

function findMatch(base: TeacherAccount[], patch: TeacherAccount): AccountMatch | null {
  const id = patch.id?.trim().toLowerCase();
  if (id) {
    const index = base.findIndex((b) => b.id?.trim().toLowerCase() === id);
    return index >= 0 ? { index, matchedBy: 'id' } : null;
  }
  const label = patch.label?.trim().toLowerCase();
  if (label) {
    const index = base.findIndex((b) => b.label?.trim().toLowerCase() === label);
    return index >= 0 ? { index, matchedBy: 'label' } : null;
  }
  // 아이디도 라벨도 없는 patch(예: "비밀번호" 열만 있는 표)는 계정이 하나일 때만
  // 그 계정을 가리킨다고 볼 수 있다. 여러 개면 어느 것인지 알 수 없다.
  return base.length === 1 ? { index: 0, matchedBy: 'sole' } : null;
}

/**
 * patch 의 값이 있는 필드만 base 위에 덮어쓴다.
 *
 * **매칭에 쓴 필드는 덮어쓰지 않는다.** 대소문자를 무시하고 찾았으므로 그 필드의 patch 값은
 * 기존 값과 표기만 다른 같은 값이고, 그대로 쓰면 저장된 자격 증명의 표기가 조용히 바뀐다
 * (이메일 로컬파트는 원칙적으로 대소문자를 구분한다). 표기를 고치려면 편집 모달을 쓴다.
 */
function mergeEntry(
  base: TeacherAccount,
  patch: TeacherAccount,
  matchedBy: AccountMatch['matchedBy']
): TeacherAccount {
  const merged: TeacherAccount = { ...base };
  (['label', 'id', 'password', 'note'] as (keyof TeacherAccount)[]).forEach((f) => {
    if (f === matchedBy) return;
    const v = patch[f]?.trim();
    if (v) merged[f] = v;
  });
  return merged;
}

/**
 * 부분 갱신(patch) 병합: `base` 위에 `patch` 의 "값이 있는" 필드만 덮어쓴다.
 * patch 에 없는 종류/계정/필드는 base 값을 그대로 보존한다.
 * (엑셀 일괄 등록처럼 "채워진 칸만 반영, 빈 칸은 원래 값 유지" 시맨틱에 사용)
 *
 * 계정 대응은 **아이디 → 라벨 → (계정이 하나뿐일 때만) 그 계정** 순으로 찾는다.
 * 대응되는 계정이 없으면 **새 계정으로 추가**하되, 아이디도 라벨도 없는 항목은
 * 어디에 붙일지 알 수 없으므로 버린다(엉뚱한 계정의 비밀번호를 덮어쓰지 않기 위함).
 *
 * 예) base={ai:[{id:'a'}]}, patch={ai:[{id:'a',password:'p'},{label:'Claude',id:'c'}]}
 *  → {ai:[{id:'a',password:'p'},{label:'Claude',id:'c'}]}
 */
export function deepMergeAccounts(
  base: TeacherAccounts,
  patch: TeacherAccounts
): TeacherAccounts {
  const out: TeacherAccounts = {};
  for (const { key } of ACCOUNT_KINDS) {
    const b = base[key] ?? [];
    const p = patch[key] ?? [];
    if (!b.length && !p.length) continue;

    const merged: TeacherAccount[] = b.map((acc) => ({ ...acc }));
    for (const entry of p) {
      if (!entry) continue;
      const match = findMatch(merged, entry);
      if (match) {
        merged[match.index] = mergeEntry(merged[match.index], entry, match.matchedBy);
      } else if (entry.id?.trim() || entry.label?.trim()) {
        merged.push({ ...entry });
      }
      // 아이디·라벨이 모두 없고 대응 계정도 못 찾은 항목은 무시한다.
    }

    const cleaned = merged.filter((acc) => !isEmptyAccount(acc));
    if (cleaned.length) out[key] = cleaned;
  }
  return out;
}

/**
 * 엑셀 일괄 등록용: 기존 meta 의 accounts 위에 patch 를 deep merge 한 새 meta 반환.
 * 나머지 meta(email/section 등)는 물론, patch 에 없는 기존 계정/필드도 보존한다.
 * 레거시 개인 전화번호 키(phone/hp)는 보존하지 않는다.
 */
export function mergeAccountPatchIntoMeta(
  meta: unknown,
  patch: TeacherAccounts
): Record<string, unknown> {
  const existing = parseAccounts(meta);
  const merged = deepMergeAccounts(existing, patch);
  return mergeAccountsIntoMeta(meta, merged);
}

export interface AccountHeaderMatch {
  kind: AccountKind;
  field: AccountField;
  /** 같은 종류에 열이 여러 벌 있을 때 계정을 구분하는 라벨 (예: 'Claude') */
  label?: string;
}

/**
 * 엑셀/CSV 헤더 문자열을 계정 종류 + 필드(+ 계정 라벨)로 매핑한다.
 * 예: "구글 아이디" → {kind:'google', field:'id'}
 *     "Claude 계정" → {kind:'ai', field:'id', label:'Claude'}
 *     "GPT 비밀번호" → {kind:'ai', field:'password', label:'GPT'}
 * 매칭 실패 시 null.
 *
 * **날짜 열은 의도적으로 무시한다.** "Claude 시작일" 같은 헤더는 필드 키워드가 없어
 * 예전 구현에서 기본값 'id' 로 떨어졌고, 그 결과 계정 아이디 자리에 날짜가 덮어쓰였다.
 */
export function matchAccountHeader(header: string): AccountHeaderMatch | null {
  const h = header.toLowerCase().replace(/\s+/g, '');
  if (!h) return null;

  // 날짜/기간 열은 계정 값이 아니다 (필드 기본값 'id' 로 새는 것을 막는다)
  if (/(시작일|발급일|개시일|종료일|만료|기간|날짜|date)/.test(h)) return null;

  let field: AccountField = 'id';
  if (/(비밀번호|비번|password|pw|pass)/.test(h)) field = 'password';
  else if (/(비고|메모|note|memo)/.test(h)) field = 'note';
  else if (/(아이디|계정|id|email|이메일)/.test(h)) field = 'id';
  else field = 'id';

  for (const meta of ACCOUNT_KINDS) {
    if (meta.aliases.some((a) => h.includes(a.toLowerCase()))) {
      const service = SERVICE_LABELS.find((s) => s.pattern.test(h));
      return { kind: meta.key, field, ...(service && { label: service.label }) };
    }
  }
  return null;
}
