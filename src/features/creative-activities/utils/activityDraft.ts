// ========================================
// 활동 기록 AI 초안 — 순수 로직 (React 비의존)
//
// 교사가 자연어로 적은 활동을 구조화된 초안으로 바꾼다.
//
// **세 가지 원칙**
//   ① **초안은 절대 바로 저장하지 않는다.** 폼을 채워 사람이 확인한 뒤에 저장된다.
//      이 기록은 생기부의 근거가 되므로, 지어낸 문장이 그대로 들어가는 순간
//      이 시스템이 없애려던 문제(30% 결손을 그럴듯한 문장으로 메우기)를 자동화하게 된다.
//   ② **모르면 지어내지 말고 되묻는다.** 필수 항목이 글에서 확정되지 않으면
//      값을 만들지 말고 질문을 돌려준다.
//   ③ **사람 이름은 절대 만들지 않는다.** 실재하지 않는 학생·교사 이름이 학교 기록에
//      박히는 것이 최악의 실패다(spec_fill에서 얻은 규칙과 동일). 참여자는 명단에서 고른다.
// ========================================

import type { ActivityAreaGroup } from './activityLabels';

/** 확정되지 않으면 되물어야 하는 항목 */
export const REQUIRED_DRAFT_FIELDS = ['name', 'areaGroup', 'startsOn', 'content'] as const;
export type RequiredDraftField = (typeof REQUIRED_DRAFT_FIELDS)[number];

/** 되묻지는 않지만 비면 화면에서 손해가 큰 항목 */
export const RECOMMENDED_DRAFT_FIELDS = ['careerFields'] as const;

export const DRAFT_FIELD_LABELS: Record<string, string> = {
  name: '활동 이름',
  areaGroup: '영역(자율·진로 / 동아리 / 봉사)',
  startsOn: '활동 날짜',
  content: '활동 내용',
  careerFields: '진로·분야',
};

/** LLM이 채워 오는 활동 초안. 확정하지 못한 값은 넣지 않는다(undefined). */
export interface ActivityDraft {
  name?: string;
  areaGroup?: ActivityAreaGroup;
  content?: string;
  careerFields?: string[];
  keywords?: string[];
  relatedSubjects?: string[];
  startsOn?: string;   // YYYY-MM-DD
  endsOn?: string;     // YYYY-MM-DD
  place?: string;
  hostName?: string;   // 주최 이름(문자열). id 매칭은 화면이 한다
  operatorName?: string;
}

export interface DraftResult {
  draft: ActivityDraft;
  /** 확정하지 못해 사람에게 되물을 질문. 비어 있으면 초안이 완성된 것 */
  questions: string[];
  /** 모델이 남긴 한 줄 요약(선택) */
  note?: string;
}

