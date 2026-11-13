/**
 * 나이스 화면 안내 둘러보기 — 왼쪽 찾기(검색·단위업무·업무별 목록) · 오른쪽 안내 전문.
 *
 * 페이지(`NeisGuidePage`)와 개발용 미리보기(`scripts/neis-kb-browser`)가 함께 쓴다 — 레이아웃·URL 은
 * 바깥이 정하고 여기는 «무엇을 골랐나»만 받는다. 안내의 시연은 할 일 카드와 **같은 모달**
 * (`NeisScreenGuideDialog`)을 띄운다 — 여기서 보는 모습이 교사가 실제로 보는 모습이다.
 *
 * 휴대폰(<lg)은 두 칸을 나란히 둘 수 없어 «목록 → 안내» 한 칸씩 보여 준다(고르면 안내, [목록] 으로 돌아감).
 */
import { Fragment, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NeisGuide } from '@/lib/neisScreenModel';
import { NeisScreenGuideDialog } from '@/features/task-workflow/components/neis/NeisScreenGuideDialog';
import {
  NEIS_GUIDES,
  NEIS_GUIDE_BY_KEY,
  NEIS_GUIDE_UNITS,
  NEIS_SCREEN_BY_KEY,
  guideKeyPart,
  searchNeisGuides,
} from './guideCatalog';

const SOURCE_LABEL: Record<NeisGuide['source'], string> = { manual: '설명서', observed: '실사용', 'ai-draft': 'AI 초안' };
const SOURCE_TONE: Record<NeisGuide['source'], string> = {
  manual: 'border-blue-100 bg-blue-50 text-blue-700',
  observed: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  'ai-draft': 'border-amber-100 bg-amber-50 text-amber-700',
};

interface Props {
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  /** 왼쪽 목록이 붙어 있을 높이(페이지는 헤더 아래 sticky, 미리보기는 화면 전체) */
  listClassName?: string;
}

