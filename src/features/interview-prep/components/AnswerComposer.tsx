import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { readStoredString, removeStored, writeStoredString } from '@/lib/safeLocalStorage';
import { FOUR_SENTENCES, STAR_F } from '../../../../supabase/functions/_shared/interviewPrep';
import { draftKey, speakingLabel } from '../utils';
import { coinValue, useCoinEconomy } from '@/lib/coinEconomy';

const MIN_CHARS = 20;
const MAX_CHARS = 6000;

/**
 * 답변 작성칸.
 *
 * **모달이 아니라 화면 안에 둔다** — 학생이 쓰는 긴 입력은 휴대폰이 정상 경로이고,
 * 좁은 화면에서 모달은 키보드가 올라오는 순간 쓸 수 없게 된다(CLAUDE.md §6).
 * 대신 좁은 폭에서 동작 줄을 아래에 붙여 둔다.
 *
 * **초안은 자동 저장한다.** 답변은 몇 분씩 걸리는 글인데, 그동안 탭이 죽거나 실수로
 * 뒤로 가면 통째로 사라진다. 저장 실패는 조용히 무시한다(시크릿 창에서도 기능은 돌아야 한다).
 */
export function AnswerComposer({
  questionId, initialValue = '', busy, onSubmit, submitLabel = '피드백 받기',
}: {
  questionId: string;
  initialValue?: string;
  busy: boolean;
  onSubmit: (answer: string) => void;
  submitLabel?: string;
}) {
  const key = draftKey(questionId);
  const [value, setValue] = useState(() => readStoredString(key) ?? initialValue);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  // 질문이 바뀌면 그 질문의 초안으로 갈아탄다(같은 컴포넌트가 재사용된다).
  useEffect(() => {
    setValue(readStoredString(draftKey(questionId)) ?? initialValue);
    setSavedAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  useEffect(() => {
    if (!value.trim()) { removeStored(key); return; }
    const timer = window.setTimeout(() => {
      writeStoredString(key, value);
      setSavedAt(Date.now());
    }, 600);
    return () => window.clearTimeout(timer);
  }, [value, key]);

  const trimmed = value.trim();
  const tooShort = trimmed.length < MIN_CHARS;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setGuideOpen((v) => !v)}
        aria-expanded={guideOpen}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
      >
        <ChevronDown className={cn('h-3 w-3 transition-transform', guideOpen && 'rotate-180')} aria-hidden="true" />
        답변의 뼈대 (결론 → 이유 → 사례 → 전공 연결)
      </button>
      {guideOpen && (
        <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3 text-[11px] leading-6 text-slate-600">
          {FOUR_SENTENCES.map((row) => (
            <p key={row.id}><strong className="text-slate-700">{row.id} {row.label}</strong> · {row.guide}</p>
          ))}
          <p className="pt-1 font-semibold text-slate-700">경험을 말할 때는 STAR+F 로 구체화하세요.</p>
          {STAR_F.map((row) => (
            <p key={row.id}><strong className="text-slate-700">{row.label}</strong> · {row.guide}</p>
          ))}
          <p className="text-slate-400">정확히 네 문장일 필요는 없어요. 중요한 것은 내용과 흐름입니다.</p>
        </div>
      )}

      <label htmlFor={`answer-${questionId}`} className="sr-only">나의 답변</label>
      <textarea
        id={`answer-${questionId}`}
        ref={area}
        value={value}
        disabled={busy}
        maxLength={MAX_CHARS}
        rows={7}
        onChange={(e) => setValue(e.target.value)}
        placeholder="결론을 먼저 말하고, 그렇게 생각한 이유와 실제 경험을 이어서 적어 보세요."
        className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm leading-7 text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-400">
          {trimmed.length.toLocaleString()}자
          {trimmed.length >= MIN_CHARS && <> · 말하면 {speakingLabel(trimmed.length)}</>}
          {tooShort && <> · 최소 {MIN_CHARS}자</>}
          {savedAt && !busy && <span className="ml-2 text-emerald-600">초안 저장됨</span>}
        </p>
        <button
          type="button"
          disabled={busy || tooShort}
          onClick={() => onSubmit(trimmed)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />답변을 읽고 있어요</>
            : <><Send className="h-3.5 w-3.5" aria-hidden="true" />{submitLabel}</>}
        </button>
      </div>
      <CoinHint />
      {busy && (
        <p role="status" className="mt-1 text-[11px] text-slate-400">
          보통 20~40초 걸려요. 창을 닫아도 결과는 저장됩니다.
        </p>
      )}
    </div>
  );
}

/** 코인(2026-10-21) — 답이 평가까지 끝나면 서버 트리거가 질문마다 한 번 준다. 값은 관리자 «코인 경제» 설정 */
function CoinHint() {
  const coins = useCoinEconomy();
  const coin = (k: string, d: number) => (coins ? coinValue(coins, k, d) : d);
  const amount = coin('interview.answer_reward', 3);
  if (amount <= 0) return null;
  return (
    <p className="mt-1 text-[11px] text-amber-700" data-interview-coin>
      ✦ 피드백까지 받으면 {amount}코인 — 질문마다 한 번, 하루 {coin('interview.answer_cap', 2)}번까지예요.
    </p>
  );
}
