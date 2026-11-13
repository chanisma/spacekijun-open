/**
 * 작업(ACTION) 노드의 «속» — 아이콘 정사각 + 아래 라벨 (2026-09-24).
 *
 * n8n 의 어휘를 따르되 **아이콘·색은 새로 만들지 않고** 연결된 작업 패널이 이미 쓰는
 * 종류(kind) 어휘를 그대로 쓴다(`KindIcon` 과 같은 표) — 같은 작업이 캔버스와 패널에서
 * 다른 모양이면 어휘가 두 벌이 된다.
 *
 * 색으로 뜻을 말하는 것은 **실행 이력 유무**(에메랄드 점)뿐이다. 유형별로 색을 더 뿌리면
 * 앱 전역의 상태색(완료/진행/대기)과 섞여 카드 스캔이 무너진다.
 *
 * 노드 껍데기(핸들·선택·툴바)는 `WorkflowNode` 가 다른 종류와 **같은 방식으로** 씌운다 —
 * 2026-09-24 에 유도 노드에서 정식 노드로 바뀌면서 별도 node type 을 두지 않게 됐다.
 */
import { ExternalLink, Landmark, Play, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTaskActionDefinition } from '../actionRegistry';
import type { TaskActionType } from '../types';

/**
 * 종류(kind) 어휘는 연결된 작업 패널의 `KindIcon` 과 같다. 다만 동그라미 버튼 안에는
 * **사각 칩을 겹치지 않는다**(48px 원 안에 원·사각을 겹치면 지저분하다) — 칩의 배경색이 하던
 * 일을 아이콘 색이 그대로 맡는다.
 */
const KIND_STYLE = {
  link: { ink: 'text-slate-500', Icon: ExternalLink },
  external: { ink: 'text-indigo-600', Icon: Landmark },
  embed: { ink: 'text-emerald-600', Icon: Wrench },
  runner: { ink: 'text-blue-600', Icon: Play },
} as const;

/**
 * ⚠️ 노드 안에 버튼을 두지 않는다 — 아이콘 칸이 노드의 대부분이라 버튼으로 만들면 그
 * 영역을 잡고 **끌 수가 없다**(`nodrag` 가 필요해진다). 여는 방법은 다른 노드와 같은
 * **더블클릭**이고, 캔버스가 그 처리를 갖는다.
 */
export function ActionNodeBody({
  title,
  actionType,
  step,
  hasRun,
  sourceDeleted,
}: {
  title: string;
  actionType: TaskActionType | undefined;
  /** 같은 할 일 안에서 몇 번째인가 — 작업이 하나뿐이면 없다(1/1 은 정보가 아니다) */
  step?: number;
  hasRun?: boolean;
  /** 원본 작업이 사라졌다 — FK CASCADE 가 지우기 전의 로컬 상태 */
  sourceDeleted?: boolean;
}) {
  const definition = actionType ? getTaskActionDefinition(actionType) : undefined;
  const style = KIND_STYLE[definition?.kind ?? 'runner'];
  const { Icon } = style;
  const tooltip = [
    title,
    definition?.title && definition.title !== title ? definition.title : null,
    hasRun ? '실행 이력 있음' : null,
    sourceDeleted ? '원본 작업이 해제되었습니다' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <div
        title={tooltip}
        className={cn(
          'relative flex h-full w-full items-center justify-center rounded-full border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition-all',
          !sourceDeleted && 'hover:border-blue-300 hover:shadow-[0_6px_16px_rgba(37,99,235,0.18)]',
          sourceDeleted && 'border-dashed border-slate-300 opacity-60'
        )}
      >
        <Icon className={cn('h-5 w-5', style.ink)} />
        {typeof step === 'number' && (
          <span className="absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[9px] font-bold text-white shadow-sm">
            {step}
          </span>
        )}
        {hasRun && (
          <span
            className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500"
            title="실행 이력 있음"
          />
        )}
      </div>
      {/* 라벨은 노드 상자 **밖**이다 — 안에 두면 선택 테두리·연결점이 글자까지 감싼다.
          `pointer-events-none` 이라야 글자 위에서 시작한 드래그가 노드를 잡는다. */}
      <span
        className="pointer-events-none absolute left-1/2 top-full mt-1 line-clamp-2 w-24 -translate-x-1/2 text-center text-[9px] font-medium leading-[1.15] text-slate-600"
        title={title}
      >
        {title}
      </span>
    </>
  );
}
