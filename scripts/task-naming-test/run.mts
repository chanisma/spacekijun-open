/**
 * 업무 관리 이름표 회귀 (2026-10-05 사용자 결정)
 *
 *   · 할 일에 붙는 기능(Action) = «작업»   («실행»은 작업을 한 번 돌린 것 — 실행 이력·검수에만)
 *   · 업무를 만들고 관리하는 사람 = «책임자» («관리자»는 시스템 관리자 전용)
 *   · 미완료 상태 = «진행 중» 하나          (진행중·진행·활성·대기를 쓰지 않는다)
 *   · 업무 진행 모달 = «단계별 진행»
 *   · 캔버스 = «업무 흐름»                  (워크플로·워크플로우·Work/Task 를 화면에 쓰지 않는다)
 *
 * 실행: npx tsx scripts/task-naming-test/run.mts
 *
 * 옛 이름이 되살아나도 빌드·타입 검사는 통과한다 — 화면 문구 줄(주석 제외)을 직접 본다.
 * 범위는 업무 관리 화면이다. 구매 신청·전자서명의 «매니저»는 다른 기능의 다른 뜻이라 대상이 아니다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCOPE = ['src/components/tasks', 'src/features/task-workflow', 'src/lib/taskTabs.ts', 'src/lib/taskUtils.ts', 'src/lib/workPivot.ts', 'src/services/workPipelineService.ts', 'src/services/workRolloverService.ts', 'src/lib/candidateToWork.ts', 'src/services/candidateWorkService.ts'];
// 데모 컴포넌트(화면에 올라가지 않는다)
const SKIP = new Set(['src/components/tasks/MultiAssigneeStatusDemo.tsx']);
const COMMENT = /^\s*(\/\/|\*|\/\*|\{\/\*)/;

function files(rel: string): string[] {
  const abs = join(ROOT, rel);
  if (statSync(abs).isFile()) return [rel];
  return readdirSync(abs).flatMap((name) => files(`${rel}/${name}`)).filter((f) => /\.(tsx?|mts)$/.test(f));
}

/** 화면 문구 줄 — 주석 줄을 빼고, 줄 끝 인라인 주석(`//` — `://` 는 제외)도 떼어 낸다 */
const visibleLines = SCOPE.flatMap(files).filter((f) => !SKIP.has(f)).flatMap((f) =>
  readFileSync(join(ROOT, f), 'utf8').split('\n').map((line, i) => ({ f, n: i + 1, line })),
).filter(({ line }) => !COMMENT.test(line)).map((x) => ({ ...x, line: x.line.replace(/(?<!:)\/\/.*$/, '') }));

let pass = 0;
let fail = 0;
const check = (name: string, pattern: RegExp, allow: (l: { f: string; line: string }) => boolean = () => false) => {
  const hits = visibleLines.filter((l) => pattern.test(l.line) && !allow(l));
  if (hits.length === 0) pass++;
  else {
    fail++;
    console.log(`  ✗ ${name}`);
    for (const h of hits.slice(0, 6)) console.log(`      ${relative(ROOT, join(ROOT, h.f))}:${h.n}  ${h.line.trim().slice(0, 120)}`);
  }
};

console.log('[책임자]');
check('«매니저»를 화면에 쓰지 않는다', /매니저/);
check('«총괄 관리자»를 쓰지 않는다', /총괄 관리자/);

console.log('[작업]');
check('할 일에 붙는 기능을 «실행 도구»·«연결된 실행»이라 부르지 않는다', /실행 도구|연결된 실행|실행 [0-9$]/);
check('«태스크»를 화면에 쓰지 않는다', /태스크/);

console.log('[진행 중]');
check('«진행중»(붙여쓰기)을 쓰지 않는다', /진행중/);
check('«활성» 상태 라벨이 없다', /['">]활성['"<]/);
check('미완료를 «진행» 한 낱말로 쓰지 않는다', /\?\s*'완료'\s*:\s*'진행'|'진행'\s*:\s*'완료'|label: '진행'|: '진행',/);
check('업무·할 일 상태 «대기»가 없다', /pending: '대기'|label: '대기'|label: "대기"|\? '✓ 완료' : '대기'/);

console.log('[단계별 진행 · 업무 흐름]');
check('«진행 화면»이라 부르지 않는다', /진행 화면/);
check('«워크플로»·«워크플로우»를 화면에 쓰지 않는다', /워크플로/);
check('노드 머리에 영어 Work/Task 가 없다', /'Work' : 'Task'|Work·Task/);

console.log('[서버 문구]');
{
  const sql = readFileSync(join(ROOT, 'supabase/migrations/20261005130000_task_vocabulary_messages.sql'), 'utf8');
  const ok = sql.includes('"업무 책임자가 회차("') && sql.includes('"과제 단위가 없는 할 일입니다."') && sql.includes("raise exception '문구를 찾지 못했습니다");
  if (ok) pass++; else { fail++; console.log('  ✗ 서버 예외문 마이그레이션이 이름표를 담고, 못 찾으면 중단한다'); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
