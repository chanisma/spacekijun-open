/**
 * 코치 대화 요약 → 추가 컨텍스트 병합 회귀 테스트.
 *
 *   npx tsx scripts/inquiry-conversation-test/run.mts
 *
 * 지키려는 불변식(전부 "틀려도 화면에 오류가 안 나는" 종류다):
 *   ① 결과 길이는 절대 예산을 넘지 않는다
 *   ② 학생이 직접 타이핑한 요구사항은 어떤 경우에도 살아남는다
 *   ③ 예산이 모자라면 **오래된** 발언부터 버린다(최근 턴이 남는다)
 *   ④ 버린 게 있으면 그 사실이 텍스트와 droppedCount 양쪽에 드러난다
 *
 * ── 2026-09-18 추가: 코치가 «학생이 고른 노드»를 본다 ──────────────────────
 * 탐구 설계의 대화는 `안녕하세요. "<과목>" 활동을 위한 새 탐구를 설계하려고 합니다.`
 * 한 줄로 시작했고, 엣지 함수는 `messages`·`target`만 받았다. 즉 학생이 지식
 * 지도에서 별을 몇 개를 골라도 **코치에게 전달되는 자리가 없었다** — 학생에게는
 * "AI가 내가 고른 걸 전혀 모른다"로 나타났다. 같은 서비스를 쓰는 아카데미
 * 연구대는 opener 본문에 스냅샷을 실어 보내 이 문제가 없었다.
 *
 * 이 결함은 **오류를 내지 않는다**(코치는 그럴듯한 일반 질문을 계속 한다).
 * 그래서 아래 ⑤~⑦은 요약 로직뿐 아니라 **배선 자체**를 정적으로 못 박는다.
 */
import { readFileSync } from 'node:fs';
import {
  buildConversationContext,
  labelTurns,
  type ConversationTurn,
} from '../../src/features/inquiry-design/utils/conversationSummary.ts';
import {
  buildConversationPrimer,
  CONVERSATION_PRIMER_BUDGET,
} from '../../src/features/inquiry-design/utils/conversationPrimer.ts';
import type { InquirySelectedSource } from '../../src/features/inquiry-design/types.ts';

