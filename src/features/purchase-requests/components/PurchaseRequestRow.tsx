import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Archive,
  ArchiveRestore,
  Copy,
  Edit,
  FileCheck2,
  MoreVertical,
  Trash2,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PurchaseRequestPageWithRelations } from '../types';
import { PeriodBadge, formatPeriodRange } from './PeriodBadge';

interface PurchaseRequestRowProps {
  page: PurchaseRequestPageWithRelations;
  index: number;
  isManager: boolean;
  /** 새 글을 만들 수 있는 사람 — 복사는 **남의 글도** 된다(이미 보이는 내용만 가져온다) */
  canCopy: boolean;
  onEdit: () => void;
  /** 이 글을 원본으로 새 글 작성 모달을 연다 */
  onCopy: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function PurchaseRequestRow({
  page,
  index,
  isManager,
  canCopy,
  onEdit,
  onCopy,
  onArchive,
  onDelete,
}: PurchaseRequestRowProps) {
  const navigate = useNavigate();
  const collaboratorCount = page.collaborators?.length || 0;
  const targetText = (page.target_roles || [])
    .map((r) => (r === 'student' ? '학생' : r === 'teacher' ? '교사' : r))
    .join('·');

  const go = () => navigate(`/purchase-requests/${page.id}`);

  return (
    <tr
      className={`group border-b border-slate-100 hover:bg-emerald-50/40 transition-colors cursor-pointer ${
        page.is_archived ? 'bg-slate-50/60 text-slate-500' : ''
      }`}
      onClick={go}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') go();
      }}
    >
      <td className="px-3 py-2.5 text-center text-xs text-slate-500 w-12 hidden sm:table-cell">
        {index}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-800 group-hover:text-emerald-700 truncate">
            {page.title}
          </span>
          <PeriodBadge
            periodStart={page.period_start}
            periodEnd={page.period_end}
            archived={page.is_archived}
          />
          {!isManager && (page.my_request_ids?.length || 0) > 0 && (
            <Badge variant="secondary" className="bg-blue-50 text-blue-700 text-[10px]">
              신청 {page.my_request_ids!.length}건
            </Badge>
          )}
          {collaboratorCount > 0 && (
            <Badge
              variant="secondary"
              className="bg-purple-50 text-purple-700 text-[10px] gap-1"
            >
              <Users className="h-3 w-3" />+{collaboratorCount}
            </Badge>
          )}
        </div>
        {page.description && (
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{page.description}</p>
        )}
        {/* 모바일에서만 추가 메타 표시 */}
        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 sm:hidden flex-wrap">
          <span>{page.creator?.name || '—'}</span>
          <span className="text-slate-300">·</span>
          <span>{formatPeriodRange(page.period_start, page.period_end)}</span>
          <span className="text-slate-300">·</span>
          <span>대상 {targetText}</span>
        </div>
      </td>

      <td className="px-3 py-2.5 text-sm text-slate-700 whitespace-nowrap hidden md:table-cell">
        {page.creator?.name || '—'}
      </td>

      <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap hidden lg:table-cell">
        대상 {targetText}
      </td>

      <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap hidden md:table-cell">
        {formatPeriodRange(page.period_start, page.period_end)}
      </td>

      <td className="px-3 py-2.5 text-xs whitespace-nowrap hidden sm:table-cell">
        {isManager ? (
          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 gap-1">
            <FileCheck2 className="h-3 w-3" />
            {page.request_count || 0}건
          </Badge>
        ) : (page.my_request_ids?.length || 0) > 0 ? (
          <Badge variant="secondary" className="bg-blue-50 text-blue-700">
            신청 {page.my_request_ids!.length}건
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-slate-100 text-slate-500">
            미신청
          </Badge>
        )}
      </td>

      <td className="px-2 py-2.5 w-10 text-right">
        {(isManager || canCopy) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-slate-600"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {isManager && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <Edit className="h-4 w-4 mr-2" /> 페이지 수정
                </DropdownMenuItem>
              )}
              {canCopy && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopy();
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" /> 복사해서 새로 만들기
                </DropdownMenuItem>
              )}
              {isManager && (
              <>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive();
                }}
              >
                {page.is_archived ? (
                  <>
                    <ArchiveRestore className="h-4 w-4 mr-2" /> 보관 해제
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4 mr-2" /> 보관함으로
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> 삭제
              </DropdownMenuItem>
              </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </td>
    </tr>
  );
}
