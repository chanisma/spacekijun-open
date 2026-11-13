import { shortTagLabel } from '../../constants';
import type { RescueTagDefinition } from '../../types/rescueTag';

interface Props {
  definition: RescueTagDefinition;
}

/**
 * 축약 키워드 + 색상 점 형태의 태그 뱃지.
 * 메인 패널 학생 카드와 위기 관리 현황 테이블에서 공통으로 사용한다.
 * 짧은 라벨은 `shortTagLabel`로 결정하고, 전체 label은 hover title로 노출한다.
 * (좁은 사이드바인 LeftPanel은 의도적으로 점(dot)만 쓰므로 이 컴포넌트를 쓰지 않는다.)
 */
export function TagBadge({ definition }: Props) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-slate-200 bg-white/70 text-slate-700 whitespace-nowrap"
      title={definition.label}
      aria-label={`위기 태그: ${definition.label}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${definition.color}`} aria-hidden />
      {shortTagLabel(definition.key, definition.label)}
    </span>
  );
}
