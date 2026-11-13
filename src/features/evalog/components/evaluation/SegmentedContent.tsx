import React from 'react';
import { cn } from '@/lib/utils';
import { buildHighlightSpans } from '../../utils/segmentationHighlight';
import type { ActivitySegmentation } from '../../types/segmentation';

/**
 * 기록 본문을 활동별 하이라이트와 함께 그린다.
 *
 * 일반 화면(비교과 탭)용이라 **모달보다 훨씬 옅게** 칠한다. 여기서 본문은 읽는 것이고
 * 하이라이트는 단서일 뿐이다 — 모달처럼 진하게 칠하면 읽기가 방해된다.
 *
 * 조각을 이어 붙이면 원문과 정확히 같다(`buildHighlightSpans`의 계약). 하이라이트를
 * 켜고 꺼도 본문이 달라지지 않으므로 `whitespace-pre-wrap`을 그대로 유지한다.
 */

/**
 * 활동 색. `ActivitySegmentationDialog`의 팔레트와 **순서가 같아야** 모달과 색이 맞는다.
 * `base`는 평상시, `hover`는 그 활동에 커서가 닿았을 때 — 한 단계만 진해진다.
 */
const TINT = [
  { base: 'bg-sky-50 decoration-sky-300', hover: 'bg-sky-100 decoration-sky-500' },
  { base: 'bg-emerald-50 decoration-emerald-300', hover: 'bg-emerald-100 decoration-emerald-500' },
  { base: 'bg-violet-50 decoration-violet-300', hover: 'bg-violet-100 decoration-violet-500' },
  { base: 'bg-amber-50 decoration-amber-300', hover: 'bg-amber-100 decoration-amber-500' },
  { base: 'bg-rose-50 decoration-rose-300', hover: 'bg-rose-100 decoration-rose-500' },
  { base: 'bg-teal-50 decoration-teal-300', hover: 'bg-teal-100 decoration-teal-500' },
  { base: 'bg-indigo-50 decoration-indigo-300', hover: 'bg-indigo-100 decoration-indigo-500' },
  { base: 'bg-orange-50 decoration-orange-300', hover: 'bg-orange-100 decoration-orange-500' },
];

interface Props {
  content: string;
  segmentation?: ActivitySegmentation | null;
  /** 끄면 원문만 그린다. 하이라이트가 방해될 때를 위한 탈출구. */
  enabled?: boolean;
  className?: string;
  /** 클릭 시 상세(모달)로 보내고 싶을 때 */
  onActivityClick?: (activityIndex: number) => void;
}

const SegmentedContent: React.FC<Props> = ({
  content, segmentation, enabled = true, className, onActivityClick,
}) => {
  const spans = React.useMemo(
    () => (enabled && segmentation ? buildHighlightSpans(content, segmentation) : null),
    [content, segmentation, enabled],
  );

  /**
   * 호버는 **활동 단위**다. 한 활동의 문장이 원문에서 떨어져 있으면 span도 나뉘는데,
   * span마다 호버가 걸리면 같은 활동인데 조각별로 반응해 경계를 잘못 읽게 된다.
   * 그래서 상태를 활동 인덱스로 들고, 그 활동의 모든 조각을 함께 강조한다.
   */
  const [hovered, setHovered] = React.useState<number | null>(null);

  if (!spans) {
    return <div className={cn('whitespace-pre-wrap', className)}>{content}</div>;
  }

  return (
    <div className={cn('whitespace-pre-wrap', className)} onMouseLeave={() => setHovered(null)}>
      {spans.map((s, i) => {
        if (s.activityIndex === null) {
          // 활동에 귀속되지 않은 문장(총평·태도·맥락).
          //
          // **글자색을 바꾸지 않는다.** 흐리게 처리하면 "덜 중요하다"는 판단을 화면에
          // 새기는 셈인데 그건 사실이 아니다 — 총평·태도는 활동이 아닐 뿐 평가에서
          // 오히려 무겁게 읽히는 서술이다. 구분은 **활동 쪽에 배경색이 있다**는 것으로
          // 충분하고, 여기서 필요한 것은 "활동인가"이지 "중요한가"가 아니다.
          return <span key={i}>{s.text}</span>;
        }
        const ai = s.activityIndex;
        const act = segmentation!.activities[ai];
        const tint = TINT[ai % TINT.length];
        const on = hovered === ai;
        return (
          <span
            key={i}
            title={act?.title}
            onMouseEnter={() => setHovered(ai)}
            onClick={onActivityClick ? () => onActivityClick(ai) : undefined}
            className={cn(
              'rounded-sm underline decoration-2 underline-offset-4 transition-colors',
              on ? tint.hover : tint.base,
              onActivityClick && 'cursor-pointer',
            )}
          >
            {s.text}
          </span>
        );
      })}
    </div>
  );
};

export default SegmentedContent;
