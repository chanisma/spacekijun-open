/**
 * 설계 의뢰 현황 — 접수한 뒤 화면을 떠나도 되는 이유를 화면이 말한다 (2026-09-18).
 *
 * 「설계하기」가 더 이상 LLM 을 동기로 부르지 않는다. 의뢰는 서버 작업 큐에 들어가고
 * 워커가 design → graph → save 세 단계로 처리한다. 그래서 이 카드가 하는 일은
 * **기다림을 눈에 보이게** 만드는 것뿐이지만, 없으면 "눌렀는데 아무 일도 안 일어남"이 된다.
 *
 * 한 의뢰 = 한 줄. 상세 단계는 여기서 끝내고 다른 곳에서 되풀이하지 않는다.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  INQUIRY_STAGE_LABEL,
  INQUIRY_STAGE_ORDER,
  inquiryGenerationActive,
  inquiryGenerationVisible,
} from '../services/inquiryGenerationService';
import type { InquiryGenerationJob } from '../types';

function elapsedLabel(fromIso: string, now: number): string {
  const started = new Date(fromIso).getTime();
  if (Number.isNaN(started)) return '';
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}분 ${seconds % 60}초`;
}

/** 서버 오류 코드 → 사람이 읽고 다음 행동을 고를 수 있는 문장. */
function failureLabel(error: string | null): string {
  if (!error) return '알 수 없는 이유로 멈췄어요.';
  if (error.startsWith('PROVIDER_TIMEOUT')) return 'AI 응답이 제한 시간을 넘겼어요.';
  if (error.startsWith('PROVIDER_HTTP_429')) return 'AI 사용량이 몰려 잠시 거절됐어요.';
  if (error.startsWith('PROVIDER_HTTP_')) return `AI 서버가 요청을 거절했어요 (${error.replace('PROVIDER_HTTP_', 'HTTP ')}).`;
  if (error.startsWith('PROVIDER_CONFIG')) return 'AI 설정에 문제가 있어요. 관리자에게 알려주세요.';
  if (error.startsWith('TRUNCATED_OUTPUT')) return '응답이 중간에 끊겼어요. 고른 근거를 줄이면 도움이 됩니다.';
  if (error.startsWith('INVALID_OUTPUT')) return 'AI가 형식을 어긴 결과를 보냈어요.';
  if (error.startsWith('WORKER_TIMEOUT')) return '처리가 시간 안에 끝나지 않았어요.';
  return error;
}

interface Props {
  jobs: InquiryGenerationJob[];
  /** 이미 화면에 펼쳐 둔 초안 id — 그 의뢰에는 「열기」를 권하지 않는다. */
  openedDraftId: string | null;
  /**
   * 지금 **실제로 존재하는** 설계 id 집합(`workspace.savedDesigns`).
   * 완료 카드는 이 안에 초안이 있을 때만 뜬다 — 이유는
   * `inquiryGenerationVisible` 주석 참고(삭제·저장 승격 두 길로 유령이 생긴다).
   */
  draftIds: ReadonlySet<string>;
  retryingId: string | null;
  onOpen: (job: InquiryGenerationJob) => void;
  onRetry: (job: InquiryGenerationJob) => void;
}

export function InquiryGenerationStatus({ jobs, openedDraftId, draftIds, retryingId, onOpen, onRetry }: Props) {
  const hasActive = jobs.some(inquiryGenerationActive);
  const [now, setNow] = useState(() => Date.now());

  // 진행 중일 때만 초를 센다. 끝난 뒤에도 돌리면 이 패널이 1초마다 다시 그려진다.
  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasActive]);

  const visible = jobs.filter((job) => inquiryGenerationVisible(job, { openedDraftId, draftIds }));

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((job) => {
        const active = inquiryGenerationActive(job);
        const stageIndex = INQUIRY_STAGE_ORDER.indexOf(job.stage);
        return (
          <div
            key={job.id}
            className={cn(
              'rounded-lg border p-3 text-xs',
              job.status === 'failed'
                ? 'border-rose-200 bg-rose-50/60'
                : job.status === 'completed'
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : 'border-brand-200 bg-brand-50/50'
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              {active && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-600" />}
              {job.status === 'completed' && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
              {job.status === 'failed' && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />}
              <span
                className="min-w-0 flex-1 truncate font-semibold text-slate-800"
                title={job.design?.title || job.input.target.name}
              >
                {job.design?.title || job.input.target.name}
              </span>
              {active && (
                <span className="shrink-0 tabular-nums text-[11px] text-slate-400">
                  {elapsedLabel(job.created_at, now)}
                </span>
              )}
            </div>

            {active && (
              <>
                <div className="mt-2 flex items-center gap-1">
                  {INQUIRY_STAGE_ORDER.map((stage, index) => (
                    <div key={stage} className="flex min-w-0 flex-1 items-center gap-1">
                      <span
                        className={cn(
                          'h-1 flex-1 rounded-full',
                          index < stageIndex ? 'bg-brand-500'
                            : index === stageIndex ? 'bg-brand-400 animate-pulse'
                              : 'bg-slate-200'
                        )}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 leading-5 text-slate-500">
                  {INQUIRY_STAGE_LABEL[job.stage]} 중… <span className="text-slate-400">
                    이 화면을 닫아도 서버에서 계속 진행돼요. 돌아오면 여기서 이어집니다.
                  </span>
                </p>
              </>
            )}

            {job.status === 'failed' && (
              <div className="mt-2 space-y-2">
                <p className="leading-5 text-rose-800">
                  «{INQUIRY_STAGE_LABEL[job.stage]}» 단계에서 멈췄어요. {failureLabel(job.error)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-full text-xs"
                  disabled={retryingId === job.id}
                  onClick={() => onRetry(job)}
                >
                  {retryingId === job.id
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                  멈춘 단계부터 다시 시도
                </Button>
              </div>
            )}

            {job.status === 'completed' && (
              <div className="mt-2">
                <p className="mb-2 leading-5 text-emerald-800">설계가 완성됐어요.</p>
                <Button type="button" className="h-8 w-full text-xs" onClick={() => onOpen(job)}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  설계 열기
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
