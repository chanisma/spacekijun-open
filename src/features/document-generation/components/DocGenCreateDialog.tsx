// ========================================
// 문서 생성 방식 만들기/수정 모달
//
// **문서 생성 메뉴의 주 경로는 "한글 양식 파일을 첨부" 다** (2026-09-04 사용자 결정).
// 종전에는 이미 등록된 양식 목록에서 고르는 것만 있어서, 처음 쓰는 사람은
// "내 양식은 어디서 올리지?" 로 막혔다 — 업로드가 러너 안쪽 '양식' 단계에만 있었다.
// 워크플로 캔버스에서는 노드가 이미 정해진 양식을 가리키는 것이 자연스러워 그대로 둔다.
//
// 첨부한 파일로 **여기서 양식(스펙 템플릿)을 만들지는 않는다** — 채울 자리를 확정하는
// 스펙 검수를 거쳐야 하기 때문. 파일은 호출부로 넘겨 러너가 스펙 검수부터 시작한다.
//
// 이름·설명 + 공개 + 양식(첨부 또는 기존 연결, 둘 다 선택)
// 디자인 규약 = dialogDesign.tsx
// ========================================

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileOutput, FileText, FileUp, Loader2, Search, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { listSpecTemplates } from '@/features/task-workflow/services/specTemplateService';
import { getDefaultTemplate } from '@/features/task-workflow/services/taskActionService';
import type { TaskAction } from '@/features/task-workflow/types';
import { useCreateDocGenAction, useUpdateDocGenAction } from '../hooks/useDocGenActions';

