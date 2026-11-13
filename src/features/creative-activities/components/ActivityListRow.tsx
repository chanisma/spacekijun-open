// ========================================
// 활동 리스트 행 — 게시글 스타일
//
// 카드 그리드를 대체한다(2026-08-27 사용자 결정). 카테고리로 이미 한 번 좁혔으므로
// 여기서는 **훑어 내려가며 고르는 것**이 목적이고, 그때는 세로로 쌓인 행이 카드보다 빠르다.
//
// 한 행이 답하는 것: 무엇을 · 언제 · 누가 주최 · 몇 명이 · 몇 년째.
// ========================================

import { CalendarDays, ChevronRight, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  formatActivityPeriod,
  getAreaGroup,
  getAreaGroupLabel,
  getAreaGroupTone,
  getStatusClass,
  getStatusLabel,
} from '../utils/activityLabels';
import type { ActivityListItem } from '../types';

interface ActivityListRowProps {
  activity: ActivityListItem;
  onClick: (activity: ActivityListItem) => void;
  /** 내가 담당한 활동 */
  isMine?: boolean;
}

export function ActivityListRow({ activity, onClick, isMine }: ActivityListRowProps) {
  const group = getAreaGroup(activity.area);
  const tone = getAreaGroupTone(group);
  const teacherNames = activity.teachers.map((t) => t.name).filter(Boolean);

  return (
    <button
      type="button"
      onClick={() => onClick(activity)}
      className={cn(
        'group flex w-full items-start gap-3 px-4 py-4 text-left transition-colors duration-150 motion-reduce:transition-none sm:gap-4 sm:px-5',
        'hover:bg-slate-50 active:bg-slate-100 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400'
      )}
    >
      {/* 영역 색 — 왼쪽 얇은 기둥. 훑을 때 색만 보고도 영역이 읽힌다 */}
      <span className={cn('mt-1 h-10 w-1 shrink-0 rounded-full', tone.fill)} aria-hidden />

      <div className="min-w-0 flex-1">
        {/* 분류·상태와 제목을 분리해 긴 제목에도 배지가 밀리지 않는다. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn('px-2 py-0.5 text-[11px] font-medium', tone.chip)}>
            {getAreaGroupLabel(group)}
          </Badge>
          {activity.lineage_generation >= 2 && (
            <span
              className="shrink-0 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[11px] font-medium text-fuchsia-700"
              title="이전 활동에서 이어진 활동입니다"
            >
              {activity.lineage_generation}년째
            </span>
          )}
          {isMine && (
            <Badge
              variant="outline"
              className="shrink-0 border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
            >
              담당
            </Badge>
          )}
          {activity.status !== 'done' && (
            <Badge
              variant="outline"
              className={cn('shrink-0 px-2 py-0.5 text-[11px] font-medium', getStatusClass(activity.status))}
            >
              {getStatusLabel(activity.status)}
            </Badge>
          )}
        </div>
        <span className="mt-2 block break-words text-[15px] font-semibold leading-snug text-slate-900 sm:text-base">
          {activity.name}
        </span>

        {/* 내용 한 줄 발췌 — 전문이 아니라 서버가 잘라 준 앞 80자다(`content_excerpt`).
            목록이 전문을 받으면 그게 그대로 전송량이 된다(실측 1,000행 −46.2%). */}
        {activity.content_excerpt && (
          <p className="mt-1 line-clamp-2 break-words text-[13px] leading-relaxed text-slate-500 sm:line-clamp-1">
            {activity.content_excerpt}
          </p>
        )}

        {/* 메타 줄 */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs leading-relaxed text-slate-500">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {activity.academic_year}학년도
            {activity.starts_on && ` · ${formatActivityPeriod(activity.starts_on, activity.ends_on)}`}
          </span>
          {activity.primaryHost && (
            <span
              className="min-w-0 max-w-full truncate"
              title={activity.hosts.map((h) => h.name).join(', ')}
            >
              <span className="mr-1 text-slate-400">주최</span>
              {activity.primaryHost.name}
              {/* 여러 동아리가 함께 한 활동임을 한 눈에 */}
              {activity.hosts.length > 1 && (
                <span className="ml-0.5"> 외 {activity.hosts.length - 1}</span>
              )}
            </span>
          )}
          {teacherNames.length > 0 && (
            <span className="min-w-0 max-w-full truncate" title={teacherNames.join(', ')}>
              <span className="mr-1 text-slate-400">담당</span>
              {teacherNames[0]}
              {teacherNames.length > 1 && ` 외 ${teacherNames.length - 1}`}
            </span>
          )}
          {activity.career_fields.length > 1 && (
            <span className="min-w-0 max-w-full truncate" title={activity.career_fields.join(', ')}>
              {activity.career_fields.join(' · ')}
            </span>
          )}
        </div>
      </div>

      {/* 참여 인원 — 우측 고정. **학생 시점에는 null 이라 아예 그리지 않는다**
          (RLS 상 자기 행만 보여 30명짜리 활동도 "1명"이 된다 — 빈 칸보다 틀린 숫자가 나쁘다). */}
      <span className="mt-0.5 flex shrink-0 flex-col items-end gap-3">
        {activity.participant_count != null && (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium tabular-nums text-slate-600">
            <Users className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">참여 </span>
            {activity.participant_count}명
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-slate-300 transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-slate-600 group-focus-visible:text-slate-600 motion-reduce:transform-none motion-reduce:transition-none" aria-hidden />
      </span>
    </button>
  );
}
