import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Download, SlidersHorizontal } from 'lucide-react';

export type ManagerViewMode = 'per_item' | 'per_request' | 'grouped_by_requester';
export type ManagerSortKey =
  | 'updated_desc'
  | 'updated_asc'
  | 'requester_asc'
  | 'item_count_desc'
  | 'total_desc';

const VIEW_LABEL: Record<ManagerViewMode, string> = {
  per_item: '품목별',
  per_request: '신청건별',
  grouped_by_requester: '신청자별',
};

const SORT_LABEL: Record<ManagerSortKey, string> = {
  updated_desc: '최근 수정순',
  updated_asc: '오래된 순',
  requester_asc: '신청자 이름순',
  item_count_desc: '품목 많은순',
  total_desc: '합계 큰 순',
};

/**
 * «신청 검토» 의 보기 설정을 한 메뉴로 (2026-10-13 화면 개편).
 *
 * 종전엔 보기 3종 버튼 · 정렬 드롭다운 · 쇼핑몰별 묶기 · 전체 열 · CSV 가 **같은 무게로** 표 위에
 * 늘어서 있어, 매니저가 신청 20건을 보려면 설정 줄을 먼저 지나야 했다. 이것들은 한 번 정하면
 * 잘 안 바꾸는 설정이라 메뉴 안으로 넣고, 버튼에는 **지금 보기 방식**만 적는다.
 * 기본값에서 벗어난 설정이 있으면 버튼에 점을 찍는다 — 메뉴에 숨긴 설정 때문에 표가 평소와
 * 다르게 보이는데 이유를 못 찾는 일을 막는다.
 */
export function ViewOptionsMenu({
  viewMode,
  onViewMode,
  sortKey,
  onSortKey,
  groupByShop,
  onGroupByShop,
  canGroupByShop,
  showAllColumns,
  onShowAllColumns,
  hasHiddenColumns,
  onExportCsv,
}: {
  viewMode: ManagerViewMode;
  onViewMode: (v: ManagerViewMode) => void;
  sortKey: ManagerSortKey;
  onSortKey: (v: ManagerSortKey) => void;
  groupByShop: boolean;
  onGroupByShop: (v: boolean) => void;
  /** 품목별 보기이고 링크 열이 있을 때만 */
  canGroupByShop: boolean;
  showAllColumns: boolean;
  onShowAllColumns: (v: boolean) => void;
  hasHiddenColumns: boolean;
  onExportCsv: () => void;
}) {
  const changed =
    sortKey !== 'updated_desc' || (canGroupByShop && groupByShop) || (hasHiddenColumns && showAllColumns);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="relative h-9 shrink-0 gap-1.5 bg-white px-2.5">
          <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-xs">
            <span className="hidden text-slate-500 sm:inline">보기 · </span>
            {VIEW_LABEL[viewMode]}
          </span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
          {changed && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-blue-600"
              aria-label="기본값과 다른 보기 설정이 있습니다"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px] text-slate-500">묶는 단위</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={viewMode} onValueChange={(v) => onViewMode(v as ManagerViewMode)}>
          <DropdownMenuRadioItem value="per_item">품목별 — 한 줄에 품목 하나</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="per_request">신청건별 — 신청서마다 표</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="grouped_by_requester">신청자별 — 사람마다 묶음</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] text-slate-500">정렬</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sortKey} onValueChange={(v) => onSortKey(v as ManagerSortKey)}>
          {(Object.keys(SORT_LABEL) as ManagerSortKey[]).map((k) => (
            <DropdownMenuRadioItem key={k} value={k}>
              {SORT_LABEL[k]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {(canGroupByShop || hasHiddenColumns) && <DropdownMenuSeparator />}
        {canGroupByShop && (
          <DropdownMenuCheckboxItem checked={groupByShop} onCheckedChange={(v) => onGroupByShop(!!v)}>
            쇼핑몰별로 묶기
          </DropdownMenuCheckboxItem>
        )}
        {hasHiddenColumns && (
          <DropdownMenuCheckboxItem checked={showAllColumns} onCheckedChange={(v) => onShowAllColumns(!!v)}>
            선택 입력 열까지 모두 보기
          </DropdownMenuCheckboxItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onExportCsv}>
          <Download className="mr-2 h-3.5 w-3.5" /> 보이는 품목 CSV로 내려받기
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
