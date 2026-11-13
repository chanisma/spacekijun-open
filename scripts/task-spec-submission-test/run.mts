// 업무 제출 — 스펙 기반 값 제출 회귀 (2026-09-03).
//
// 여기서 고정하는 것은 **화면에 안 보이는 판정**이다: 방식 기본값·배타 규칙·CSV 모양.
// 깨져도 오류가 나지 않고 "제출이 안 된다/이상한 게 섞인다"로만 나타난다.
//
// DB 계층(RPC·RLS·뷰)은 SQL 롤백 트랜잭션으로 따로 검증했다(6항목 통과):
//   ①담당자 제출→문서 final·담당자 completed ②재제출은 같은 행의 참조만 이동
//   ③무관한 교사 0행 ④매니저 1행+뷰 1행 ⑤비담당자 42501 ⑥값 제출 업무에 파일 0A000
//
// 실행: npx tsx --tsconfig tsconfig.app.json scripts/task-spec-submission-test/run.mts
import { check, finish } from '../task-work-spec-test/lib.mts';

// supabase 클라이언트가 모듈 로드 시 localStorage 를 만진다(Node 에는 없다)
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

const {
  getSubmissionConfig, isSpecSubmission, isFileSubmission, isSubmissionRequired,
  submissionModeLabel, buildSubmissionMetaPatch, validateSubmissionConfig,
} = await import('../../src/lib/taskSubmissionConfig');
const { specSubmissionsToCsv } = await import('../../src/lib/taskSubmissionCsv');

type T = Parameters<typeof getSubmissionConfig>[0];
const task = (submission: unknown): T => ({ meta: { submission } } as unknown as T);

// ── 1) 기본값 = 파일 (2026-09-03 이전 데이터 호환) ────────────────────────
{
  // **이것이 깨지면 기존 업무가 전부 값 제출로 오인된다** — 담당자가 파일을 못 올린다
  check('mode 없음 = file', getSubmissionConfig(task({ required: true })).mode === 'file');
  check('submission 없음 = file', getSubmissionConfig({ meta: {} } as T).mode === 'file');
  check('task 자체가 없어도 안전', getSubmissionConfig(null).mode === 'file');
  check('required 기본 false', getSubmissionConfig(null).required === false);

  check('spec 판정', isSpecSubmission(task({ required: true, mode: 'spec' })));
  check('required 없으면 spec 아님', !isSpecSubmission(task({ mode: 'spec' })));
  check('file 판정', isFileSubmission(task({ required: true })));
  check('방식 무관 required 판정', isSubmissionRequired(task({ required: true, mode: 'spec' })));
}

// ── 2) 양식 참조 정규화 ──────────────────────────────────────────────────
{
  const c = getSubmissionConfig(task({
    required: true, mode: 'spec', actionId: 'w1',
    template: { id: 't1', name: '평가계획서', familyId: 'f1' },
  }));
  check('actionId 읽힘', c.actionId === 'w1');
  check('template 읽힘', c.template?.id === 't1' && c.template?.familyId === 'f1');
  // id 가 빈 문자열이면 참조가 없는 것으로 본다 — 잠금 탐색이 빈 id 로 헛돌지 않게
  check('빈 template id 는 null',
    getSubmissionConfig(task({ required: true, mode: 'spec', template: { id: '' } })).template === null);
  check('빈 actionId 는 null',
    getSubmissionConfig(task({ required: true, mode: 'spec', actionId: '' })).actionId === null);
}

// ── 3) 저장 패치 — 끌 때도 키를 남긴다 ───────────────────────────────────
{
  // meta 는 얕은 병합이라 키를 빼도 사라지지 않는다 — required:false 로 남겨야 꺼진다
  const off = buildSubmissionMetaPatch({ required: false, mode: 'spec' });
  check('끄면 required:false 가 남는다', off?.required === false);
  check('끈 패치에도 mode 가 있다', off?.mode === 'spec');

  const file = buildSubmissionMetaPatch({ required: true, mode: 'file', actionId: 'w', template: { id: 't' } });
  // 파일 모드에 spec 전용 키가 새면 나중에 mode 만 바꿔도 낡은 양식이 살아난다
  check('file 모드는 actionId/template 을 넣지 않는다',
    file?.actionId === undefined && file?.template === undefined);

  const spec = buildSubmissionMetaPatch({
    required: true, mode: 'spec', actionId: 'w1', template: { id: 't1', name: 'n' },
  });
  check('spec 모드는 actionId·template 을 담는다', spec?.actionId === 'w1' && spec?.template?.id === 't1');
  check('familyId 는 없으면 null', spec?.template?.familyId === null);
  check('빈 guide 는 undefined', buildSubmissionMetaPatch({ required: true, guide: '   ' })?.guide === undefined);
}

