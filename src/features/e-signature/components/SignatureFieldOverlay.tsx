/**
 * 페이지 위에 그려지는 서명 칸.
 *
 * **모든 위치·크기를 `%` 로만 준다** — 페이지 렌더 폭은 화면에 따라 매번 달라지는데,
 * 저장된 좌표는 정규화(0~1)라 백분율이 곧 그 값이다. 픽셀로 환산하면 리사이즈될 때마다
 * 어긋난다.
 *
 * 서명자마다 색이 다른 이유: 칸이 여럿일 때 "누구 자리인가"가 한눈에 읽혀야 한다.
 * 색은 이름 해시로 **결정론적**으로 고른다(같은 사람은 늘 같은 색 — 창체 분야 색과 같은 방식).
 */
import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PageBoxPlacement } from '../lib/signatureField';
import { signerColor } from '../lib/signerColor';

export interface FieldMark {
  key: string;
  placement: PageBoxPlacement;
  signerName: string;
  /** 이미 서명된 칸인가 — 서명 화면에서 진행 상황을 보여 준다 */
  signed?: boolean;
  /** 지금 강조할 칸(내 차례) */
  highlight?: boolean;
}

interface Props {
  page: number;
  marks: FieldMark[];
  onRemove?: (key: string) => void;
  /** 칸 안에 그릴 것(완료된 서명 미리보기 등) */
  renderInside?: (mark: FieldMark) => React.ReactNode;
}

export const SignatureFieldOverlay: React.FC<Props> = ({ page, marks, onRemove, renderInside }) => {
  const here = marks.filter((m) => m.placement.page === page);
  if (here.length === 0) return null;

  return (
    <>
      {here.map((mark) => {
        const color = signerColor(mark.signerName);
        return (
          <div
            key={mark.key}
            className={cn(
              'absolute rounded-[3px] border-2 transition-shadow',
              mark.highlight && 'ring-2 ring-offset-1 ring-blue-400 shadow-lg',
            )}
            style={{
              left: `${mark.placement.x * 100}%`,
              top: `${mark.placement.y * 100}%`,
              width: `${mark.placement.w * 100}%`,
              height: `${mark.placement.h * 100}%`,
              borderColor: color,
              // 서명이 들어가면 배경을 비운다 — 색 판이 서명을 가리면 안 된다
              backgroundColor: mark.signed ? 'transparent' : `${color}1a`,
              borderStyle: mark.signed ? 'solid' : 'dashed',
            }}
          >
            {renderInside?.(mark)}

            {/* 이름표 — 칸이 작아도 읽히도록 칸 위에 띄운다 */}
            {!mark.signed && (
              <span
                className="absolute -top-[18px] left-0 whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: color }}
              >
                {mark.signerName}
              </span>
            )}

            {onRemove && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(mark.key); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 text-slate-400 shadow ring-1 ring-slate-200 hover:text-rose-500"
                aria-label={`${mark.signerName} 서명 칸 삭제`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </>
  );
};

export default SignatureFieldOverlay;
