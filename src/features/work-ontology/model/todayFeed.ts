// ========================================
// 「오늘」 — 출처가 다른 «내가 할 것»을 한 줄 모양으로 모으는 판정의 단일 출처 (2026-11-08, P0)
//
// 설계 = docs/plans/2026-11-08-work-ontology-redesign.md §4-A.
// 화면은 이 결과를 그리기만 한다. React·Supabase 에 의존하지 않는다(회귀 scripts/work-ontology-test).
//
// ⚠️ 이 모듈은 **새 판정을 만들지 않는다** — 각 출처의 기존 단일 출처를 부른다:
//    할 일 상태 = taskStatus.getMyTaskStatus · 끝난 업무 = isFromClosedWork · 담당자 아님 = withoutReportedNotMine
//    회차 = taskDeadlines · 요청 배치 = collectInput.placeInboxRequests · 공문 처리 필요 = officialDocInbox.needsAction
// ⚠️ P0 는 읽기 전용이다 — 할 일·요청의 주행동은 «내 할 일»(완료·제출의 유일한 진입점)로 보내는 링크다.
//    완료 버튼을 여기 만들지 말 것(2026-09-04 사고, task-split-test). 진입점 이전은 P3.
// ========================================

import { getMyTaskStatus, isFromClosedWork } from '@/lib/taskStatus';
import { withoutReportedNotMine } from '@/lib/taskAssignmentIssue';
import { formatRoundLabel, getTaskDeadlines, pendingDeadlinesForAssignee } from '@/lib/taskDeadlines';
import { placeInboxRequests, requestKindOf, requestVerb, type MyCollectRequest } from '@/lib/collectInput';
import { needsAction } from '@/lib/officialDocInbox';
import type { OfficialDoc } from '@/features/official-docs/officialDocService';
import { objectHref } from './objectRef';
import { whyLine } from './docSuggestion';

export type TodaySource = 'task' | 'request' | 'signature' | 'approval' | 'doc';
export type TodayBucket = 'now' | 'week' | 'later';
/** 칩 색 — CLAUDE.md §3 상태 색(완료 에메랄드·진행 블루·예정 슬레이트·취소 로즈·제출 인디고) + 출처 색(겹치지 않는 계열) */
export type ChipTone = 'late' | 'progress' | 'wait' | 'submit' | 'doc' | 'calendar' | 'sign' | 'plain';

export interface TodayChip { text: string; tone: ChipTone }

export type TodayAction =
  | { kind: 'navigate'; label: string; href: string }
  | { kind: 'signature'; label: string; id: string }
  | { kind: 'approval'; label: string; id: string }
  /** 공문 제안 — [내 일로]·[다른 사람에게]·[참고만] (P2). 버튼 셋은 화면이 그린다 */
  | { kind: 'docDecision'; label: string; id: string };

export interface TodayItem {
  key: string;
  source: TodaySource;
  title: string;
  /** 맥락 띠 — 업무 이름(누르면 한 장 보기) 또는 출처 설명 */
  context: { label: string; href?: string | null; note?: string | null };
  /** 정렬·묶음 기준 날짜(YYYY-MM-DD, 한국) — 없으면 null */
  due: string | null;
  bucket: TodayBucket;
  chips: TodayChip[];
  action: TodayAction;
  /** 제목을 누르면 갈 한 장 보기(없으면 제목은 누르지 않는다) */
  objectHref: string | null;
  /** 제안 카드의 «왜 나에게» 한 줄 + AI 요약(P2) */
  why?: string | null;
  summary?: string | null;
}

// ----------------------------------------
// 날짜 — 'YYYY-MM-DD' 문자열 산술(시간대 흔들림 없음)
// ----------------------------------------

function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
}

/** due - today (일). 둘 중 하나라도 없으면 null */
export function daysBetween(today: string, due: string | null | undefined): number | null {
  if (!due || !/^\d{4}-\d{2}-\d{2}/.test(due)) return null;
  return dayNumber(due.slice(0, 10)) - dayNumber(today);
}

