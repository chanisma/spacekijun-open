/**
 * 완료된 문서의 **보관 및 내보내기** — 모달 안 단계 패널.
 *
 * ── 왜 토스트가 아닌가 ─────────────────────────────────────────────────────
 * 종전엔 Drive 이관 결과를 토스트로 알렸는데 두 가지가 나빴다:
 *   ① 금방 사라져 **놓치기 쉽다** — 실패 사유가 특히 그렇다
 *   ② "인증하고 보관" 같은 **다음 행동**을 토스트 버튼에 숨기면 발견되지 않는다
 *
 * 그래서 상태와 다음 행동을 **모달 안에 남긴다**. 사라지지 않으니 실패를 나중에 봐도 되고,
 * 무엇을 해야 하는지가 항상 그 자리에 있다.
 *
 * ── 순서 ───────────────────────────────────────────────────────────────────
 * ① Drive 로 옮기기 → ② 내려받기·출력. 완료된 문서의 정본 자리는 학교 Drive 이므로
 * 보관이 먼저다. 다만 **강제하지는 않는다** — 인증이 막히면 파일을 영영 못 받게 되므로
 * [건너뛰고 내려받기]를 항상 남긴다(사용자 목적은 결국 파일이다).
 */
import React from 'react';
import {
  AlertCircle, Check, CloudUpload, Download, ExternalLink, Loader2, Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ArchivePhase } from '../hooks/useSignatureDocument';
import type { DriveArchiveInfo } from '../services/signatureDrive';
import { formatDaysLeft, formatPurgeDeadline } from '../types';

interface Props {
  phase: ArchivePhase;
  archived: DriveArchiveInfo | null;
  isBuilding: boolean;
  /** 정리까지 남은 달력 일수. null 이면 대상이 아니다(이미 정리됐거나 Drive 로 옮겼다) */
  daysLeft: number | null;
  /** 정확히 언제 지워지는가 */
  deadline: Date | null;
  /**
   * 서버에 파일이 없다 — **Drive 로 옮겼거나** 기한이 지나 정리됐다.
   * 이 상태에서 내려받기를 시도하면 400 이 난다(실사용 확인).
   */
  filesGone: boolean;
  onArchive: () => void;
  onAuthenticate: () => void;
  onDownload: () => void;
  onPrint: () => void;
  /** 한글 문서는 브라우저가 못 열어 출력 대신 내려받기로 돌린다 */
  printable: boolean;
}

