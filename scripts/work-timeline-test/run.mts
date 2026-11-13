// 업무 타임라인 회귀 — npx tsx scripts/work-timeline-test/run.mts
//
// 이 부류는 오류를 내지 않는다: 끝낸 회차가 남은 일처럼 보이거나, 유도 구간이 명시 구간처럼
// 그려지거나, 휠이 페이지 스크롤을 삼켜도 화면은 멀쩡히 그려진다. 그래서 판정을 못 박는다.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTimelineTaskRows,
  getRoundProgress,
  getTaskProgress,
  sumProgress,
  type TimelineTaskLike,
} from '../../src/lib/workTimeline';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}`, detail ?? '');
  }
}
const ymd = (d: Date | null | undefined) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;

const A = { id: 'a', status: 'pending' };
const B = { id: 'b', status: 'pending' };
const task = (over: Partial<TimelineTaskLike> & { id: string }): TimelineTaskLike => ({
  title: over.id,
  type: 'one_time',
  status: 'pending',
  order_index: 0,
  created_at: '2026-03-01T00:00:00Z',
  meta: { assignees: [A] },
  ...over,
});

// ── 1. 정렬: 절차형(단계 순) → 일회성(마감 순, 날짜 없는 것 맨 뒤) ──
{
  const rows = buildTimelineTaskRows([
    task({ id: 'one-late', due_date: '2026-05-20' }),
    task({ id: 'one-undated' }),
    task({ id: 'p2', type: 'procedural', order_index: 2, due_date: '2026-04-10' }),
    task({ id: 'one-early', due_date: '2026-03-15' }),
    task({ id: 'p1', type: 'procedural', order_index: 1, due_date: '2026-04-01' }),
  ], '2026-03-02T09:00:00Z');
  check('정렬 순서', rows.map((r) => r.id).join() === 'p1,p2,one-early,one-late,one-undated', rows.map((r) => r.id));
  check('절차형 단계 번호', rows[0].step === 1 && rows[1].step === 2);
  check('일회성은 단계 번호 없음', rows[2].step === null);
  check('날짜 없는 할 일 표시', rows[4].undated && rows[4].markers.length === 0);
}

// ── 2. 기간 유도 ──
{
  const rows = buildTimelineTaskRows([
    task({ id: 'p1', type: 'procedural', order_index: 1, due_date: '2026-04-01' }),
    task({ id: 'p2', type: 'procedural', order_index: 2 }), // 날짜 없음
    task({ id: 'p3', type: 'procedural', order_index: 3, due_date: '2026-04-20' }),
    task({ id: 'one', due_date: '2026-04-05' }),
  ], '2026-03-02T09:00:00Z');
  const [p1, p2, p3, one] = rows;
  check('첫 단계 시작 = 업무 생성일', ymd(p1.span?.start) === '2026-03-02' && ymd(p1.span?.end) === '2026-04-01');
  check('유도 구간은 derived', p1.span?.derived === true);
  check('날짜 없는 단계는 구간 없음', p2.span === null && p2.undated);
  check('날짜 없는 단계가 사슬을 끊지 않는다', ymd(p3.span?.start) === '2026-04-01', ymd(p3.span?.start));
  check('일회성은 유도하지 않는다', one.span === null && one.markers.length === 1);
}
{
  // 앞 단계 마감이 더 늦으면(순서와 날짜가 어긋남) 거꾸로 된 막대를 만들지 않는다
  const rows = buildTimelineTaskRows([
    task({ id: 'p1', type: 'procedural', order_index: 1, due_date: '2026-05-01' }),
    task({ id: 'p2', type: 'procedural', order_index: 2, due_date: '2026-04-01' }),
  ], '2026-03-02');
  check('역전된 날짜는 구간을 만들지 않는다', rows[1].span === null);
  // 업무 생성일을 모르면 첫 단계는 점
  const noCreated = buildTimelineTaskRows([
    task({ id: 'p1', type: 'procedural', order_index: 1, due_date: '2026-05-01' }),
  ]);
  check('생성일 없으면 첫 단계는 구간 없음', noCreated[0].span === null);
}
{
  // 명시 시작일(컬럼이 생긴 뒤)이 유도를 이긴다 — 일회성에도 적용
  const rows = buildTimelineTaskRows([
    task({ id: 'p1', type: 'procedural', order_index: 1, due_date: '2026-04-10', start_date: '2026-04-03' }),
    task({ id: 'one', due_date: '2026-04-10', start_date: '2026-04-08' }),
    task({ id: 'bad', due_date: '2026-04-10', start_date: '2026-04-20' }),
  ], '2026-03-02');
  check('명시 시작일 우선', ymd(rows[0].span?.start) === '2026-04-03' && rows[0].span?.derived === false);
  check('일회성도 명시 시작일이면 구간', rows.find((r) => r.id === 'one')?.span?.derived === false);
  check('시작 > 마감이면 무시', rows.find((r) => r.id === 'bad')?.span === null);
}

// ── 3. 회차별 진행률 ──
{
  const multi = task({
    id: 'm',
    due_date: '2026-06-01',
    meta: {
      assignees: [A, B],
      deadlines: ['2026-04-01', '2026-05-01', '2026-06-01'],
      deadlineProgress: {
        '2026-04-01': { a: { status: 'completed' }, b: { status: 'completed' } },
        '2026-05-01': { a: { status: 'completed' } },
      },
    },
  });
  check('전원 끝낸 회차 = 100', getRoundProgress(multi, '2026-04-01').percentage === 100);
  check('일부만 끝낸 회차 = 50', getRoundProgress(multi, '2026-05-01').percentage === 50);
  check('아무도 안 한 회차 = 0', getRoundProgress(multi, '2026-06-01').percentage === 0);
  check('할 일 단위 진행률은 그대로 0', getTaskProgress(multi).percentage === 0);

  const [row] = buildTimelineTaskRows([multi]);
  check('회차 마커 3개', row.markers.length === 3);
  check('끝난 회차만 done', row.markers.map((m) => m.done).join() === 'true,false,false', row.markers.map((m) => m.done));

  // 취소된 담당자는 분모에서 빠진다
  const withCancelled = task({
    id: 'c',
    meta: {
      assignees: [A, { id: 'x', status: 'cancelled' }],
      deadlines: ['2026-04-01', '2026-05-01'],
      deadlineProgress: { '2026-04-01': { a: { status: 'completed' } } },
    },
  });
  check('취소 담당자 제외', getRoundProgress(withCancelled, '2026-04-01').percentage === 100);

  // 매니저가 task 를 완료로 닫으면 회차 기록과 무관하게 끝난 것이다
  const closed = { ...multi, status: 'completed' };
  check('task 완료가 회차 기록을 이긴다', getRoundProgress(closed, '2026-06-01').percentage === 100);
  check('task 완료 → 행 상태 completed', buildTimelineTaskRows([closed])[0].status === 'completed');
}
{
  const single = task({ id: 's', due_date: '2026-04-01', meta: { assignees: [{ id: 'a', status: 'completed' }, B] } });
  check('단일 마감은 담당자 기준', getRoundProgress(single, '2026-04-01').percentage === 50);
  const noAssignee = task({ id: 'n', status: 'completed', meta: {} });
  check('담당자 없으면 task.status', getTaskProgress(noAssignee).percentage === 100);
  check('합산', sumProgress([getTaskProgress(single), getTaskProgress(noAssignee)]).percentage === 67);
  check('빈 합산 = 0', sumProgress([]).percentage === 0);
  check('취소 → 행 상태', buildTimelineTaskRows([task({ id: 'x', status: 'cancelled' })])[0].status === 'cancelled');
}

// ── 4. 정적 검사 ──
{
  const gantt = readFileSync(join(ROOT, 'src/components/tasks/WorkGanttChart.tsx'), 'utf8');
  const tab = readFileSync(join(ROOT, 'src/components/tasks/WorkTimelineTab.tsx'), 'utf8');
  const filters = readFileSync(join(ROOT, 'src/components/tasks/WorkTimelineFilters.tsx'), 'utf8');
  const wheel = readFileSync(join(ROOT, 'src/hooks/useWheelScrollX.ts'), 'utf8');

  check('휠은 passive:false 로 직접 단다', /addEventListener\('wheel', onWheel, \{ passive: false \}\)/.test(wheel));
  check('간트는 React onWheel 을 쓰지 않는다', !/onWheel=/.test(gantt));
  // 목록 열 위 = 위아래, 그래프 위 = 좌우 (2026-09-21 사용자 결정)
  check('목록 열 위에서는 가로채지 않는다', /clientX - el\.getBoundingClientRect\(\)\.left < ignoreLeft\) return/.test(wheel));
  check('간트가 목록 열 폭을 넘긴다', /useWheelScrollX\(scrollRef, \{[^}]*ignoreLeft: NAME_COL_W/.test(gantt));
  check('가로로 안 넘치면 가로채지 않는다', /if \(max <= 4\) return/.test(wheel));
  check('표에 자체 세로 스크롤 + 머리글 고정', /max-h-\[72vh\] overflow-auto/.test(gantt) && /sticky top-0 z-30/.test(gantt));
  check('가로 제스처·Shift·Ctrl 은 통과', /ctrlKey \|\| event\.shiftKey/.test(wheel) && /deltaX\) >= Math\.abs\(event\.deltaY/.test(wheel));
  check('드래그는 공용 훅', /useDragScroll/.test(gantt) && !/setPointerCapture/.test(gantt));
  check('일 단위가 있다', /"Day" \| "Week"/.test(filters) && /Day: \d+, Week: 20/.test(gantt));
  check('모든 보기 단위에 폭 상수', ['Day', 'Week', 'Month', 'Year'].every((m) => new RegExp(`${m}: \\d+`).test(gantt)));
  check('탭은 판정을 lib 에서 가져온다', /from "@\/lib\/workTimeline"/.test(tab) && !/function getTaskProgress/.test(tab));
  check('회차 기준 진행률을 쓴다', /getRoundProgress\(t, deadline\)/.test(tab));
  check('유도 구간은 다르게 그린다', /row\.span\?\.derived \? DERIVED_SPAN_BG/.test(gantt));
  check('합쳐진 절차 막대에 단계별 마감 도넛', /row\.type === "procedural"\)\s*\.flatMap/.test(gantt) && /\? String\(row\.step\)/.test(gantt));
  check('절차·일회성 도넛이 같은 기준점(하루 칸 가운데)을 쓴다', (gantt.match(/\+ dayWidthPct \/ 2\}%/g) ?? []).length >= 3);
  check('끝난 회차는 흐리게', /m\.done && "opacity-45"/.test(gantt));
  check('펼침 상태는 안전 저장소로', /readStoredJson<string\[\]>\(EXPANDED_KEY/.test(tab) && !/localStorage\./.test(tab));
}

// 업무 상태 대응표가 네 상태를 모두 담는가 (2026-10-05). 'pending'(대기)이 빠져 있어 업무 하나를
// [대기]로 바꾸면 타임라인 탭 전체가 오류 화면이 됐고, 업무 상세 칩에는 영문 `pending` 이 보였다.
// 운영에 대기 업무가 없으면 아무 증상이 없는 부류라 정적 검사가 방어선이다.
console.log('[업무 상태 대응표]');
{
  const types = readFileSync(join(ROOT, 'src/types/tasks.ts'), 'utf8');
  const gantt = readFileSync(join(ROOT, 'src/components/tasks/WorkGanttChart.tsx'), 'utf8');
  const detail = readFileSync(join(ROOT, 'src/components/tasks/WorkDetailDialog.tsx'), 'utf8');
  const statuses = ['pending', 'active', 'completed', 'cancelled'];
  check('Work.status 타입에 대기가 있다', /status: 'pending' \| 'active' \| 'completed' \| 'cancelled';/.test(types));
  const meta = gantt.slice(gantt.indexOf('const STATUS_META = {'), gantt.indexOf('} as const;', gantt.indexOf('const STATUS_META = {')));
  check('타임라인 색표가 네 상태를 모두 담는다', statuses.every((s) => new RegExp(`\\n  ${s}: \\{`).test(meta)));
  check('업무 상태 조회는 안전한 함수로(모르는 값에도 안 죽는다)', !/STATUS_META\[ev\.status\]/.test(gantt) && /workStatusMeta\(ev\.status\)/.test(gantt));
  const chip = detail.slice(detail.indexOf('const statusChip = {'), detail.indexOf('}[currentWork.status]'));
  check('업무 상세 칩이 네 상태를 모두 담는다', statuses.every((s) => new RegExp(`\\b${s}: \\{ label:`).test(chip)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
