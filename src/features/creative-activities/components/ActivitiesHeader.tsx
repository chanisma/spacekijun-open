// ========================================
// 창체 헤더 — 검색 · 범주 · 필터 · 기록 버튼을 한 카드에
//
// 입시 정보(IpsiHubHeader)의 글래스 카드 스타일을 따른다.
// **타이틀은 두지 않는다**(사용자 결정) — 사이드바가 이미 어느 화면인지 말해 주고,
// 그 자리를 검색과 범주에 내주는 편이 첫 화면의 밀도를 높인다.
//
// 영역은 **3그룹**으로 묶여 있다(자율·진로 / 동아리 / 봉사) — utils/activityLabels의
// ActivityAreaGroup 참고. 생기부의 자율·진로가 비슷한 내용이라는 사용자 판단.
// ========================================

import { HelpCircle, Lightbulb, Plus, Search, X } from 'lucide-react';
import { CardHeader } from '@/components/ui/card';
import { ImprovedCard } from '@/components/ui/improved-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  ACTIVITY_AREA_GROUPS,
  getAreaGroupLabel,
  getAreaGroupTone,
  getHostKindLabel,
  type ActivityAreaGroup,
} from '../utils/activityLabels';
import type { ActivityHost } from '../types';

export const ALL_FILTER = '__all__';

// `explore` = 탐구 탐색(GraphRAG). 생기부에서 뽑은 탐구 활동을 주제군으로 훑는 자리라
// 다른 셋(학교가 연 활동)과 데이터가 다르다 — 그래서 검색·필터가 적용되지 않는다.
export type ActivityScope = 'browse' | 'mine' | 'proposals' | 'explore';

interface ActivitiesHeaderProps {
  scope: ActivityScope;
  onScopeChange: (scope: ActivityScope) => void;
  mineLabel: string;
  mineCount: number;
  /** 제안함 배지 — 아직 검토되지 않은(접수·검토 중) 제안 수 */
  pendingProposalCount: number;

  search: string;
  onSearchChange: (v: string) => void;

  areaGroup: ActivityAreaGroup | null;
  onAreaGroupChange: (g: ActivityAreaGroup | null) => void;
  /** 그룹별 활동 수 — 칩에 함께 보여 준다 */
  areaGroupCounts: Map<ActivityAreaGroup, number>;
  totalCount: number;

  year: string;
  onYearChange: (v: string) => void;
  yearOptions: number[];

  hostId: string;
  onHostChange: (v: string) => void;
  hosts: ActivityHost[];

  hasFilter: boolean;
  onClearFilters: () => void;

  canCreate: boolean;
  onCreate: () => void;
  /** 제안하기 — 학생에게는 활동 기록 옆에 나란히 둔다 */
  onPropose: () => void;
  /** 사용 방법 — 지금 보고 있는 세그먼트의 안내를 연다 */
  onGuide: () => void;
}

