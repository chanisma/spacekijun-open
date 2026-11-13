import { useEffect, useMemo, useState } from 'react';
import { Sparkles, X, History as HistoryIcon, ListChecks, Eye, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useEducationalNews } from '../../hooks/useEducationalNews';
import { useAllEducationalVideos } from '../../hooks/useAllEducationalVideos';
import { useNewsAiAnalysis } from '../../hooks/useNewsAiAnalysis';
import {
  newsRowToSelectable,
  toAnalysisFailure,
  videoRowToSelectable,
} from '../../services/newsAiAnalysisService';
import type {
  AnalysisAudience,
  AnalysisFailureInfo,
  AnalysisStep,
  CompoundAnalysisResult,
  SelectableContent,
} from '../../types/aiAnalysis';
import {
  defaultPerspectiveFor,
  perspectiveLabel,
  perspectivePresetsFor,
  type AnalysisPerspectivePreset,
} from '../../types/aiAnalysis';
import { NewsSelectionStep } from './NewsSelectionStep';
import { ReviewStep } from './ReviewStep';
import { ResultStep } from './ResultStep';
import { HistoryStep } from './HistoryStep';

type Props = {
  open: boolean;
  onClose: () => void;
  /** 누가 돌리는가. 프롬프트의 화자·관점 목록·안내 문구가 갈린다. */
  audience: AnalysisAudience;
};

const STEP_ORDER: AnalysisStep[] = ['select', 'review', 'result'];

