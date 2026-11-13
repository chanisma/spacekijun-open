// ========================================
// 공지 작성/수정 모달
// 부서·제목·내용·게시 기간(시작일~종료일) 입력
// ========================================

import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Calendar, CalendarRange, FileOutput, ListTodo, Loader2, Megaphone, Paperclip, ShoppingCart, StickyNote, Users, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CombinedFileUpload } from '@/components/ui/combined-file-upload';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { Switch } from '@/components/ui/switch';
import type { GoogleDriveFileInfo } from '@/components/ui/google-drive/GoogleDrivePicker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth/AuthProvider';
import { useDepartments } from '@/hooks/useDepartments';
import { noticeKeys, useCreateNotice, useUpdateNotice } from '../hooks/useNotices';
import { todayStr } from '../utils/noticeDates';
import { htmlClipboardToText } from '../utils/noticeContent';
import { makeNoticeLinkToken, type NoticeLinkToken, type NoticeLinkType } from '../utils/noticeLinks';
import { NoticeLinkPicker } from './NoticeLinkPicker';
import {
  NOTICE_MAX_FILES,
  NOTICE_MAX_FILE_SIZE,
  cleanupRemovedAttachment,
  registerNoticeDriveFile,
  registerNoticeFileToDocuments,
  updateNoticeAttachments,
  uploadNoticeLocalFile,
} from '../services/noticeFileService';
import type { DepartmentNotice, NoticeAttachment } from '../types';
import type { NoticeDraftSeed } from '../utils/noticeDraft';

interface NoticeFormDialogProps {
  initialDraft?: NoticeDraftSeed | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 수정 대상 — null이면 새 공지 작성 */
  editing: DepartmentNotice | null;
  /** 새 공지 등록 직후 호출 (본인 공지 확인 처리용) */
  onCreated?: (notice: DepartmentNotice) => void;
}

