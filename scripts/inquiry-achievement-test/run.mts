/**
 * 탐구 설계 — 성취기준 맥락 회귀 · `npx tsx scripts/inquiry-achievement-test/run.mts`
 *
 * 이 영역은 **틀려도 오류가 나지 않는다**. 2026-09-14 에 실제로 이렇게 새어 나갔다:
 *
 *  · `docgen_context` SELECT 정책이 교직원 전용이라 **학생 시점에서 0행**이 돌아왔다.
 *    RLS 차단은 예외가 아니라 빈 결과라서 콘솔에도 흔적이 없다.
 *  · 서비스가 `if (error) return new Map()` 으로 조회 실패까지 삼켰다.
 *  · 화면은 로딩·조회 실패·진짜 미등록을 **한 문구로** 표시했다
 *    ("이 과목은 등록된 성취기준이 없습니다").
 *
 * 세 겹이 겹쳐서 "성취기준이 하나도 없다"로 보였고, 실제로는 118건이 멀쩡히 있었다.
 * 정책은 DB 에 있어 여기서 못 보지만, **나머지 두 겹**과 매칭 규칙은 여기서 못 박는다.
 */
import { readFileSync } from 'node:fs';

// 서비스는 supabase 클라이언트를 끌고 오고 그 모듈이 부팅 시 localStorage 를 만진다.
// 다른 회귀(`ipsi-ai-analysis-test`·`evalearn-store-test`)와 같은 방식으로 stub 후 동적 import.
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
};
const { normalizeSubjectKey } = await import(
  '../../src/features/inquiry-design/services/achievementContextService'
);
// 파서·해석기는 supabase 를 끌고 오지 않지만, 위 stub 뒤에 함께 가져와 순서를 명확히 둔다.
const {
  MAX_ACHIEVEMENT_LINKS,
  declaredStandardCount,
  normalizeStandardCode,
  parseAchievementStandards,
  resolveAchievementLinks,
  standardCountMismatch,
} = await import('../../src/features/inquiry-design/utils/achievementStandards');

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

// ── 1. 과목명 정규화 ─────────────────────────────────────────────────────────
console.log('1. 과목명 정규화 — 끝자리 숫자만 떼고 가운데는 남긴다');
check('로마숫자 Ⅱ 제거', normalizeSubjectKey('생명과학Ⅱ') === '생명과학');
check('로마숫자 Ⅰ 제거', normalizeSubjectKey('통합수학Ⅰ') === '통합수학');
check('아라비아 숫자 제거', normalizeSubjectKey('공통국어1') === '공통국어');
check('공백 제거', normalizeSubjectKey('독서 토론과 글쓰기') === '독서토론과글쓰기');
check('로마숫자 + 공백 동시', normalizeSubjectKey('심화 영어 독해Ⅰ') === '심화영어독해');
// 가운데 숫자는 과목을 가르는 정보다 — 여기를 지우면 서로 다른 과목이 한 칸으로 합쳐진다.
check('가운데 숫자는 남는다', normalizeSubjectKey('미술1 창작') === '미술1창작');
check('끝이 아닌 숫자는 안 지운다', normalizeSubjectKey('미술 창작') !== normalizeSubjectKey('미술1'));
check('빈 문자열 안전', normalizeSubjectKey('') === '');

// ── 2. 라이브 과목명 표본 (2026-2 실측) ──────────────────────────────────────
console.log('2. 라이브 표본 — 제목과 과목명이 같은 키로 떨어지는가');
{
  // docgen_context 제목에서 접미사를 뗀 값과, 시간표/교육과정의 과목명이 만나야 한다.
  const titleKey = (title: string) => normalizeSubjectKey(title.replace(/\s*성취기준\s*$/u, ''));
  const matched: Array<[string, string]> = [
    ['생명과학 성취기준', '생명과학Ⅱ'],
    ['지구과학 성취기준', '지구과학Ⅰ'],
    ['인공지능 기초 성취기준', '인공지능 기초'],
    ['사회문제 탐구 성취기준', '사회문제 탐구'],
  ];
  for (const [title, subject] of matched) {
    check(`'${subject}' ↔ '${title}'`, titleKey(title) === normalizeSubjectKey(subject));
  }
  // 2015 개정 명칭은 **일부러** 매칭되지 않는다(라이브러리는 2022 개정 명칭).
  // 틀린 과목의 성취기준을 붙이는 것은 없는 것보다 나쁘다 — 억지 매칭을 넣지 말 것.
  const unmatched = ['영어Ⅱ', '미적분', '독서', '정치와 법', '실용 국어'];
  const indexKeys = new Set(
    ['생명과학 성취기준', '지구과학 성취기준', '인공지능 기초 성취기준', '사회문제 탐구 성취기준'].map(titleKey),
  );
  for (const subject of unmatched) {
    check(`'${subject}' 는 억지로 잇지 않는다`, !indexKeys.has(normalizeSubjectKey(subject)));
  }
}

