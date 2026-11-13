import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AnalysisFailureInfo } from '../../types/aiAnalysis';

type Props = {
  failure: AnalysisFailureInfo;
  onDismiss: () => void;
};

/**
 * 원인별 다음 행동. **"다시 시도하세요"만 쓰지 않는다** — 잘림은 다시 눌러도
 * 같은 자료면 같은 길이가 나오므로, 사용자가 바꿀 수 있는 것을 말해 줘야 한다.
 */
const NEXT_STEP: Record<AnalysisFailureInfo['reason'], string> = {
  truncated:
    '선택한 자료 수를 줄이거나, 추가 지시사항에 "각 항목을 짧게 써 줘"를 넣고 다시 시도해 보세요.',
  'no-json': '다시 시도하면 대개 성공합니다. 반복되면 자료 수를 줄여 보세요.',
  invalid: '다시 시도하면 대개 성공합니다. 반복되면 자료 수를 줄여 보세요.',
  'empty-result':
    '분석 관점을 더 구체적으로 적거나 자료를 바꿔 다시 시도해 보세요.',
  request: '잠시 후 다시 시도해 주세요. 계속되면 관리자에게 알려 주세요.',
};

/**
 * 분석 실패 안내.
 *
 * **원문(raw)을 반드시 담는다.** 종전에는 실패 시 토스트 한 줄만 뜨고 모델 응답이
 * 버려져, 같은 실패가 반복돼도 무엇이 왔는지 아무도 알 수 없었다. 여기서 펼쳐 볼 수
 * 있으면 사용자가 그대로 복사해 신고할 수 있고, 그게 이 오류를 고칠 유일한 단서다.
 */
export function AnalysisFailureNotice({ failure, onDismiss }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyRaw = async () => {
    try {
      await navigator.clipboard.writeText(failure.raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드가 막힌 환경(권한·비보안 컨텍스트)에서는 아래 펼친 원문을 직접 선택하면 된다
    }
  };

  return (
    <section className="rounded-lg border border-rose-200 bg-rose-50/70 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600" />
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold text-rose-800">분석을 완성하지 못했습니다</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-rose-700">{failure.message}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
            {NEXT_STEP[failure.reason]}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
            {failure.attempts > 1 && (
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-slate-600">
                {failure.attempts}회 시도
              </span>
            )}
            {failure.finishReason && (
              <span
                className="rounded-full bg-white/80 px-2 py-0.5 font-mono text-slate-600"
                title="공급자가 알려준 종료 사유. length면 출력 길이 제한에 걸린 것입니다."
              >
                finish_reason={failure.finishReason}
              </span>
            )}
            {failure.raw.length > 0 && (
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-slate-600">
                응답 {failure.raw.length.toLocaleString()}자
              </span>
            )}
          </div>

          {failure.raw.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowRaw(v => !v)}
                  className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-white/60"
                  aria-expanded={showRaw}
                >
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${showRaw ? 'rotate-180' : ''}`}
                  />
                  AI 응답 원문 {showRaw ? '접기' : '보기'}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyRaw}
                  className="h-6 gap-1 px-1.5 text-[11px] text-rose-700 hover:bg-white/60"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? '복사됨' : '복사'}
                </Button>
              </div>
              {showRaw && (
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded border border-rose-200 bg-white p-2 text-[10px] leading-relaxed text-slate-700">
                  {failure.raw}
                </pre>
              )}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          className="h-6 w-6 flex-shrink-0 text-rose-500 hover:bg-white/60"
          title="닫기"
          aria-label="오류 안내 닫기"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </section>
  );
}