const AREA_GROUPS: ActivityAreaGroup[] = ['autonomy_career', 'club', 'service'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ----------------------------------------
// 프롬프트
// ----------------------------------------

export function buildDraftSystemPrompt(today: string, academicYear: number): string {
  return [
    '너는 한국 고등학교의 창의적 체험활동 기록을 정리하는 보조자다.',
    '교사가 자연어로 적은 활동 설명을 읽고 구조화된 초안 JSON을 만든다.',
    '',
    '## 절대 규칙',
    '1. 글에서 확인되지 않은 값은 **절대 만들어내지 마라.** 추측하느니 비워 두고 질문하라.',
    '2. **날짜를 기본값으로 채우지 마라.** 글에 날짜 단서가 전혀 없으면 startsOn을 넣지 말고',
    '   dateEvidence를 "none"으로 두고 질문하라. 오늘 날짜는 상대 표현("어제", "지난주 금요일")을',
    '   계산할 때의 **기준점일 뿐**이며, 날짜가 없을 때 대신 쓰는 값이 아니다.',
    '3. **사람 이름을 그대로 쓰지 마라.** 글에 이름이 나오면 mentionedNames에 모아 신고하고,',
    '   content·note에는 "담당 교사", "학생", "학생들"처럼 역할로 바꿔 적어라.',
    '   참여자는 시스템이 명단에서 고르므로 초안에 이름이 있을 이유가 없다.',
    '4. 활동 이름은 **무엇을 했는지**가 드러나야 한다. 동아리 이름만 적지 마라.',
    '   나쁨: "융합과학 동아리" / 좋음: "혈액형 판별 실험"',
    '5. 날짜는 반드시 YYYY-MM-DD 형식이다.',
    '',
    `오늘은 ${today}이고 현재 학년도는 ${academicYear}이다.`,
    '',
    '## 영역(areaGroup) 선택',
    '- "club": 동아리 시간에 한 활동',
    '- "service": 봉사활동',
    '- "autonomy_career": 자율·자치 활동과 진로 활동 (학교 행사·특강·캠페인·진로 체험 등)',
    '',
    '## 출력 형식',
    '다른 말 없이 JSON 객체 하나만 출력한다.',
    '{',
    '  "draft": {',
    '    "name": "활동 이름",',
    '    "areaGroup": "club" | "service" | "autonomy_career",',
    '    "content": "무엇을 어떻게 했는지 2~4문장",',
    '    "careerFields": ["의학", "생명공학"],',
    '    "keywords": ["혈액형", "응집반응"],',
    '    "relatedSubjects": ["생명과학Ⅰ"],',
    '    "startsOn": "YYYY-MM-DD",',
    '    "endsOn": "YYYY-MM-DD",',
    '    "place": "과학실",',
    '    "hostName": "융합과학",',
    '    "operatorName": "외부 업체명"',
    '  },',
    '  "dateEvidence": "explicit" | "relative" | "none",',
    '  "mentionedNames": ["글에 등장한 사람 이름 전부"],',
    '  "questions": ["확정하지 못한 것을 묻는 짧은 질문"],',
    '  "note": "한 줄 요약(이름 없이)"',
    '}',
    '',
    '## dateEvidence — 반드시 정직하게 신고하라',
    '- "explicit": 글에 날짜가 직접 적혀 있다 (예: "8월 21일", "2026-08-20")',
    '- "relative": 상대 표현을 오늘 기준으로 계산했다 (예: "어제", "지난주 금요일")',
    '- "none": 글에 날짜 단서가 전혀 없다 → **startsOn을 넣지 말고 질문하라**',
    '',
    '확정하지 못한 키는 **넣지 마라**(빈 문자열이나 "미상"을 넣지 마라).',
    'questions는 필수 항목(활동 이름·영역·날짜·내용)이 비었을 때만 넣고, 한 번에 3개를 넘기지 마라.',
    '이미 확정된 것은 다시 묻지 마라.',
  ].join('\n');
}

/** 대화 누적 — 이전 답변을 모두 실어 보내야 "이미 답한 것을 또 묻는" 일이 없다 */
export function buildDraftUserPrompt(turns: string[]): string {
  if (turns.length === 1) return turns[0];
  return turns
    .map((t, i) => (i === 0 ? `[활동 설명]\n${t}` : `[추가 답변 ${i}]\n${t}`))
    .join('\n\n');
}

// ----------------------------------------
// 응답 파싱
// ----------------------------------------

/**
 * 모델 응답에서 JSON 객체를 꺼낸다.
 *
 * 코드펜스(```json)로 감싸거나 앞뒤에 설명을 붙이는 경우가 흔하다 —
 * 그 두 가지만 벗겨도 실패의 대부분이 사라진다.
 */
export function extractJsonObject(raw: string): unknown {
  const text = raw.trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;

  try {
    return JSON.parse(candidate);
  } catch {
    // 앞뒤 잡담을 버리고 첫 { 부터 마지막 } 까지만
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function asTrimmedString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s) return undefined;
  // 모델이 "모름"류를 채우는 경우를 값으로 받지 않는다 — 그러면 되묻기가 무력해진다
  if (/^(미상|모름|알 수 없음|없음|unknown|n\/?a|null)$/i.test(s)) return undefined;
  return s;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.map(asTrimmedString).filter((s): s is string => !!s))];
  return out.length ? out : undefined;
}

function asIsoDate(v: unknown): string | undefined {
  const s = asTrimmedString(v);
  if (!s || !ISO_DATE.test(s)) return undefined;
  // 존재하지 않는 날짜(2026-02-31)를 걸러낸다
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  const back = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
  return back === s ? s : undefined;
}

/**
 * 모델 응답 → 초안 + 질문. 형식이 깨져도 던지지 않고 질문으로 되돌린다.
 *
 * `turns`(사용자 원문)를 함께 받는 이유: **날짜 증거를 코드가 직접 판정**하기 위해서다.
 * 실측(2026-08-28, solar-pro3) — 글에 날짜가 한 글자도 없는데 모델이 오늘 날짜를
 * `startsOn`에 채워 넣었다. 프롬프트로 금지해도 모델은 "오늘은 X다"를 폴백으로 읽는다.
 * 그래서 원문에 날짜 단서가 없으면 **모델이 뭐라고 하든 날짜를 버린다.**
 */
