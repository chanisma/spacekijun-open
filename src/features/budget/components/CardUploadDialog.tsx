// 사업관리카드 올리기 (2026-11-10)
// ① 파일 → ② 카드 안의 사업 고르기(새 사업 / 기존 사업과 짝) → ③ 차이 미리보기 → ④ 반영
// 짝짓기·차이 판정은 순수 함수(parseBudgetCard.ts)가 한다 — 여기는 그리기와 호출만.
import { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Loader2, Upload, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, TitleIconChip } from '@/components/tasks/dialogDesign';
import { toast } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  cardPayload, diffCardWithLines, displayProjectName, normalizeCardName, parseBudgetCard,
  type CardDiff, type CardProject, type ParsedCard,
} from '../model/parseBudgetCard';
import { fiscalYearOf, signedWon, won } from '../model/budgetMath';
import { applyCard, createProject, fetchLinesForProjects } from '../services/budgetService';
import { BUDGET_QUERY_KEY } from '../hooks/useBudget';
import type { BudgetLine, BudgetProjectSummary } from '../types';
import { KIND_LABEL } from '../types';

const NEW = '__new__';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  /** 그 해에 내가 볼 수 있는 사업(담당 아닌 것은 짝 후보에서 뺀다) */
  projects: BudgetProjectSummary[];
  /** 한 사업 화면에서 열면 그 사업만 미리 고른다 */
  focusProjectId?: string | null;
  onDone?: (projectIds: string[]) => void;
}

interface Choice {
  selected: boolean;
  target: string; // project id 또는 NEW
}

