// ========================================
// 업무 점검 — 코드 규칙 (2026-09-27)
//
// 근거 = docs/plans/2026-09-27-task-automation-research.md §5 (라이브 32건 실측)
//   코드 규칙은 32건 중 27건에서 무언가를 잡았고 비용이 0이다 → **항상 보여 준다**.
//   AI 교차 점검은 글이 많은 업무에서만 쓸모가 있었다 → 버튼(src/lib/workAi.ts).
//
// 규칙은 **업무 데이터 안의 사실만** 본다. 학사력·내용연수 같은 도메인 지식이 필요한 판정은
// 여기 넣지 않는다(지식은 규칙표로 따로 들여야 한다 — 연구 문서 §4).
// ========================================

import { getTaskDeadlines } from './taskDeadlines';
import {
  buildStages,
  effectiveOutputKind,
  parseOutputDecl,
  type PipelineActionLike,
  type PipelineTaskLike,
} from './workPipeline';

export type CheckSeverity = 'warn' | 'info';

export interface WorkCheckFinding {
  /** 규칙 id — 회귀·수락률 집계의 키 */
  rule: string;
  severity: CheckSeverity;
  message: string;
  /** 어떻게 고치는가 — 한 줄 */
  hint?: string;
  /** 가리키는 할 일(업무 전체에 대한 지적이면 없다) */
  taskIds: string[];
}

export interface WorkCheckInput {
  work: { status: string };
  tasks: PipelineTaskLike[];
  actions: PipelineActionLike[];
}

/** 자리표시 문구 — AI 초안·양식에 남아 발송되면 그대로 사고가 된다 */
export const PLACEHOLDER_RE = /(임시로\s*생성|임시로\s*작성|추후\s*(?:안내|공유|확정)\s*예정|OO|○○|XX|\[\s*(?:날짜|일시|장소|이름)\s*\])/;

const isDone = (t: PipelineTaskLike) => t.status === 'completed' || t.status === 'cancelled';

/** 할 일의 가장 이른·늦은 마감(YYYY-MM-DD) — 다중 마감이면 회차 전부를 본다 */
function deadlineRange(task: PipelineTaskLike): { first: string; last: string } | null {
  const dates = getTaskDeadlines({ due_date: task.due_date ?? null, meta: (task.meta ?? {}) as never });
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  return { first: sorted[0], last: sorted[sorted.length - 1] };
}

function isWeekend(key: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return false;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return day === 0 || day === 6;
}

const audienceEmpty = (config: Record<string, unknown> | null | undefined, key: 'message' | 'collect') => {
  const block = (config?.[key] ?? null) as { audience?: { include?: unknown[] } } | null;
  return !block?.audience?.include || block.audience.include.length === 0;
};

/**
 * 규칙 점검. 결과 순서 = 경고 먼저, 같은 등급 안에서는 규칙이 정한 순서.
 * **완료된 업무는 상태 어긋남만 본다** — 끝난 일의 설정 누락을 지적해 봐야 할 일이 없다.
 */