export function parseDraftResponse(raw: string, turns: string[] = []): DraftResult {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== 'object') {
    return {
      draft: {},
      questions: ['활동 내용을 다시 한 번 적어 주시겠어요? (무엇을·언제·어디서 했는지)'],
    };
  }

  const root = parsed as Record<string, unknown>;
  const rawDraft = (root.draft ?? root) as Record<string, unknown>;

  const areaRaw = asTrimmedString(rawDraft.areaGroup);
  const areaGroup = AREA_GROUPS.includes(areaRaw as ActivityAreaGroup)
    ? (areaRaw as ActivityAreaGroup)
    : undefined;

  // 날짜 증거 — 모델 신고와 원문 검사를 **둘 다** 통과해야 날짜를 받는다.
  // 원문 검사가 최종 판정이다(모델은 틀리게 신고할 수 있지만 원문은 거짓말하지 않는다).
  const evidence = asTrimmedString(root.dateEvidence);
  const modelSaysNone = evidence === 'none';
  const textHasDate = turns.length === 0 ? true : hasDateEvidence(turns.join('\n'));
  const dateAllowed = !modelSaysNone && textHasDate;

  const startsOn = dateAllowed ? asIsoDate(rawDraft.startsOn) : undefined;
  let endsOn = dateAllowed ? asIsoDate(rawDraft.endsOn) : undefined;
  // 종료일이 시작일보다 앞이면 버린다(CHECK activity_period_ordered 위반 방지)
  if (startsOn && endsOn && endsOn < startsOn) endsOn = undefined;
  // 같은 날이면 '하루'로 취급 — ends_on을 비운다
  if (startsOn && endsOn === startsOn) endsOn = undefined;

  const rawNames = asStringArray(root.mentionedNames) ?? [];
  // 모델이 신고를 빠뜨려도 원문에서 직접 캐낸다 — 신고에만 기대면 새는 순간을 못 막는다
  const names = [...new Set([...rawNames, ...detectPersonNames(turns.join('\n'))])];

  const draft: ActivityDraft = {
    name: redactNames(asTrimmedString(rawDraft.name), names),
    areaGroup,
    content: redactNames(asTrimmedString(rawDraft.content), names),
    careerFields: asStringArray(rawDraft.careerFields),
    keywords: asStringArray(rawDraft.keywords),
    relatedSubjects: asStringArray(rawDraft.relatedSubjects),
    startsOn,
    endsOn,
    place: redactNames(asTrimmedString(rawDraft.place), names),
    hostName: redactNames(asTrimmedString(rawDraft.hostName), names),
    operatorName: redactNames(asTrimmedString(rawDraft.operatorName), names),
  };

  const modelQuestions = (asStringArray(root.questions) ?? []).slice(0, 3);

  return {
    draft,
    // 모델이 안 물어도 **우리가 판정한 결손**을 우선한다 — 되묻기의 정본은 코드다
    questions: mergeQuestions(draft, modelQuestions),
    note: redactNames(asTrimmedString(root.note), names),
  };
}

// ----------------------------------------
// 코드 강제 — 프롬프트를 믿지 않는다
// ----------------------------------------

/**
 * 원문에 날짜 단서가 있는가.
 *
 * 있으면 모델이 계산한 날짜를 받고, 없으면 **모델이 뭘 채웠든 버린다.**
 * 실측에서 모델이 오늘 날짜를 폴백으로 채워 되묻기가 무력화됐다.
 */
export function hasDateEvidence(text: string): boolean {
  if (!text) return false;
  const patterns: RegExp[] = [
    /\d{4}\s*[-./년]\s*\d{1,2}\s*[-./월]\s*\d{1,2}/,   // 2026-08-20, 2026년 8월 20일
    /\d{1,2}\s*월\s*\d{1,2}\s*일/,                       // 8월 20일
    /\d{1,2}\s*\/\s*\d{1,2}/,                            // 8/20
    /\d{1,2}\s*일(에|,|\s|$)/,                             // 27일에
    /(그저께|엊그제|그제|어제|오늘|내일|모레)/,
    /(지난|저번|이번|다음|담)\s*주/,
    /(월|화|수|목|금|토|일)요일/,
    /(지난|저번|이번|다음)\s*달/,
    /\d{1,2}\s*주\s*차/,
  ];
  return patterns.some((re) => re.test(text));
}

