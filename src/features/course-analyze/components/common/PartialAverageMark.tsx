/**
 * 부분 평균 표식
 *
 * 이 화면들의 평균은 대부분 "성적이 있는 사람/과목"만으로 계산된다. 그런데 옆에는
 * 수강 인원·과목 수처럼 **더 큰 모집단**이 함께 적혀 있어서, 표식이 없으면 독자는
 * 그 큰 수를 평균의 분모로 읽는다(예: `24명` 옆의 `평균 2.10등급`이 실제로는 18명 평균).
 *
 * 그래서 분모가 실제로 줄어든 경우에만 숫자 옆에 작은 표식을 붙이고, 몇 개 중 몇 개로
 * 계산했는지를 툴팁에 적는다. **분모가 온전하면 아무것도 렌더하지 않는다** — 항상 붙는
 * 표식은 곧 배경이 되어 읽히지 않는다.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import {
  isPartialAverage,
  partialAverageTitle,
  type PartialAverageScope,
} from '../../utils/gradeFormat';

export interface PartialAverageMarkProps extends PartialAverageScope {
  className?: string;
}

export function PartialScopeMark({
  title,
  className,
}: {
  /** 무엇이 빠졌는지 설명하는 한 문장 */
  title: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'ml-1 inline-flex items-center rounded px-1 py-px align-middle',
        'bg-amber-50 text-amber-700 border border-amber-200/70',
        'font-sans text-[10px] font-bold leading-none tracking-tight cursor-help',
        className,
      )}
      title={title}
    >
      부분
    </span>
  );
}

export function PartialAverageMark({
  covered,
  total,
  unit = '명',
  missingLabel = '성적',
  className,
}: PartialAverageMarkProps) {
  // 분모가 온전하면(또는 알 수 없으면) 표식 없음 — 전체 평균이므로 덧붙일 말이 없다.
  if (!isPartialAverage(covered, total)) return null;

  return (
    <PartialScopeMark
      title={partialAverageTitle({ covered, total, unit, missingLabel })}
      className={className}
    />
  );
}