export function DocGenCreateDialog({
  open,
  onOpenChange,
  editing,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 값이 있으면 수정 모드(이름·설명만 — 기본 양식은 러너 안 핀 버튼이 담당) */
  editing?: TaskAction | null;
  /** 만든 직후 호출 — `file` 이 있으면 러너를 스펙 검수부터 열라는 뜻 */
  onCreated?: (action: TaskAction, file?: File | null) => void;
}) {
  const isEdit = Boolean(editing);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  /** 첨부한 한글 양식 — 기존 양식 연결과 배타 */
  const [file, setFile] = useState<File | null>(null);
  /** 기존 양식 목록은 접어 둔다 — 주 경로는 파일 첨부다 */
  const [pickerOpen, setPickerOpen] = useState(false);

  const createWork = useCreateDocGenAction();
  const updateWork = useUpdateDocGenAction();
  const isSaving = createWork.isPending || updateWork.isPending;

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['docgen-spec-templates'],
    queryFn: listSpecTemplates,
    enabled: open && !isEdit,
  });

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? '');
    setDescription(editing?.description ?? '');
    setTemplateId(editing ? getDefaultTemplate(editing)?.id ?? null : null);
    setTemplateSearch('');
    setIsPublic(false);
    setFile(null);
    setPickerOpen(false);
  }, [open, editing]);

  const visibleTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => (t.name || '').toLowerCase().includes(q));
  }, [templates, templateSearch]);

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error('생성 방식 이름을 입력하세요.');
      return;
    }
    try {
      if (isEdit && editing) {
        await updateWork.mutateAsync({ actionId: editing.id, title: trimmed, description });
        toast.success('생성 방식을 수정했습니다.');
      } else {
        const template = templateId
          ? templates.find((t) => t.id === templateId)
          : null;
        const action = await createWork.mutateAsync({
          title: trimmed,
          description,
          template: template ? { id: template.id, name: template.name } : null,
          isPublic,
        });
        onCreated?.(action, file);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장에 실패했습니다.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isSaving && onOpenChange(o)}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TitleIconChip icon={FileOutput} tone="indigo" />
            {isEdit ? '생성 방식 수정' : '새 문서 생성 방식'}
          </DialogTitle>
          <DialogDescription className="pt-1 text-xs text-slate-500">
            HWPX 양식의 스펙을 따라 AI 계획 검토를 거쳐 문서를 완성하는 방식입니다.
            만든 방식은 업무 관리의 task나 공지사항에 연결할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-1.5">
            <Label htmlFor="docgen-title" className="text-sm font-medium">
              이름
            </Label>
            <Input
              id="docgen-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 교수학습 및 평가운영 계획서 작성"
              maxLength={120}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="docgen-description" className="text-sm font-medium">
              설명 <span className="font-normal text-slate-400">(선택)</span>
            </Label>
            <Textarea
              id="docgen-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="어떤 문서를 만드는 방식인지 적어두면 목록·공지에서 알아보기 쉽습니다."
              rows={2}
              disabled={isSaving}
              className="resize-y"
            />
          </div>

          {!isEdit && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
              <Checkbox
                checked={isPublic}
                onCheckedChange={(v) => setIsPublic(v === true)}
                disabled={isSaving}
                className="mt-0.5"
              />
              <span className="text-xs">
                <span className="font-medium text-slate-700">다른 교사·직원에게 공개</span>
                <span className="mt-0.5 block text-slate-400">
                  공지 링크를 받은 사람이 이 방식으로 문서를 만들려면 공개가 필요합니다.
                  비공개면 나만 볼 수 있으며, 나중에 목록 카드에서 언제든 바꿀 수 있습니다.
                </span>
              </span>
            </label>
          )}

          {!isEdit && (
            <div className="space-y-2">
              <SectionLabel icon={FileText}>양식</SectionLabel>

              {/* 주 경로 — 내 한글 양식을 그대로 올린다 */}
              {file ? (
                <div className="flex items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50/50 p-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-700" title={file.name}>
                      {file.name}
                    </span>
                    <span className="block text-xs text-slate-400">
                      만들면 바로 채울 자리를 확인하는 화면이 열립니다
                    </span>
                  </span>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                    onClick={() => setFile(null)} disabled={isSaving} title="첨부 취소"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <label
                    htmlFor="docgen-template-file"
                    className={cn(
                      'flex items-center gap-3 rounded-lg border border-dashed border-blue-300 bg-blue-50/40 p-3',
                      isSaving || templateId ? 'opacity-50' : 'cursor-pointer hover:bg-blue-50',
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                      <FileUp className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-blue-700">한글 양식 파일 올리기</span>
                      <span className="block text-xs text-slate-400">
                        HWPX · 채울 자리를 자동으로 찾아 줍니다
                      </span>
                    </span>
                  </label>
                  <Input
                    id="docgen-template-file" type="file" accept=".hwpx" className="hidden"
                    disabled={isSaving || Boolean(templateId)}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      // 첨부와 기존 양식 연결은 배타 — 둘 다면 어느 쪽으로 시작할지 모호해진다
                      if (f) { setFile(f); setTemplateId(null); }
                      e.target.value = '';
                    }}
                  />
                </>
              )}

              {/* 옵션 — 이미 등록된 양식을 그대로 쓰고 싶을 때만 편다 */}
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                disabled={isSaving || Boolean(file)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border border-slate-100 px-2.5 py-2 text-left text-xs transition-colors',
                  file ? 'opacity-40' : 'hover:bg-slate-50',
                )}
              >
                <span className="text-slate-500">
                  또는 <span className="font-medium text-slate-700">이미 등록된 양식에서 고르기</span>
                  {templateId && (
                    <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                      선택됨
                    </span>
                  )}
                </span>
                <span className="text-slate-400">{pickerOpen ? '접기' : '펼치기'}</span>
              </button>

              {pickerOpen && !file && (
              <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="양식 이름 검색"
                  className="pl-8"
                  disabled={isSaving}
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-100">
                <button
                  type="button"
                  onClick={() => setTemplateId(null)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50/60',
                    templateId === null ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600',
                  )}
                >
                  기본 양식 없이 만들기
                </button>
                {templatesLoading ? (
                  <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    양식 불러오는 중
                  </div>
                ) : (
                  visibleTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setTemplateId(template.id)}
                      className={cn(
                        'flex w-full flex-col gap-0.5 border-t border-slate-100 px-3 py-2 text-left transition-colors hover:bg-blue-50/60',
                        templateId === template.id && 'bg-blue-50',
                      )}
                    >
                      <span
                        className={cn(
                          'truncate text-sm',
                          templateId === template.id ? 'font-medium text-blue-700' : 'text-slate-800',
                        )}
                        title={template.name}
                      >
                        {template.name}
                      </span>
                      <span className="text-xs text-slate-400">
                        v{template.version} · {new Date(template.created_at).toLocaleDateString('ko-KR')}
                      </span>
                    </button>
                  ))
                )}
                {!templatesLoading && visibleTemplates.length === 0 && (
                  <p className="border-t border-slate-100 px-3 py-3 text-center text-xs text-slate-400">
                    등록된 스펙 양식이 없습니다. 위에서 한글 양식 파일을 올리세요.
                  </p>
                )}
              </div>
              </>
              )}

              {!file && !templateId && (
                <p className="text-[11px] leading-relaxed text-slate-400">
                  둘 다 비워 두고 만들 수도 있습니다 — 그때는 문서를 만들 때 양식을 고릅니다.
                </p>
              )}
            </div>
          )}
        </div>

        <div className={DIALOG_FOOTER_CLASS}>
          <Button
            variant="ghost"
            className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            취소
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {isEdit ? '수정 저장' : '만들기'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