/**
 * 원문에서 사람 이름을 캐낸다 — `홍길동 선생님`, `정이안 학생` 같은 확실한 꼬리만 본다.
 *
 * 넓게 잡으면 멀쩡한 낱말을 지우므로 **꼬리가 붙은 것만** 잡는다.
 * 모델의 `mentionedNames` 신고와 합쳐 쓰는 2차선이다.
 */
export function detectPersonNames(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();

  // `정이안, 송수아 학생이` 처럼 나열된 형태까지 잡는다 — 꼬리(선생님/학생 …)는
  // 마지막 이름에만 붙으므로 그 앞의 쉼표 나열을 함께 캡처해 쪼갠다.
  //   그룹1 = 앞 나열("정이안, "), 그룹2 = 꼬리가 붙은 이름("송수아")
  // 꼬리 뒤의 조사(이/가/은/는 …)는 그냥 흘려보낸다 — 예전 `(?![가-힣])`는
  // `선생님이`의 '이' 때문에 매칭이 통째로 실패했다.
  const re =
    /(^|[^가-힣])((?:[가-힣]{2,4}\s*[,·]\s*)*)([가-힣]{2,4})\s*(선생님|샘|학생|군|양)/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    for (const piece of (m[2] ?? '').split(/[,·]/)) {
      const v = piece.trim();
      if (v.length >= 2) out.add(v);
    }
    out.add(m[3]);
  }
  return [...out];
}

/** 초안 텍스트에서 사람 이름을 가린다. 폼에서 사람이 고치도록 ○○로 남긴다. */
export function redactNames(
  value: string | undefined,
  names: string[]
): string | undefined {
  if (!value || names.length === 0) return value;
  let out = value;
  // 긴 이름부터 지워야 '김하' 가 '정이안'을 쪼개지 않는다
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    if (!name || name.length < 2) continue;
    out = out.split(name).join('○○');
  }
  const trimmed = out.trim();
  return trimmed ? trimmed : undefined;
}

// ----------------------------------------
// 결손 판정 — 되묻기의 정본
// ----------------------------------------

/** 필수 항목 중 비어 있는 것 */
export function findMissingRequired(draft: ActivityDraft): RequiredDraftField[] {
  return REQUIRED_DRAFT_FIELDS.filter((f) => {
    const v = draft[f];
    return v === undefined || v === null || (typeof v === 'string' && !v.trim());
  });
}

const FIELD_QUESTIONS: Record<RequiredDraftField, string> = {
  name: '이 활동의 이름을 무엇으로 할까요? (동아리 이름이 아니라 무엇을 했는지가 드러나게)',
  areaGroup: '어느 영역인가요? 자율·진로 / 동아리 / 봉사 중에서 알려 주세요.',
  startsOn: '활동을 한 날짜가 언제인가요? (예: 2026-08-27)',
  content: '활동에서 무엇을 어떻게 했는지 조금만 더 적어 주시겠어요?',
};

/**
 * 되물을 질문 목록.
 *
 * **모델이 낸 질문보다 코드 판정을 앞세운다** — 모델이 "다 채웠다"고 우겨도
 * 필수 항목이 비어 있으면 반드시 묻는다. 반대로 모델이 이미 채운 것을 또 묻는
 * 질문은 버린다(같은 걸 두 번 묻는 것이 이 기능을 가장 빨리 죽인다).
 */
export function mergeQuestions(draft: ActivityDraft, modelQuestions: string[]): string[] {
  const missing = findMissingRequired(draft);
  const ours = missing.map((f) => FIELD_QUESTIONS[f]);

  // 필수가 다 찼으면 모델 질문도 버린다 — 더 물을 이유가 없다
  if (missing.length === 0) return [];

  const seen = new Set(ours.map(normalizeForCompare));
  for (const q of modelQuestions) {
    const key = normalizeForCompare(q);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ours.push(q);
  }
  return ours.slice(0, 4);
}

function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, '').replace(/[?？.,!]/g, '').toLowerCase();
}

/** 되묻지는 않지만 화면에서 손해가 큰 항목(진로·분야) */
export function findMissingRecommended(draft: ActivityDraft): string[] {
  return draft.careerFields?.length ? [] : ['careerFields'];
}

/** 초안이 폼을 열 만큼 채워졌는가 */
export function isDraftReady(draft: ActivityDraft): boolean {
  return findMissingRequired(draft).length === 0;
}
