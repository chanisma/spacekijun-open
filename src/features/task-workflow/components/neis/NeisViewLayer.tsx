// ========================================
// NEIS 화면 층 — 수집본의 좌표 그대로 나이스 화면 구조를 그린다 (2026-10-05)
//
// 스크린샷이 아니라 **구조에서 다시 그린 그림**이다 — 나이스 화면은 여는 것만으로 사람 이름·
// 아이디가 채워지는데 그림에는 자료가 없어야 하고, 나이스가 바뀌면 재수집만으로 그림이 따라간다.
// 이 층은 확대·이동을 하지 않는다(사용 방법 씬의 카메라가 바깥에서 transform 한다).
// 좌표 = 화면 루트 기준 CSS px − 원점(origin), 세로는 빈 자료 영역을 접은 사상(map)을 거친다.
// ========================================

import { Calendar, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NEIS_SIDE_LABEL_SPACE, NEIS_VALUE_KIND_LABEL, type NeisBox, type NeisCaptureView, type NeisElement } from '@/lib/neisScreenModel';
import { neisTabItemBoxes } from '@/lib/neisWalkthrough';

export type NeisMark = 'focus' | 'lit' | 'write';

interface Props {
  view: NeisCaptureView;
  /** 원점(접기 전 좌표) — 그림이 요소들이 차지한 범위부터 시작하게 */
  origin: [x: number, y: number];
  /** 세로 사상(neisVerticalMap) */
  map: (y: number) => number;
  /** 대상 ID → 표시 */
  marks?: Map<string, NeisMark>;
}

const MARK_CLASS: Record<NeisMark, string> = {
  focus: 'z-20 ring-4 ring-amber-400 ring-offset-1',
  lit: 'z-10 ring-2 ring-blue-500',
  write: 'z-10 ring-4 ring-rose-500 ring-offset-1',
};

export function NeisViewLayer({ view, origin, map, marks }: Props) {
  const [ox, oy] = origin;
  const at = ([x, y, w, h]: NeisBox): React.CSSProperties => ({
    position: 'absolute',
    left: x - ox,
    top: map(y) - map(oy),
    width: w,
    height: map(y + h) - map(y),
  });
  const mark = (id: string) => {
    const m = marks?.get(id);
    return m ? MARK_CLASS[m] : '';
  };

  // 조회 조건 띠 — 수집본에는 띠가 없고 그 안 요소의 region 만 있다
  const inside = view.elements.filter((e) => e.region === 'search');
  const band: NeisBox | null = inside.length
    ? (() => {
      const x1 = Math.min(25, ...inside.map((e) => e.box[0]));
      const y1 = Math.min(...inside.map((e) => e.box[1])) - 12;
      const x2 = Math.max(...inside.map((e) => e.box[0] + e.box[2])) + 12;
      const y2 = Math.max(...inside.map((e) => e.box[1] + e.box[3])) + 12;
      return [x1, y1, x2 - x1, y2 - y1];
    })()
    : null;

  return (
    <div className="font-sans text-[13px] text-slate-700">
      {band && <div className="rounded-md bg-slate-100" style={at(band)} />}
      {view.elements.map((element) => (
        <ElementShape key={element.id} element={element} at={at} mark={mark} map={map} />
      ))}
    </div>
  );
}