/** 종료일 기본값: 시작일 + 14일 */
function defaultEndDate(startDate: string): string {
  const d = new Date(`${startDate}T00:00:00`);
  d.setDate(d.getDate() + 14);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function NoticeFormDialog({ open, onOpenChange, editing, onCreated, initialDraft }: NoticeFormDialogProps) {
  const { profile } = useAuth();
  const { departments } = useDepartments({ source: 'database', category: 'school' });
  const createNotice = useCreateNotice();
  const updateNotice = useUpdateNotice();

  const queryClient = useQueryClient();

  const [department, setDepartment] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(() => defaultEndDate(todayStr()));
  const [linkPickerType, setLinkPickerType] = useState<NoticeLinkType | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // 열람 대상 제한 — 끄면 기존 동작(교직원 전체 공개)
  const [restrictTargets, setRestrictTargets] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);

  // 첨부 파일 상태 (tasks의 CombinedFileUpload 패턴)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [googleDriveFiles, setGoogleDriveFiles] = useState<GoogleDriveFileInfo[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [processingFiles, setProcessingFiles] = useState(false);

  const isEditing = editing !== null;
  const isSaving = createNotice.isPending || updateNotice.isPending || processingFiles;

  const existingAttachments = useMemo<NoticeAttachment[]>(
    () => (editing?.attachments ?? []).filter((a) => !removedAttachmentIds.includes(a.id)),
    [editing, removedAttachmentIds]
  );

  // 열릴 때마다 폼 초기화 (수정이면 기존 값 로드)
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDepartment(editing.department);
      setTitle(editing.title);
      setContent(editing.content);
      setStartDate(editing.start_date);
      setEndDate(editing.end_date);
      // NULL·빈 배열 = 전체 공개
      const existingTargets = editing.target_resource_ids ?? [];
      setRestrictTargets(existingTargets.length > 0);
      setTargets(existingTargets);
    } else {
      const today = todayStr();
      setDepartment('');
      setTitle(initialDraft?.title ?? '');
      setContent(initialDraft?.content ?? '');
      setStartDate(today);
      setEndDate(defaultEndDate(today));
      setRestrictTargets(false);
      setTargets([]);
    }
    setAttachedFiles([]);
    setGoogleDriveFiles([]);
    setRemovedAttachmentIds([]);
    setLinkPickerType(null);
  }, [open, editing, initialDraft]);

  // 수정 시 부서 목록에 없는 부서명(비활성화된 부서 등)도 선택지에 유지
  const departmentOptions = useMemo(() => {
    if (editing && editing.department && !departments.includes(editing.department)) {
      return [editing.department, ...departments];
    }
    return departments;
  }, [departments, editing]);

  /**
   * 웹 등에서 복사한 목록 구조(ul/ol)를 글머리 기호 텍스트로 변환해 붙여넣기.
   * HTML 플레이버에 목록 태그가 있을 때만 개입 — 일반 텍스트나 Word처럼
   * plain text에 이미 • 글리프가 포함된 경우는 기본 붙여넣기로 충분.
   */
  const handleContentPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData('text/html');
    if (!html || !/<(ul|ol|li)[\s>]/i.test(html)) return;

    const converted = htmlClipboardToText(html);
    if (!converted.trim()) return;

    e.preventDefault();
    const el = e.currentTarget;
    // setRangeText: 선택 영역 대체 + 커서를 삽입 끝으로 이동한 뒤 state 동기화
    el.setRangeText(converted, el.selectionStart, el.selectionEnd, 'end');
    setContent(el.value);
  };

  /** 링크 픽커에서 선택한 항목을 커서 위치에 토큰으로 삽입 */
  const handleInsertLink = (token: NoticeLinkToken) => {
    const text = makeNoticeLinkToken(token.type, token.id, token.label);
    const el = contentRef.current;
    if (!el) {
      setContent((prev) => (prev ? `${prev} ${text}` : text));
      return;
    }
    el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
    setContent(el.value);
    el.focus();
  };

  /**
   * 첨부 처리 — 공지 저장 후 로컬 파일 업로드·Drive 파일 등록·제거분 정리를 수행하고
   * attachments 배열을 갱신. 파일 단위 부분 실패는 건너뛰고 개수만 알림.
   */
  const processAttachments = async (noticeId: string): Promise<void> => {
    const removed = (editing?.attachments ?? []).filter((a) => removedAttachmentIds.includes(a.id));
    const hasChanges =
      attachedFiles.length > 0 || googleDriveFiles.length > 0 || removed.length > 0;
    if (!hasChanges) return;

    const next: NoticeAttachment[] = [...existingAttachments];
    let failed = 0;

    for (const file of attachedFiles) {
      try {
        const attachment = await uploadNoticeLocalFile(noticeId, file);
        await registerNoticeFileToDocuments(attachment, department, noticeId);
        next.push(attachment);
      } catch (error) {
        console.error('공지 첨부 업로드 실패:', error);
        failed++;
      }
    }

    for (const driveFile of googleDriveFiles) {
      try {
        const attachment = await registerNoticeDriveFile(noticeId, department, driveFile);
        if (attachment) next.push(attachment);
        else failed++;
      } catch (error) {
        console.error('Google Drive 첨부 등록 실패:', error);
        failed++;
      }
    }

    await updateNoticeAttachments(noticeId, next);
    // 제거된 첨부 정리는 best-effort (실패해도 무시)
    removed.forEach((a) => void cleanupRemovedAttachment(noticeId, a));

    if (failed > 0) toast.error(`첨부파일 ${failed}개 처리에 실패했습니다.`);
  };

  const handleSubmit = async () => {
    if (isSaving) return;
    if (!department) {
      toast.error('부서를 선택해주세요.');
      return;
    }
    if (!title.trim()) {
      toast.error('제목을 입력해주세요.');
      return;
    }
    if (!content.trim()) {
      toast.error('내용을 입력해주세요.');
      return;
    }
    if (!startDate || !endDate) {
      toast.error('게시 기간을 입력해주세요.');
      return;
    }
    if (endDate < startDate) {
      toast.error('게시 종료일은 시작일 이후여야 합니다.');
      return;
    }

    if (restrictTargets && targets.length === 0) {
      toast.error('열람 대상을 한 명 이상 선택하거나, 대상 제한을 꺼주세요.');
      return;
    }

    const input = {
      department,
      title: title.trim(),
      content: content.trim(),
      start_date: startDate,
      end_date: endDate,
      // null = 전체 공개. 수정 시에도 항상 값을 실어 보내 "제한 해제"가 반영되게 한다.
      target_resource_ids: restrictTargets ? targets : null,
    };

    try {
      setProcessingFiles(true);
      let noticeId: string;
      if (isEditing && editing) {
        await updateNotice.mutateAsync({ id: editing.id, input });
        noticeId = editing.id;
      } else {
        const created = await createNotice.mutateAsync({ input, authorName: profile?.name ?? null });
        noticeId = created.id;
        onCreated?.(created);
      }

      await processAttachments(noticeId);

      // 첨부 갱신이 mutation invalidate 이후에 일어나므로 한 번 더 무효화
      await queryClient.invalidateQueries({ queryKey: noticeKeys.all });
      onOpenChange(false);
    } catch {
      // 공지 저장 실패 — mutation의 onError 토스트가 이미 표시됨
    } finally {
      setProcessingFiles(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!isSaving) onOpenChange(nextOpen); }}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        onEscapeKeyDown={(event) => { if (isSaving) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (isSaving) event.preventDefault(); }}>
        <DialogHeader className="space-y-0 border-slate-100 px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex items-center gap-3.5 pr-7">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Megaphone className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
                {isEditing ? '공지사항 수정' : '새 공지사항 작성'}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
                부서의 소식을 공지사항과 홈 대시보드에 전달하세요.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            <div className="grid min-w-0 grid-cols-1 gap-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:grid-cols-[1fr_1.5fr] [&>*]:min-w-0">
              {/* 부서 */}
              <div className="space-y-2">
                <Label htmlFor="notice-department" className="flex items-center text-xs font-medium text-slate-600">
                  <Building2 className="mr-2 h-4 w-4" />
                  부서
                </Label>
                <Select value={department} onValueChange={setDepartment} disabled={isSaving}>
                  <SelectTrigger id="notice-department" className="h-10 rounded-xl border-slate-200 bg-white">
                    <SelectValue placeholder="부서를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {departmentOptions.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 게시 기간 */}
              <div className="space-y-2">
                <Label className="flex items-center text-xs font-medium text-slate-600">
                  <CalendarRange className="mr-2 h-4 w-4" />
                  게시 기간
                </Label>
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    type="date"
                    aria-label="게시 시작일"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={isSaving}
                    className="min-w-0 flex-1 rounded-xl border-slate-200 bg-white px-2 text-xs sm:text-sm"
                  />
                  <span className="text-sm text-slate-400">~</span>
                  <Input
                    type="date"
                    aria-label="게시 종료일"
                    min={startDate}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={isSaving}
                    className="min-w-0 flex-1 rounded-xl border-slate-200 bg-white px-2 text-xs sm:text-sm"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  종료일이 지나면 공지와 부서 북마크에서 자동으로 내려갑니다.
                </p>
              </div>
            </div>

            {/* 열람 대상 — 기본은 교직원 전체 공개(기존 동작) */}
            <div className="space-y-3 rounded-2xl border border-slate-200/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <Label className="flex items-center text-sm font-medium text-slate-700">
                  <Users className="mr-2 h-4 w-4" />
                  열람 대상
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {restrictTargets ? '선택한 사람만' : '교직원 전체'}
                  </span>
                </Label>
                <Switch
                  aria-label="열람 대상 제한"
                  checked={restrictTargets}
                  onCheckedChange={setRestrictTargets}
                  disabled={isSaving}
                />
              </div>

              {restrictTargets ? (
                <>
                  <SearchableMultiSelect
                    filterByTeacher
                    enableTagSearch
                    includeTagOptions
                    selectedValues={targets}
                    onSelectionChange={setTargets}
                    placeholder="이름 또는 부서 태그로 검색하세요"
                    searchPlaceholder="예: 김교사, 1학년 담임"
                    emptyText="검색 결과가 없습니다"
                    maxSelectedDisplay={3}
                    disabled={isSaving}
                  />
                  <p className="text-xs leading-relaxed text-slate-500">
                    선택한 사람과 작성자·관리자만 이 공지를 볼 수 있습니다.
                    {targets.length === 0 && (
                      <span className="text-rose-600"> 한 명 이상 선택해 주세요.</span>
                    )}
                  </p>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-slate-500">
                  교사·직원 전체에게 보입니다. 특정 인원에게만 알리려면 위 스위치를 켜세요.
                  (공지사항은 학생에게 노출되지 않습니다)
                </p>
              )}
            </div>

            {/* 제목 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="notice-title" className="text-sm font-medium text-slate-700">제목</Label>
                <span className="text-xs tabular-nums text-slate-400">{title.length}/200</span>
              </div>
              <Input
                id="notice-title"
                className="h-12 rounded-xl border-slate-200 text-base shadow-none"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="공지 제목을 입력하세요"
                maxLength={200}
                disabled={isSaving}
              />
            </div>

            {/* 내용 */}
            <div className="space-y-2">
              <Label htmlFor="notice-content" className="text-sm font-medium text-slate-700">내용</Label>
              <div className="overflow-hidden rounded-xl border border-slate-200 focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-100">
                {/* 링크 삽입 툴바 — 스케줄 일정 / 업무 / 구매 신청 게시글 */}
                <div role="group" aria-label="본문에 링크 삽입" className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-slate-50/70 p-2">
                  <span className="px-1.5 text-xs font-medium text-slate-500">링크 삽입</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 rounded-lg px-2 text-xs text-slate-600 hover:bg-white hover:text-slate-900"
                    onClick={() => setLinkPickerType('schedule')}
                    disabled={isSaving}
                  >
                    <Calendar className="h-3 w-3" />
                    일정
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 rounded-lg px-2 text-xs text-slate-600 hover:bg-white hover:text-slate-900"
                    onClick={() => setLinkPickerType('task')}
                    disabled={isSaving}
                  >
                    <ListTodo className="h-3 w-3" />
                    업무
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 rounded-lg px-2 text-xs text-slate-600 hover:bg-white hover:text-slate-900"
                    onClick={() => setLinkPickerType('purchase')}
                    disabled={isSaving}
                  >
                    <ShoppingCart className="h-3 w-3" />
                    구매글
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 rounded-lg px-2 text-xs text-slate-600 hover:bg-white hover:text-slate-900"
                    onClick={() => setLinkPickerType('collab')}
                    disabled={isSaving}
                  >
                    <StickyNote className="h-3 w-3" />
                    협업보드
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 rounded-lg px-2 text-xs text-slate-600 hover:bg-white hover:text-slate-900"
                    onClick={() => setLinkPickerType('docgen')}
                    disabled={isSaving}
                  >
                    <FileOutput className="h-3 w-3" />
                    문서 생성
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 rounded-lg px-2 text-xs text-slate-600 hover:bg-white hover:text-slate-900"
                    onClick={() => setLinkPickerType('activity')}
                    disabled={isSaving}
                  >
                    <Sparkles className="h-3 w-3" />
                    창의적 체험활동
                  </Button>
                </div>
                <Textarea
                  id="notice-content"
                  ref={contentRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={handleContentPaste}
                  placeholder="공지 내용을 입력하세요"
                  rows={9}
                  disabled={isSaving}
                  className="min-h-52 resize-y rounded-none border-0 px-4 py-3 text-sm leading-7 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                웹·워드 등에서 복사한 목록(글머리 기호·번호)은 붙여넣을 때 구조가 유지되고,
                링크 삽입 버튼으로 다른 메뉴의 항목을 본문에 연결할 수 있습니다.
              </p>
            </div>

            {/* 첨부 파일 — tasks의 로컬 + Google Drive 통합 업로드 재사용 */}
            <div className="space-y-3 border-t border-slate-100 pt-5">
              <Label className="flex items-center text-sm font-medium text-slate-700">
                <Paperclip className="mr-2 h-4 w-4" />
                첨부 파일
                <span className="ml-2 text-xs font-normal text-slate-400">선택</span>
              </Label>
              <CombinedFileUpload
                localFiles={attachedFiles}
                onLocalFilesChange={setAttachedFiles}
                googleDriveFiles={googleDriveFiles}
                onGoogleDriveFilesChange={setGoogleDriveFiles}
                maxFileSize={NOTICE_MAX_FILE_SIZE}
                maxFiles={NOTICE_MAX_FILES}
                showGoogleDrive={true}
                disabled={isSaving}
              />
              {/* 기존 첨부 (수정 시) — X로 제거 표시 */}
              {isEditing && existingAttachments.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">기존 첨부파일</p>
                  {existingAttachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{att.name}</span>
                      {att.isGoogleDrive && (
                        <span className="shrink-0 rounded bg-blue-50 px-1 text-[10px] text-blue-600">Drive</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setRemovedAttachmentIds((prev) => [...prev, att.id])}
                        disabled={isSaving}
                        className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`${att.name} 제거`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>


          </div>

          <DialogFooter className="shrink-0 gap-2 border-slate-100 bg-white px-5 py-4 sm:px-7">
            <Button type="button" variant="outline" className="min-w-20 rounded-xl border-slate-200" onClick={() => onOpenChange(false)} disabled={isSaving}>
              취소
            </Button>
            <Button type="submit" className="min-w-28 rounded-xl bg-slate-900 hover:bg-slate-800" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSaving ? '저장 중…' : isEditing ? '수정 저장' : '공지 등록'}
            </Button>
          </DialogFooter>
        </form>

        {/* 링크 삽입 픽커 (중첩 다이얼로그) */}
        <NoticeLinkPicker
          type={linkPickerType}
          onClose={() => setLinkPickerType(null)}
          onSelect={handleInsertLink}
        />
      </DialogContent>
    </Dialog>
  );
}
