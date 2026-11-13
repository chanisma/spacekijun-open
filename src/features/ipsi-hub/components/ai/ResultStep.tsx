import { ArrowLeft, Save, Lightbulb, TrendingUp, Target, AlertTriangle, FilePlus2, Loader2, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CompoundAnalysisResult } from '../../types/aiAnalysis';

type Props = {
  result: CompoundAnalysisResult;
  title: string;
  onTitleChange: (v: string) => void;
  perspective: string;
  newsCount: number;
  videoCount: number;
  /** 잘린 응답을 복구해 얻은 결과인가. 그렇다면 일부 항목이 빠져 있다. */
  repaired: boolean;
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
  onStartNew: () => void;
};

type SectionConfig = {
  label: string;
  Icon: typeof Lightbulb;
  tone: string;
  bg: string;
  items: string[];
};

export function ResultStep({
  result,
  title,
  onTitleChange,
  perspective,
  newsCount,
  videoCount,
  repaired,
  saving,
  onBack,
  onSave,
  onStartNew,
}: Props) {
  const totalCount = newsCount + videoCount;
  const sections: SectionConfig[] = [
    { label: '핵심 발견', Icon: Lightbulb, tone: 'text-amber-700', bg: 'bg-amber-50/70 border-amber-200', items: result.keyFindings },
    { label: '트렌드', Icon: TrendingUp, tone: 'text-blue-700', bg: 'bg-blue-50/70 border-blue-200', items: result.trends },
    { label: '전략 시사점', Icon: Target, tone: 'text-emerald-700', bg: 'bg-emerald-50/70 border-emerald-200', items: result.strategy },
    { label: '유의사항', Icon: AlertTriangle, tone: 'text-rose-700', bg: 'bg-rose-50/70 border-rose-200', items: result.cautions },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {/* 부분 결과임을 반드시 밝힌다 — 조용히 짧은 결과를 완성본으로 보여 주면
            "왜 트렌드가 2개뿐인가"를 알 길이 없고, 그 상태로 저장돼 이력에 남는다 */}
        {repaired && (
          <section className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
            <Scissors className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-amber-800">일부만 도착한 결과입니다</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                AI 응답이 길이 제한에 걸려 끊겼고, 도착한 부분까지만 복구했습니다. 항목이
                평소보다 적을 수 있습니다. 전체 결과가 필요하면 자료 수를 줄여 다시 실행해
                주세요.
              </p>
            </div>
          </section>
        )}

        {/* 메타 + 제목 */}
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
            <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
              총 {totalCount}건 종합
            </span>
            {newsCount > 0 && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-600">
                뉴스 {newsCount}
              </span>
            )}
            {videoCount > 0 && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-600">
                영상 {videoCount}
              </span>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              관점: {perspective}
            </span>
          </div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            분석 제목
          </label>
          <Input
            value={title}
            onChange={e => onTitleChange(e.target.value)}
            placeholder="저장 시 사용할 제목"
            className="mt-1 h-8 text-xs"
          />
        </section>

        {/* 종합 총평 */}
        {result.summary && (
          <section className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3">
            <h3 className="mb-1.5 text-xs font-semibold text-slate-700">종합 총평</h3>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
              {result.summary}
            </p>
          </section>
        )}

        {/* 4개 섹션 */}
        {sections.map(s =>
          s.items.length === 0 ? null : (
            <section key={s.label} className={`rounded-lg border p-3 ${s.bg}`}>
              <h3 className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${s.tone}`}>
                <s.Icon className="h-3.5 w-3.5" />
                {s.label}
                <span className="ml-1 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {s.items.length}
                </span>
              </h3>
              <ul className="space-y-1.5">
                {s.items.map((item, idx) => (
                  <li
                    key={idx}
                    className="relative pl-3 text-xs leading-relaxed text-slate-700 before:absolute before:left-0 before:top-[0.55em] before:h-1 before:w-1 before:rounded-full before:bg-slate-400"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )
        )}

        {sections.every(s => s.items.length === 0) && !result.summary && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
            분석 결과가 비어 있습니다. 모델이 형식 외 답변을 줬을 수 있어요. 다시 실행해보세요.
          </div>
        )}
      </div>

      {/* 푸터 */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 py-3">
        <Button variant="outline" onClick={onBack} disabled={saving} className="gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          이전
        </Button>
        <Button variant="outline" onClick={onStartNew} disabled={saving} className="gap-1">
          <FilePlus2 className="h-3.5 w-3.5" />
          새 분석
        </Button>
        <Button onClick={onSave} disabled={saving} className="ml-auto gap-2">
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              저장 중…
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" />
              결과 저장
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