function ElementShape({
  element,
  at,
  mark,
  map,
}: {
  element: NeisElement;
  at: (box: NeisBox) => React.CSSProperties;
  mark: (id: string) => string;
  map: (y: number) => number;
}) {
  const style = at(element.box);
  const dim = element.disabled ? 'opacity-45' : '';
  const sideLabel = (text: string, required = false) => (
    <span
      className="absolute truncate text-right text-[13px] text-slate-600"
      style={{ left: (style.left as number) - NEIS_SIDE_LABEL_SPACE, top: style.top, width: NEIS_SIDE_LABEL_SPACE - 8, lineHeight: `${style.height}px` }}
    >
      {required && <span className="mr-0.5 text-rose-500">*</span>}
      {text}
    </span>
  );

  switch (element.kind) {
    case 'field':
      return (
        <>
          {/* 기간의 끝 칸(`등록일~`)은 나이스처럼 `~` 만 — 긴 라벨을 그리면 시작 칸 위에 겹친다 */}
          {element.label.endsWith('~')
            ? <span className="absolute text-center text-[13px] text-slate-500" style={{ left: (style.left as number) - 14, top: style.top, width: 12, lineHeight: `${style.height}px` }}>~</span>
            : sideLabel(element.label, element.required)}
          <div
            className={cn('flex items-center justify-between rounded border border-slate-300 bg-white px-2 text-[12px] text-slate-400', dim, mark(element.id))}
            style={style}
          >
            <span className="truncate">{element.valueKind === 'empty' ? '' : NEIS_VALUE_KIND_LABEL[element.valueKind]}</span>
            {element.control === 'combobox' && <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
            {element.control === 'date' && <Calendar className="h-3.5 w-3.5 shrink-0" />}
          </div>
        </>
      );
    case 'button': {
      const tone = element.variant === 'secondary'
        ? 'bg-slate-700 text-white'
        : element.variant === 'plain'
          ? 'border border-slate-300 bg-white text-slate-600'
          : 'bg-blue-600 text-white';
      const label = /^일자(빼기|더하기)/.test(element.label)
        ? (element.label.includes('빼기') ? '‹' : '›')
        : element.label.replace(/#\d+$/, '');
      return (
        <div
          className={cn('flex items-center justify-center whitespace-nowrap rounded text-[12px] font-medium', tone, dim, mark(element.id))}
          style={style}
        >
          {label}
        </div>
      );
    }
    case 'heading':
      return (
        <div className={cn('flex items-center whitespace-nowrap text-[15px] font-bold text-slate-800', mark(element.id))} style={style}>
          {element.label}
        </div>
      );
    case 'note':
      return (
        <div className={cn('truncate text-[12px] text-slate-500', mark(element.id))} style={style}>
          {element.label}
        </div>
      );
    case 'check':
      return (
        <div className={cn('flex items-center gap-1.5 whitespace-nowrap text-[12px]', dim, mark(element.id))} style={style}>
          <span className={cn('h-3.5 w-3.5 shrink-0 rounded-sm border', element.checked ? 'border-blue-600 bg-blue-600' : 'border-slate-400 bg-white')} />
          {element.label}
        </div>
      );
    case 'radio':
      return (
        <>
          {element.label !== element.options.join('/') && sideLabel(element.label)}
          <div className={cn('flex items-center gap-3 overflow-hidden whitespace-nowrap text-[12px]', dim, mark(element.id))} style={style}>
            {element.options.map((option, index) => (
              <span key={`${option}-${index}`} className="flex items-center gap-1">
                <span className={cn('h-3 w-3 rounded-full border', index === 0 ? 'border-[4px] border-blue-600' : 'border-slate-400')} />
                {option}
              </span>
            ))}
          </div>
        </>
      );
    case 'tabs': {
      // 칸 자리는 포인터와 같은 함수에서 — 포인터가 탭 위에 오는 것이 구성으로 보장된다
      const boxes = neisTabItemBoxes(element);
      const buttons = element.via === 'buttons';
      return (
        <>
          {!buttons && <div className="border-b-2 border-blue-600" style={{ ...style, height: undefined, top: (style.top as number) + (style.height as number) - 2 }} />}
          {element.items.map((item, index) => {
            const active = item === element.active;
            return (
              <span
                key={item}
                className={cn(
                  'flex items-center justify-center overflow-hidden whitespace-nowrap px-1 text-center text-[13px] leading-tight',
                  buttons ? 'rounded-md border' : 'rounded-t border border-b-0',
                  active ? 'border-blue-600 bg-blue-600 font-semibold text-white' : 'border-slate-300 bg-white text-slate-600',
                  mark(`tab:${item}`),
                )}
                style={at(boxes[index])}
              >
                {item}
              </span>
            );
          })}
        </>
      );
    }
    case 'report':
      // 보고서 뷰어 — 나이스의 출력용 문서 영역. 도구 막대는 모든 보고서에 같다(쪽 넘김·확대·저장·인쇄·찾기)
      return (
        <div className={cn('flex flex-col overflow-hidden rounded-sm border border-slate-300 bg-slate-50', mark(element.id))} style={style}>
          <div className="flex h-9 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 text-[13px] text-slate-500">
            <span>« ‹ › »</span><span className="text-slate-300">|</span><span>1 / 1</span>
            <span className="text-slate-300">|</span><span>－ ＋ 100%</span><span className="text-slate-300">|</span>
            <span>저장</span><span>인쇄</span><span>찾기</span>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="flex h-[80%] w-[60%] items-center justify-center border border-slate-200 bg-white text-[12px] text-slate-400 shadow-sm">
              보고서 — 조회하면 출력용 문서가 그려집니다
            </div>
          </div>
        </div>
      );
    case 'grid': {
      const headerBottom = Math.max(element.box[1] + 30, ...element.columns.map((c) => c.box[1] + c.box[3]));
      const headerHeight = map(headerBottom) - map(element.box[1]);
      return (
        <>
          <div className={cn('rounded-sm border border-slate-300 bg-white', mark(element.id))} style={style}>
            <div className="absolute inset-x-0 top-0 bg-slate-50" style={{ height: headerHeight }} />
            {element.selectable && (
              <span className="absolute h-3.5 w-3.5 rounded-sm border border-slate-400 bg-white" style={{ left: 16, top: headerHeight / 2 - 7 }} />
            )}
            <div
              className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-[repeating-linear-gradient(135deg,transparent,transparent_10px,rgb(241_245_249)_10px,rgb(241_245_249)_20px)] text-[12px] text-slate-400"
              style={{ top: headerHeight }}
            >
              자료 영역 — 조회하면 채워집니다
            </div>
          </div>
          {/* 칸 머리글은 그리드 밖 형제로 — 표시 고리가 그리드 테두리에 잘리지 않게 */}
          {element.columns.map((col) => (
            <div
              key={col.id}
              className={cn(
                'flex items-center justify-center border-b border-r border-slate-200 bg-slate-50 px-1 text-center text-[12px] leading-tight text-slate-600',
                mark(col.id),
              )}
              style={at(col.box)}
            >
              {col.label}
            </div>
          ))}
        </>
      );
    }
  }
}
