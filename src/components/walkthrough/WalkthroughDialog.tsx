/**
 * 기능 안내 모달 — **왼쪽은 시연, 오른쪽은 그 단계의 말**.
 *
 * ── 왜 2단인가 ─────────────────────────────────────────────────────────────
 * 절차 안내를 글머리표 목록으로 쓰면 죽는다("서명자를 추가하고 위치를 지정한 뒤
 * 요청합니다" — 읽고 나서도 어디를 눌러야 하는지 모른다). 반대로 시연만 있으면
 * 화면은 흘러가는데 **왜 그렇게 하는지**가 남지 않는다.
 * 그래서 한 단계에 둘을 나란히 붙인다 — 왼쪽에서 손이 어디로 가는지 보고,
 * 오른쪽에서 그 행동의 의미를 읽는다.
 *
 * ── 자동으로 다음 단계로 넘기지 않는다 ────────────────────────────────────
 * 읽는 속도는 사람마다 다르고, 안내 모달은 발표가 아니다. 씬은 그 단계 안에서만
 * 반복 재생 가능하고(다시 재생), 단계 이동은 항상 사용자가 한다.
 *
 * ── 씬 저작 ────────────────────────────────────────────────────────────────
 * `scene` 은 `WalkthroughStage`(1280×720 고정 캔버스) 안에서 렌더된다.
 * 좌표·타이밍 규칙은 `src/lib/walkthrough/index.ts` 주석 참고.
 */
import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS,
} from '@/components/tasks/dialogDesign';
import { Scene } from '@/lib/walkthrough';
import { WalkthroughStage } from './WalkthroughStage';

export interface WalkthroughStep {
  id: string;
  /** 단계 표시줄에 쓰는 아주 짧은 이름 (2~5자) */
  label: string;
  /** 오른쪽 설명의 제목 */
  title: string;
  /** 한 문단 — 이 단계에서 무엇을 왜 하는지 */
  body: React.ReactNode;
  /** 요점. 화면에 보이는 것과 1:1로 대응시킬 것 */
  points?: React.ReactNode[];
  /** 왼쪽 시연 씬 */
  scene: React.ReactNode;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  steps: WalkthroughStep[];
  /**
   * 머리글 아래 한 줄 — 같은 화면의 다른 안내로 바꾸는 칩 같은 것(NEIS 화면 사용 방법의 «흐름»).
   * 안내를 바꾸면 단계가 처음부터 다시 시작해야 하므로 호출부가 `key` 로 모달을 다시 그린다.
   */
  headerAction?: React.ReactNode;
}

export const WalkthroughDialog: React.FC<Props> = ({
  open, onOpenChange, title, description, steps, headerAction,
}) => {
  const [index, setIndex] = useState(0);
  // 같은 단계를 다시 재생하려면 playKey 가 바뀌어야 한다(단계 번호만으로는 안 바뀐다)
  const [replay, setReplay] = useState(0);

  // 다시 열면 처음부터 — 지난번에 보던 단계가 남아 있으면 "안내"가 아니게 된다
  useEffect(() => {
    if (open) { setIndex(0); setReplay((n) => n + 1); }
  }, [open]);

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  const go = (next: number) => {
    setIndex(Math.max(0, Math.min(steps.length - 1, next)));
    setReplay((n) => n + 1);
  };

  if (!step) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* overflow 는 안쪽 패널이 맡는다 — Content 에 두면 안에서 열리는 팝오버가 잘린다 */}
      <DialogContent className="flex h-[88vh] max-w-6xl flex-col gap-0 p-0">
        <DialogHeader className={cn(DIALOG_HEADER_CLASS, 'shrink-0 rounded-t-lg pb-3')}>
          <DialogTitle className="text-sm">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-[11px] text-slate-500">
              {description}
            </DialogDescription>
          )}
          {headerAction && <div className="pt-1.5">{headerAction}</div>}
        </DialogHeader>

        {/* ── 단계 표시줄 — 지금 어디쯤인지, 그리고 바로 건너뛸 수 있게 ── */}
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-slate-50/70 px-4 py-2">
          {steps.map((s, i) => (
            <React.Fragment key={s.id}>
              {i > 0 && <span className="h-px w-3 shrink-0 bg-slate-300" aria-hidden />}
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === index ? 'step' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  i === index
                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                    : i < index
                      ? 'border-slate-200 bg-white text-slate-500 hover:text-slate-700'
                      : 'border-dashed border-slate-200 bg-white text-slate-400 hover:text-slate-600',
                )}
              >
                <span
                  className={cn(
                    'grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold',
                    i === index ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600',
                  )}
                >
                  {i + 1}
                </span>
                {s.label}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* ── 본문: 시연 | 설명 ── */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100/60 p-4">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <WalkthroughStage>
                {/*
                  key 까지 함께 갈아 끼워 단계를 바꾸면 이전 씬이 통째로 언마운트되게 한다 —
                  씬마다 상태(타이핑 위치 등)가 t 파생이라 남아 있어도 틀리진 않지만,
                  DOM 을 재사용하면 전환이 '이어 붙은 것'처럼 보인다.
                */}
                <Scene key={`${step.id}:${replay}`} playKey={`${step.id}:${replay}`} paused={!open}>
                  {step.scene}
                </Scene>
              </WalkthroughStage>
            </div>
          </div>

          <aside className="flex shrink-0 flex-col gap-3 overflow-y-auto border-t bg-white px-4 py-4 lg:w-[340px] lg:border-l lg:border-t-0">
            <div>
              <p className="text-[11px] font-medium text-brand-600">
                {index + 1}단계 · {steps.length}단계 중
              </p>
              <h3 className="mt-0.5 text-base font-semibold leading-snug text-slate-900">
                {step.title}
              </h3>
            </div>

            <div className="text-[13px] leading-relaxed text-slate-600">{step.body}</div>

            {step.points && step.points.length > 0 && (
              <ul className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                {step.points.map((p, i) => (
                  <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-slate-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden />
                    <span className="min-w-0">{p}</span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>

        <div className={cn(DIALOG_FOOTER_CLASS, 'shrink-0 rounded-b-lg')}>
          <Button
            variant="ghost" size="sm" className={cn(FOOTER_BUTTON_CLASS, 'mr-auto')}
            onClick={() => setReplay((n) => n + 1)}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />다시 재생
          </Button>
          <Button
            variant="ghost" size="sm" className={FOOTER_BUTTON_CLASS}
            onClick={() => go(index - 1)} disabled={isFirst}
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />이전
          </Button>
          {isLast ? (
            <Button size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700"
                    onClick={() => onOpenChange(false)}>
              안내 닫기
            </Button>
          ) : (
            <Button size="sm" className="h-8 bg-blue-600 text-xs hover:bg-blue-700"
                    onClick={() => go(index + 1)}>
              다음<ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WalkthroughDialog;
