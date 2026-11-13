/**
 * 후보 카드 하나를 고치는 모달 (2026-09-23).
 *
 * AI 가 뽑은 것을 그대로 업무로 만들지 않고 사람이 다듬을 수 있어야 한다는 요구에서 나왔다.
 * 고칠 수 있는 것은 **제목·설명·유형·기한** 넷이다(사용자 결정).
 *
 * **근거(evidence)와 신뢰도는 고치지 않는다.** 그 둘은 «AI 가 원문의 어디를 보고 이렇게
 * 판단했는가»의 기록이라, 사람이 손대면 카드가 원문을 가리키지 못하게 된다. 대신
 * 모달 아래에 읽기 전용으로 보여 줘서 **무엇을 근거로 고치는지** 옆에 두고 판단하게 한다.
 *
 * 중첩 모달 규약(`docs/nested-modal-pitfalls.md`):
 *   · 이 모달을 열 때 바깥(문서 분석 모달)을 **닫지 않는다** — 겹쳐 띄우기다.
 *   · `container` 를 넘기지 않는다(body 포털). 넘기면 바깥 모달 가운데에 뜬다.
 *   · 안쪽 Select 는 `DialogContent` 가 알아서 자기 안으로 포털한다(`usePortalContainer`).
 */
import { useEffect, useState } from 'react';
import { CalendarDays, FileText, Quote, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import {
  candidateEditDraft,
  deriveCandidateDueDate,
  editedFields,
  toCandidateEdit,
  type CandidateEditDraft,
} from '../analysis/candidateEdits';
import type {
  DocumentCandidate,
  DocumentCandidateEdit,
  DocumentCandidateType,
} from '../types';

const TYPE_OPTIONS: Array<{ value: DocumentCandidateType; label: string; hint: string }> = [
  { value: 'event', label: '일정', hint: '날짜가 정해진 행사·활동' },
  { value: 'task', label: '업무', hint: '담당자가 수행할 일' },
  { value: 'submission', label: '제출', hint: '무언가를 내야 하는 것' },
  { value: 'approval', label: '승인·심의', hint: '결재·심의를 거치는 것' },
  { value: 'constraint', label: '제약', hint: '지켜야 할 조건·금지' },
  { value: 'information', label: '참고', hint: '알아 두기만 하면 되는 것' },
];

/** 초안에 실제로 할 일로 들어가는 유형. 화면이 그 결과를 미리 말해 준다. */
const TASK_TYPES = new Set<DocumentCandidateType>(['event', 'task', 'submission', 'approval']);

interface CandidateEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** AI 원본. 되돌리기·«수정됨» 판정의 기준이다. */
  candidate: DocumentCandidate | null;
  edit: DocumentCandidateEdit | undefined;
  /** `null` = 원본으로 되돌리기. */
  onSave: (localId: string, edit: DocumentCandidateEdit | null) => void;
}

export function CandidateEditDialog({
  open,
  onOpenChange,
  candidate,
  edit,
  onSave,
}: CandidateEditDialogProps) {
  const [draft, setDraft] = useState<CandidateEditDraft | null>(null);

  // 모달이 열릴 때마다 지금 값으로 다시 채운다 — 이전 카드의 입력이 남으면 엉뚱한
  // 후보를 고치게 된다.
  useEffect(() => {
    if (!open || !candidate) return;
    setDraft(candidateEditDraft(candidate, edit));
  }, [open, candidate, edit]);

  if (!candidate || !draft) return null;

  const aiDueDate = deriveCandidateDueDate(candidate);
  const changed = editedFields(candidate, edit);
  const titleEmpty = !draft.title.trim();

  const patch = (next: Partial<CandidateEditDraft>) =>
    setDraft((current) => (current ? { ...current, ...next } : current));

  const save = () => {
    if (titleEmpty) return;
    onSave(candidate.localId, toCandidateEdit(candidate, draft));
    onOpenChange(false);
  };

  const revert = () => {
    onSave(candidate.localId, null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-lg gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TitleIconChip icon={FileText} tone="indigo" />
            후보 수정
          </DialogTitle>
          <DialogDescription>
            AI가 뽑은 내용을 다듬습니다. 원문 근거와 신뢰도는 기록이므로 바뀌지 않습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-1.5">
            <Label htmlFor="candidate-title">제목</Label>
            <Input
              id="candidate-title"
              value={draft.title}
              maxLength={200}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="업무 초안에 들어갈 제목"
            />
            {titleEmpty && (
              <p className="text-xs text-rose-600">제목은 비워 둘 수 없습니다.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="candidate-description">설명</Label>
            <Textarea
              id="candidate-description"
              value={draft.description}
              rows={4}
              maxLength={2000}
              className="leading-relaxed"
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="무엇을 해야 하는지"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="candidate-type">유형</Label>
              <Select
                value={draft.type}
                onValueChange={(value) => patch({ type: value as DocumentCandidateType })}
              >
                <SelectTrigger id="candidate-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="font-medium">{option.label}</span>
                      <span className="ml-2 text-xs text-slate-400">{option.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* 유형은 «초안에 할 일로 들어가는가»를 가른다. 고르고 나서 알게 되면 늦다. */}
              <p className="text-xs text-slate-500">
                {TASK_TYPES.has(draft.type)
                  ? '선택하면 업무 초안에 할 일로 들어갑니다.'
                  : '할 일로 만들어지지 않고 업무 설명에만 참고로 남습니다.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="candidate-due">기한</Label>
              <Input
                id="candidate-due"
                type="date"
                value={draft.dueDate ?? ''}
                onChange={(e) => patch({ dueDate: e.target.value || null })}
              />
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                {aiDueDate ? `AI가 읽은 기한 ${aiDueDate}` : 'AI는 확정 기한을 찾지 못했습니다'}
                {draft.dueDate && (
                  <button
                    type="button"
                    className="text-slate-500 underline underline-offset-2 hover:text-slate-700"
                    onClick={() => patch({ dueDate: null })}
                  >
                    기한 없음으로
                  </button>
                )}
              </p>
            </div>
          </div>

          {/* 무엇을 근거로 고치는지 옆에 둔다 — 읽기 전용이다. */}
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <SectionLabel icon={Quote}>원문 근거</SectionLabel>
            {candidate.evidence.map((evidence, index) => (
              <p key={`${evidence.blockId}-${index}`} className="min-w-0 text-xs text-muted-foreground">
                <span className="font-mono text-foreground">{evidence.blockId}</span>
                {evidence.page ? ` · ${evidence.page}쪽` : ''} — “{evidence.quote}”
              </p>
            ))}
            {candidate.dates.length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                문서에 적힌 표현: {candidate.dates.map((date) => date.raw).join(' · ')}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          {changed.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS} sm:mr-auto`}
              onClick={revert}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              원본으로 되돌리기
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            className="h-8 gap-1.5 bg-blue-600 px-3 text-xs text-white hover:bg-blue-700"
            disabled={titleEmpty}
            onClick={save}
          >
            <Save className="h-3.5 w-3.5" />
            수정 저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
