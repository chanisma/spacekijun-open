/**
 * 두 가지 «조용히 틀리는» 표시 결함의 회귀 (2026-09-23).
 *
 *   npx tsx --tsconfig tsconfig.app.json scripts/inquiry-status-title-test/run.mts
 *
 * ── ① 삭제된 설계가 «설계가 완성됐어요» 로 남는다 ─────────────────────────
 * 완료 카드는 `academy_generation_jobs` 에서 오고 설계는 `student_inquiry_designs`
 * 에 있는데, 둘을 잇는 `draft_id` 는 **FK 없는 text 컬럼**이다(실측: 이 표의 FK 는
 * `owner_id` 하나뿐). 초안이 사라져도 의뢰 행은 남아 카드가 계속 뜨고, 눌러도
 * 열리지 않는다. 초안이 사라지는 길이 **둘 다 정상 동작**이라는 것이 핵심이다 —
 * 이력에서 삭제 / 저장으로 승격(`saveInquiryDesign` 이 초안을 지운다).
 * 실측 2026-09-23: 완료 3건 중 1건이 이미 유령(학생 00-00494).
 *
 * ── ② 실행 단계 제목의 번호가 두 번 보인다 ────────────────────────────────
 * 화면이 동그라미로 `index + 1` 을 그리는데 제목에도 `1.` 이 실려 온다. 실측
 * plan_steps 53건 중 **12건(23%)** — 프롬프트 지시로는 0% 가 되지 않고, 이미 저장된
 * 12건도 고쳐지지 않는다. 그래서 표시 단계에서 다룬다.
 *
 * 둘 다 **빌드도 타입 검사도 통과**하므로 순수·정적 검사가 유일한 방어선이다.
 */
import { readFileSync } from 'node:fs';
import { inquiryGenerationVisible } from '../../src/features/inquiry-design/services/inquiryGenerationService.ts';
import { planStepTitle } from '../../src/features/inquiry-design/utils/planSteps.ts';
import type { InquiryGenerationJob } from '../../src/features/inquiry-design/types.ts';

const read = (path: string) => readFileSync(path, 'utf8');
/** 주석에 옛 코드가 인용돼 있다 — 설명문만 보고 통과하지 않도록 걷어내고 본다. */
const code = (path: string) =>
  read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  OK  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

function job(patch: Partial<InquiryGenerationJob> = {}): InquiryGenerationJob {
  return {
    id: 'job-1',
    owner_id: 'owner',
    surface: 'inquiry-design',
    student_id: '00-00494',
    experience: false,
    stage: 'save',
    status: 'completed',
    input: {} as InquiryGenerationJob['input'],
    provider: 'solar-pro4',
    created_at: '',
    updated_at: '',
    design: null,
    graph: null,
    usage: {},
    draft_id: 'draft-1',
    attempts: 0,
    error: null,
    ...patch,
  };
}

const none = { openedDraftId: null, draftIds: new Set<string>() };
const present = { openedDraftId: null, draftIds: new Set(['draft-1']) };

// ── ① 완료 카드는 초안이 있을 때만 ──────────────────────────────────────
console.log('\n[1] 완료 카드는 초안이 실제로 있을 때만 뜬다');
{
  check('초안이 있으면 보인다', inquiryGenerationVisible(job(), present));
  check('이력에서 삭제된 초안이면 감춘다', !inquiryGenerationVisible(job(), none));
  check(
    '저장으로 승격돼 초안이 사라져도 감춘다(openedDraftId 가 null 로 풀려도)',
    !inquiryGenerationVisible(job(), { openedDraftId: null, draftIds: new Set(['other']) })
  );
  check(
    '이미 펼쳐 둔 초안에는 카드를 권하지 않는다',
    !inquiryGenerationVisible(job(), { openedDraftId: 'draft-1', draftIds: new Set(['draft-1']) })
  );
  check('draft_id 가 없는 완료 의뢰는 감춘다', !inquiryGenerationVisible(job({ draft_id: null }), present));
}

console.log('\n[2] 진행 중·실패는 초안과 무관하게 보인다');
{
  for (const status of ['queued', 'running', 'retry'] as const) {
    check(`${status} 는 초안이 없어도 보인다`, inquiryGenerationVisible(job({ status }), none));
  }
  // 실패 카드에는 [다시 시도]가 있다 — 초안 존재로 감추면 재시도 수단이 사라진다.
  check('failed 는 초안이 없어도 보인다', inquiryGenerationVisible(job({ status: 'failed' }), none));
}

// ── ② 실행 단계 제목 ────────────────────────────────────────────────────
console.log('\n[3] 실행 단계 제목의 중복 번호 (라이브 실측 문자열)');
{
  // 라이브 `student_inquiry_designs` 에서 그대로 가져온 12건 중 한 벌.
  const live = [
    '1. 개념을 조작적으로 정의하고 설문 설계하기',
    '2. 소규모 익명 설문으로 자료 수집하기',
    '3. 수학적 모델링과 데이터 분석하기',
    '4. 결과를 해석하고 보고서 작성하기',
  ];
  const stripped = live.map((title, index) => planStepTitle(title, index));
  check(
    '제 자리 번호는 모두 떨어진다',
    stripped.every((title) => !/^\d/.test(title)),
    stripped.join(' | ')
  );
  check('본문은 그대로다', stripped[0] === '개념을 조작적으로 정의하고 설문 설계하기', stripped[0]);
}

