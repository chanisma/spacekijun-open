import { ArrowLeft, Sparkles, ExternalLink, Info, Loader2, RotateCcw, Tv, Newspaper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  AnalysisFailureInfo,
  AnalysisPerspectivePresetEntry,
  AnalysisPerspectivePreset,
  SelectableContent,
  SelectableNews,
} from '../../types/aiAnalysis';
import { AnalysisFailureNotice } from './AnalysisFailureNotice';
import { newsSourceMeta } from '../../utils/newsSources';

type Props = {
  items: SelectableContent[];
  /** 이 사용자에게 보여 줄 관점 목록(대상별로 다르다). */
  presets: readonly AnalysisPerspectivePresetEntry[];
  perspectivePreset: AnalysisPerspectivePreset;
  onPerspectivePresetChange: (v: AnalysisPerspectivePreset) => void;
  perspectiveCustom: string;
  onPerspectiveCustomChange: (v: string) => void;
  customNote: string;
  onCustomNoteChange: (v: string) => void;
  running: boolean;
  /** 진행 중인 시도(1차 실패 후 자동 재시도). */
  attempt: { attempt: number; total: number } | null;
  failure: AnalysisFailureInfo | null;
  onDismissFailure: () => void;
  onBack: () => void;
  onRun: () => void;
};

/**
 * 이 개수를 넘으면 "응답이 잘릴 수 있다"고 미리 알린다.
 *
 * 자료가 많아지면 프롬프트가 커지고 모델이 항목마다 길게 답해 출력 예산을 넘긴다 —
 * 그게 `truncated` 실패의 직접 원인이다. 막지는 않는다(정당한 사용일 수 있다).
 * 실패한 뒤에 알려 주는 것보다 누르기 전에 아는 것이 낫다.
 */
const VOLUME_WARN_THRESHOLD = 12;


function formatDuration(sec: number | null): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ReviewStep({
  items,
  presets,
  perspectivePreset,
  onPerspectivePresetChange,
  perspectiveCustom,
  onPerspectiveCustomChange,
  customNote,
  onCustomNoteChange,
  running,
  attempt,
  failure,
  onDismissFailure,
  onBack,
  onRun,
}: Props) {
  const newsItems = items.filter(it => it.kind === 'news');
  const videoItems = items.filter(it => it.kind === 'video');
  const isRetry = failure !== null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* 실패 안내 — 검토 화면에 머물러 원인·원문·다음 행동을 그 자리에 둔다 */}
        {failure && (
          <AnalysisFailureNotice failure={failure} onDismiss={onDismissFailure} />
        )}

        {/* 자료가 많으면 응답이 잘린다 — 누르기 전에 알린다 */}
        {items.length > VOLUME_WARN_THRESHOLD && (
          <section className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
            <p className="text-[11px] leading-relaxed text-amber-800">
              자료 {items.length}건은 많은 편입니다. AI 응답이 길이 제한에 걸려 중간에 끊길 수
              있으니, 실패하면 {VOLUME_WARN_THRESHOLD}건 이하로 줄여 보세요.
            </p>
          </section>
        )}

        {/* 분석 관점 */}
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-xs font-semibold text-slate-700">분석 관점</h3>
          <div className="flex flex-wrap gap-1.5">
            {presets.map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => onPerspectivePresetChange(p.value)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  perspectivePreset === p.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Input
            value={perspectiveCustom}
            onChange={e => onPerspectiveCustomChange(e.target.value)}
            placeholder="(선택) 분석 관점을 직접 입력하면 위 프리셋을 덮어씁니다"
            className="mt-2 h-8 text-xs"
          />
        </section>

        {/* 추가 지시사항 */}
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-xs font-semibold text-slate-700">
            추가 지시사항 <span className="text-slate-400">(선택)</span>
          </h3>
          <Textarea
            value={customNote}
            onChange={e => onCustomNoteChange(e.target.value)}
            rows={3}
            placeholder="예) 영상 화자 주장과 뉴스 보도가 어긋나는 지점을 강조해줘"
            className="text-xs"
          />
        </section>

        {/* 선택된 자료 미리보기 */}
        <section className="rounded-lg border border-slate-200 bg-white">
          <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <h3 className="text-xs font-semibold text-slate-700">
              선택된 자료 ({items.length}건 — 뉴스 {newsItems.length} / 영상 {videoItems.length})
            </h3>
          </header>
          <ul className="divide-y divide-slate-100">
            {items.map((it, idx) => {
              const isNews = it.kind === 'news';
              const sourceMeta = isNews ? newsSourceMeta((it as SelectableNews).source, 'soft') : null;
              return (
                <li key={`${it.kind}:${it.id}`} className="px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isNews ? (
                          <>
                            <span
                              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${sourceMeta?.classes}`}
                            >
                              <Newspaper className="h-2.5 w-2.5" />
                              {sourceMeta?.label}
                            </span>
                          </>
                        ) : (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700"
                            title={it.channelLabel ?? '영상'}
                          >
                            <Tv className="h-2.5 w-2.5" />
                            {it.channelLabel ?? '영상'}
                          </span>
                        )}
                        {it.category && (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                            {it.category}
                          </span>
                        )}
                        {!isNews && it.durationSeconds && (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                            {formatDuration(it.durationSeconds)}
                          </span>
                        )}
                      </div>
                      <h4 className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-slate-800">
                        {it.title}
                      </h4>
                      {it.headlineSummary && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                          {it.headlineSummary}
                        </p>
                      )}
                    </div>
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="원문 보기"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* 푸터 */}
      <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-4 py-3">
        <Button variant="outline" onClick={onBack} disabled={running} className="gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          자료 다시 선택
        </Button>
        <Button onClick={onRun} disabled={running || items.length === 0} className="ml-auto gap-2">
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {/* 자동 재시도를 숨기면 이유 없이 두 배로 느려진 실행으로 보인다 */}
              {attempt && attempt.attempt > 1
                ? `형식 교정 재시도 중… (${attempt.attempt}/${attempt.total})`
                : '분석 중…'}
            </>
          ) : isRetry ? (
            <>
              <RotateCcw className="h-3.5 w-3.5" />
              다시 시도
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              AI 분석 실행
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