export function runWorkChecks({ work, tasks, actions }: WorkCheckInput): WorkCheckFinding[] {
  const findings: WorkCheckFinding[] = [];
  const open = tasks.filter((t) => !isDone(t));

  // ── 업무 상태 ↔ 할 일 상태 ──
  if (work.status === 'completed' && open.length > 0) {
    findings.push({
      rule: 'work_completed_with_open_tasks',
      severity: 'warn',
      message: `업무는 완료인데 끝나지 않은 할 일이 ${open.length}개 남아 있습니다.`,
      hint: '할 일을 완료·취소하거나 업무를 진행 중으로 되돌리세요.',
      taskIds: open.map((t) => t.id),
    });
  }
  if (work.status !== 'completed' && tasks.length > 0 && open.length === 0) {
    findings.push({
      rule: 'work_active_all_done',
      severity: 'info',
      message: '할 일이 모두 끝났습니다.',
      hint: '업무 상태를 완료로 바꿀 차례입니다.',
      taskIds: [],
    });
  }
  if (work.status === 'completed') return sortFindings(findings);

  // ── 마감 ──
  const noDue = open.filter((t) => !deadlineRange(t));
  if (noDue.length > 0) {
    findings.push({
      rule: 'task_no_due',
      severity: 'warn',
      message: `마감일이 없는 할 일이 ${noDue.length}개 있습니다.`,
      hint: '마감일이 없으면 타임라인·마감 알림·순서 점검이 이 할 일을 보지 못합니다.',
      taskIds: noDue.map((t) => t.id),
    });
  }

  // 단계 순서와 마감이 거꾸로 — 앞 단계의 가장 늦은 마감 > 뒤 단계의 가장 이른 마감
  // (적대적 검증 2026-09-27) ① 취소된 할 일은 기준이 아니다 ② **다중 마감**(연중 반복) 할 일은 비교하지
  // 않는다 — 마지막 회차(12월)가 뒤 단계 전부를 거짓 경보로 만든다 ③ 마감 없는 단계를 건너뛰어도
  // 비교가 끊기지 않게 **가장 가까운 앞 단계의 기준**을 이어 쓴다.
  const stages = buildStages(tasks);
  const comparable = (t: PipelineTaskLike) => t.status !== 'cancelled' && getTaskDeadlines({ due_date: t.due_date ?? null, meta: (t.meta ?? {}) as never }).length === 1;
  let carried: { last: string; stage: number } | null = null;
  for (let i = 0; i < stages.length; i += 1) {
    if (carried) {
      const prevLast = carried.last;
      const inverted = stages[i].tasks.filter((t) => {
        const r = deadlineRange(t);
        return r && !isDone(t) && comparable(t) && r.first < prevLast;
      });
      if (inverted.length > 0) {
        findings.push({
          rule: 'stage_order_inversion',
          severity: 'warn',
          message: `${i + 1}단계 할 일의 마감이 ${carried.stage + 1}단계 마감(${prevLast.slice(5).replace('-', '/')})보다 빠릅니다.`,
          hint: '순서가 맞다면 마감일을, 마감이 맞다면 단계 순서를 고치세요.',
          taskIds: inverted.map((t) => t.id),
        });
      }
    }
    const stageLast = stages[i].tasks
      .filter(comparable)
      .map(deadlineRange).filter((r): r is { first: string; last: string } => !!r)
      .map((r) => r.last).sort().pop();
    if (stageLast) carried = { last: stageLast, stage: i };
  }

  const weekend = open.filter((t) => {
    const r = deadlineRange(t);
    return r && (isWeekend(r.first) || isWeekend(r.last));
  });
  if (weekend.length > 0) {
    findings.push({
      rule: 'task_weekend_due',
      severity: 'info',
      message: `주말에 마감되는 할 일이 ${weekend.length}개 있습니다.`,
      hint: '작년 업무에서 날짜를 옮겨 왔다면 요일이 밀렸을 수 있습니다.',
      taskIds: weekend.map((t) => t.id),
    });
  }

  // ── 작업 설정 ──
  const openIds = new Set(open.map((t) => t.id));
  const liveActions = actions.filter((a) => openIds.has(a.task_id));
  const emptyAudience = liveActions.filter((a) =>
    (a.action_type === 'message.send' && audienceEmpty(a.config, 'message'))
    || (a.action_type === 'collect.input' && audienceEmpty(a.config, 'collect')));
  if (emptyAudience.length > 0) {
    findings.push({
      rule: 'action_empty_audience',
      severity: 'warn',
      message: `받는 사람이 비어 있는 작업이 ${emptyAudience.length}개 있습니다 — ${emptyAudience.map((a) => `「${a.title}」`).join(', ')}`,
      hint: '앞 단계에 명단이 있으면 [받는 사람으로]로 채울 수 있습니다.',
      taskIds: [...new Set(emptyAudience.map((a) => a.task_id))],
    });
  }

  const placeholder = liveActions.filter((a) => {
    const m = (a.config?.message ?? null) as { body?: string; title?: string } | null;
    const c = (a.config?.collect ?? null) as { guide?: string; title?: string } | null;
    const text = [m?.title, m?.body, c?.title, c?.guide].filter(Boolean).join('\n');
    return PLACEHOLDER_RE.test(text);
  });
  if (placeholder.length > 0) {
    findings.push({
      rule: 'action_placeholder_text',
      severity: 'warn',
      message: `자리표시 문구가 남은 작업이 있습니다 — ${placeholder.map((a) => `「${a.title}」`).join(', ')}`,
      hint: '"임시로 생성", "OO" 같은 문구가 그대로 발송되지 않게 고치세요.',
      taskIds: [...new Set(placeholder.map((a) => a.task_id))],
    });
  }

  const collectNoDue = liveActions.filter((a) => {
    if (a.action_type !== 'collect.input') return false;
    const c = (a.config?.collect ?? null) as { dueDate?: string | null } | null;
    return !c?.dueDate;
  });
  if (collectNoDue.length > 0) {
    findings.push({
      rule: 'collect_no_due',
      severity: 'info',
      message: `응답 마감일이 없는 입력 받기가 ${collectNoDue.length}개 있습니다.`,
      hint: '받는 사람 화면에 «언제까지»가 보이지 않습니다.',
      taskIds: [...new Set(collectNoDue.map((a) => a.task_id))],
    });
  }

  // ── 흐름 ──
  // 뒤 단계의 받는 사람이 비었는데 바로 앞 단계가 명단·표를 남긴다 → 채울 수 있다고 알려 준다
  for (let i = 1; i < stages.length; i += 1) {
    const prevGivesPeople = stages[i - 1].tasks.some((t) => {
      const kind = effectiveOutputKind(t, actions);
      return kind === 'people' || kind === 'table';
    });
    if (!prevGivesPeople) continue;
    const gaps = actions.filter((a) =>
      stages[i].tasks.some((t) => t.id === a.task_id && !isDone(t))
      && ((a.action_type === 'message.send' && audienceEmpty(a.config, 'message'))
        || (a.action_type === 'collect.input' && audienceEmpty(a.config, 'collect'))));
    if (gaps.length > 0) {
      findings.push({
        rule: 'flow_audience_available',
        severity: 'info',
        message: `${i + 1}단계의 받는 사람을 앞 단계 명단으로 채울 수 있습니다.`,
        hint: '그 할 일을 열면 «앞 단계에서 넘어온 것»에 버튼이 있습니다.',
        taskIds: [...new Set(gaps.map((a) => a.task_id))],
      });
    }
  }

  // ── 글 ──
  // 설명 없는 할 일 — AI 교차 점검은 대조할 글이 없으면 할 말이 없다(연구 문서 §5)
  const noDescription = open.filter((t) => !t.description?.trim() || t.description.trim() === t.title.trim());
  if (noDescription.length > 0 && noDescription.length >= Math.ceil(open.length / 2)) {
    findings.push({
      rule: 'task_no_description',
      severity: 'info',
      message: `설명이 없는 할 일이 ${noDescription.length}개입니다.`,
      hint: '설명이 없으면 AI 점검이 대조할 글이 없어 아무것도 찾지 못합니다.',
      taskIds: noDescription.map((t) => t.id),
    });
  }

  // 단계가 둘 이상인데 무엇을 넘기는지 정해진 할 일이 하나도 없다 — 흐름이 신호뿐이다
  if (stages.length >= 2) {
    const declared = tasks.filter((t) => parseOutputDecl(t.meta) || effectiveOutputKind(t, actions) !== 'signal');
    if (declared.length === 0) {
      findings.push({
        rule: 'pipeline_signal_only',
        severity: 'info',
        message: '단계 사이로 «끝났다»는 신호만 넘어갑니다.',
        hint: '할 일마다 «남기는 것»(값·명단·표)을 정하면 다음 단계가 옮겨 적지 않고 받아 씁니다.',
        taskIds: [],
      });
    }
  }

  return sortFindings(findings);
}

function sortFindings(findings: WorkCheckFinding[]): WorkCheckFinding[] {
  const rank = (f: WorkCheckFinding) => (f.severity === 'warn' ? 0 : 1);
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
    .map(({ f }) => f);
}