const BUDGET = 6000;
const read = (path: string) => readFileSync(path, 'utf8');
/** 주석에는 옛 코드가 인용돼 있다 — 설명문만 보고 통과하지 않도록 걷어내고 본다. */
const code = (path: string) =>
  read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${name}`);
  } else {
    failures += 1;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** 코치/학생이 번갈아 말하는 대화 n턴. 발언 길이는 chars로 고정. */
function makeTurns(turnCount: number, chars: number): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (let i = 0; i < turnCount; i += 1) {
    turns.push({ role: 'assistant', content: `질문${i + 1}`.padEnd(chars, '가') });
    turns.push({ role: 'user', content: `대답${i + 1}`.padEnd(chars, '나') });
  }
  return turns;
}

console.log('\n[1] 10턴 정상 — 예산 안에 전부 들어간다');
{
  // 실측 근거: 코치 답변은 max_tokens 220으로 묶여 있고 "1~2문장" 지시가 붙어
  // 있어 한 발언이 125자를 크게 넘기 어렵다. 10턴이면 20발언 × 125자 = 2,500자.
  const turns = makeTurns(10, 125);
  const result = buildConversationContext(turns, '', BUDGET);
  check('생략 없음', result.droppedCount === 0, `dropped=${result.droppedCount}`);
  check('예산 이내', result.text.length <= BUDGET, `len=${result.text.length}`);
  check('첫 발언 보존', result.text.includes('코치1:'));
  check('마지막 발언 보존', result.text.includes('학생10:'));
}

console.log('\n[2] 수기 입력 동반 — 사람이 쓴 글이 살아남는다');
{
  const turns = makeTurns(10, 125);
  const manual = '실험 위주로 구성하고 데이터 시각화 단계를 명확히 해주세요.';
  const result = buildConversationContext(turns, manual, BUDGET);
  check('수기 입력 보존', result.text.includes(manual));
  check('요약도 함께 보존', result.text.includes('코치1:'));
  check('예산 이내', result.text.length <= BUDGET, `len=${result.text.length}`);
}

console.log('\n[3] 예산 초과 — 오래된 발언부터 버린다 (구 구현은 반대였다)');
{
  const turns = makeTurns(20, 400); // 40발언 × 400자 = 16,000자
  const result = buildConversationContext(turns, '', BUDGET);
  check('생략 발생', result.droppedCount > 0, `dropped=${result.droppedCount}`);
  check('예산 이내', result.text.length <= BUDGET, `len=${result.text.length}`);
  check('가장 최근 발언 보존', result.text.includes('학생20:'));
  check('가장 오래된 발언 제거', !result.text.includes('코치1:'));
  check('생략 사실 표기', result.text.includes('생략'));
}

console.log('\n[4] 예산 초과 + 수기 입력 — 수기 입력이 최우선으로 지켜진다');
{
  const turns = makeTurns(20, 400);
  const manual = '반드시 지켜야 하는 요구사항입니다.';
  const result = buildConversationContext(turns, manual, BUDGET);
  check('수기 입력 보존', result.text.includes(manual));
  check('예산 이내', result.text.length <= BUDGET, `len=${result.text.length}`);
  check('최근 발언 보존', result.text.includes('학생20:'));
}

console.log('\n[5] 극단 — 학생이 예산에 육박하는 장문을 붙여넣음');
{
  const manual = '요'.repeat(BUDGET - 100);
  const turns = makeTurns(5, 200);
  const result = buildConversationContext(turns, manual, BUDGET);
  check('예산 이내', result.text.length <= BUDGET, `len=${result.text.length}`);
  check('수기 입력이 우선 확보됨', result.text.includes('요'.repeat(1000)));
}

console.log('\n[6] 극단 — 발언 하나가 예산보다 큼');
{
  const turns: ConversationTurn[] = [
    { role: 'assistant', content: '짧은 질문' },
    { role: 'user', content: '가'.repeat(BUDGET * 2) },
  ];
  const result = buildConversationContext(turns, '', BUDGET);
  check('예산 이내', result.text.length <= BUDGET, `len=${result.text.length}`);
  check('요약이 통째로 비지 않음', result.text.length > 50, `len=${result.text.length}`);
}

console.log('\n[7] 빈 대화 / 라벨링');
{
  const result = buildConversationContext([], '', BUDGET);
  check('빈 대화도 예산 이내', result.text.length <= BUDGET);
  const labels = labelTurns([
    { role: 'assistant', content: 'A' },
    { role: 'user', content: 'B' },
    { role: 'assistant', content: 'C' },
  ]);
  check('코치/학생 번호가 각각 증가', labels.join('|') === '코치1: A|학생1: B|코치2: C', labels.join('|'));
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ 선택 맥락 블록 — 코치가 읽을 수 있는 형태로 실리는가
// ─────────────────────────────────────────────────────────────────────────────
function entitySource(
  label: string,
  type: string,
  properties: Record<string, unknown>,
  relationHint: string | null = null,
): InquirySelectedSource {
  return {
    source_kind: 'kg_entity',
    kg_version_id: 'v1',
    source_entity_id: `e:${label}`,
    relation_hint: relationHint,
    snapshot: { entity_id: `e:${label}`, label, type, properties, relation_hint: relationHint },
  };
}

console.log('\n[8] 선택 맥락 — 고른 노드가 이름·출처·원문까지 실린다');
{
  const sources = [
    entitySource('단백질 접힘', 'Concept', {
      // 신 KG 는 properties 가 한 겹 더 감싸여 있다. 정규화 창구를 거치지 않으면
      // 여기서 조용히 빈 객체가 실린다 — 정확히 이 형태로 한 번 새어 나갔다.
      properties: { grade: 2, subject: '생명과학Ⅰ', did: '아밀로이드 응집 기전을 조사해 발표함' },
    }),
    entitySource('효소 반응 속도 실험', 'Activity', {
      sources: [{ grade: 2, semester: 1, subject: '생명과학Ⅰ' }],
      evidence: ['온도별 카탈레이스 활성을 측정함'],
    }, 'DEEPENED_FROM'),
  ];
  const primer = buildConversationPrimer({ selectedSources: sources });
  check('두 개 모두 실림', primer.includedCount === 2, `included=${primer.includedCount}`);
  check('생략 없음', primer.droppedCount === 0);
  check('노드 이름 포함', primer.text.includes('단백질 접힘') && primer.text.includes('효소 반응 속도 실험'));
  check('감싸인 properties 의 원문 근거도 풀려 나옴', primer.text.includes('아밀로이드 응집 기전'));
  check('출처(학년·과목) 포함', primer.text.includes('생명과학'));
  check('관계 힌트 포함', primer.text.includes('DEEPENED_FROM'));
  check('«학생의 실제 기록»이라는 설명이 붙는다', primer.text.includes('실제 기록'));
  check('지어내기 금지 지시 포함', primer.text.includes('지어내지'));
}

console.log('\n[9] 생기부 기록 선택 + 탐구 방향 수기 입력');
{
  const activity: InquirySelectedSource = {
    source_kind: 'activity_record',
    activity_id: 'a1',
    snapshot: { category: 'autonomous', subject_name: '', grade: 1, semester: 2, content: '학급 자율 탐구로 미세먼지 농도를 측정함' },
  };
  const primer = buildConversationPrimer({
    selectedSources: [activity],
    userRequirements: '실험 위주로 구성하고 데이터 시각화 단계를 명확히 해주세요.',
  });
  check('기록 원문 포함', primer.text.includes('미세먼지 농도를 측정'));
  check('수기 방향도 함께 전달', primer.text.includes('데이터 시각화'));
  check('수기 방향이 학생 본인의 말로 표시됨', primer.text.includes('학생 본인의 말'));
}

console.log('\n[10] 아무것도 안 골랐으면 아무것도 붙이지 않는다');
{
  // 빈 블록을 붙이면 코치가 «선택한_기록» 이라는 빈 태그를 보고 있다고 착각한다.
  const primer = buildConversationPrimer({ selectedSources: [], userRequirements: '   ' });
  check('빈 문자열', primer.text === '', JSON.stringify(primer.text));
  check('개수 0', primer.includedCount === 0 && primer.droppedCount === 0);
  const none = buildConversationPrimer({});
  check('인자 없어도 안전', none.text === '' && none.includedCount === 0);
}

console.log('\n[11] 예산 — 넘으면 뒤에서 버리고 그 사실을 말한다');
{
  const many = Array.from({ length: 60 }, (_, i) =>
    entitySource(`노드${i}`, 'Concept', { evidence: ['가'.repeat(400)] }));
  const primer = buildConversationPrimer({ selectedSources: many });
  check('예산 이내', primer.text.length <= CONVERSATION_PRIMER_BUDGET, `len=${primer.text.length}`);
  check('일부는 실림', primer.includedCount > 0, `included=${primer.includedCount}`);
  check('버린 게 있음', primer.droppedCount > 0, `dropped=${primer.droppedCount}`);
  check('버린 사실이 텍스트에 드러남', primer.text.includes(`${primer.droppedCount}개는 생략`));
  check('앞에서부터 실린다', primer.text.includes('노드0'));
  const each = primer.includedCount + primer.droppedCount;
  check('합계가 선택 수와 같다', each === many.length, `${each} vs ${many.length}`);
}

console.log('\n[12] 라벨 없는 노드는 버린다');
{
  // 이름이 없으면 코치가 가리킬 수 없다 — 빈 칸을 보내 "고른 게 있다"고 말하는 것이
  // 아예 안 보내는 것보다 나쁘다.
  const primer = buildConversationPrimer({
    selectedSources: [entitySource('', 'Concept', {}), entitySource('광합성', 'Concept', {})],
  });
  check('라벨 있는 것만 실림', primer.includedCount === 1, `included=${primer.includedCount}`);
  check('남은 것은 광합성', primer.text.includes('광합성'));
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ 배선 — 이 결함은 오류를 내지 않으므로 정적 검사가 유일한 방어선이다
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[13] 배선 — 화면이 선택 노드를 서비스로 넘기는가');
{
  const page = code('src/features/inquiry-design/InquiryDesignPage.tsx');
  const calls = page.split('requestInquiryConversation({').slice(1);
  check('대화 호출이 2곳(시작·이어가기)', calls.length === 2, `calls=${calls.length}`);
  for (const [i, call] of calls.entries()) {
    const args = call.slice(0, call.indexOf('});'));
    check(`호출 ${i + 1} — selectedSources 전달`, /\bselectedSources\b/.test(args));
    check(`호출 ${i + 1} — userRequirements 전달`, /\buserRequirements\b/.test(args));
  }
  // opener 본문에 스냅샷을 박으면 학생 첫 말풍선이 원시 JSON 이 된다
  // (InquiryConversationBox 는 messages 를 전부 렌더한다 — 아카데미는 slice(1)).
  const opener = page.slice(page.indexOf('const opener:'), page.indexOf('const opener:') + 400);
  check('opener 본문에는 JSON 을 박지 않는다', !opener.includes('JSON.stringify'));
}

console.log('\n[14] 배선 — 서비스가 첫 메시지 사본에만 덧붙이는가');
{
  const service = code('src/features/inquiry-design/services/inquiryDesignService.ts');
  check('primer 를 만든다', service.includes('buildConversationPrimer('));
  check('첫 메시지에만 붙인다', /index === 0 \?/.test(service));
  check('primer.text 를 첫 메시지 사본에 싣는다', service.includes('${primer.text}'));
  check('선택 개수를 서버로 보낸다', service.includes('selectedSourceCount: primer.includedCount'));
}

console.log('\n[15] 배선 — 엣지 함수가 선택을 알고 갈라지는가 (배포 필요)');
{
  const proxy = code('supabase/functions/openai-proxy/index.ts');
  const conversation = proxy.slice(proxy.indexOf("case 'inquiryDesignConversation'"));
  check('selectedSourceCount 를 읽는다', conversation.includes('params.selectedSourceCount'));
  // 사용자 메시지에 "고른 것을 짚어 달라"고 적어도 시스템 프롬프트의
  // "관심 주제부터 물어라"가 그것을 이긴다 — 1턴 지시가 갈라져야 한다.
  check('1턴 지시가 선택 유무로 갈린다', /selectedSourceCount > 0[\s\S]{0,400}첫 턴이다/.test(conversation));

  const stages = code('supabase/functions/_shared/inquiryStages.ts');
  // design 분기는 `if (stage === 'design') return [common,` 로 **한 줄에** 시작하므로
  // 'return [common,' 를 끝 표지로 쓰면 빈 문자열이 된다. graph 분기의 첫 지시문을 경계로 쓴다.
  const design = stages.slice(
    stages.indexOf("if (stage === 'design')"),
    stages.indexOf('이미 완성된 설계 내용은'),
  );
  check('design 분기를 실제로 잘라 냈다', design.length > 200, `len=${design.length}`);
  // 설계 단계는 selectedSources 를 **원래도 받고 있었지만** 그게 무엇인지 말한 적이
  // 없어 모델이 목적 없는 부속 데이터로 취급했다. 이름을 붙이는 지시가 있어야 한다.
  check('설계 단계가 selectedSources 를 지시문에서 호명한다', design.includes('selectedSources 는'));
  check('설계 단계가 학생 실제 경험임을 말한다', design.includes('실제 경험'));
}

console.log(
  failures === 0
    ? '\n✅ 전체 통과\n'
    : `\n❌ 실패 ${failures}건\n`
);
process.exit(failures === 0 ? 0 : 1);
