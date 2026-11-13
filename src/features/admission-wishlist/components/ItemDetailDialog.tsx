import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { DIALOG_HEADER_CLASS, TitleIconChip } from '@/components/tasks/dialogDesign';
import { GraduationCap } from 'lucide-react';
import { TRACK_LABELS, type WishlistItem } from '../types';
import type { StudentContext } from '../utils/itemInsight';
import { WishlistItemCard } from './WishlistItemCard';
import { AdmissionChangeSection } from './AdmissionChangeSection';
import { UnivInfoSection } from './UnivInfoSection';

interface Props {
  item: WishlistItem | null;
  ctx: StudentContext;
  readOnly: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (id: string) => void;
  deleting?: boolean;
}

/**
 * 지원 항목 상세 — 보드/비교표에서 한 칸을 눌렀을 때 여는 모달.
 *
 * 내용은 기존 `WishlistItemCard` 를 그대로 담는다(반영 내신 근거·수능최저 원문·
 * 종합 평가요소·면접 기출 등). 개요 화면이 새로 생겨도 그 상세 정보를 잃지 않기 위해
 * 카드를 버리지 않고 **여기로 옮겨 담은 것**이다.
 */
export function ItemDetailDialog({ item, ctx, readOnly, onOpenChange, onDelete, deleting }: Props) {
  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base min-w-0">
            <TitleIconChip icon={GraduationCap} tone="blue" />
            <span className="truncate">{item?.university ?? '지원 상세'}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 truncate">
            {item
              ? [item.department, item.admissionName, TRACK_LABELS[item.track]].filter(Boolean).join(' · ')
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto custom-scrollbar p-4 space-y-4">
          {item && (
            <>
              <WishlistItemCard
                item={item}
                readOnly={readOnly}
                naesin={ctx.naesin}
                subjects={ctx.subjects}
                mock={ctx.mock}
                onDelete={onDelete}
                deleting={deleting}
              />

              {/* 대학 기본 정보 — 입학처·연락처·복수지원 원문.
                  비교표 셀은 좁아 요약만 담으므로 원문은 여기에 둔다. */}
              <section>
                <h3 className="text-xs font-bold text-slate-700 mb-2">입학처 · 복수지원</h3>
                <UnivInfoSection university={item.university} />
              </section>

              {/* 전형 변경사항 원문 — 비교표 셀은 좁아 요약만 보여주므로 전문은 여기에 둔다 */}
              <section>
                <h3 className="text-xs font-bold text-slate-700 mb-2">전형 변경사항</h3>
                <AdmissionChangeSection
                  university={item.university}
                  admissionName={item.admissionName}
                />
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
