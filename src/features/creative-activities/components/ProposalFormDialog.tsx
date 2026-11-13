// ========================================
// 활동 제안 작성 (Phase 3)
//
// 두 입구가 있다:
//   ① 새 활동 제안 — 제안함에서 바로
//   ② **이 활동 이어가기** — 활동 상세에서. 이때 `parentActivity`가 들어오고,
//      수락해 만든 활동의 계보 부모가 그 활동이 된다.
//      **학생 제안이 계보의 마디가 되는 지점**이다.
// ========================================

import { useEffect, useState } from 'react';
import { GitBranch, Lightbulb, Loader2, Send, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  FOOTER_BUTTON_CLASS,
  FOOTER_NEUTRAL_CLASS,
  SectionLabel,
  TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import {
  ACTIVITY_AREA_GROUPS,
  areaForGroup,
  getAreaGroup,
  getAreaGroupLabel,
  type ActivityAreaGroup,
} from '../utils/activityLabels';
import { parseCareerFields } from '../utils/categories';
import type { ActivityProposalInput, ActivityWithContext } from '../types';

interface ProposalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** '이어가기'로 열렸으면 그 활동 — 계보 부모가 된다 */
  parentActivity?: ActivityWithContext | null;
  /** 학생이면 학생코드 (제안자 식별) */
  myStudentCode: string | null;
  onSubmit: (input: ActivityProposalInput) => Promise<void> | void;
  isSubmitting?: boolean;
}

export function ProposalFormDialog({
  open,
  onOpenChange,
  parentActivity,
  myStudentCode,
  onSubmit,
  isSubmitting,
}: ProposalFormDialogProps) {
  const { data: term } = useAcademicTerm();
  const isContinuation = !!parentActivity;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [areaGroup, setAreaGroup] = useState<ActivityAreaGroup>('club');
  const [careerFields, setCareerFields] = useState('');
  const [targetYear, setTargetYear] = useState<string>('');

  // 열릴 때 1회 시딩. 이어가기면 원 활동에서 영역·분야를 물려받는다.
  useEffect(() => {
    if (!open) return;
    if (parentActivity) {
      setTitle(`${parentActivity.name} 이어가기`);
      setAreaGroup(getAreaGroup(parentActivity.area));
      setCareerFields(parentActivity.career_fields.join(', '));
    } else {
      setTitle('');
      setAreaGroup('club');
      setCareerFields('');
    }
    setBody('');
    setTargetYear(String((term?.year ?? new Date().getFullYear()) + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, parentActivity?.id]);

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmit({
      title: title.trim(),
      body: body.trim(),
      area: areaForGroup(areaGroup),
      career_fields: parseCareerFields(careerFields),
      target_year: targetYear ? Number(targetYear) : null,
      parent_activity_id: parentActivity?.id ?? null,
      proposer_student_code: myStudentCode,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2">
            <TitleIconChip icon={isContinuation ? GitBranch : Lightbulb} tone="indigo" />
            <DialogTitle className="text-base">
              {isContinuation ? '이 활동 이어가기' : '활동 제안하기'}
            </DialogTitle>
          </div>
          <DialogDescription className="mt-1 text-xs leading-relaxed text-slate-500">
            {isContinuation ? (
              <>
                <span className="font-medium text-slate-600">{parentActivity!.name}</span>을(를)
                이어받아 발전시키는 제안입니다. 개설되면 그 활동의 다음 연차로 이어집니다.
              </>
            ) : (
              '해보고 싶은 활동을 제안하세요. 다른 학생이 관심을 표시하면 개설 판단의 근거가 됩니다.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(92vh-11rem)] space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          {isContinuation && (
            <div className="flex items-start gap-2 rounded-md border-l-2 border-fuchsia-300 bg-fuchsia-50/60 px-3 py-2">
              <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fuchsia-600" />
              <p className="text-[12px] leading-relaxed text-slate-600">
                이어받을 활동{' '}
                <span className="font-medium text-slate-800">{parentActivity!.name}</span>
                <span className="text-slate-400"> ({parentActivity!.academic_year}학년도)</span>
                {parentActivity!.content && (
                  <span className="mt-1 block line-clamp-2 text-[11.5px] text-slate-500">
                    {parentActivity!.content}
                  </span>
                )}
              </p>
            </div>
          )}

          <section className="space-y-3">
            <SectionLabel icon={Lightbulb}>무엇을 하고 싶은가</SectionLabel>

            <div className="space-y-1.5">
              <Label htmlFor="pr-title" className="text-xs text-slate-600">
                제안 제목 <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="pr-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-9"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pr-body" className="text-xs text-slate-600">
                내용 <span className="text-rose-500">*</span>
              </Label>
              <Textarea
                id="pr-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                className="resize-none text-sm"
              />
              <p className="text-[11px] leading-relaxed text-slate-400">
                {isContinuation
                  ? '무엇을 그대로 두고 무엇을 바꾸고 싶은지 적으면 선생님이 판단하기 쉽습니다.'
                  : '왜 하고 싶은지, 무엇을 해보고 싶은지 적어 주세요.'}
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <SectionLabel icon={GitBranch}>분류</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">영역</Label>
                <Select
                  value={areaGroup}
                  onValueChange={(v) => setAreaGroup(v as ActivityAreaGroup)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_AREA_GROUPS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {getAreaGroupLabel(g)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-year" className="text-xs text-slate-600">
                  희망 학년도
                </Label>
                <Input
                  id="pr-year"
                  type="number"
                  value={targetYear}
                  onChange={(e) => setTargetYear(e.target.value)}
                  className="h-9 tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pr-careers" className="text-xs text-slate-600">
                진로 · 분야 <span className="text-slate-400">(쉼표로 구분해 여러 개)</span>
              </Label>
              <Input
                id="pr-careers"
                value={careerFields}
                onChange={(e) => setCareerFields(e.target.value)}
                className="h-9"
              />
            </div>
          </section>
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button
            type="button"
            variant="ghost"
            className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            <X className="h-3.5 w-3.5" />
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            제안하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