// ── 3. 조회 실패를 삼키지 않는다 ─────────────────────────────────────────────
console.log('3. 서비스가 오류를 삼키지 않는다');
{
  const svc = read('src/features/inquiry-design/services/achievementContextService.ts');
  // 주석에는 **옛 코드가 인용돼 있다**(왜 바꿨는지 적어 두려고). 주석을 걷어내고 본다 —
  // 안 그러면 설명문 때문에 검사가 실패하거나, 반대로 설명문만 보고 통과한다.
  const svcCode = svc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('빈 Map 으로 실패를 감추지 않는다', !/if\s*\(error\)\s*return new Map\(\)/.test(svcCode));
  check('오류를 던진다', /if\s*\(error\)\s*throw/.test(svcCode));
  // 본문 조회는 종전대로 null 을 돌려준다(호출부가 명시적 오류 문구를 갖고 있다).
  check('본문 조회 실패는 호출부가 문구를 갖는다',
    /성취기준을 불러오지 못했어요/.test(svc));
}

// ── 4. 화면이 네 상태를 구분한다 ────────────────────────────────────────────
console.log('4. 화면이 로딩·실패·미등록·정상을 구분한다');
{
  const panel = read('src/features/inquiry-design/components/InquirySidePanel.tsx');
  check('로딩 문구가 있다', /성취기준 목록을 불러오는 중/.test(panel));
  check('조회 실패 문구가 있다', /성취기준 목록을 불러오지 못했어요/.test(panel));
  check('미등록 문구가 남아 있다', /이 과목은 등록된 성취기준이 없습니다/.test(panel));
  check('정상 문구가 남아 있다', /교육과정 이해를 돕는 참고로만 씁니다/.test(panel));
  check('상태 prop 을 받는다', /achievementIndexStatus/.test(panel));
  check('실패 시 다시 시도할 수 있다',
    /onRetryAchievementIndex/.test(panel) && /다시 시도/.test(panel));

  const page = read('src/features/inquiry-design/InquiryDesignPage.tsx');
  check('페이지가 isError 로 상태를 유도한다',
    /achievementIndexQuery\.isError\s*\?\s*'error'/.test(page));
  check('데이터가 오기 전에는 loading 이다', /:\s*'loading'/.test(page));
  check('패널에 상태와 재시도를 넘긴다',
    /achievementIndexStatus=\{achievementIndexStatus\}/.test(page)
    && /onRetryAchievementIndex=\{/.test(page));
}

// ── 5. 성취기준 본문 파서 ────────────────────────────────────────────────────
//
// 라이브 118건 전수 실측(2026-09-18): 비어 있지 않은 줄 2,093 = 머리글 118 +
// `[영역 NN]` 364 + 성취기준 1,611, 규칙에서 벗어난 `[...]` 줄 **0건**이고
// 머리글의 "(…, N개)" 선언값이 파싱 개수와 118건 전부 일치한다.
// 아래 표본은 그 형태를 그대로 옮긴 것이다(다중 구간 코드 `10통과1-02-06` 포함).
console.log('5. 성취기준 본문 파서');
{
  const body = [
    '고등학교 생명과학 성취기준 (2022 개정 교육과정, 4개)',
    '',
    '[영역 01]',
    '[12생명01-01] 생명 시스템의 구성 단계를 설명한다.',
    '[12생명01-02] 세포막을 통한 물질 이동을 설명한다.',
    '',
    '[영역 03]',
    '[12생명03-02] 생태계 구성 요소의 상호작용을 설명한다.',
    '[10통과1-02-06] 여러 구간으로 된 코드도 읽는다.',
  ].join('\n');
  const standards = parseAchievementStandards(body);

  check('성취기준 줄만 센다(머리글·영역 줄 제외)', standards.length === 4, `${standards.length}`);
  check('코드를 원문 표기 그대로 읽는다', standards[0].code === '12생명01-01');
  check('문장을 원문 그대로 읽는다', standards[0].text === '생명 시스템의 구성 단계를 설명한다.');
  // 영역 머리글은 아래 항목들에 **이어져** 붙는다 — 한 줄만 보고 판정하면 잃는 정보다.
  check('영역이 이어진다', standards[1].area === '영역 01');
  check('영역이 바뀐다', standards[2].area === '영역 03');
  // `[영역 01]` 은 코드처럼 생겼지만 코드가 아니다. 두 자리 숫자로 시작하는지로 가른다.
  check('영역 줄을 성취기준으로 읽지 않는다', !standards.some((s) => s.code.startsWith('영역')));
  // 실제로 존재하는 다중 구간 코드. 한 구간만 받으면 이런 줄이 통째로 사라진다.
  check('다중 구간 코드도 읽는다', standards[3].code === '10통과1-02-06');
  check('머리글 산문은 무시한다', !standards.some((s) => s.text.startsWith('고등학교')));

  // 선언 개수 ↔ 파싱 개수. 라이브 118건이 전부 일치하므로, 어긋나면 본문 형식이
  // 바뀌어 **절반만 읽히는** 상태다. 오류가 나지 않는 고장이라 이 대조가 유일한 신호다.
  check('머리글의 선언 개수를 읽는다', declaredStandardCount(body) === 4);
  check('일치하면 불일치가 없다', standardCountMismatch(body, standards) === null);
  check(
    '어긋나면 그 쌍을 돌려준다',
    standardCountMismatch(body, standards.slice(0, 2))?.parsed === 2,
  );
  check('선언이 없으면 대조하지 않는다', declaredStandardCount('성취기준 목록') === null);
  check('빈 본문은 빈 목록', parseAchievementStandards('').length === 0);
}

// ── 6. 지어낸 코드는 화면에 못 올라온다 ─────────────────────────────────────
//
// 이 기능의 유일한 새 위험은 **AI 가 없는 코드를 지어내는 것**이다. 같은 영역이
// 이미 세워 둔 원칙("틀린 성취기준은 없는 것보다 나쁘다")을 코드로 못 박는다.
console.log('6. 연결 해석 — 사전에 없는 코드는 버린다');
{
  const standards = parseAchievementStandards(
    [
      '[영역 01]',
      '[12생명01-01] 생명 시스템의 구성 단계를 설명한다.',
      '[12생명01-02] 세포막을 통한 물질 이동을 설명한다.',
      '[영역 03]',
      '[12생명03-02] 생태계 구성 요소의 상호작용을 설명한다.',
      '[12생명04-01] 물질 순환과 에너지 흐름을 설명한다.',
    ].join('\n'),
  );

  const ok = resolveAchievementLinks({ codes: ['12생명03-02'] }, standards);
  check('실재하는 코드는 통과한다', ok.links.length === 1 && ok.dropped.length === 0);
  // 화면에 뜨는 문장은 **사전에서 채운다** — AI 가 문장을 베껴 쓰다 틀릴 자리가 없다.
  check('문장을 사전에서 채운다', ok.links[0].text === '생태계 구성 요소의 상호작용을 설명한다.');
  check('영역도 함께 채운다', ok.links[0].area === '영역 03');

  const fake = resolveAchievementLinks({ codes: ['12생명99-99'] }, standards);
  check('없는 코드는 버린다', fake.links.length === 0);
  // 버렸다는 **사실이 남아야** 한다. 조용히 빈 결과로 만들면 고장이 "닿는 것이 없음"으로 위장된다.
  check('버린 것을 알린다', fake.dropped.includes('12생명99-99'));

  const mixed = resolveAchievementLinks({ codes: ['12생명01-01', '없는코드-00'] }, standards);
  check('섞여 오면 실재하는 것만 남긴다', mixed.links.length === 1 && mixed.dropped.length === 1);

  // 코드에 한글이 섞여 있어 모델이 옮겨 적다 틀릴 수 있다 — 번호가 안전한 복구 경로다.
  check('번호도 읽는다', resolveAchievementLinks({ codes: ['3'] }, standards).links[0]?.code === '12생명03-02');
  check('범위 밖 번호는 버린다', resolveAchievementLinks({ codes: ['99'] }, standards).links.length === 0);

  // 표기 흔들림 흡수: 대괄호·공백·유니코드 대시.
  check('대괄호를 흡수한다', resolveAchievementLinks({ codes: ['[12생명01-02]'] }, standards).links.length === 1);
  check('공백을 흡수한다', resolveAchievementLinks({ codes: [' 12생명01-02 '] }, standards).links.length === 1);
  check('유니코드 대시를 흡수한다', resolveAchievementLinks({ codes: ['12생명01–02'] }, standards).links.length === 1);
  check('정규화가 대괄호·공백을 지운다', normalizeStandardCode(' [12생명01-02] ') === '12생명01-02');

  // 응답 모양을 하나로 못 박지 않는다 — 모델이 흔히 쓰는 변형을 모두 받는다.
  check('배열로 와도 받는다', resolveAchievementLinks(['12생명01-01'], standards).links.length === 1);
  check(
    '{links:[{code}]} 로 와도 받는다',
    resolveAchievementLinks({ links: [{ code: '12생명01-01' }] }, standards).links.length === 1,
  );
  const none = resolveAchievementLinks({ codes: [] }, standards);
  check('빈 배열은 빈 결과(정상)', none.links.length === 0 && none.dropped.length === 0);

  check(
    '중복은 한 번만',
    resolveAchievementLinks({ codes: ['12생명01-01', '12생명01-01'] }, standards).links.length === 1,
  );
  const many = resolveAchievementLinks(
    { codes: ['12생명01-01', '12생명01-02', '12생명03-02', '12생명04-01'] },
    standards,
  );
  check(`상한 ${MAX_ACHIEVEMENT_LINKS}개를 넘지 않는다`, many.links.length === MAX_ACHIEVEMENT_LINKS);
}

// ── 7. 배선 — 오류를 내지 않는 실수들 ───────────────────────────────────────
console.log('7. 배선 정적 검사');
{
  const service = read('src/features/inquiry-design/services/achievementLinkService.ts');
  // ⚠️ solar 경로는 `max_tokens` 를 아예 보내지 않아(aiChat.ts) 추론 토큰이 예산을 다
  //    먹으면 본문이 빈 채 끝난다. JSON 을 기대하는 이 호출에서는 그게 곧 실패다.
  check('공급자를 openai 로 못 박는다', /provider:\s*'openai'/.test(service));
  check('출력 예산을 함께 넘긴다', /maxCompletionTokens/.test(service));
  // 잘린 JSON 을 전손으로 만들지 않는다(공용 복구 파서 재사용).
  check('공용 JSON 복구 파서를 쓴다', /parseAnalysisJson/.test(service));
  // "전부 버려졌다" 와 "정말 닿는 게 없다" 를 가른다 — 뭉개면 고장이 정상으로 위장된다.
  check('전부 버려지면 실패로 다룬다', /hallucinated/.test(service));
  check('본문을 못 읽으면 따로 말한다', /empty-context/.test(service));

  // 설계 단계 프롬프트·스키마는 건드리지 않는다 — 아카데미 연구대와 **공유**하는 코드다.
  const stages = read('supabase/functions/_shared/inquiryStages.ts');
  check(
    '설계 단계 프롬프트는 그대로다(코드·문장 베끼기 금지 유지)',
    /성취기준 코드와 문장을 결과에 베끼지 않는다/.test(stages),
  );
  check('설계 스키마에 연결 필드를 더하지 않았다', !/achievement_links/.test(stages));

  const card = read('src/features/inquiry-design/components/AchievementLinkCard.tsx');
  check('코드와 문장을 함께 보여준다', /link\.code/.test(card) && /link\.text/.test(card));
  // 상태를 각각 다르게 말한다(2026-09-14 에 한 문구로 뭉개져 장애가 숨은 적이 있다).
  check('연결 없음을 정상으로 말한다', /직접 닿는 성취기준을 찾지 못했어요/.test(card));
  check('실패 시 다시 시도할 수 있다', /다시 시도/.test(card));
  check('참고일 뿐임을 말한다', /탐구 범위를 제한하지 않아요/.test(card));
  // 남기기 실패가 표시를 막으면 안 된다 — 그 순간 사용자가 할 수 있는 일이 없다.
  check('남기기 실패는 표시를 막지 않는다', /표시는 정상/.test(card));

  const panel = read('src/features/inquiry-design/components/InquirySidePanel.tsx');
  check('설계 결과에 카드를 그린다', /<AchievementLinkCard/.test(panel));
  const history = read('src/features/inquiry-design/components/HistoryPanel.tsx');
  check('이력에도 카드를 그린다', /<AchievementLinkCard/.test(history));
  check('이력은 과목 정규화 키로 문서를 찾는다', /normalizeSubjectKey\(design\.target_name\)/.test(history));

  const page = read('src/features/inquiry-design/InquiryDesignPage.tsx');
  check('이력 패널에 성취기준 목차를 넘긴다', /achievementIndex=\{achievementIndexQuery\.data\}/.test(page));
  check('결과를 설계 행에 남긴다', /saveAchievementLinks/.test(page));

  const types = read('src/features/inquiry-design/types.ts');
  // 옛 설계에는 없는 필드다. 필수로 만들면 이력 전체가 타입에서 깨진다.
  check('연결 필드는 선택이다', /achievement_links\?:/.test(types));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