export function ActivitiesHeader({
  scope,
  onScopeChange,
  mineLabel,
  mineCount,
  pendingProposalCount,
  search,
  onSearchChange,
  areaGroup,
  onAreaGroupChange,
  areaGroupCounts,
  totalCount,
  year,
  onYearChange,
  yearOptions,
  hostId,
  onHostChange,
  hosts,
  hasFilter,
  onClearFilters,
  canCreate,
  onCreate,
  onPropose,
  onGuide,
}: ActivitiesHeaderProps) {
  return (
    <ImprovedCard className="mb-4 border border-white/20 bg-white/70 shadow-sm backdrop-blur-md">
      <CardHeader className="gap-2.5 px-3 pb-3 pt-3 sm:px-4 md:px-6">
        {/* ── 1줄: 범위 세그먼트 · 검색 · 기록 ── */}
        <div className="flex items-center gap-2">
          <div className="flex shrink-0 items-center rounded-lg border border-slate-200 bg-white/60 p-0.5">
            <ScopeButton active={scope === 'browse'} onClick={() => onScopeChange('browse')}>
              전체
            </ScopeButton>
            <ScopeButton active={scope === 'mine'} onClick={() => onScopeChange('mine')}>
              {mineLabel}
              {mineCount > 0 && (
                <span className="ml-1 tabular-nums opacity-60">{mineCount}</span>
              )}
            </ScopeButton>
            <ScopeButton active={scope === 'proposals'} onClick={() => onScopeChange('proposals')}>
              제안함
              {pendingProposalCount > 0 && (
                <span className="ml-1 tabular-nums opacity-60">{pendingProposalCount}</span>
              )}
            </ScopeButton>
            <ScopeButton active={scope === 'explore'} onClick={() => onScopeChange('explore')}>
              탐구 탐색
            </ScopeButton>
          </div>

          <div className={cn('relative min-w-0 flex-1', (scope === 'proposals' || scope === 'explore') && 'invisible')}>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="활동 이름 · 내용 · 키워드 · 장소 · 업체명"
              className="h-8 border-slate-200 bg-white/60 pl-8 text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-300 transition hover:text-slate-600"
                aria-label="검색어 지우기"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* 사용 방법 — 액션 묶음의 **맨 왼쪽**이 늘 이 자리다(그 왼쪽에는 아무 버튼도
                두지 않는다 — 앱 전역 규약). 세그먼트마다 다른 안내가 열리므로 제안함·탐구
                탐색에서도 사라지지 않는다. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onGuide}
              title="사용 방법"
              className="h-8 shrink-0 gap-1.5 px-2 text-xs text-slate-500 hover:text-slate-700"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">사용 방법</span>
            </Button>

            {scope !== 'proposals' && scope !== 'explore' && (
              <>
              {canCreate && (
                <Button
                  size="icon"
                  onClick={onCreate}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition-all hover:bg-blue-700 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-sm"
                  title="활동 기록"
                  aria-label="활동 기록"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    활동 기록
                  </span>
                </Button>
              )}
              {/* 제안하기 — 기록 옆에 나란히. 학생에게는 두 길이 대등하다:
                  이미 한 것은 기록하고, 하고 싶은 것은 제안한다 */}
              <Button
                size="icon"
                variant="outline"
                onClick={onPropose}
                className="flex h-8 w-8 items-center justify-center rounded-lg border-slate-200 bg-white/60 text-slate-600 transition-all hover:border-slate-300 hover:text-slate-900 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-sm"
                title="활동 제안하기"
                aria-label="활동 제안하기"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">제안하기</span>
              </Button>
              </>
            )}
          </div>
        </div>

        {/* ── 2줄: 범주(영역 그룹) 칩 + 연도·주최. 제안함에는 해당 없음 ── */}
        {scope !== 'proposals' && scope !== 'explore' && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-slate-100 pt-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <AreaChip
              active={areaGroup === null}
              onClick={() => onAreaGroupChange(null)}
              label="전체"
              count={totalCount}
            />
            {ACTIVITY_AREA_GROUPS.map((g) => (
              <AreaChip
                key={g}
                group={g}
                active={areaGroup === g}
                onClick={() => onAreaGroupChange(areaGroup === g ? null : g)}
                label={getAreaGroupLabel(g)}
                count={areaGroupCounts.get(g) ?? 0}
              />
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Select value={year} onValueChange={onYearChange}>
              <SelectTrigger className="h-7 w-[6.5rem] border-slate-200 bg-white/60 text-xs">
                <SelectValue placeholder="학년도" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER}>전체 연도</SelectItem>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}학년도
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={hostId} onValueChange={onHostChange}>
              <SelectTrigger className="h-7 w-[8.5rem] border-slate-200 bg-white/60 text-xs">
                <SelectValue placeholder="주최" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ALL_FILTER}>전체 주최</SelectItem>
                {hosts.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    <span className="text-slate-400">[{getHostKindLabel(h.kind)}]</span> {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-1.5 text-xs text-slate-500"
                onClick={onClearFilters}
              >
                <X className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">초기화</span>
              </Button>
            )}
          </div>
        </div>
        )}
      </CardHeader>
    </ImprovedCard>
  );
}

// ----------------------------------------

function ScopeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium transition',
        active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
      )}
    >
      {children}
    </button>
  );
}

function AreaChip({
  group,
  active,
  onClick,
  label,
  count,
}: {
  group?: ActivityAreaGroup;
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  const tone = group ? getAreaGroupTone(group) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition',
        active && tone
          ? tone.chip
          : active
            ? 'border-slate-300 bg-slate-100 text-slate-700'
            : 'border-slate-200 bg-white/60 text-slate-500 hover:border-slate-300 hover:text-slate-700'
      )}
    >
      {tone && <span className={cn('h-1.5 w-1.5 rounded-full', tone.fill)} />}
      {label}
      <span className="tabular-nums opacity-60">{count}</span>
    </button>
  );
}
