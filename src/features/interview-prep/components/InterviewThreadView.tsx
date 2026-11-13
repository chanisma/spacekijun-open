import { useState } from 'react';
import {
  BookOpenCheck, CornerDownRight, FileSearch, Loader2, MessageCircleQuestion, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  interviewRubric,
  type InterviewPrepAnswerRow,
  type InterviewPrepEvaluation,
} from '../../../../supabase/functions/_shared/interviewPrep';
import { isInFlight, latestAnswer, latestEvaluatedAnswer, type InterviewThread } from '../utils';
import { AnswerComposer } from './AnswerComposer';
import { RubricDots, SourceChip } from './parts';

/**
 * 기준 id → 이름. 경험형 루브릭이 일반형을 포함하므로 그것 하나로 전부 덮인다.
 * 키를 `string` 으로 넓혀 둔다 — 저장된 평가는 JSONB 라 루브릭이 바뀌면 옛 id 가
 * 섞여 들어올 수 있고, 그때 조회가 타입에서 막히면 안 된다(화면은 id 를 그대로 쓴다).
 */
const RUBRIC_LABELS = new Map<string, string>(
  interviewRubric('experience').map((row) => [row.id, row.label] as [string, string]),
);

const KIND_LABEL = { daily: '오늘의 질문', practice: '연습 질문', followup: '이어지는 질문' } as const;

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });

export interface ThreadActions {
  onEvaluate: (questionId: string, answer: string) => void;
  onFollowUp: (questionId: string) => void;
  /** 지금 작업 중인 질문 id + 무엇을 하는 중인지. */
  pending: { questionId: string; kind: 'evaluate' | 'followup' } | null;
}

/**
 * 질문 → 답변 → 피드백 → 꼬리 질문 한 묶음.
 *
 * **학생 기록 탭과 교사 탭이 이 부품 하나를 공유한다**(`actions` 를 주지 않으면 읽기
 * 전용). 갈라 두면 루브릭 표시 규칙과 버전 표기를 두 벌 유지하게 되고, 그 어긋남은
 * 오류를 내지 않고 "화면마다 다르게 보인다"로만 드러난다.
 */