export const ExportPanel: React.FC<Props> = ({
  phase, archived, isBuilding, daysLeft, deadline, filesGone,
  onArchive, onAuthenticate, onDownload, onPrint, printable,
}) => {
  const done = !!archived || phase.kind === 'done';

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        보관 및 내보내기
      </p>

      {/*
        이미 정리된 문서 — 파일이 없으므로 내려받기 버튼을 아예 두지 않는다.
        비활성 버튼만 두면 "왜 안 되지"가 되고, 없애면 "어디 갔지"가 된다. 이유를 적는다.
      */}
      {filesGone && !archived && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">
          보관 기한이 지나 <strong>문서가 서버에서 정리</strong>됐습니다.
          서명 기록은 남아 있지만 문서 파일은 다시 받을 수 없습니다.
        </p>
      )}

      {/* ① Drive 보관 — 정리된 문서에는 올릴 파일이 없다 */}
      {!(filesGone && !archived) && (
      <div
        className={cn(
          'rounded-lg border px-2.5 py-2',
          done ? 'border-emerald-200 bg-emerald-50/50'
            : phase.kind === 'failed' ? 'border-rose-200 bg-rose-50/50'
            : phase.kind === 'needs-auth' ? 'border-amber-200 bg-amber-50/50'
            : 'border-slate-200 bg-slate-50/60',
        )}
      >
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <StepIcon phase={phase} done={done} />
          <span className={cn(
            done ? 'text-emerald-800'
              : phase.kind === 'failed' ? 'text-rose-800'
              : phase.kind === 'needs-auth' ? 'text-amber-900'
              : 'text-slate-700',
          )}>
            Google Drive 보관
          </span>
        </div>

        {done ? (
          <div className="mt-1 pl-5">
            {archived?.link ? (
              <a
                href={archived.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />Drive에서 열기
              </a>
            ) : (
              <span className="text-[11px] text-emerald-700">옮겨졌습니다.</span>
            )}
            {archived?.uploadedBy && (
              <span className="ml-1.5 text-[10px] text-emerald-600/70">
                {archived.uploadedBy} 보관
              </span>
            )}
          </div>
        ) : phase.kind === 'working' ? (
          <p className="mt-1 pl-5 text-[11px] text-slate-500">
            {isBuilding ? '서명본을 만드는 중…' : 'Drive로 옮기는 중…'}
          </p>
        ) : phase.kind === 'needs-auth' ? (
          <div className="mt-1 space-y-1.5 pl-5">
            {/* 사라지지 않는 설명 — 왜 인증이 필요한지까지 적는다 */}
            <p className="text-[11px] leading-relaxed text-amber-900">
              Google 인증이 만료됐습니다. 로그인 세션이 갱신되면 Drive 권한이 사라지는 것이
              정상이라 가끔 다시 인증해야 합니다.
            </p>
            <Button size="sm" className="h-7 bg-blue-600 px-2.5 text-[11px] hover:bg-blue-700"
                    onClick={onAuthenticate}>
              Google 인증하고 옮기기
            </Button>
          </div>
        ) : phase.kind === 'failed' ? (
          <div className="mt-1 space-y-1.5 pl-5">
            <p className="break-words text-[11px] leading-relaxed text-rose-800">{phase.message}</p>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={onArchive}>
              다시 시도
            </Button>
          </div>
        ) : (
          <div className="mt-1 space-y-1.5 pl-5">
            <p className="text-[11px] leading-relaxed text-slate-500">
              학교 Drive(<span className="tabular-nums">{new Date().getFullYear()}</span>/전자서명)로 옮깁니다.
            </p>
            {/*
              **언제 지워지는지 정확히 말한다.** 지나면 복구가 불가능하므로 "며칠 뒤"만으로는
              부족하다 — 달력을 보고 계획할 수 있게 날짜·시각을 함께 적는다.
            */}
            {daysLeft != null && deadline && (
              <div className={cn(
                'rounded-md border px-2 py-1.5',
                daysLeft <= 2 ? 'border-rose-200 bg-rose-50/70'
                  : daysLeft <= 4 ? 'border-amber-200 bg-amber-50/70'
                  : 'border-slate-200 bg-white',
              )}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn(
                    'text-[11px] font-semibold tabular-nums',
                    daysLeft <= 2 ? 'text-rose-700' : daysLeft <= 4 ? 'text-amber-800' : 'text-slate-700',
                  )}>
                    {formatPurgeDeadline(deadline)}
                  </span>
                  <span className={cn(
                    'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    daysLeft <= 2 ? 'bg-rose-600 text-white'
                      : daysLeft <= 4 ? 'bg-amber-500 text-white'
                      : 'bg-slate-200 text-slate-700',
                  )}>
                    {formatDaysLeft(daysLeft)}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                  이때 서버에서 정리됩니다. 그 전에 옮기지 않으면 다시 받을 수 없습니다.
                </p>
              </div>
            )}
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={onArchive}>
              <CloudUpload className="mr-1 h-3 w-3" />Drive로 옮기기
            </Button>
          </div>
        )}
      </div>
      )}

      {/* ② 내려받기·출력 — 보관 전에도 막지 않는다(파일을 못 받는 상황을 만들지 않는다).
          단 이미 정리된 문서는 받을 파일 자체가 없다. */}
      {/*
        내려받기·출력은 **서버에 파일이 있을 때만**. Drive 로 옮긴 뒤에도 버튼을 두면
        누르는 순간 400 이 난다 — 그때의 정본은 Drive 링크다(위에 있다).
      */}
      {!filesGone && (
      <div className="flex items-center gap-1.5">
        <Button
          variant={done ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 flex-1 text-xs', done && 'bg-blue-600 hover:bg-blue-700')}
          onClick={onDownload}
          disabled={isBuilding || phase.kind === 'working'}
        >
          {isBuilding
            ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            : <Download className="mr-1 h-3.5 w-3.5" />}
          {/* Drive 를 아직 안 거쳤으면 "건너뛴다"는 사실을 버튼이 말한다 */}
          {done ? '내려받기' : '건너뛰고 내려받기'}
        </Button>
        {printable && (
          <Button
            variant="outline" size="sm" className="h-8 px-2.5 text-xs"
            onClick={onPrint}
            disabled={isBuilding || phase.kind === 'working'}
          >
            <Printer className="mr-1 h-3.5 w-3.5" />출력
          </Button>
        )}
      </div>
      )}
    </div>
  );
};

const StepIcon: React.FC<{ phase: ArchivePhase; done: boolean }> = ({ phase, done }) => {
  if (done) return <Check className="h-3.5 w-3.5 text-emerald-600" />;
  if (phase.kind === 'working') return <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />;
  if (phase.kind === 'failed') return <AlertCircle className="h-3.5 w-3.5 text-rose-600" />;
  if (phase.kind === 'needs-auth') return <AlertCircle className="h-3.5 w-3.5 text-amber-600" />;
  return <CloudUpload className="h-3.5 w-3.5 text-slate-400" />;
};

export default ExportPanel;
