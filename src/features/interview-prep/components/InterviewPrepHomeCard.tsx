import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Loader2, MessageCircleQuestion, Sparkles } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useMenuVisibility } from '@/hooks/useMenuVisibility';
import { isPathVisible } from '@/lib/menuVisibility';
import { useInterviewPrepState } from '../hooks';
import { isInFlight } from '../utils';

/**
 * 학생 홈의 "오늘의 면접 질문" 카드.
 *
 * **진입점이 메뉴 안에만 있으면 학생은 오지 않는다** — 하루 한 번짜리 기능은 질문이
 * 학생에게 먼저 보여야 한다. 그래서 본체는 `/interview-prep` 에 두고 홈에는 상태와
 * 진입만 둔다.
 *
 * **여기서 질문을 만들지 않는다.** 홈을 여는 것만으로 LLM 이 돌면 재학생 630명이
 * 매일 호출을 일으키는데, 그중 대부분은 그날 답하지 않는다. 생성은 누를 때.
 *
 * 조회도 상태 RPC **한 번**뿐이다 — 점수까지 보여주려면 질문·답변을 통째로 받아야
 * 해서 홈이 무거워진다. 점수는 본체 화면에 있다.
 */
export function InterviewPrepHomeCard() {
  const { user } = useAuth();
  const menu = useMenuVisibility();
  if (!user || menu.isLoading || menu.error) return null;
  if (!isPathVisible(menu.config, '/interview-prep', { isAdmin: false, role: 'student' })) return null;
  return <InterviewPrepHomeContent />;
}

function InterviewPrepHomeContent() {
  const state = useInterviewPrepState();
  if (state.isError) return null;

  const data = state.data;
  const daily = data?.daily ?? null;
  const generating = isInFlight(daily);
  const answered = data?.answeredToday ?? false;
  const tone = answered ? 'emerald' : daily ? 'blue' : 'slate';

  return (
    <section
      aria-labelledby="interview-prep-home-title"
      className="relative col-span-full min-w-0 overflow-hidden rounded-2xl border bg-card p-4 shadow-sm sm:p-5 xl:col-span-6"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-1 ${
          tone === 'emerald' ? 'bg-emerald-500'
            : tone === 'blue' ? 'bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-400'
              : 'bg-slate-200'
        }`}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p id="interview-prep-home-title" className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <MessageCircleQuestion className="h-4 w-4 text-blue-600" aria-hidden="true" />
          오늘의 면접 질문
        </p>
        {!!data?.answeredDays && (
          <span className="text-[11px] text-slate-400">답변한 날 {data.answeredDays}일</span>
        )}
      </div>

      {state.isPending ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> 불러오는 중…
        </p>
      ) : answered ? (
        <>
          <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> 오늘 답변을 마쳤어요
          </p>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            피드백을 다시 읽거나, 이어지는 질문에 답해 볼 수 있어요.
          </p>
          <HomeLink label="피드백 다시 보기" />
        </>
      ) : generating ? (
        <>
          <p role="status" className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> 질문을 만들고 있어요…
          </p>
          <HomeLink label="면접 준비 열기" />
        </>
      ) : daily?.question ? (
        <>
          <p className="mt-3 break-words text-sm font-semibold leading-7 text-slate-900 line-clamp-3">
            “{daily.question}”
          </p>
          {daily.source_label && (
            <p className="mt-1.5 truncate text-[11px] text-slate-400">근거 · {daily.source_label}</p>
          )}
          <HomeLink label="답하기" primary />
        </>
      ) : (
        <>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            내 생기부에서 아직 다루지 않은 활동으로 면접 질문을 하나 만들어 드려요.
          </p>
          <HomeLink label="오늘의 질문 받기" primary icon={<Sparkles className="h-4 w-4" aria-hidden="true" />} />
        </>
      )}
    </section>
  );
}

function HomeLink({ label, primary, icon }: { label: string; primary?: boolean; icon?: React.ReactNode }) {
  return (
    <Link
      to="/interview-prep"
      className={
        primary
          ? 'mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700'
          : 'mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline'
      }
    >
      {icon}
      {label}
      {!icon && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
    </Link>
  );
}