/** 이번 주 = 오늘부터 6일 뒤까지(7일 창). 달력의 주가 아니다 — 월요일에 금요일 일이 «나중에»로 밀리지 않게 */
export const WEEK_WINDOW_DAYS = 6;

export function bucketOf(today: string, due: string | null, alwaysNow = false): TodayBucket {
  if (alwaysNow) return 'now';
  const d = daysBetween(today, due);
  if (d === null) return 'later';
  if (d <= 0) return 'now';
  if (d <= WEEK_WINDOW_DAYS) return 'week';
  return 'later';
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** «오늘 마감» · «2일 지남» · «11/12(목)» */
export function dueChip(today: string, due: string | null): TodayChip | null {
  const d = daysBetween(today, due);
  if (d === null || !due) return null;
  if (d < 0) return { text: `${-d}일 지남`, tone: 'late' };
  if (d === 0) return { text: '오늘 마감', tone: 'late' };
  const [y, m, day] = due.slice(0, 10).split('-').map(Number);
  const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return { text: `${m}/${day}(${wd})`, tone: d <= 2 ? 'progress' : 'wait' };
}

// ----------------------------------------
// 출처별 입력 모양 — 화면 훅이 넘기는 최소 형태(구조적 타입)
// ----------------------------------------

export interface FeedTask {
  id: string;
  title: string;
  type?: string | null;
  status?: string | null;
  due_date?: string | null;
  event_id?: string | null;
  event_name?: string | null;
  event_status?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface FeedSignature {
  id: string;
  title: string;
  requesterName: string;
  dueAt: string | null;
  /** 서명자 중 몇 번째 차례인지(표시용) — 모르면 null */
  orderLabel?: string | null;
}

export interface FeedApproval {
  id: string;
  title: string;
  requesterName: string;
  createdAt: string;
}

export interface TodayInputs {
  today: string;
  myResourceId: string | null;
  myName: string | null;
  tasks: readonly FeedTask[];
  requests: readonly MyCollectRequest[];
  signatures: readonly FeedSignature[];
  approvals: readonly FeedApproval[];
  /** 관리자에게만 온다(P0 — 공문 RLS). 결재권자가 나인 것만 쓴다 */
  docs: readonly OfficialDoc[];
}

// ----------------------------------------
// 출처 → 줄
// ----------------------------------------

/** 내 할 일 목록에 남은(끝나지 않은) 할 일인가 — 홈 대시보드와 같은 거름 */
export function openTasksForMe(tasks: readonly FeedTask[], myResourceId: string | null): FeedTask[] {
  const live = tasks.filter((t) => !isFromClosedWork(t));
  const mine = withoutReportedNotMine(live as never[], myResourceId) as unknown as FeedTask[];
  return mine.filter((t) => {
    const s = getMyTaskStatus(t as never, myResourceId);
    return s !== 'completed' && s !== 'cancelled';
  });
}

/** 내게 남은 다음 마감 — 다중 마감이면 내가 끝내지 않은 첫 회차 */
export function nextDueForMe(task: FeedTask, myResourceId: string | null): { due: string | null; roundLabel: string | null } {
  const all = getTaskDeadlines(task as never);
  if (all.length <= 1) return { due: task.due_date ? task.due_date.slice(0, 10) : all[0] ?? null, roundLabel: null };
  const pending = pendingDeadlinesForAssignee(task as never, myResourceId ?? undefined);
  const due = pending[0] ?? null;
  return { due, roundLabel: due ? formatRoundLabel(all, due) : null };
}

function hasUnits(task: FeedTask): boolean {
  const units = (task.meta as { units?: unknown } | null)?.units;
  return Array.isArray(units) && units.length > 0;
}

function taskItems(input: TodayInputs, rowRequests: Map<string, MyCollectRequest[]>, open: FeedTask[]): TodayItem[] {
  return open.map((task) => {
    const { due, roundLabel } = nextDueForMe(task, input.myResourceId);
    const chips: TodayChip[] = [];
    const dc = dueChip(input.today, due);
    if (dc) chips.push(dc);
    if (roundLabel) chips.push({ text: roundLabel, tone: 'plain' });
    if (hasUnits(task)) chips.push({ text: '과제 단위', tone: 'plain' });
    for (const r of rowRequests.get(task.id) ?? []) {
      chips.push({ text: `${requestVerb(r) === '제출 안내 보기' ? '실물 제출' : '제출'} ${r.done}/${r.total}`, tone: 'submit' });
    }
    return {
      key: `task:${task.id}`,
      source: 'task' as const,
      title: task.title,
      context: {
        label: task.event_name || '업무',
        href: task.event_id ? objectHref('work', task.event_id) : null,
      },
      due,
      bucket: bucketOf(input.today, due),
      chips,
      action: { kind: 'navigate' as const, label: '하러 가기', href: `/my-tasks?task=${encodeURIComponent(task.id)}` },
      objectHref: task.event_id ? objectHref('work', task.event_id, task.id) : null,
    };
  });
}

function requestItems(input: TodayInputs, section: MyCollectRequest[]): TodayItem[] {
  return section.map((r) => {
    const due = r.due_date ? r.due_date.slice(0, 10) : null;
    const chips: TodayChip[] = [];
    const dc = dueChip(input.today, due);
    if (dc) chips.push(dc);
    const kind = requestKindOf(r);
    chips.push({ text: kind === 'input' ? `${r.done}/${r.total}줄` : `${r.done}/${r.total}`, tone: 'submit' });
    return {
      key: `request:${r.action_id}`,
      source: 'request' as const,
      title: r.task_title ? `${r.task_title} — ${r.action_title}` : r.action_title,
      context: { label: r.work_title || '요청', note: '담당이 아니어도 내 차례' },
      due,
      bucket: bucketOf(input.today, due),
      chips,
      action: { kind: 'navigate' as const, label: requestVerb(r), href: `/my-tasks?collect=${encodeURIComponent(r.action_id)}` },
      objectHref: null,
    };
  });
}

function signatureItems(input: TodayInputs): TodayItem[] {
  return input.signatures.map((s) => {
    const due = s.dueAt ? toKstDateKey(s.dueAt) : null;
    const chips: TodayChip[] = [{ text: '내 차례', tone: 'sign' }];
    const dc = dueChip(input.today, due);
    if (dc) chips.push({ ...dc, text: `마감 ${dc.text}` });
    return {
      key: `signature:${s.id}`,
      source: 'signature' as const,
      title: s.title,
      context: { label: '서명', note: `요청 ${s.requesterName}${s.orderLabel ? ` · ${s.orderLabel}` : ''}` },
      due,
      // 내 차례인 서명은 다음 사람을 막고 있다 — 마감과 무관하게 «지금»
      bucket: 'now' as const,
      chips,
      action: { kind: 'signature' as const, label: '서명하기', id: s.id },
      objectHref: null,
    };
  });
}

function approvalItems(input: TodayInputs): TodayItem[] {
  return input.approvals.map((a) => ({
    key: `approval:${a.id}`,
    source: 'approval' as const,
    title: a.title,
    context: { label: '결재', note: `요청 ${a.requesterName}` },
    due: null,
    bucket: 'now' as const,
    chips: [{ text: '내 차례', tone: 'sign' as const }],
    action: { kind: 'approval' as const, label: '결재하기', id: a.id },
    objectHref: null,
  }));
}

/** 내 공문 — 결재권자 이름 = 내 이름 · 아직 결정 없음 · 처리 필요로 판정됨 */
export function myPendingDocs(docs: readonly OfficialDoc[], myName: string | null): OfficialDoc[] {
  const name = (myName ?? '').trim();
  if (!name) return [];
  return docs.filter((d) => (d.approver_name ?? '').trim() === name && !d.decision && needsAction(d));
}

function docItems(input: TodayInputs): TodayItem[] {
  return myPendingDocs(input.docs, input.myName).map((d) => {
    const due = d.triage?.deadline ? d.triage.deadline.slice(0, 10) : null;
    const chips: TodayChip[] = [];
    const dc = dueChip(input.today, due);
    chips.push(dc ? { ...dc, text: `기한 ${dc.text}` } : { text: '기한 없음', tone: 'wait' });
    return {
      key: `doc:${d.id}`,
      source: 'doc' as const,
      title: d.title,
      context: {
        label: '공문',
        note: [d.sender, d.registered_at ? `${toKstDateKey(d.registered_at).slice(5).replace('-', '/')} 접수` : null].filter(Boolean).join(' · '),
      },
      due,
      bucket: bucketOf(input.today, due),
      chips,
      action: { kind: 'docDecision' as const, label: '내 일로', id: d.id },
      objectHref: null,
      why: whyLine(d),
      summary: d.triage?.result?.summary ?? null,
    };
  });
}

/** ISO 시각 → 한국 날짜 키 */
export function toKstDateKey(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso.slice(0, 10);
  return new Date(t + 9 * 3_600_000).toISOString().slice(0, 10);
}

// ----------------------------------------
// 조립
// ----------------------------------------

const SOURCE_ORDER: Record<TodaySource, number> = { signature: 0, approval: 1, task: 2, request: 3, doc: 4 };

/** 마감 이른 순 → 마감 없음은 뒤 → 같은 날은 출처 순(남을 막는 서명·결재 먼저) */
export function compareItems(a: TodayItem, b: TodayItem): number {
  if (a.due !== b.due) {
    if (a.due === null) return 1;
    if (b.due === null) return -1;
    return a.due < b.due ? -1 : 1;
  }
  return SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || a.title.localeCompare(b.title, 'ko');
}

export interface TodayFeed {
  /** 공문 제안 — 확인만 하면 내 일이 된다(P2). 지금/이번 주/나중에 와 섞지 않는다(아직 내 일이 아니다) */
  suggestions: TodayItem[];
  now: TodayItem[];
  week: TodayItem[];
  later: TodayItem[];
  /** 출처별 개수 — 머리 요약용 */
  counts: Record<TodaySource, number>;
  /** 앞으로 7일 중 마감이 가장 많이 몰린 날(2건 이상일 때만) */
  busiestDay: { date: string; count: number } | null;
  overdue: number;
}

export function buildTodayFeed(input: TodayInputs): TodayFeed {
  const open = openTasksForMe(input.tasks, input.myResourceId);
  // 요청은 한 자리에만 — 제출 요청은 그 할 일 행이 맡고, 나머지는 요청 줄로(내 할 일과 같은 규칙)
  const { rows, section } = placeInboxRequests(input.requests as MyCollectRequest[], new Set(open.map((t) => t.id)));

  const suggestions = docItems(input).sort(compareItems);
  const all = [
    ...signatureItems(input),
    ...approvalItems(input),
    ...taskItems(input, rows, open),
    ...requestItems(input, section),
  ].sort(compareItems);

  const counts: Record<TodaySource, number> = { task: 0, request: 0, signature: 0, approval: 0, doc: 0 };
  for (const item of [...all, ...suggestions]) counts[item.source] += 1;

  const perDay = new Map<string, number>();
  for (const item of all) {
    const d = daysBetween(input.today, item.due);
    if (d !== null && d >= 0 && d <= WEEK_WINDOW_DAYS && item.due) perDay.set(item.due, (perDay.get(item.due) ?? 0) + 1);
  }
  let busiestDay: TodayFeed['busiestDay'] = null;
  for (const [date, count] of [...perDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (count >= 2 && (!busiestDay || count > busiestDay.count)) busiestDay = { date, count };
  }

  return {
    suggestions,
    now: all.filter((i) => i.bucket === 'now'),
    week: all.filter((i) => i.bucket === 'week'),
    later: all.filter((i) => i.bucket === 'later'),
    counts,
    busiestDay,
    overdue: all.filter((i) => (daysBetween(input.today, i.due) ?? 0) < 0).length,
  };
}