export function AiAnalysisPanel({ open, onClose, audience }: Props) {
  const { toast } = useToast();
  const { news, loading: newsLoading } = useEducationalNews();
  const { videos, loading: videosLoading } = useAllEducationalVideos();
  const aiAnalysis = useNewsAiAnalysis();

  const presets = useMemo(() => perspectivePresetsFor(audience), [audience]);

  const [tab, setTab] = useState<'workflow' | 'history'>('workflow');
  const [step, setStep] = useState<AnalysisStep>('select');
  // 통합 키: `${kind}:${id}` 형태로 저장하여 뉴스/영상 ID 충돌 방지
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [perspectivePreset, setPerspectivePreset] =
    useState<AnalysisPerspectivePreset>(() => defaultPerspectiveFor(audience));
  const [perspectiveCustom, setPerspectiveCustom] = useState('');
  const [analysisTitle, setAnalysisTitle] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [result, setResult] = useState<CompoundAnalysisResult | null>(null);
  const [resultRaw, setResultRaw] = useState<string>('');
  const [resultModel, setResultModel] = useState<string>('');
  /** 잘린 응답을 복구해 얻은 결과인가. 결과 화면이 그 사실을 밝혀야 한다. */
  const [resultRepaired, setResultRepaired] = useState(false);
  const [failure, setFailure] = useState<AnalysisFailureInfo | null>(null);

  // 역할 미리보기(admin)로 대상이 바뀌면 그 대상의 목록 밖 값이 남아 어떤 칩도
  // 선택돼 보이지 않는다 — 기본값으로 되돌린다.
  useEffect(() => {
    setPerspectivePreset(prev =>
      presets.some(p => p.value === prev) ? prev : defaultPerspectiveFor(audience)
    );
  }, [audience, presets]);

  // 패널이 열릴 때 상태 초기화 (필요 시 reset 버튼 추가 가능)
  useEffect(() => {
    if (!open) {
      // 닫힐 때만 살짝 정리 — 이력은 유지
      // (선택지·결과는 다시 열어도 그대로 보이는 게 UX상 이득이라 유지)
    }
  }, [open]);

  const selectableContent: SelectableContent[] = useMemo(() => {
    // 메인 ipsi-hub 피드(useIpsiHub.ts)와 동일한 기준 — articleDate 내림차순,
    // 값이 비어 있으면 가장 뒤로. 두 매퍼 모두 article_date → collected_at 폴백을 거치므로
    // articleDate 단일 키 비교로 일관된 결과가 나온다.
    const merged: SelectableContent[] = [
      ...news.map(newsRowToSelectable),
      ...videos.map(videoRowToSelectable),
    ];
    return merged.sort((a, b) =>
      (b.articleDate ?? '').localeCompare(a.articleDate ?? '')
    );
  }, [news, videos]);

  const keyOf = (item: SelectableContent) => `${item.kind}:${item.id}`;

  const selectedContent = useMemo(
    () => selectableContent.filter(it => selectedKeys.has(keyOf(it))),
    [selectableContent, selectedKeys]
  );

  const selectedNewsIds = useMemo(
    () => selectedContent.filter(it => it.kind === 'news').map(it => it.id),
    [selectedContent]
  );
  const selectedVideoIds = useMemo(
    () => selectedContent.filter(it => it.kind === 'video').map(it => it.id),
    [selectedContent]
  );

  // 직접 입력이 있으면 그것이 이긴다(입력란 placeholder가 그렇게 안내한다).
  const effectivePerspective = useMemo(
    () => perspectiveCustom.trim() || perspectiveLabel(perspectivePreset),
    [perspectivePreset, perspectiveCustom]
  );

  const toggleKey = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearSelection = () => setSelectedKeys(new Set());

  const goToReview = () => {
    if (selectedKeys.size === 0) {
      toast({
        title: '자료를 선택하세요',
        description: '분석에 사용할 뉴스 또는 영상을 1개 이상 선택해야 합니다.',
        variant: 'destructive',
      });
      return;
    }
    setStep('review');
  };

  const runAnalysis = async () => {
    setFailure(null);
    try {
      const newsRows = news.filter(n => selectedNewsIds.includes(n.id));
      const videoRows = videos.filter(v => selectedVideoIds.includes(v.id));
      if (newsRows.length === 0 && videoRows.length === 0) {
        toast({ title: '자료 정보 누락', variant: 'destructive' });
        return;
      }
      const out = await aiAnalysis.run({
        perspective: effectivePerspective,
        rows: newsRows,
        videoRows,
        customNote: customNote.trim() || undefined,
        audience,
      });
      setResult(out.result);
      setResultRaw(out.raw);
      setResultModel(out.model);
      setResultRepaired(out.repaired);
      // 기본 제목: 첫 자료 제목 외 N건
      if (!analysisTitle.trim()) {
        const first = selectedContent[0]?.title ?? '입시 자료 분석';
        const more = selectedContent.length > 1 ? ` 외 ${selectedContent.length - 1}건` : '';
        setAnalysisTitle(`${first}${more}`);
      }
      setStep('result');
    } catch (err) {
      console.error('AI 분석 실패:', err);
      // **검토 단계에 머문다.** 토스트는 몇 초 뒤 사라지고, 그러면 30~120초를 기다린
      // 사용자에게 남는 것이 아무것도 없다. 원인·원문·다음 행동을 그 자리에 붙여 둔다.
      setFailure(toAnalysisFailure(err));
    }
  };

  const saveResult = async () => {
    if (!result) return;
    try {
      await aiAnalysis.save({
        title: analysisTitle.trim() || '제목 없음',
        perspective: effectivePerspective,
        sourceNewsIds: selectedNewsIds,
        sourceVideoIds: selectedVideoIds,
        result,
        rawResponse: tryParseJson(resultRaw),
        model: resultModel,
      });
      toast({ title: '저장됨', description: '분석 결과가 저장되었습니다.' });
      setTab('history');
    } catch (err: any) {
      toast({
        title: '저장 실패',
        description: err.message ?? '저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const startNew = () => {
    setStep('select');
    setResult(null);
    setResultRaw('');
    setResultRepaired(false);
    setFailure(null);
    setAnalysisTitle('');
    clearSelection();
    setTab('workflow');
  };

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <>
      {/* 백드롭 */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* 패널 */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[640px] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/80 p-2 text-blue-600 shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">AI 입시 자료 분석</h2>
              <p className="text-[11px] text-slate-500">
                {audience === 'student'
                  ? '여러 자료를 묶어 추세와 내가 할 일을 정리합니다'
                  : '여러 기사를 묶어 트렌드·전략 시사점을 도출합니다'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-slate-500 hover:bg-white/60"
            title="닫기"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 탭 */}
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-3">
          <TabButton
            active={tab === 'workflow'}
            onClick={() => setTab('workflow')}
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="새 분석"
          />
          <TabButton
            active={tab === 'history'}
            onClick={() => setTab('history')}
            icon={<HistoryIcon className="h-3.5 w-3.5" />}
            label={`이력 (${aiAnalysis.history.length})`}
          />
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-hidden">
          {tab === 'workflow' ? (
            <div className="flex h-full flex-col">
              {/* 단계 표시 */}
              <div className="flex items-center justify-center gap-2 border-b border-slate-100 bg-white px-4 py-2.5">
                {[
                  { key: 'select', label: '선택', Icon: ListChecks },
                  { key: 'review', label: '검토', Icon: Eye },
                  { key: 'result', label: '결과', Icon: FileText },
                ].map((s, idx) => (
                  <StepPill
                    key={s.key}
                    label={s.label}
                    Icon={s.Icon}
                    active={stepIndex === idx}
                    done={stepIndex > idx}
                    onClick={() => {
                      // 뒤로 가는 건 자유, 앞으로는 가드
                      if (idx <= stepIndex) setStep(s.key as AnalysisStep);
                    }}
                  />
                ))}
              </div>

              <div className="flex-1 overflow-y-auto">
                {step === 'select' && (
                  <NewsSelectionStep
                    items={selectableContent}
                    loading={newsLoading || videosLoading}
                    selectedKeys={selectedKeys}
                    onToggle={toggleKey}
                    onClear={clearSelection}
                    onNext={goToReview}
                  />
                )}
                {step === 'review' && (
                  <ReviewStep
                    items={selectedContent}
                    presets={presets}
                    perspectivePreset={perspectivePreset}
                    onPerspectivePresetChange={setPerspectivePreset}
                    perspectiveCustom={perspectiveCustom}
                    onPerspectiveCustomChange={setPerspectiveCustom}
                    customNote={customNote}
                    onCustomNoteChange={setCustomNote}
                    running={aiAnalysis.running}
                    attempt={aiAnalysis.attempt}
                    failure={failure}
                    onDismissFailure={() => setFailure(null)}
                    onBack={() => setStep('select')}
                    onRun={runAnalysis}
                  />
                )}
                {step === 'result' && result && (
                  <ResultStep
                    result={result}
                    title={analysisTitle}
                    onTitleChange={setAnalysisTitle}
                    perspective={effectivePerspective}
                    newsCount={selectedNewsIds.length}
                    videoCount={selectedVideoIds.length}
                    repaired={resultRepaired}
                    saving={aiAnalysis.saving}
                    onBack={() => setStep('review')}
                    onSave={saveResult}
                    onStartNew={startNew}
                  />
                )}
              </div>
            </div>
          ) : (
            <HistoryStep
              items={aiAnalysis.history}
              loading={aiAnalysis.historyLoading}
              onRefresh={aiAnalysis.refreshHistory}
              onDelete={aiAnalysis.remove}
              onLoadSources={aiAnalysis.loadSourceRows}
              onLoadVideoSources={aiAnalysis.loadVideoSourceRows}
            />
          )}
        </div>
      </aside>
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'border-blue-500 text-blue-600'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StepPill({
  label,
  Icon,
  active,
  done,
  onClick,
}: {
  label: string;
  Icon: typeof ListChecks;
  active: boolean;
  done: boolean;
  onClick: () => void;
}) {
  const tone = active
    ? 'bg-blue-600 text-white'
    : done
    ? 'bg-blue-50 text-blue-700'
    : 'bg-slate-100 text-slate-500';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${tone}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function tryParseJson(s: string): unknown {
  try {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start === -1 || end === -1) return s;
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return s;
  }
}