console.log('\n[4] 번호 표기 변형');
{
  check('1) 형식', planStepTitle('1) 자료 수집', 0) === '자료 수집');
  check('(1) 형식', planStepTitle('(1) 자료 수집', 0) === '자료 수집');
  check('1단계. 형식', planStepTitle('1단계. 자료 수집', 0) === '자료 수집');
  check('전각 마침표', planStepTitle('2．자료 수집', 1) === '자료 수집');
  check('하이픈 구분자', planStepTitle('3 - 자료 수집', 2) === '자료 수집');
  check('콜론 구분자', planStepTitle('4: 자료 수집', 3) === '자료 수집');
  check('앞뒤 공백은 정리한다', planStepTitle('  1.  자료 수집  ', 0) === '자료 수집');
}

console.log('\n[5] 손대지 말아야 할 것 (오탐 방지)');
{
  // 자리와 다른 번호는 «모델이 순서를 잘못 붙였다»는 신호다 — 지우면 그 사실이 감춰진다.
  check('번호가 제 자리와 다르면 그대로', planStepTitle('5. 자료 수집', 0) === '5. 자료 수집');
  // 이 안전장치가 막는 실제 사고: 연도·수치로 시작하는 제목.
  check('연도로 시작하는 제목', planStepTitle('2026. 1학기 자료 수집', 0) === '2026. 1학기 자료 수집');
  // 구분자를 요구하는 이유.
  check('구분자 없는 숫자는 번호가 아니다', planStepTitle('3 학년 대상 설문', 2) === '3 학년 대상 설문');
  check('번호가 없으면 그대로', planStepTitle('자료 수집', 0) === '자료 수집');
  check('번호만 있는 제목은 비우지 않는다', planStepTitle('1.', 0) === '1.');
  check('빈 값·잘못된 타입', planStepTitle(null, 0) === '' && planStepTitle(undefined, 0) === '');
}

// ── 배선 ────────────────────────────────────────────────────────────────
console.log('\n[6] 배선 — 세 화면이 같은 규칙을 쓴다');
{
  const side = code('src/features/inquiry-design/components/InquirySidePanel.tsx');
  const history = code('src/features/inquiry-design/components/HistoryPanel.tsx');
  const observatory = code('src/features/academy/game/GameObservatory.tsx');

  check('탐구 설계 탭', side.includes('planStepTitle(step.title, index)'));
  check('분석 이력 탭', history.includes('planStepTitle(step.title, index)'));
  check('아카데미 관측소(<ol> 자동 번호)', observatory.includes('planStepTitle(s.title, i)'));

  // key 를 번호 뗀 값으로 바꾸면 «1. 자료 수집»·«2. 자료 수집» 이 같은 key 가 된다.
  check('React key 는 원문을 쓴다', side.includes('key={step.title}') && history.includes('key={step.title}'));

  const status = code('src/features/inquiry-design/components/InquiryGenerationStatus.tsx');
  check('완료 카드 판정은 공용 함수', status.includes('inquiryGenerationVisible(job, { openedDraftId, draftIds })'));
  check(
    '컴포넌트가 옛 인라인 조건을 되살리지 않았다',
    !status.includes("job.status === 'completed' && job.draft_id && job.draft_id !== openedDraftId")
  );

  const page = code('src/features/inquiry-design/InquiryDesignPage.tsx');
  check('페이지가 존재하는 설계 id 를 넘긴다', page.includes('draftIds={savedDesignIds}'));
  // 종전엔 열기 실패를 무조건 «잠시 후 다시 눌러 주세요» 로 안내해, 삭제된 설계를
  // 누른 사용자가 성공할 수 없는 행동을 반복하게 됐다.
  // 「잠시 후 다시 눌러 주세요」 자체는 [다시 시도] 실패 안내로 여전히 옳다.
  // 문제였던 것은 **열기 실패**를 그 한 가지 원인으로 단정한 것이므로, 그 핸들러만 본다.
  const openHandler = page.slice(
    page.indexOf('const openCompletedGeneration'),
    page.indexOf('const persistAnalysisAchievementLinks')
  );
  check('열기 핸들러를 잘라 냈다', openHandler.length > 200 && openHandler.length < 1200, `len=${openHandler.length}`);
  check('열기 실패가 «없어졌다»를 말할 수 있다', openHandler.includes('이 설계는 더 이상 없습니다'));
  check('열기 실패를 «기다리면 된다»로 단정하지 않는다', !openHandler.includes('잠시 후 다시 눌러 주세요'));
  // 클로저의 낡은 workspace 대신 refetch 결과로 판정해야 방금 삭제된 것도 옳게 읽는다.
  check('다시 읽은 결과로 판정한다', openHandler.includes('await workspaceQuery.refetch()'));
}

console.log(failures === 0 ? '\n전체 통과\n' : `\n실패 ${failures}건\n`);
process.exit(failures === 0 ? 0 : 1);