export function NeisGuideBrowser({ selectedKey, onSelect, listClassName }: Props) {
  const [query, setQuery] = useState('');
  const [unit, setUnit] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);

  const filtered = useMemo(() => searchNeisGuides(query, unit), [query, unit]);
  const grouped = useMemo(() => {
    const out = new Map<string, NeisGuide[]>();
    for (const guide of filtered) {
      const head = `${guideKeyPart(guide.key, 0)} › ${guideKeyPart(guide.key, 1)}`;
      out.set(head, [...(out.get(head) ?? []), guide]);
    }
    return [...out];
  }, [filtered]);

  const guide = selectedKey ? NEIS_GUIDE_BY_KEY.get(selectedKey) ?? null : null;
  const manualCount = NEIS_GUIDES.filter((g) => g.source === 'manual').length;
  const faqCount = NEIS_GUIDES.reduce((n, g) => n + (g.faq?.length ?? 0), 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] lg:items-start">
      {/* 찾기 — 휴대폰에서는 안내를 고르면 숨는다 */}
      <aside className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm',
        'lg:sticky lg:top-4',
        listClassName ?? 'lg:max-h-[calc(100vh-7rem)]',
        guide && 'hidden lg:flex',
      )}
      >
        <div className="space-y-2.5 border-b border-slate-100 p-2.5">
          <label className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 focus-within:border-blue-300 focus-within:bg-white sm:h-9">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="화면 이름·용도·절차·묻고 답하기에서 찾기"
              aria-label="나이스 안내 찾기"
              className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-slate-400 sm:text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-1" role="group" aria-label="단위업무">
            {([[null, NEIS_GUIDES.length], ...NEIS_GUIDE_UNITS] as Array<[string | null, number]>).map(([name, n]) => (
              <button
                key={name ?? '전체'}
                type="button"
                aria-pressed={unit === name}
                onClick={() => setUnit(name)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                  unit === name ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {name ?? '전체'} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>
          <div className="text-[10px] text-slate-400">
            {filtered.length === NEIS_GUIDES.length ? `${NEIS_GUIDES.length}개` : `${filtered.length} / ${NEIS_GUIDES.length}개`}
            {' '}· 설명서 기준 {manualCount} · 묻고 답하기 {faqCount}
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto p-1.5" aria-label="나이스 화면 목록">
          {grouped.length === 0 && <div className="p-6 text-center text-sm text-slate-400">찾는 안내가 없습니다</div>}
          {grouped.map(([head, list]) => (
            <section key={head} className="mb-1.5">
              <div className="sticky top-0 z-10 bg-card/95 px-2 py-1 text-[11px] font-semibold text-slate-500 backdrop-blur">
                {head} <span className="font-normal text-slate-400">{list.length}</span>
              </div>
              {list.map((item) => {
                const active = item.key === selectedKey;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onSelect(item.key)}
                    aria-current={active ? 'true' : undefined}
                    className={cn('flex w-full min-w-0 items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors sm:py-1.5', active ? 'bg-blue-50' : 'hover:bg-slate-50')}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={cn('truncate text-[13px] font-medium', active ? 'text-blue-700' : 'text-slate-800')} title={item.key}>
                        {guideKeyPart(item.key, 3)}
                        <span className="ml-1 text-[11px] font-normal text-slate-400">{guideKeyPart(item.key, 2)}</span>
                      </div>
                      <div className="truncate text-[11px] text-slate-500" title={item.purpose}>{item.purpose}</div>
                    </div>
                    {item.source !== 'manual' && (
                      <span className={cn('mt-0.5 shrink-0 rounded border px-1 text-[10px]', SOURCE_TONE[item.source])}>{SOURCE_LABEL[item.source]}</span>
                    )}
                  </button>
                );
              })}
            </section>
          ))}
        </nav>
      </aside>

      {/* 읽기 */}
      <div className={cn('min-w-0', !guide && 'hidden lg:block')}>
        {guide ? (
          <GuideView guide={guide} onDemo={() => setDemo(true)} onPick={onSelect} onBack={() => onSelect(null)} />
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-16 text-center text-sm text-slate-500">
            왼쪽에서 나이스 화면을 고르세요
          </div>
        )}
      </div>

      {guide && (
        <NeisScreenGuideDialog
          key={guide.key}
          open={demo}
          onOpenChange={setDemo}
          screenKey={guide.key}
          roles={NEIS_SCREEN_BY_KEY.get(guide.key)?.roles}
        />
      )}
    </div>
  );
}

