// 사업 만들기·고치기 (2026-11-10) — 카드 없이 직접 등록하거나, 등록된 사업의 이름·종류·부서를 고친다.
// 작년 사업을 고르면 그 산출내역 구성을 가져올 수 있다(계획은 사업 화면의 «작년 참고»에서 골라 가져온다).
import { useEffect, useState } from 'react';
import { FolderPlus, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, TitleIconChip } from '@/components/tasks/dialogDesign';
import type { BudgetKind } from '../model/parseBudgetCard';
import { displayProjectName, normalizeCardName } from '../model/parseBudgetCard';
import { createLine, createProject, fetchLinesForProjects, updateProject } from '../services/budgetService';
import { useBudgetMutation } from '../hooks/useBudget';
import type { BudgetProject } from '../types';

const KIND_OPTIONS: { value: BudgetKind; label: string; hint: string }[] = [
  { value: 'purpose', label: '목적사업', hint: '총액 고정 · 사업 간 이동 불가 · 남으면 반납' },
  { value: 'total', label: '총액배분', hint: '교육청 총액배분 사업' },
  { value: 'basic', label: '기본운영비 등', hint: '학교 기본운영비·부서 예산' },
];

const NONE = '__none__';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  project?: BudgetProject | null; // 있으면 고치기
  /** 작년 사업 후보(가져오기) */
  previousYearProjects?: BudgetProject[];
  onCreated?: (id: string) => void;
}

export function ProjectFormDialog({ open, onOpenChange, year, project, previousYearProjects = [], onCreated }: Props) {
  const editing = !!project;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<BudgetKind>('purpose');
  const [department, setDepartment] = useState('');
  const [note, setNote] = useState('');
  const [fromId, setFromId] = useState<string>(NONE);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? '');
    setKind(project?.kind ?? 'purpose');
    setDepartment(project?.department ?? '');
    setNote(project?.note ?? '');
    setFromId(NONE);
  }, [open, project]);

  const save = useBudgetMutation(async () => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('사업 이름을 적어 주세요');
    if (project) {
      await updateProject(project.id, { name: trimmed, kind, department: department.trim() || null, note: note.trim() || null });
      return project.id;
    }
    const from = previousYearProjects.find((p) => p.id === fromId) ?? null;
    const created = await createProject({
      fiscal_year: year,
      name: trimmed,
      kind,
      department: department.trim() || null,
      note: note.trim() || null,
      card_key: from?.card_key ?? normalizeCardName(trimmed),
      group_name: from?.group_name ?? null,
      rolled_over_from: from?.id ?? null,
    });
    if (from) {
      // 작년 산출내역 구성만 가져온다(금액 0 — 올해 예산은 카드 반영·추경으로 들어온다)
      const lines = await fetchLinesForProjects([from.id]);
      for (const [i, l] of lines.sort((a, b) => a.sort_order - b.sort_order).entries()) {
        await createLine({ project_id: created.id, name: l.name, expense_item: l.expense_item, budget_amount: 0, sort_order: i + 1 });
      }
    }
    return created.id;
  }, { success: () => (editing ? null : '사업을 만들었습니다') });

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2">
            <TitleIconChip icon={FolderPlus} />
            <DialogTitle className="text-base">{editing ? '사업 정보 고치기' : `${year}학년도 사업 만들기`}</DialogTitle>
          </div>
          <DialogDescription className="pt-1 text-xs">
            {editing ? '이름·종류·부서·메모를 고칩니다.' : '보통은 사업관리카드를 올리면 사업이 만들어집니다. 카드 없이 먼저 계획을 세울 때 직접 만드세요.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-4 py-4 sm:px-6">
          <div className="space-y-1.5">
            <Label htmlFor="bp-name">사업 이름</Label>
            <Input id="bp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: [목적]AI 중점학교 운영비" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>종류</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {KIND_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setKind(o.value)}
                  aria-pressed={kind === o.value}
                  className={`min-h-[44px] rounded-lg border px-3 py-2 text-left transition ${kind === o.value ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <span className="block text-sm font-medium text-slate-800">{o.label}</span>
                  <span className="block text-[11px] leading-snug text-slate-500">{o.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-dept">부서 (선택)</Label>
            <Input id="bp-dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="예: 정보부" maxLength={100} />
          </div>
          {!editing && previousYearProjects.length > 0 && (
            <div className="space-y-1.5">
              <Label>작년 사업에서 이어서 (선택)</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>새로 시작</SelectItem>
                  {previousYearProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.fiscal_year} · {displayProjectName(p.name)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">산출내역 구성만 가져옵니다(금액 0). 작년 계획은 사업 화면 «작년 참고»에서 골라 가져옵니다.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="bp-note">메모 (선택)</Label>
            <Textarea id="bp-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="교부 공문 번호, 사용 조건 등" maxLength={2000} />
          </div>
        </div>
        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`} onClick={() => onOpenChange(false)} disabled={save.isPending}>취소</Button>
          <Button
            className="h-8 gap-1.5 bg-blue-600 px-3 text-xs hover:bg-blue-700"
            disabled={save.isPending || !name.trim()}
            onClick={() => save.mutate(undefined, {
              onSuccess: (id) => { onOpenChange(false); if (!editing) onCreated?.(id); },
            })}
          >
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editing ? '저장' : '만들기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