// ── 4) 검증 — 저장 전에 잡아야 할 조합 ──────────────────────────────────
{
  const base = { required: true, mode: 'file' as const, templateId: null, deadlineCount: 0 };
  check('끈 상태면 검증 없음',
    validateSubmissionConfig({ ...base, required: false, deadlineCount: 5 }).length === 0);

  // 다중 마감 배타 — 회차별 완료가 따로 있어 "제출=완료"로 표현되지 않는다
  check('다중 마감이면 거부', validateSubmissionConfig({ ...base, deadlineCount: 2 }).length === 1);
  check('마감 1개는 통과', validateSubmissionConfig({ ...base, deadlineCount: 1 }).length === 0);

  check('spec 인데 양식 없으면 거부',
    validateSubmissionConfig({ ...base, mode: 'spec' }).some((e) => e.includes('양식')));
  check('spec + 양식 있으면 통과',
    validateSubmissionConfig({ ...base, mode: 'spec', templateId: 't' }).length === 0);

  // 이미 제출물이 있으면 방식 전환 금지 — 이종 행이 섞이면 현황·분석이 무너진다
  check('파일 제출물이 있는데 spec 으로 전환 거부',
    validateSubmissionConfig({ ...base, mode: 'spec', templateId: 't', existingKinds: ['file'] })
      .some((e) => e.includes('방식을 바꿀 수 없습니다')));
  check('같은 방식이면 통과',
    validateSubmissionConfig({ ...base, mode: 'file', existingKinds: ['file'] }).length === 0);
  check('제출물이 있으면 양식 변경 거부',
    validateSubmissionConfig({ ...base, mode: 'spec', templateId: 't2', existingKinds: ['spec'], templateChanged: true })
      .some((e) => e.includes('양식을 바꿀 수 없습니다')));
  check('제출물이 없으면 양식 변경 허용',
    validateSubmissionConfig({ ...base, mode: 'spec', templateId: 't2', templateChanged: true }).length === 0);
}

// ── 5) 라벨 — 칩·버튼·안내가 같은 낱말을 써야 한다 ───────────────────────
{
  check('spec 라벨', submissionModeLabel('spec') === '양식 문서 제출'); // 2026-10-06 새 제출 받기와 같은 이름(«문서 작성»은 HWPX 분류 이름과 겹쳤다)
  check('file 라벨', submissionModeLabel('file') === '파일 제출');
}

// ── 6) CSV ───────────────────────────────────────────────────────────────
{
  const rows = [{
    submission_id: 's1', task_id: 't', assignee_resource_id: 'a1', assignee_name: '김교사',
    unit_key: null, submitted_at: '2026-09-03T01:00:00Z', resubmitted_at: null,
    document_id: 'd1', title: '문서', version: 1, template_version_id: 'tv1',
    plan: { rows: [{ a: 1 }, { a: 2 }] },
    field_values: { purpose: '목표, 쉼표 포함', note: '따옴표"있음' },
    row_values: {},
  }];
  const csv = specSubmissionsToCsv(rows as never, [
    { key: 'purpose', label: '목적' }, { key: 'note', label: '비고' }, { key: 'rows', label: '항목' },
  ]);
  // 엑셀이 한글을 cp949 로 오해하지 않도록 BOM 이 반드시 앞에 있어야 한다
  check('BOM 으로 시작', csv.charCodeAt(0) === 0xFEFF, String(csv.charCodeAt(0)));
  check('쉼표 포함 값은 따옴표로 감싼다', csv.includes('"목표, 쉼표 포함"'), csv);
  check('따옴표는 두 번으로 이스케이프', csv.includes('""있음"'), csv);
  // 반복 행을 셀 하나에 다 넣으면 표가 읽히지 않는다 — 개수만
  check('반복 행의 실제 값을 내보냄', csv.includes('항목 · 1 · a,항목 · 2 · a') && csv.includes(',1,2'), csv);
  // BOM 을 떼고 비교한다 — 헤더 자체는 BOM 다음부터다
  const header = csv.replace(/^﻿/, '').split('\n')[0];
  check('담당자·시각 열이 앞에 온다', header.startsWith('담당자,단위,제출 시각,'), header);
  check('필드 열이 지정 순서대로', header.trimEnd().endsWith('목적,비고,항목 · 1 · a,항목 · 2 · a'), header);
}

finish('task-spec-submission');
