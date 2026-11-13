import { Lightbulb, Target, BarChart3, AlertTriangle, Clock } from 'lucide-react';
import type { NewsFeedItem, TimestampedHighlight } from '../types/feed';

export type AnalysisSections = {
  corePoints: string[];
  strategyImplications: string[];
  dataPoints?: string[];
  cautions: string[];
};

type NewsLike = Pick<
  NewsFeedItem,
  'corePoints' | 'strategyImplications' | 'dataPoints' | 'cautions'
>;

type AnalysisDrawerProps = {
  sections: AnalysisSections;
  highlights?: TimestampedHighlight[];
  onJumpToTimestamp?: (timeSec: number) => void;
};

type SectionConfig = {
  key: keyof AnalysisSections;
  label: string;
  Icon: typeof Lightbulb;
  tone: string;
};

const SECTIONS: SectionConfig[] = [
  { key: 'corePoints', label: '핵심 포인트', Icon: Lightbulb, tone: 'text-amber-600' },
  { key: 'strategyImplications', label: '전략 시사점', Icon: Target, tone: 'text-blue-600' },
  { key: 'dataPoints', label: '데이터 포인트', Icon: BarChart3, tone: 'text-emerald-600' },
  { key: 'cautions', label: '유의사항', Icon: AlertTriangle, tone: 'text-rose-600' },
];

function formatTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function hasDetailContent(item: NewsLike): boolean {
  return (
    item.corePoints.length > 0 ||
    item.strategyImplications.length > 0 ||
    item.dataPoints.length > 0 ||
    item.cautions.length > 0
  );
}

export function hasAnalysisContent(
  sections: AnalysisSections,
  highlights?: TimestampedHighlight[]
): boolean {
  return (
    sections.corePoints.length > 0 ||
    sections.strategyImplications.length > 0 ||
    (sections.dataPoints?.length ?? 0) > 0 ||
    sections.cautions.length > 0 ||
    (highlights?.length ?? 0) > 0
  );
}

export function AnalysisDrawer({ sections, highlights, onJumpToTimestamp }: AnalysisDrawerProps) {
  const visible = SECTIONS.filter((s) => {
    const arr = sections[s.key];
    return Array.isArray(arr) && arr.length > 0;
  });

  const hasHighlights = (highlights?.length ?? 0) > 0;

  if (visible.length === 0 && !hasHighlights) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-muted-foreground">
        분석된 상세 정보가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visible.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map(({ key, label, Icon, tone }) => (
            <section
              key={key}
              className="rounded-md border border-gray-200 bg-gray-50/60 p-3"
            >
              <h5 className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${tone}`}>
                <Icon className="h-3.5 w-3.5" />
                {label}
              </h5>
              <ul className="space-y-1 pl-1">
                {(sections[key] as string[]).map((line, idx) => (
                  <li
                    key={idx}
                    className="relative pl-3 text-xs leading-relaxed text-gray-700 before:absolute before:left-0 before:top-[0.55em] before:h-1 before:w-1 before:rounded-full before:bg-gray-400"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {hasHighlights && (
        <section className="rounded-md border border-gray-200 bg-gray-50/60 p-3">
          <h5 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-violet-600">
            <Clock className="h-3.5 w-3.5" />
            타임스탬프 하이라이트
          </h5>
          <ul className="space-y-1.5">
            {highlights!.map((h, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs leading-relaxed">
                {onJumpToTimestamp ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onJumpToTimestamp(h.timeSec);
                    }}
                    className="mt-0.5 rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-violet-700 hover:bg-violet-200"
                  >
                    {formatTimestamp(h.timeSec)}
                  </button>
                ) : (
                  <span className="mt-0.5 rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-violet-700">
                    {formatTimestamp(h.timeSec)}
                  </span>
                )}
                <span className="flex-1 text-gray-700">{h.note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function NewsDetailDrawer({ item }: { item: NewsLike }) {
  return (
    <AnalysisDrawer
      sections={{
        corePoints: item.corePoints,
        strategyImplications: item.strategyImplications,
        dataPoints: item.dataPoints,
        cautions: item.cautions,
      }}
    />
  );
}
