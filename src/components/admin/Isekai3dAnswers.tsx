/**
 * 관리자 «이세계 사회인» — 학생별 AI 질문과 답 (2026-10-22 사용자 결정으로 관리자 열람을 열었다, 20261022120000).
 *
 * 서버 `isekai3d_my_students()`(볼 수 있는 학생 중 기록이 있는 학생) → `isekai3d_student_overview(학생)`(지식·최근 답 100개).
 * 판정은 서버 `isekai3d_can_view` 한 곳 — 관리자 = profiles.role 정본이라 화면 미리보기와 무관하다.
 * 이름·글 해석은 `isekai3dAdminStats.ts`.
 *
 * ⚠️ 학생이 쓴 글은 그대로 보여 준다(HTML 로 넣지 않는다 — React 텍스트).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquareText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DIALOG_HEADER_CLASS, TitleIconChip } from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import { statCard as card } from './statParts';
import {
  answerState, APPROACH_LABEL, cardText, chosenLabel, contextLabel, QUESTION_KIND_LABEL, studentLabel,
  type Isekai3dAnswer, type Isekai3dOverview, type Isekai3dStudentRow,
} from './isekai3dAdminStats';

const dateLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export function Isekai3dAnswers({ careerLabels }: { careerLabels: Record<string, string> }) {
  const [search, setSearch] = useState('');
  const [grade, setGrade] = useState<number | null>(null);
  const [open, setOpen] = useState<Isekai3dStudentRow | null>(null);
  const q = useQuery({
    queryKey: ['isekai3d-admin-students'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('isekai3d_my_students' as never);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Isekai3dStudentRow[];
    },
  });
  const rows = useMemo(() => q.data ?? [], [q.data]);
  const grades = useMemo(() => [...new Set(rows.map((r) => r.grade).filter((g): g is number => g != null))].sort(), [rows]);
  const list = useMemo(() => {
    const t = search.trim();
    return rows
      .filter((r) => (grade == null || r.grade === grade) && (!t || r.name.includes(t)))
      // 최근에 답한 학생부터 — 답이 없는 학생은 뒤로
      .sort((a, b) => (b.last_answered ?? '').localeCompare(a.last_answered ?? ''));
  }, [rows, search, grade]);

  return (
    <div className={card} data-isekai3d-answers>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">학생별 질문과 답</p>
          <p className="text-xs text-muted-foreground">게임 기록이 있는 재학생 {rows.length}명 · 최근에 답한 순 · 담임·학년부장도 자기 학생의 답을 볼 수 있어요</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg border border-slate-100 bg-slate-100/50 p-0.5" role="group" aria-label="학년">
            {[null, ...grades].map((g) => (
              <button
                key={g ?? 'all'}
                type="button"
                onClick={() => setGrade(g)}
                className={cn('rounded-md px-2 py-1 text-xs', grade === g ? 'bg-white font-medium shadow-sm' : 'text-muted-foreground')}
                aria-pressed={grade === g}
              >{g == null ? '전체' : `${g}학년`}</button>
            ))}
          </div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름 찾기" className="h-8 w-32 text-xs" aria-label="학생 이름 찾기" />
        </div>
      </div>

      {q.isPending ? <p role="status" className="py-4 text-sm text-muted-foreground">학생 목록을 불러오는 중…</p>
        : q.isError ? <p role="alert" className="py-4 text-sm text-rose-600">{(q.error as Error).message}</p>
        : (
          <div className="mt-2 max-h-[24rem] overflow-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-xs text-muted-foreground"><th className="py-1">학생</th><th>답한 질문</th><th>마지막 답</th><th /></tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.user_id} className="border-t">
                    <td className="py-1">{studentLabel(r)}</td>
                    <td className="tabular-nums">{r.answered}</td>
                    <td className="text-xs">{dateLabel(r.last_answered)}</td>
                    <td className="text-right">
                      <button type="button" onClick={() => setOpen(r)} className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">답 보기</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{rows.length ? '조건에 맞는 학생이 없어요.' : '아직 게임 기록이 있는 학생이 없어요.'}</p>}
          </div>
        )}

      <StudentAnswersDialog student={open} careerLabels={careerLabels} onClose={() => setOpen(null)} />
    </div>
  );
}

function StudentAnswersDialog({ student, careerLabels, onClose }: { student: Isekai3dStudentRow | null; careerLabels: Record<string, string>; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['isekai3d-admin-overview', student?.user_id],
    enabled: !!student,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('isekai3d_student_overview' as never, { p_student: student!.user_id } as never);
      if (error) throw new Error(error.message);
      return data as unknown as Isekai3dOverview;
    },
  });
  const o = q.data;
  const insights = (o?.knowledge?.insights ?? []).filter((i) => i.txt);

  return (
    <Dialog open={!!student} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0">
        <div className={DIALOG_HEADER_CLASS}>
          <div className="flex min-w-0 items-center gap-2">
            <TitleIconChip icon={MessageSquareText} />
            <div className="min-w-0">
              <DialogTitle className="truncate">{student ? studentLabel(student) : ''}</DialogTitle>
              <DialogDescription className="text-xs">이세계 사회인 · 최근 받은 질문 100개까지</DialogDescription>
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
          {q.isPending ? <p role="status" className="text-sm text-muted-foreground">불러오는 중…</p>
            : q.isError ? <p role="alert" className="text-sm text-rose-600">{(q.error as Error).message}</p>
            : o && (
              <>
                {o.memory === false && (
                  <p className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">이 학생은 게임의 «기억»을 껐어요 — 경향(통찰)이 쌓이지 않아요. 답한 질문은 남아 있어요.</p>
                )}
                {insights.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">게임이 읽은 경향</p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {insights.map((i, k) => <li key={i.id ?? k} className="rounded-full bg-violet-50 px-2.5 py-1 text-xs text-violet-700">{i.txt}</li>)}
                    </ul>
                  </div>
                )}
                {o.answers.length === 0
                  ? <p className="py-6 text-center text-sm text-muted-foreground">아직 받은 질문이 없어요.</p>
                  : <ol className="space-y-2">{o.answers.map((a, k) => <AnswerItem key={k} a={a} careerLabels={careerLabels} />)}</ol>}
              </>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AnswerItem({ a, careerLabels }: { a: Isekai3dAnswer; careerLabels: Record<string, string> }) {
  const state = answerState(a);
  const ctx = contextLabel(a.contextKey, careerLabels);
  const picked = chosenLabel(a);
  const options: { label: string; approach?: string }[] = a.card.choices ?? a.card.options?.map((label) => ({ label })) ?? [];
  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <span className="font-medium text-slate-700">{QUESTION_KIND_LABEL[a.kind] ?? a.kind}</span>
        {ctx && <span>· {ctx}</span>}
        <span className="ml-auto">{dateLabel(a.deliveredAt)} 받음</span>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm">{cardText(a.card.text)}</p>
      <ul className="mt-2 space-y-1">
        {options.map((c, i) => {
          const chosen = a.choice === i;
          const approach = c.approach ? APPROACH_LABEL[c.approach] ?? c.approach : null;
          return (
            <li key={i} className={cn('flex items-start gap-2 rounded-md px-2 py-1 text-sm', chosen ? 'bg-blue-50 font-medium text-blue-800 ring-1 ring-blue-200' : 'text-slate-600')}>
              <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 break-words">{c.label}</span>
              {approach && <span className="shrink-0 text-[11px] text-muted-foreground">{approach}</span>}
              {chosen && <span className="shrink-0 text-[11px]">선택</span>}
            </li>
          );
        })}
      </ul>
      {a.text && (
        <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="mr-1 text-xs font-semibold">직접 쓴 글</span>{a.text}
        </p>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        {state === 'open' ? '아직 답하지 않았어요'
          : state === 'skipped' ? `${dateLabel(a.answeredAt)} 건너뜀`
          : `${dateLabel(a.answeredAt)} 답함${a.choice != null && !picked ? ' · 고른 번호가 보기에 없어요' : ''}`}
      </p>
    </li>
  );
}