export function CardUploadDialog({ open, onOpenChange, year, projects, focusProjectId, onDone }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [card, setCard] = useState<ParsedCard | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);

  const editable = useMemo(() => projects.filter((p) => p.myRole), [projects]);

  const reset = () => {
    setFileName(null);
    setCard(null);
    setChoices({});
    setLines([]);
  };

  const handleFile = async (file: File) => {
    setReading(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as (string | number | null)[][];
      const parsed = parseBudgetCard(rows, file.name);
      setFileName(file.name);
      setCard(parsed);
      // 기본 짝: 같은 열쇠(정규화한 사업 이름)의 내 사업, 없으면 새 사업. 한 사업 화면에서 열었으면 그 사업만 고른다
      const next: Record<string, Choice> = {};
      for (const p of parsed.projects) {
        const match = editable.find((e) => (e.card_key ?? normalizeCardName(e.name)) === p.cardKey);
        const focused = focusProjectId ? match?.id === focusProjectId : true;
        next[p.cardKey] = { selected: focusProjectId ? focused : !!match, target: match?.id ?? NEW };
      }
      // 한 사업 화면에서 열었는데 이름이 바뀌어 짝을 못 찾았으면 아무것도 고르지 않는다 — 사용자가 직접 고른다
      setChoices(next);
      const ids = [...new Set(Object.values(next).map((c) => c.target).filter((t) => t !== NEW))];
      setLines(await fetchLinesForProjects(ids));
    } catch (e) {
      toast.error(e instanceof Error ? `파일을 읽지 못했습니다: ${e.message}` : '파일을 읽지 못했습니다');
    } finally {
      setReading(false);
    }
  };

  const diffs = useMemo(() => {
    const out = new Map<string, CardDiff>();
    if (!card) return out;
    for (const p of card.projects) {
      const c = choices[p.cardKey];
      const existing = c && c.target !== NEW ? lines.filter((l) => l.project_id === c.target) : [];
      out.set(p.cardKey, diffCardWithLines(p.lines, existing));
    }
    return out;
  }, [card, choices, lines]);

  const setTarget = async (key: string, target: string) => {
    setChoices((prev) => ({ ...prev, [key]: { ...prev[key], target, selected: true } }));
    if (target !== NEW && !lines.some((l) => l.project_id === target)) {
      const more = await fetchLinesForProjects([target]);
      setLines((prev) => [...prev, ...more]);
    }
  };

  const selected = card?.projects.filter((p) => choices[p.cardKey]?.selected) ?? [];
  const cardYear = card?.cardDate ? fiscalYearOf(new Date(card.cardDate)) : year;

  const apply = async () => {
    if (!card || !selected.length) return;
    setBusy(true);
    const done: string[] = [];
    try {
      for (const p of selected) {
        const c = choices[p.cardKey];
        let projectId = c.target;
        if (projectId === NEW) {
          const created = await createProject({
            fiscal_year: cardYear, name: p.name, kind: p.kind, group_name: p.groupName, card_key: p.cardKey,
          });
          projectId = created.id;
        }
        const diff = diffs.get(p.cardKey) ?? diffCardWithLines(p.lines, []);
        const matches = c.target === NEW ? diffCardWithLines(p.lines, []).matches : diff.matches;
        await applyCard(projectId, fileName, cardPayload(p, matches, card.cardDate));
        done.push(projectId);
      }
      toast.success(`사업 ${done.length}개에 카드를 반영했습니다`);
      void qc.invalidateQueries({ queryKey: BUDGET_QUERY_KEY });
      onDone?.(done);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(`${done.length ? `${done.length}개 반영 뒤 ` : ''}멈췄습니다: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
      void qc.invalidateQueries({ queryKey: BUDGET_QUERY_KEY });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { if (!o) reset(); onOpenChange(o); } }}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <DialogHeader className={DIALOG_HEADER_CLASS}>
          <div className="flex items-center gap-2">
            <TitleIconChip icon={FileSpreadsheet} tone="emerald" />
            <DialogTitle className="text-base">사업관리카드 올리기</DialogTitle>
          </div>
          <DialogDescription className="pt-1 text-xs">
            에듀파인 «사업관리카드(예산)» 엑셀을 올리면 예산현액·품의·원인행위를 가져옵니다. 계획은 그대로 둡니다.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
          <input
            ref={fileRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
            className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
          >
            {reading ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-slate-400" /> : <Upload className="h-5 w-5 shrink-0 text-slate-400" />}
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-700" title={fileName ?? undefined}>
                {fileName ?? '파일을 놓거나 눌러서 고르기 (.xls · .xlsx)'}
              </span>
              <span className="block text-xs text-slate-500">
                {card ? `사업 ${card.projects.length}개 · 카드 날짜 ${card.cardDate ?? '알 수 없음'} · ${cardYear}학년도` : '에듀파인 › 사업관리카드(예산) › 엑셀 저장'}
              </span>
            </span>
          </button>

          {card?.warnings.map((w) => (
            <p key={w} className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}
            </p>
          ))}

          {card && card.projects.length > 0 && (
            <ul className="space-y-2">
              {card.projects.map((p) => (
                <CardProjectRow
                  key={p.cardKey}
                  project={p}
                  choice={choices[p.cardKey]}
                  diff={diffs.get(p.cardKey)}
                  candidates={editable}
                  onToggle={(v) => setChoices((prev) => ({ ...prev, [p.cardKey]: { ...prev[p.cardKey], selected: v } }))}
                  onTarget={(t) => void setTarget(p.cardKey, t)}
                />
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className={DIALOG_FOOTER_CLASS}>
          <Button variant="ghost" className={`${FOOTER_BUTTON_CLASS} ${FOOTER_NEUTRAL_CLASS}`} onClick={() => onOpenChange(false)} disabled={busy}>
            닫기
          </Button>
          <Button className="h-8 gap-1.5 bg-blue-600 px-3 text-xs hover:bg-blue-700" onClick={() => void apply()} disabled={busy || !selected.length}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {selected.length ? `사업 ${selected.length}개 반영` : '반영할 사업을 고르세요'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CardProjectRow({ project, choice, diff, candidates, onToggle, onTarget }: {
  project: CardProject;
  choice: Choice | undefined;
  diff: CardDiff | undefined;
  candidates: BudgetProjectSummary[];
  onToggle: (v: boolean) => void;
  onTarget: (t: string) => void;
}) {
  const isNew = !choice || choice.target === NEW;
  const counts = diff ? {
    added: diff.matches.filter((m) => m.change === 'new').length,
    changed: diff.matches.filter((m) => m.change === 'changed').length,
    budget: diff.matches.filter((m) => m.diffs.some((d) => d.field === 'budget')).length,
    manual: diff.matches.filter((m) => m.overwritesManual).length,
    missing: diff.missing.length,
  } : null;
  const mismatch = Object.entries(project.mismatch);
  return (
    <li className={`rounded-xl border px-3 py-2.5 ${choice?.selected ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200'}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <Checkbox className="mt-1" checked={!!choice?.selected} onCheckedChange={(v) => onToggle(v === true)} aria-label={`${project.name} 반영`} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">{KIND_LABEL[project.kind]}</Badge>
            <span className="min-w-0 truncate text-sm font-medium text-slate-800" title={project.name}>{displayProjectName(project.name)}</span>
            {project.groupName && <span className="truncate text-[11px] text-slate-400">· {project.groupName}</span>}
          </div>
          <p className="text-xs tabular-nums text-slate-500">
            {project.lines.length}줄 · 예산 {won(project.lineTotal.budget)} · 원인행위 {won(project.lineTotal.wonin)}
          </p>
          {choice?.selected && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={choice.target} onValueChange={onTarget}>
                <SelectTrigger className="h-7 w-auto min-w-[12rem] max-w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW}>새 사업으로 만들기</SelectItem>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>기존: {displayProjectName(c.name)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {counts && !isNew && (
                <span className="text-[11px] text-slate-500">
                  새 줄 {counts.added} · 바뀐 줄 {counts.changed}{counts.budget ? ` (예산현액 ${counts.budget} → 카드 반영 차수)` : ''}
                  {counts.missing ? ` · 카드에 없는 줄 ${counts.missing}` : ''}
                </span>
              )}
            </div>
          )}
          {choice?.selected && counts && counts.manual > 0 && (
            <p className="text-[11px] text-amber-700">손으로 고친 품의·원인행위 {counts.manual}줄이 카드 값으로 바뀝니다</p>
          )}
          {mismatch.length > 0 && (
            <p className="text-[11px] text-amber-700">
              카드의 사업 합계와 산출내역 합이 다릅니다({mismatch.map(([k, v]) => `${{ budget: '예산', pumui: '품의', wonin: '원인행위', jichul: '지출결의', jigeup: '지급' }[k]} ${signedWon(v as number)}`).join(', ')}) — 산출내역 합을 씁니다
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