function GuideView({ guide, onDemo, onPick, onBack }: {
  guide: NeisGuide;
  onDemo: () => void;
  onPick: (key: string) => void;
  onBack: () => void;
}) {
  const screen = NEIS_SCREEN_BY_KEY.get(guide.key);
  const whens = [...new Set(guide.flows.map((flow) => flow.when).filter((w): w is string => Boolean(w)))];
  return (
    <article className="space-y-4">
      <button type="button" onClick={onBack} className="flex h-11 items-center gap-1 text-sm text-slate-500 hover:text-slate-800 lg:hidden">
        <ChevronLeft className="h-4 w-4" /> 목록
      </button>

      <header className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-400" />
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
          {guide.key.split('›').map((segment, index, all) => (
            <Fragment key={index}>
              <span>{segment.replace(/#.*$/, '')}</span>
              {index < all.length - 1 && <ChevronRight className="h-3 w-3" />}
            </Fragment>
          ))}
        </div>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-bold text-slate-900">{guideKeyPart(guide.key, 3)}</h2>
            <p className="mt-1 text-[15px] text-slate-700">{guide.purpose}</p>
          </div>
          <button
            type="button"
            onClick={onDemo}
            className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 sm:h-9"
          >
            <Play className="h-4 w-4" /> 사용 방법 시연
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          <span className={cn('rounded-full border px-2 py-0.5', SOURCE_TONE[guide.source])}>{SOURCE_LABEL[guide.source]}</span>
          {guide.who && <Chip>담당 · {guide.who}</Chip>}
          {whens.map((when) => <Chip key={when}>시기 · {when}</Chip>)}
          {screen?.roles.length ? <Chip>담임 탭 · {screen.roles.join('·')}</Chip> : null}
          {(guide.refs ?? []).map((ref) => (
            <span key={ref.section} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-500">
              설명서 {ref.section} {ref.title} · p.{ref.pages}
            </span>
          ))}
        </div>
        {guide.context && <p className="mt-3 text-sm leading-relaxed text-slate-600">{guide.context}</p>}
      </header>

      {guide.before?.length || guide.after?.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          <ListBox title="먼저 끝나 있어야 할 일" tone="amber" items={guide.before ?? []} />
          <ListBox title="다음에 이어지는 일" tone="emerald" items={guide.after ?? []} />
        </div>
      ) : null}

      {guide.flows.map((flow, flowIndex) => (
        <section key={flowIndex} className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-base font-semibold text-slate-900">{flow.title}</h3>
            {flow.view && flow.view !== 'main' && <span className="text-[11px] text-slate-400">{flow.view.replace(/^tab:/, '안쪽 탭 · ')}</span>}
            {flow.when && <span className="text-[11px] text-blue-600">{flow.when}</span>}
          </div>
          <ol className="mt-3 space-y-3">
            {flow.steps.map((step, stepIndex) => (
              <li key={stepIndex} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">{stepIndex + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800">
                    {step.label && <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{step.label}</span>}
                    {step.text}
                  </div>
                  {step.detail && <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{step.detail}</p>}
                  {step.points?.length ? (
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] text-slate-600 marker:text-blue-400">
                      {step.points.map((point, i) => <li key={i}>{point}</li>)}
                    </ul>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      {guide.cautions?.length ? <ListBox title="주의" tone="rose" items={guide.cautions} /> : null}

      {guide.faq?.length ? (
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <h3 className="text-base font-semibold text-slate-900">
            묻고 답하기 <span className="text-xs font-normal text-slate-400">나이스지원 답변(설명서)</span>
          </h3>
          <dl className="mt-3 space-y-3">
            {guide.faq.map((item, i) => (
              <div key={i}>
                <dt className="text-sm font-medium text-slate-800">Q. {item.q}</dt>
                <dd className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {guide.related?.length ? (
        <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <h3 className="text-base font-semibold text-slate-900">관련 화면</h3>
          <ul className="mt-2 space-y-1.5">
            {guide.related.map((rel) => (
              <li key={rel.key} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
                {NEIS_GUIDE_BY_KEY.has(rel.key) ? (
                  <button type="button" onClick={() => onPick(rel.key)} className="shrink-0 font-medium text-blue-600 hover:underline">
                    {guideKeyPart(rel.key, 3)}
                  </button>
                ) : <span className="shrink-0 font-medium text-slate-700">{guideKeyPart(rel.key, 3)}</span>}
                <span className="min-w-0 text-[13px] text-slate-500">{rel.why}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="pb-2 text-[11px] text-slate-400">
        {[guide.author, guide.writtenAt, guide.source === 'manual' ? '설명서는 학교마다 업무 담당이 다를 수 있다고 밝힙니다' : null].filter(Boolean).join(' · ')}
      </p>
    </article>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">{children}</span>;
}

const TONES = {
  amber: 'border-amber-200 bg-amber-50/60 text-amber-900',
  emerald: 'border-emerald-200 bg-emerald-50/60 text-emerald-900',
  rose: 'border-rose-200 bg-rose-50/60 text-rose-900',
} as const;

function ListBox({ title, tone, items }: { title: string; tone: keyof typeof TONES; items: string[] }) {
  return (
    <section className={cn('rounded-2xl border p-4', TONES[tone])}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length ? (
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] leading-relaxed">
          {items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      ) : <p className="mt-1 text-[13px] opacity-60">없음</p>}
    </section>
  );
}
