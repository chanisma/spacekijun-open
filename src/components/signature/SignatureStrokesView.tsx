import React from 'react';
import { cn } from '@/lib/utils';
import { parseSignatureStrokes, strokePaths } from '@/lib/signatureStrokes';

/**
 * 저장된 서명(획 좌표)을 SVG로 그린다 (기능 비종속 공용 부품).
 *
 * 벡터라 화면·인쇄 어디서든 같은 데이터로 선명하게 나온다.
 * DB jsonb는 어떤 모양이든 담을 수 있으므로 항상 `parseSignatureStrokes`를 통과시킨 뒤 그린다.
 */

interface SignatureStrokesViewProps {
  /** DB에서 읽은 값(검증 전 raw 허용) */
  value: unknown;
  className?: string;
  color?: string;
  /**
   * 선 두께. 서명 좌표계(잉크 경계로 잘라낸 박스) 기준이라
   * 박스 폭에 비례해 정해야 크기가 달라져도 굵기 인상이 유지된다.
   */
  strokeWidthRatio?: number;
  title?: string;
}

export const SignatureStrokesView: React.FC<SignatureStrokesViewProps> = ({
  value,
  className,
  color = 'currentColor',
  strokeWidthRatio = 0.006,
  title,
}) => {
  const strokes = parseSignatureStrokes(value);
  if (!strokes) return null;

  const paths = strokePaths(strokes);
  // 좁고 긴 서명과 큼직한 서명의 굵기가 같아 보이도록 긴 변을 기준으로 잡는다.
  const strokeWidth = Math.max(strokes.w, strokes.h) * strokeWidthRatio;

  return (
    <svg
      viewBox={`0 0 ${strokes.w} ${strokes.h}`}
      // 셀 비율이 서명 비율과 달라도 잘리지 않고 가운데 맞춤으로 들어간다.
      preserveAspectRatio="xMidYMid meet"
      className={cn('h-full w-full', className)}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={title ?? '서명'}
    >
      {title ? <title>{title}</title> : null}
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
};
