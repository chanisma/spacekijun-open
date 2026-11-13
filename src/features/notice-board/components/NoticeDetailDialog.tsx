// ========================================
// 공지 상세 모달 — 리스트에서 공지 선택 시 표시
// 작성자 본인/admin에게는 수정·삭제 버튼 노출
// 링크 복사는 이 공지를 볼 수 있는 사람 전원에게 노출 (공유용 딥링크)
// ========================================

import { useEffect, useRef, useState } from 'react';
import { CalendarRange, Check, Link2, Paperclip, Pencil, Trash2, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from '@/lib/toast';
import { useDeleteNotice } from '../hooks/useNotices';
import { cleanupRemovedAttachment } from '../services/noticeFileService';
import { getNoticeStatus, formatPeriod } from '../utils/noticeDates';
import { copyTextToClipboard, noticeShareUrl } from '../utils/noticeShare';
import { STATUS_BADGE } from '../utils/statusBadge';
import { NoticeContentView } from './NoticeContentView';
import type { DepartmentNotice } from '../types';

interface NoticeDetailDialogProps {
  notice: DepartmentNotice | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (notice: DepartmentNotice) => void;
}

export function NoticeDetailDialog({ notice, onOpenChange, onEdit }: NoticeDetailDialogProps) {
  const { user, isAdmin } = useAuth();
  const deleteNotice = useDeleteNotice();

  // 복사 결과는 버튼 라벨이 말한다 — 성공 토스트는 띄우지 않는다(화면이 이미 말한다).
  // 'failed' 일 때만 주소를 화면에 드러내 직접 복사할 수 있게 한다.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  // 아래 `if (!notice) return null` 보다 **위에서** 훅을 전부 호출해야 한다
  // (notice=null 로 닫혀 있을 때도 훅 호출 순서가 같아야 하므로)
  const noticeId = notice?.id ?? null;

  // 다른 공지로 갈아타거나 모달이 닫히면 복사 표시를 초기화 —
  // 그대로 두면 다음에 열었을 때 "링크 복사됨"이 먼저 보인다
  useEffect(() => {
    setCopyState('idle');
  }, [noticeId]);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  if (!notice) return null;

  const canManage = isAdmin || notice.created_by === user?.id;
  const status = getNoticeStatus(notice);
  const statusBadge = STATUS_BADGE[status];
  const shareUrl = noticeShareUrl(notice.id);

  const handleCopyLink = async () => {
    const copied = await copyTextToClipboard(shareUrl);
    clearTimeout(resetTimer.current);
    setCopyState(copied ? 'copied' : 'failed');
    if (copied) {
      resetTimer.current = setTimeout(() => setCopyState('idle'), 2000);
    } else {
      toast.error('링크를 복사하지 못했습니다. 아래 주소를 직접 복사해 주세요.');
    }
  };

  const handleDelete = () => {
    if (!window.confirm(`"${notice.title}" 공지를 삭제하시겠습니까?`)) return;
    deleteNotice.mutate(notice.id, {
      onSuccess: () => {
        // 첨부 정리는 best-effort (Storage·documents; Drive 원본은 보존)
        (notice.attachments ?? []).forEach((a) => void cleanupRemovedAttachment(notice.id, a));
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
              {notice.department}
            </Badge>
            <Badge variant="outline" className={statusBadge.className}>
              {statusBadge.label}
            </Badge>
          </div>
          <DialogTitle className="text-left text-lg leading-snug pt-1">
            {notice.title}
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <CalendarRange className="h-3.5 w-3.5" />
              게시 기간 {formatPeriod(notice)}
            </span>
            {notice.author_name && (
              <span className="flex items-center gap-1">
                <UserRound className="h-3.5 w-3.5" />
                {notice.author_name}
              </span>
            )}
            <span>{new Date(notice.created_at).toLocaleDateString('ko-KR')} 등록</span>
          </div>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/60 p-4">
          {/* 글머리·번호 기호 줄을 목록 형태로 렌더 */}
          <NoticeContentView content={notice.content} />
        </div>

        {/* 첨부 파일 */}
        {(notice.attachments?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
              <Paperclip className="h-3.5 w-3.5" />
              첨부파일 {notice.attachments.length}개
            </p>
            {notice.attachments.map((att) => (
              <button
                key={att.id}
                type="button"
                onClick={() => window.open(att.url, '_blank', 'noopener,noreferrer')}
                className="flex w-full items-center gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-2 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
                  {att.name}
                </span>
                {att.isGoogleDrive ? (
                  <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">
                    Drive
                  </span>
                ) : att.size > 0 ? (
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {att.size >= 1024 * 1024
                      ? `${(att.size / 1024 / 1024).toFixed(1)}MB`
                      : `${Math.max(1, Math.round(att.size / 1024))}KB`}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}

        {/* 클립보드가 막힌 경우(비보안 컨텍스트·권한 거부)의 최후 수단 */}
        {copyState === 'failed' && (
          <Input
            readOnly
            value={shareUrl}
            aria-label="공지 링크"
            onFocus={(event) => event.currentTarget.select()}
            className="h-8 border-rose-200 bg-rose-50/40 text-xs text-slate-700"
          />
        )}

        <DialogFooter className="justify-between gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            aria-live="polite"
            className={copyState === 'copied' ? 'border-emerald-200 text-emerald-700' : undefined}
          >
            {copyState === 'copied' ? (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            {copyState === 'copied' ? '링크 복사됨' : '링크 복사'}
          </Button>

          {canManage && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(notice)}
                disabled={deleteNotice.isPending}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                수정
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={handleDelete}
                disabled={deleteNotice.isPending}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                삭제
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