export function InterviewThreadView({
  thread, actions, depth = 0, defaultOpenComposer = false,
}: {
  thread: InterviewThread;
  actions?: ThreadActions;
  depth?: number;
  defaultOpenComposer?: boolean;
}) {
  const { question } = thread;
  const evaluated = latestEvaluatedAnswer(thread);
  const last = latestAnswer(thread);
  const working = isInFlight(last) || actions?.pending?.questionId === question.id;
  const [revising, setRevising] = useState(defaultOpenComposer && !last);
  const [historyOpen, setHistoryOpen] = useState(false);

  const canAnswer = !!actions && question.status === 'ready';
  const showComposer = canAnswer && (!last || revising);
  const hasFollowUpChild = thread.children.length > 0;

  return (
    <div className={cn(depth > 0 && 'mt-4 border-l-2 border-indigo-100 pl-4')}>
      <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
        {depth > 0 && <CornerDownRight className="h-3 w-3" aria-hidden="true" />}
        <span>{KIND_LABEL[question.kind] ?? '질문'}</span>
        <span aria-hidden="true">·</span>
        <span>{dateLabel(question.created_at)}</span>
      </p>

      {question.status === 'generating' ? (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          질문을 준비하고 있어요…
        </p>
      ) : question.status === 'failed' ? (
        <p className="mt-2 text-sm text-slate-500">질문을 준비하지 못했어요. 다시 시도해 주세요.</p>
      ) : (
        <p className="mt-2 break-words text-base font-semibold leading-7 text-slate-900">
          {question.question}
        </p>
      )}

      {question.intent && question.status === 'ready' && (
        <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
          <span className="text-slate-400">질문 의도</span> · {question.intent}
        </p>
      )}

      {depth === 0 && (
        <div className="mt-3">
          <SourceChip label={question.source_label} excerpt={question.source_excerpt} />
        </div>
      )}

      {/* ── 제출한 답변 ───────────────────────────────────────────── */}
      {last && !showComposer && (
        <div className="mt-4">
          <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
            <span>나의 답변</span>
            {last.version > 1 && <span>· {last.version}번째로 다듬은 답변</span>}
            {thread.answers.length > 1 && (
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className="font-medium text-blue-600 hover:underline"
              >
                {historyOpen ? '이전 버전 닫기' : `이전 버전 ${thread.answers.length - 1}개 보기`}
              </button>
            )}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm leading-7 text-slate-700">
            {last.answer}
          </p>
          {historyOpen && (
            <ol className="mt-2 space-y-2">
              {thread.answers.slice(0, -1).reverse().map((row) => (
                <li key={row.id} className="rounded-xl border border-dashed border-slate-200 p-3">
                  <p className="text-[11px] text-slate-400">{row.version}번째 · {dateLabel(row.created_at)}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-6 text-slate-500">{row.answer}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* ── 피드백 ────────────────────────────────────────────────── */}
      {working && !showComposer && (
        <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          답변을 읽고 있어요…
        </p>
      )}
      {evaluated?.evaluation && !showComposer && (
        // key 로 답변 버전을 묶는다 — 없으면 다시 평가받았을 때 펼쳐 둔 항목이
        // 이전 평가 기준으로 남아 "가장 낮은 항목"을 더 이상 가리키지 않는다.
        <EvaluationView
          key={evaluated.id}
          evaluation={evaluated.evaluation}
          stale={!!last && last.id !== evaluated.id}
        />
      )}

      {/* ── 다음 행동 ─────────────────────────────────────────────── */}
      {showComposer && (
        <AnswerComposer
          questionId={question.id}
          // 고쳐 쓰는 경우 직전 답변에서 시작한다 — 빈 칸에서 다시 쓰게 하면 다듬기가 아니라
          // 재작성이 된다(초안이 남아 있으면 그쪽이 이긴다).
          initialValue={last?.answer ?? ''}
          busy={!!working}
          submitLabel={last ? '다시 피드백 받기' : '피드백 받기'}
          onSubmit={(answer) => { setRevising(false); actions!.onEvaluate(question.id, answer); }}
        />
      )}
      {canAnswer && last && !showComposer && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!working}
            onClick={() => setRevising(true)}
            className="inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            답변 고쳐서 다시 받기
          </button>
          {evaluated?.evaluation?.followUp && !hasFollowUpChild && (
            <button
              type="button"
              disabled={!!working}
              onClick={() => actions!.onFollowUp(question.id)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {actions!.pending?.questionId === question.id && actions!.pending.kind === 'followup'
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                : <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden="true" />}
              이 질문에 답하기
            </button>
          )}
        </div>
      )}

      {thread.children.map((child) => (
        <InterviewThreadView key={child.question.id} thread={child} actions={actions} depth={depth + 1} />
      ))}
    </div>
  );
}

/**
 * 루브릭 결과.
 *
 * **가장 낮은 항목만 기본으로 펼친다** — 네 항목의 조언을 모두 펼쳐 두면 무엇부터
 * 고쳐야 할지가 사라진다. 나머지는 눌러서 본다.
 */
function EvaluationView({ evaluation, stale }: { evaluation: InterviewPrepEvaluation; stale: boolean }) {
  const criteria = evaluation.criteria ?? [];
  const weakest = criteria.length
    ? criteria.reduce((min, row) => (row.score < min.score ? row : min), criteria[0]).id
    : null;
  const [open, setOpen] = useState<string | null>(weakest);

  return (
    <section aria-label="답변 피드백" className="mt-4 rounded-xl border border-slate-200 bg-white p-3.5">
      <p className="text-[11px] text-slate-400">
        연습용 AI 피드백 · 항목별 0~4단계 · 실제 입시 점수가 아닙니다
      </p>
      {stale && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700">
          가장 최근에 제출한 답변은 아직 평가되지 않았어요. 아래는 그 전 답변에 대한 조언입니다.
        </p>
      )}
      <ul className="mt-3 space-y-1.5">
        {criteria.map((row) => {
          const expanded = open === row.id;
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : row.id)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50"
              >
                <RubricDots score={row.score} label={RUBRIC_LABELS.get(row.id) ?? row.id} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
                  {RUBRIC_LABELS.get(row.id) ?? row.id}
                </span>
              </button>
              {expanded && (
                <div className="mb-1 ml-1.5 border-l-2 border-slate-100 pl-3 text-[11px] leading-6 text-slate-500">
                  <p><span className="text-slate-400">답변 근거</span> · {row.evidence}</p>
                  <p className="mt-0.5 text-slate-600">{row.feedback}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs leading-6">
        <div>
          <dt className="inline font-semibold text-emerald-700">잘한 점 </dt>
          <dd className="inline text-slate-600">{evaluation.strength}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-blue-700">먼저 보완할 점 </dt>
          <dd className="inline text-slate-600">{evaluation.improvement}</dd>
        </div>
      </dl>
      {/* ── 기록 대조 ─────────────────────────────────────────────────────
          점수가 아니라 **사실 확인**이다. `unsupported` 를 오답처럼 빨갛게 칠하면
          안 된다 — 발췌는 기록의 일부라 그 바깥을 덧붙이는 것은 정상이고 좋은
          답변일 수도 있다. 다만 "문서로는 증명되지 않는다"를 알아야 한다. */}
      {evaluation.recordCheck && (
        <p className={cn(
          'mt-3 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[11px] leading-6',
          evaluation.recordCheck.status === 'conflict' ? 'bg-rose-50 text-rose-800'
            : evaluation.recordCheck.status === 'unsupported' ? 'bg-amber-50 text-amber-900'
              : 'bg-emerald-50 text-emerald-800',
        )}>
          <FileSearch className="mt-1 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">
              {evaluation.recordCheck.status === 'conflict' ? '기록과 다른 내용이 있어요'
                : evaluation.recordCheck.status === 'unsupported' ? '기록에서 확인되지 않는 내용이 있어요'
                  : '기록과 어긋나지 않아요'}
            </strong>
            {' · '}{evaluation.recordCheck.note}
          </span>
        </p>
      )}

      {/* ── 학술 참고 ─────────────────────────────────────────────────────
          생활기록부는 학생이 고칠 수 없는 문서라 "틀렸다"로 끝내면 할 수 있는 일이
          없다. 그래서 늘 **면접에서 어떻게 말할지**가 함께 붙는다. AI 의견이라는
          것도 분명히 적는다. */}
      {evaluation.academicNote && (
        <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/70 px-2.5 py-2 text-[11px] leading-6 text-sky-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <BookOpenCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
            내용을 한 번 확인해 보세요
            <span className="font-normal text-sky-600">· AI 참고 의견</span>
          </p>
          <p className="mt-1">{evaluation.academicNote.concern}</p>
          <p className="mt-1 text-sky-800">
            <strong className="font-semibold">면접에서는</strong> {evaluation.academicNote.suggestion}
          </p>
        </div>
      )}

      {evaluation.followUp && (
        <p className="mt-3 border-l-2 border-indigo-300 bg-indigo-50/60 py-2 pl-3 pr-2 text-xs leading-6 text-indigo-900">
          <Sparkles className="mr-1 inline h-3 w-3" aria-hidden="true" />
          {evaluation.followUp}
        </p>
      )}
    </section>
  );
}

export { EvaluationView };
export type { InterviewPrepAnswerRow };
