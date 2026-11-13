/**
 * NEIS 화면 사용 방법 모달 — 앱의 다른 기능과 **같은 껍데기**(`WalkthroughDialog`: 왼쪽 시연 ·
 * 오른쪽 설명)를 쓴다. 다른 점은 씬을 손으로 그리지 않고 수집본·안내에서 만든다는 것뿐이다.
 *
 * 단계 = [화면 찾기] → 안내의 절차(없으면 [화면 구성]) → [주의](자료를 바꾸는 버튼).
 * 안내에 흐름이 여럿이면 머리글 칩으로 고른다 — 기능 안내의 «탭마다 안내를 따로»와 같은 이유
 * (한 모달에 몰아넣으면 지금 하지도 않을 일의 단계를 넘겨 가며 봐야 한다).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WalkthroughDialog, type WalkthroughStep } from '@/components/walkthrough/WalkthroughDialog';
import { Hi } from '@/components/walkthrough/atoms';
import { cn } from '@/lib/utils';
import { loadNeisCapture, loadNeisGuide } from '@/lib/neisKnowledgeLoader';
import { neisViewForInnerTab, type NeisGuide } from '@/lib/neisScreenModel';
import { buildNeisWalkthroughPlan } from '@/lib/neisWalkthrough';
import { NeisFindScene, NeisStepScene } from './NeisGuideScenes';

const SOURCE_TEXT: Record<NeisGuide['source'], string> = {
  observed: '실제 사용으로 확인한 안내',
  manual: '나이스 사용자 설명서 기준 안내',
  'ai-draft': 'AI 초안 — 검토 전 안내',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screenKey: string;
  /** 메뉴목록의 담임 역할(비면 업무분장 담당자 메뉴) */
  roles?: string[];
  /** 할 일에 지정한 화면 안 탭 — 그 탭의 흐름부터 연다 */
  innerTab?: string;
}

export function NeisScreenGuideDialog({ open, onOpenChange, screenKey, roles, innerTab }: Props) {
  const query = useQuery({
    queryKey: ['neis-knowledge', screenKey],
    enabled: open,
    queryFn: async () => {
      const [capture, guide] = await Promise.all([loadNeisCapture(screenKey), loadNeisGuide(screenKey)]);
      return { capture, guide };
    },
    staleTime: Infinity,
  });
  const capture = query.data?.capture ?? null;
  const guide = query.data?.guide ?? null;

  // 처음 고를 흐름 — 할 일이 «화면 안 탭»을 지정했으면 그 탭에서 하는 흐름
  const preferred = useMemo(() => {
    if (!capture || !guide) return 0;
    const viewId = neisViewForInnerTab(capture, innerTab);
    const index = viewId ? guide.flows.findIndex((flow) => flow.view === viewId) : -1;
    return Math.max(0, index);
  }, [capture, guide, innerTab]);
  const [picked, setPicked] = useState<number | null>(null);
  const flowIndex = picked ?? preferred;

  const steps: WalkthroughStep[] = useMemo(() => {
    if (!capture) return [];
    const flowTitle = guide?.flows[flowIndex]?.title;
    return buildNeisWalkthroughPlan({ capture, guide, flowIndex, roles }).map((step) => ({
      id: step.id,
      label: step.label,
      title: step.title,
      body: step.detail ?? '',
      points: step.points,
      scene: step.kind === 'find'
        ? <NeisFindScene capture={capture} viewId={step.viewId} />
        : (
          <NeisStepScene
            capture={capture}
            step={step}
            band={step.band
              ? <Hi>{step.band}</Hi>
              : <>{flowTitle && <span style={{ color: 'var(--fg-muted)' }}>{flowTitle} · </span>}{step.title}</>}
          />
        ),
    }));
  }, [capture, guide, flowIndex, roles]);

  const title = capture ? `나이스 「${capture.name}」 사용 방법` : '나이스 화면 사용 방법';
  const description = [
    '나이스 화면 구조로 다시 그린 시연입니다 — 자료(이름·성적 등)는 담지 않습니다',
    guide ? SOURCE_TEXT[guide.source] : '아직 절차 안내가 없어 화면 구성만 보여 줍니다',
    // 설명서 쪽 — 화면이 설명서와 다르게 보일 때 원문을 찾아갈 수 있게
    guide?.refs?.length ? `설명서 ${guide.refs.map((ref) => `p.${ref.pages}`).join(', ')}` : null,
    capture?.capturedAt ? `${capture.capturedAt.slice(0, 10)} 수집` : null,
  ].filter(Boolean).join(' · ');

  const flowChips = guide && guide.flows.length > 1 ? (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="안내 고르기">
      {guide.flows.map((flow, index) => (
        <button
          key={`${flow.title}-${index}`}
          type="button"
          role="tab"
          aria-selected={index === flowIndex}
          onClick={() => setPicked(index)}
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
            index === flowIndex
              ? 'border-blue-200 bg-blue-600 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          {flow.title}
        </button>
      ))}
    </div>
  ) : undefined;

  if (!open) return null;
  if (!capture || steps.length === 0) {
    // 불러오는 중이거나 수집본이 없을 때도 같은 껍데기 — 모달이 «안 열린 것»처럼 보이지 않게
    return (
      <WalkthroughDialog
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description={query.isLoading ? '화면 구조를 불러오는 중입니다' : '이 화면의 구조를 아직 수집하지 않았습니다'}
        steps={[{ id: 'empty', label: '준비 중', title: query.isLoading ? '불러오는 중…' : '사용 방법을 준비하지 못했습니다', body: '', scene: null }]}
      />
    );
  }
  return (
    <WalkthroughDialog
      key={flowIndex}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      steps={steps}
      headerAction={flowChips}
    />
  );
}
