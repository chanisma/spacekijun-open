/**
 * 업무 후보 서랍 — 한 행(자리·부서)의 후보를 보고 고치고 지운다 (2026-09-24).
 *
 * 후보는 Work 가 아니다 — 그러나 **2026-10-05 사용자 결정으로 «업무로 만들기»가 생겼다**
 * (2026-09-24 의 «승격 경로를 두지 않는다»를 뒤집음). 그대로 옮기는 기계가 아니라 기존 분석으로
 * 초안을 채우고 사람이 고친 뒤 만든다 — `CandidateWorkDialog` + `src/lib/candidateToWork.ts`.
 * 만든 후보는 지우지 않고 «업무로 만듦»으로 표시한다(지도는 후보 수에서 뺀다).
 *
 * 판정·모양은 전부 `src/lib/workCandidates.ts`.
 */
import { useEffect, useState } from 'react';
import { ChevronDown, Layers, ListOrdered, Loader2, Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CandidateWorkDialog } from '@/components/tasks/CandidateWorkDialog';
import { candidateLinkKey } from '@/lib/candidateToWork';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DIALOG_FOOTER_CLASS, DIALOG_HEADER_CLASS, FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS, TitleIconChip,
} from '@/components/tasks/dialogDesign';
import { cn } from '@/lib/utils';
import {
  candidateBudget,
  candidateDetail,
  candidateDocCount,
  candidateOwner,
  candidateProcedureSummary,
  candidateRenamedFrom,
  candidateSummary,
  candidateSupports,
  candidatePeriod,
  candidateTierCounts,
  isAdminOfficeCandidate,
  budgetItemKey,
  budgetItemsOf,
  candidateIncomingBudgetNotices,
  evidenceTierLabel,
  formatMoney,
  ownerGradeClass,
  ownerMatchOf,
  sortProcedures,
  EVIDENCE_TIERS,
  OWNER_MATCH_LABEL,
  sharedBudgetKeys,
  splitBudgetName,
  groupCandidatesByArea,
  validateCandidateDraft,
  CANDIDATE_NAME_MAX,
  CANDIDATE_NOTE_MAX,
  SCALE_OPTIONS,
  WORK_CANDIDATE_KIND_LABEL,
  WORK_TYPE_OPTIONS,
  type OnceAnalysis,
  type ProcedureKind,
  type WorkCandidate,
  type WorkCandidateDraft,
} from '@/lib/workCandidates';
import {
  useCreateWorkCandidate, useDeleteWorkCandidate, useUpdateWorkCandidate, useWorkCandidateEvidence,
  useWorkCandidateProcedures,
} from '@/hooks/useWorkCandidates';

const emptyDraft = (seatId: string | null, department: string | null): WorkCandidateDraft => ({
  kind: 'work', name: '', area_name: null, seat_id: seatId,
  department, brm: null, work_type: null, scale: null, note: null,
});

const draftOf = (candidate: WorkCandidate): WorkCandidateDraft => ({
  kind: candidate.kind,
  name: candidate.name,
  area_name: candidate.area_name,
  seat_id: candidate.seat_id,
  department: candidate.department,
  brm: candidate.brm,
  work_type: candidate.work_type,
  scale: candidate.scale,
  note: candidate.note,
});

export function WorkCandidateDialog({
  open,
  onOpenChange,
  rowLabel,
  candidates,
  academicYear,
  /** 새 후보를 만들 때 미리 채울 자리·부서 */
  seatId,
  department,
  converted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowLabel: string;
  candidates: WorkCandidate[];
  academicYear: number;
  seatId: string | null;
  department: string | null;
  /** 후보 열쇠 → 이미 만든 업무(`convertedCandidates`) */
  converted?: Map<string, { workId: string; workName: string }>;
}) {
  const navigate = useNavigate();
  const update = useUpdateWorkCandidate();
  const create = useCreateWorkCandidate();
  const remove = useDeleteWorkCandidate();

  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<WorkCandidateDraft>(emptyDraft(seatId, department));
  const [confirmDelete, setConfirmDelete] = useState<WorkCandidate | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [converting, setConverting] = useState<WorkCandidate | null>(null);

  // 행이 바뀌면 열려 있던 편집은 그 행의 것이 아니다
  useEffect(() => {
    if (!open) { setEditing(null); setCreating(false); setConfirmDelete(null); setExpanded(null); setConverting(null); }
  }, [open]);

  const groups = groupCandidatesByArea(candidates);
  // 같은 예산이 둘 이상에 붙은 것 — 합산하면 안 된다는 표시를 줄마다 단다
  const sharedKeys = sharedBudgetKeys(candidates);
  const busy = update.isPending || create.isPending || remove.isPending;

  const startEdit = (candidate: WorkCandidate) => {
    setCreating(false);
    setEditing(candidate.id);
    setDraft(draftOf(candidate));
  };

  const startCreate = () => {
    setEditing(null);
    setCreating(true);
    setDraft(emptyDraft(seatId, department));
  };

  const handleSave = async () => {
    const problem = validateCandidateDraft(draft);
    if (problem) { toast.error(problem); return; }
    try {
      if (creating) await create.mutateAsync({ academicYear, draft });
      else if (editing) await update.mutateAsync({ id: editing, draft });
      setEditing(null);
      setCreating(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장하지 못했습니다.');
    }
  };

  const handleDelete = async (candidate: WorkCandidate) => {
    try {
      await remove.mutateAsync(candidate.id);
      // 지우는 것이 정상 사용이라 토스트를 남긴다 — 되돌릴 방법(시드 재적재)을 함께 말한다
      toast.success(`「${candidate.name}」을(를) 후보에서 지웠습니다`);
      setConfirmDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '지우지 못했습니다.');
    }
  };

  const form = (
    <div className="space-y-2.5 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px]">이름</Label>
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value.slice(0, CANDIDATE_NAME_MAX) }))}
            placeholder="업무 이름"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">영역</Label>
          <Input
            value={draft.area_name ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, area_name: e.target.value }))}
            placeholder="묶음 이름(선택)"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-[11px]">유형</Label>
          <div className="flex flex-wrap gap-1">
            {WORK_TYPE_OPTIONS.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, work_type: d.work_type === type ? null : type }))}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                  draft.work_type === type
                    ? 'border-blue-300 bg-blue-100 text-blue-700'
                    : 'border-slate-200 text-slate-500 hover:border-blue-200',
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">규모</Label>
          <div className="flex flex-wrap gap-1">
            {SCALE_OPTIONS.map((scale) => (
              <button
                key={scale}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, scale: d.scale === scale ? null : scale }))}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                  draft.scale === scale
                    ? 'border-blue-300 bg-blue-100 text-blue-700'
                    : 'border-slate-200 text-slate-500 hover:border-blue-200',
                )}
              >
                {scale}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">단위과제(BRM)</Label>
          <Input
            value={draft.brm ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, brm: e.target.value }))}
            placeholder="에듀파인 단위과제"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]">메모</Label>
        <Textarea
          value={draft.note ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value.slice(0, CANDIDATE_NOTE_MAX) }))}
          placeholder="이 후보를 어떻게 다룰지 — 올릴 것인지, 왜 안 올리는지"
          rows={2}
          className="text-xs"
        />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditing(null); setCreating(false); }}>
          취소
        </Button>
        <Button size="sm" className="h-7 bg-blue-600 text-xs hover:bg-blue-700" disabled={busy} onClick={() => void handleSave()}>
          {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          저장
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] gap-0 overflow-hidden p-0">
          <DialogHeader className={DIALOG_HEADER_CLASS}>
            <DialogTitle className="flex items-center gap-2 text-base">
              <TitleIconChip icon={Layers} />
              {rowLabel}
              <span className="text-slate-400">·</span>
              후보
            </DialogTitle>
            <DialogDescription className="text-xs">
              문서 분석이 말하는 «올라올 수 있는 일» {candidates.length}개 — 시스템에 등록된 업무가 아닙니다.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-6">
            {creating && form}

            {groups.map(({ area, areaCandidate, works }) => (
              <div key={area} className="rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                    {WORK_CANDIDATE_KIND_LABEL.area}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800" title={area}>
                    {area}
                  </p>
                  {areaCandidate && (
                    <RowActions
                      onEdit={() => startEdit(areaCandidate)}
                      onDelete={() => setConfirmDelete(areaCandidate)}
                    />
                  )}
                </div>
                {areaCandidate && editing === areaCandidate.id && <div className="p-3">{form}</div>}

                {works.length === 0 && !areaCandidate && (
                  <p className="px-3 py-2 text-[11px] text-slate-400">업무가 없습니다.</p>
                )}
                <ul className="divide-y divide-slate-50">
                  {works.map((candidate) => (
                    <li key={candidate.id} className="px-3 py-1.5">
                      <div className="flex items-start gap-2">
                        {/*
                          칩은 이름 **아래 줄**에 둔다 (2026-09-28). 이름과 같은 줄이면 칩(사업비·담당·문서·
                          행정실·달)이 폭을 먹어 휴대폰에서 업무 이름이 「계..」로 줄거나 **아예 사라졌다**
                          (스크린샷으로만 드러났다 — scripts/work-candidate-test/run-screenshots.mjs).
                        */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-slate-700" title={candidate.name}>
                            {candidate.name}
                          </p>
                          {(candidateSummary(candidate) || candidate.note) && (
                            <p className="truncate text-[10px] text-slate-400">
                              {candidateSummary(candidate)}
                              {candidate.note && <span className="ml-1 text-slate-500">· {candidate.note}</span>}
                            </p>
                          )}
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            {candidate.budget ? (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700" title="학교회계 세출예산 현액">
                                {formatMoney(candidate.budget)}
                              </span>
                            ) : null}
                            <ProcedureChip candidate={candidate} />
                            <OwnerMatchChip candidate={candidate} />
                            {candidateDocCount(candidate) > 0 && (
                              <span
                                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-600"
                                title="이 업무로 배정된 문서 — 펼치면 문서 목록과 다룬 사람이 나옵니다"
                              >
                                문서 {candidateDocCount(candidate)}
                              </span>
                            )}
                            {isAdminOfficeCandidate(candidate) && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">행정실</span>
                            )}
                            {(() => {
                              const made = converted?.get(candidateLinkKey(candidate));
                              return made ? (
                                <button
                                  type="button"
                                  className="max-w-[14rem] truncate rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                                  title={`이 후보로 만든 업무 «${made.workName}» 열기`}
                                  onClick={() => { onOpenChange(false); navigate({ search: `?work=${made.workId}` }); }}
                                >
                                  업무로 만듦 · {made.workName}
                                </button>
                              ) : null;
                            })()}
                            {candidate.months.length > 0 && (
                              <span className="text-[10px] tabular-nums text-slate-400" title="문서가 오간 달">
                                {candidate.months.join('·')}월
                              </span>
                            )}
                          </div>
                        </div>
                        {/* 상세가 있는 후보만 펼침 — 없는 줄에 셰브론을 두면 눌러도 아무 일이 없다 */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-slate-400 hover:text-blue-600"
                          aria-label={expanded === candidate.id ? '상세 접기' : '상세 보기'}
                          onClick={() => setExpanded(expanded === candidate.id ? null : candidate.id)}
                        >
                          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded === candidate.id && 'rotate-180')} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-slate-400 hover:text-blue-600"
                          aria-label="업무로 만들기"
                          title="이 후보를 바탕으로 업무·할 일 만들기"
                          onClick={() => setConverting(candidate)}
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                        </Button>
                        <RowActions
                          onEdit={() => startEdit(candidate)}
                          onDelete={() => setConfirmDelete(candidate)}
                        />
                      </div>
                      {/*
                        예산이 붙은 후보는 **정확한 항목 이름을 늘 보여 준다** (2026-09-25 사용자 요청).
                        업무 이름이 뭉뚱그려져 있어(「학교급식 운영·무상급식·우유급식」 = 4개 항목)
                        합계만으로는 어느 돈인지 알 수 없다. 펼치지 않아도 보이게 둔다.
                      */}
                      <BudgetItemList candidate={candidate} sharedKeys={sharedKeys} />
                      {expanded === candidate.id && (
                        <div className="pt-1.5">
                          {/* 절차가 먼저 — 사용자 요청 "절차적인 업무가 있는지 우선적으로 파악해서 표시" */}
                          <ProcedurePanel candidate={candidate} />
                          <CandidateDetailPanel candidate={candidate} />
                          <OwnerPanel candidate={candidate} />
                          <EvidenceList candidate={candidate} />
                        </div>
                      )}
                      {editing === candidate.id && <div className="pt-2">{form}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {candidates.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-xs text-slate-400">
                이 자리에 걸린 후보가 없습니다.
              </p>
            )}
          </div>

          <DialogFooter className={DIALOG_FOOTER_CLASS}>
            <span className="mr-auto text-[10px] text-slate-400">
              후보는 업무가 아닙니다 — 고치거나 치우고, 필요하면 업무로 만드세요
            </span>
            <Button
              variant="ghost"
              size="sm"
              className={cn(FOOTER_BUTTON_CLASS, 'text-blue-600 hover:bg-blue-50 hover:text-blue-700')}
              onClick={startCreate}
            >
              <Plus className="h-3.5 w-3.5" />
              후보 추가
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(FOOTER_BUTTON_CLASS, FOOTER_NEUTRAL_CLASS)}
              onClick={() => onOpenChange(false)}
            >
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 겹쳐 띄운다 — 서랍을 닫지 않는다(바꿔치기가 아니다, docs/nested-modal-pitfalls.md) */}
      {converting && (
        <CandidateWorkDialog
          open
          onOpenChange={(v) => { if (!v) setConverting(null); }}
          candidate={converting}
          existing={converted?.get(candidateLinkKey(converting)) ?? null}
        />
      )}

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>후보에서 지울까요?</AlertDialogTitle>
            <AlertDialogDescription>
              「{confirmDelete?.name}」을(를) 목록에서 지웁니다. 시스템에 올라온 업무는 건드리지 않습니다.
              {confirmDelete?.code && ' 공문 분석에서 온 후보라 시드를 다시 넣으면 되돌아옵니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={(e) => {
                // ⚠️ 비동기라 기본 즉시 닫기를 막는다 — 실패하면 확인창이 남아야 한다
                e.preventDefault();
                if (confirmDelete) void handleDelete(confirmDelete);
              }}
            >
              지우기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * 예산 항목 — **정확한 세부항목 이름**으로 갈라 보여 준다 (2026-09-25 사용자 요청).
 *
 * ⚠️ 같은 이름이 두 줄 이상일 수 있다(라이브 9건 — 「교기운영>농구부운영」이 네 줄).
 *    산출내역이 달라 예산서에서 갈라진 것이라 **합치지 않는다**(합치면 예산서와 대조가 안 된다).
 * ⚠️ 「짐작」은 artifact 가 산출내역 낱말로 붙인 것(87개 중 25개)이라 **확정처럼 보이면 안 된다**.
 * ⚠️ 「겹침」은 같은 예산이 다른 업무에도 붙었다는 뜻 — **합산하면 안 된다**는 표시다.
 */
function BudgetItemList({
  candidate, sharedKeys,
}: {
  candidate: WorkCandidate;
  sharedKeys: Set<string>;
}) {
  const items = budgetItemsOf(candidate);
  if (items.length === 0) return null;
  // 우리가 쓴 문서(지출품의 등)는 아래 근거 목록이 보여 주므로 여기는 «들어온 돈»만 남긴다
  const notices = candidateIncomingBudgetNotices(candidate);

  return (
    <div className="mt-1 space-y-1 border-l-2 border-amber-200 pl-2">
      {/*
        **예산 관련 공문 제목** — 이 돈이 어느 사업 것인지는 여기에 있다
        (「학교스포츠클럽·학교체육 사업」 1,305만 → 토요스포츠데이 / 학교체육활성화 공모 /
        스포츠클럽 활동비 / 교육장배 대회).

        ⚠️ **«사업 이름이 특정되지 않습니다» 경고와 형제 업무 소거법을 되살리지 말 것**
           (2026-09-25 사용자 결정). 답은 추론할 것이 아니라 이 목록에 이미 있다 —
           근거·기각 기록은 `src/lib/workCandidates.ts` 의 같은 날짜 주석.
      */}
      {notices.length > 0 && (
        <div className="rounded bg-slate-50 px-1.5 py-1">
          <p className="text-[10px] font-medium text-slate-500">이 돈이 들어온 공문</p>
          <ul className="mt-0.5 space-y-0.5">
            {notices.map((notice, i) => (
              <li key={`${notice.date}-${i}`} className="flex gap-1.5 text-[10px] leading-4">
                <span className="shrink-0 tabular-nums text-slate-400">{notice.date}</span>
                <span className="shrink-0 rounded bg-white px-1 text-slate-500">{notice.kind}</span>
                <span className="min-w-0 flex-1 text-slate-600">{notice.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-0.5">
        {items.map((item, i) => {
          const [name, amount, confirmed] = item;
          const { program, item: leaf } = splitBudgetName(name);
          const shared = sharedKeys.has(budgetItemKey(item));
          return (
            <li key={`${name}-${amount}-${i}`} className="text-[11px]">
              <div className="flex items-center gap-1.5">
                {/* 금액이 먼저다 — 과목은 사업을 못 가르므로 앞세울 값이 아니다 */}
                <span className="shrink-0 font-semibold tabular-nums text-slate-700">
                  {formatMoney(amount)}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-400" title={name}>
                  예산과목 {program && `${program} › `}{leaf}
                </span>
                {!confirmed && (
                  <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-500" title="산출내역 낱말로 짐작해 붙인 값">
                    짐작
                  </span>
                )}
                {shared && (
                  <span className="shrink-0 rounded bg-rose-50 px-1 text-[10px] text-rose-600" title="같은 예산이 다른 업무에도 붙어 있습니다 — 합산하지 마세요">
                    겹침
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * 목록 줄의 절차 칩 — 이 업무를 맡은 사람 중 **절차로 판정된 사람이 있으면** 가장 긴 단계 수를,
 * 전원이 일회성이면 「일회성」을 짧게 (2026-09-29 사용자 요청 "일회성 업무는 간단하게 표시").
 */
function ProcedureChip({ candidate }: { candidate: WorkCandidate }) {
  const summary = candidateProcedureSummary(candidate);
  if (!summary) return null;
  if (summary.procedure > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800"
        title={`절차로 판정된 사람 ${summary.procedure}명 — 가장 긴 절차 ${summary.max_steps}단계`}
      >
        <ListOrdered className="h-3 w-3" />
        절차 {summary.max_steps}단계
      </span>
    );
  }
  if (summary.once > 0 && summary.repeat === 0) {
    return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">일회성</span>;
  }
  return null;
}

const KIND_CHIP: Record<ProcedureKind, string> = {
  절차: 'border border-slate-700 font-semibold text-slate-800',
  반복: 'border border-slate-300 text-slate-600',
  일회성: 'bg-slate-100 text-slate-500',
  참고: 'text-slate-400',
};

/**
 * **절차 — 사람별 검토** (2026-09-29 사용자 요청).
 *
 * "각 사람의 업무를 업무별로 검토하여 절차적인 업무가 있는지 우선적으로 파악해서 표시 ·
 *  먼저 업무 안에서만 파악하고 그 뒤 다른 사람의 업무에서 연관된 것을 찾아 재검토 · 일회성은 간단하게."
 *
 * 그래서 이 패널은 **절차를 먼저·크게**, 반복은 한 줄, 일회성은 이름+한 마디, 참고는 이름만 모은다.
 * 다른 사람이 한 단계(`by`)와 연관 업무(`related`)는 2단계 재검토에서 찾은 것이라 따로 표시한다.
 *
 * ⚠️ 펼칠 때만 읽는다 — 업무 하나에 수십 명분이라 목록 조회에 싣지 않았다.
 */
function ProcedurePanel({ candidate }: { candidate: WorkCandidate }) {
  const summary = candidateProcedureSummary(candidate);
  const { data = [], isLoading, error } = useWorkCandidateProcedures(summary ? candidate.id : null);
  const [openStep, setOpenStep] = useState<string | null>(null);
  if (!summary) return null;

  const entries = sortProcedures(data);
  const main = entries.filter((e) => e.kind === '절차' || e.kind === '반복');
  const once = entries.filter((e) => e.kind === '일회성');
  const reference = entries.filter((e) => e.kind === '참고');

  return (
    <div className="mt-1.5 space-y-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-medium text-slate-600">
        절차 — 사람별 검토
        <span className="ml-1 font-normal text-slate-400">
          · 절차 {summary.procedure} · 반복 {summary.repeat} · 일회성 {summary.once} · 참고 {summary.reference}
          {Boolean(summary.once_promote) && ` · 일회성 중 올릴 만함 ${summary.once_promote}`}
          {Boolean(summary.once_misfiled) && ` · 분류 오류 ${summary.once_misfiled}`}
        </span>
      </p>
      {isLoading && (
        <p className="flex items-center gap-1 text-[10px] text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          검토 결과를 불러오는 중…
        </p>
      )}
      {error && (
        <p className="text-[10px] text-slate-500">
          검토 결과를 불러오지 못했습니다 — {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {main.map((entry) => (
        <div key={`${entry.person}-${entry.kind}`} className="rounded-md bg-slate-50/70 px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded px-1.5 py-0.5 text-[10px]', KIND_CHIP[entry.kind])}>{entry.kind}</span>
            <span className="text-[11px] font-medium text-slate-800">{entry.person}</span>
            {entry.cycle && <span className="text-[10px] text-slate-500">· {entry.cycle}</span>}
          </div>
          <p className="mt-0.5 text-[11px] leading-5 text-slate-600">{entry.summary}</p>
          {entry.steps.length > 0 && (
            <ol className="mt-1 space-y-0.5">
              {entry.steps.map((step, i) => {
                const key = `${entry.person}-${i}`;
                const open = openStep === key;
                const first = step.docs[0]?.date;
                const last = step.docs[step.docs.length - 1]?.date;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => setOpenStep(open ? null : key)}
                      className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] hover:bg-white"
                      aria-expanded={open}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[9px] font-semibold text-white">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-700" title={step.name}>{step.name}</span>
                      {step.by && (
                        <span className="shrink-0 rounded border border-slate-300 bg-white px-1 text-[10px] text-slate-600" title="다른 사람이 한 단계 — 다른 사람의 업무에서 찾았다">
                          {step.by}
                        </span>
                      )}
                      {first && (
                        <span className="shrink-0 tabular-nums text-[10px] text-slate-400">
                          {first}{last && last !== first ? `~${last}` : ''}
                        </span>
                      )}
                      <ChevronDown className={cn('h-3 w-3 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
                    </button>
                    {open && (
                      <ul className="ml-6 mt-0.5 space-y-0.5 border-l border-slate-200 pl-2">
                        {step.docs.map((doc, j) => (
                          <li key={`${doc.date}-${j}`} className="flex gap-1.5 text-[10px] leading-4">
                            <span className="shrink-0 tabular-nums text-slate-400">{doc.date}</span>
                            <span className="shrink-0 text-slate-400">{doc.dir === 1 ? '기안' : '접수'}</span>
                            {doc.title
                              ? <span className="min-w-0 flex-1 truncate text-slate-700" title={doc.title}>{doc.title}</span>
                              : <span className="min-w-0 flex-1 text-slate-400">(제목 가림)</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {entry.related.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {entry.related.map((rel, i) => (
                <p key={`${rel.person}-${i}`} className="text-[10px] leading-4 text-slate-500">
                  <span className="text-slate-400">연관 · </span>
                  <span className="font-medium text-slate-700">{rel.person}</span>
                  <span className="text-slate-400"> 「{rel.work}」</span> — {rel.role}
                  <span className="text-slate-400"> (문서 {rel.docs.length})</span>
                </p>
              ))}
            </div>
          )}
          {entry.revised && (
            <p className="mt-0.5 text-[10px] leading-4 text-slate-500">↻ 재검토: {entry.revised}</p>
          )}
        </div>
      ))}

      {/*
        일회성은 간단하게 — 이름과 한 마디, 그 아래 한 줄에 분석 칩(2026-09-29): 무엇을 하는 일인가(행위·부담) ·
        누구의 일인가(본 업무가 아닐 때만 — 조각이면 주관자, 분류 오류면 맞는 업무) · 업무로 올릴 만한가.
        ⚠️ «해마다 돌아오는가»는 없다 — 작년 공문 데이터가 필요해 나중에 한다(사용자 결정).
      */}
      {once.length > 0 && (
        <ul className="space-y-1">
          {once.map((entry) => (
            <li key={`${entry.person}-once`} className="text-[10px] leading-4">
              <div className="flex min-w-0 items-baseline gap-1.5">
                <span className={cn('shrink-0 rounded px-1', KIND_CHIP.일회성)}>일회성</span>
                <span className="shrink-0 font-medium text-slate-700">{entry.person}</span>
                <span className="min-w-0 flex-1 truncate text-slate-500" title={entry.summary}>{entry.summary}</span>
              </div>
              {entry.once && <OnceChips once={entry.once} />}
            </li>
          ))}
        </ul>
      )}
      {reference.length > 0 && (
        <p className="text-[10px] leading-4 text-slate-400" title={reference.map((e) => `${e.person}: ${e.summary}`).join('\n')}>
          참고(받은 안내뿐) · {reference.map((e) => e.person).join(' · ')}
        </p>
      )}
    </div>
  );
}

/**
 * 일회성 분석 칩 한 줄 — 행위·부담 · 누구의 일(본 업무가 아닐 때만) · 올릴 만함.
 * 색이 아니라 글자와 테두리로 말한다(«분장과 다름»과 같은 원칙 — 분류 오류도 «고칠 곳»이지 경고가 아니다).
 */
function OnceChips({ once }: { once: OnceAnalysis }) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-[46px]">
      <span className="rounded bg-slate-100 px-1 text-slate-600">{once.action}</span>
      <span className="text-slate-400">부담 {once.load}</span>
      {once.owner !== '본 업무' && (
        <span
          className={cn('min-w-0 truncate rounded px-1', once.owner === '분류 오류' ? 'border border-slate-300 text-slate-700' : 'bg-slate-50 text-slate-500')}
          title={once.ownerNote ?? undefined}
        >
          {once.owner === '다른 사람 절차의 조각'
            ? `${once.ownerPerson ?? '다른 사람'}의 「${once.ownerWork ?? '—'}」 조각`
            : once.owner === '분류 오류'
              ? `분류 오류 → 「${once.ownerWork ?? '—'}」`
              : once.owner}
        </span>
      )}
      {once.promote === '올릴 만함' && (
        <span className="rounded border border-slate-700 px-1 font-medium text-slate-800" title={once.promoteWhy}>
          업무로 올릴 만함
        </span>
      )}
    </div>
  );
}

/**
 * 목록 줄의 담당 갈래 칩 — **분장과 같은 것은 그리지 않는다**(172/235라 다 그리면 소음).
 *
 * ⚠️ 「분장과 다름」을 경고 색으로 칠하지 말 것 — 재검토에서 다름은 분장표 갱신·이관·협력으로
 *    갈렸다. 테두리로 눈에 띄게만 하고 색은 무채색이다(`ownerMatchOf` 주석).
 */
function OwnerMatchChip({ candidate }: { candidate: WorkCandidate }) {
  const match = ownerMatchOf(candidate);
  if (!match || match === 'same') return null;
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px]',
        match === 'different' ? 'border border-slate-300 bg-white font-medium text-slate-700' : 'bg-slate-50 text-slate-500',
      )}
      title={match === 'different'
        ? '분장 자리 사람이 아닌 사람이 이 업무의 문서를 가장 강하게 입증했습니다 — 분장표 갱신·이관·협력을 볼 곳'
        : undefined}
    >
      {OWNER_MATCH_LABEL[match]}
    </span>
  );
}

/**
 * **담당 — 분장표와 문서가 가리키는 사람** (2026-09-28, artifact 「업무별 담당」).
 *
 * 한 업무의 담당을 두 근거로 나란히 놓는다: 분장표의 자리·사람 ↔ 그 업무의 문서를 가장 강하게
 * 입증한 사람. 등급은 입증(기안) > 집행(행정실 회계) > 유력(제출·긴급) > 참고(안내만).
 *
 * ⚠️ **사람별 화면(사람을 고르면 그 사람의 업무)을 만들지 않는다** — 개인별 비교표가 된다는
 *    이유로 사람 축을 기각한 결정(CLAUDE.md 학교 전체)을 그대로 둔다. 여기는 «업무 하나의 담당»이다.
 */
function OwnerPanel({ candidate }: { candidate: WorkCandidate }) {
  const owner = candidateOwner(candidate);
  if (!owner) return null;
  const match = ownerMatchOf(candidate);
  const tiers = candidateTierCounts(candidate);
  const total = tiers.reduce((n, v) => n + v, 0);
  const others = owner.people.filter(([name]) => name !== owner.top).slice(0, 6);
  // 담당의 문서 수 — 아래 «함께 다룬 사람»과 같은 자로 나란히 비교할 수 있어야 한다
  const topDocs = owner.people.find(([name]) => name === owner.top)?.[2];

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex gap-2 py-0.5">
      <span className="w-[76px] shrink-0 text-[10px] text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 text-[11px] leading-5 text-slate-600">{children}</span>
    </div>
  );

  return (
    <div className="mt-1.5 space-y-0.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-medium text-slate-600">담당 — 분장표와 문서</p>
      <Row label="분장 자리">
        {candidate.seat_label ? (
          <>
            <span className="text-slate-700">{candidate.seat_label}</span>
            {owner.seatPeople.length > 0 && (
              <span className="ml-1 text-slate-400">· {owner.seatPeople.join(' → ')}</span>
            )}
          </>
        ) : (
          <span className="text-slate-400">분장표에 이 업무의 자리가 없습니다</span>
        )}
      </Row>
      <Row label="문서로 본 담당">
        <span className="font-medium text-slate-800">{owner.top}</span>
        <span className={cn('ml-1 rounded px-1 text-[10px]', ownerGradeClass(owner.grade))}>{owner.grade}</span>
        {typeof topDocs === 'number' && <span className="ml-1 tabular-nums text-slate-400">{topDocs}</span>}
        {match && match !== 'no-seat' && (
          <span className={cn(
            'ml-1.5 rounded px-1 text-[10px]',
            match === 'different' ? 'border border-slate-300 font-medium text-slate-700' : 'bg-slate-100 text-slate-500',
          )}>
            {OWNER_MATCH_LABEL[match]}
          </span>
        )}
      </Row>
      {others.length > 0 && (
        <Row label="함께 다룬 사람">
          <span className="flex flex-wrap gap-x-2 gap-y-0.5">
            {others.map(([name, grade, docs, inSeat]) => (
              <span key={name} className="inline-flex items-center gap-1" title={inSeat ? '분장 자리 사람' : undefined}>
                <span className={cn(inSeat ? 'text-slate-700' : 'text-slate-600')}>{name}</span>
                <span className={cn('rounded px-1 text-[10px]', ownerGradeClass(grade))}>{grade}</span>
                <span className="tabular-nums text-slate-400">{docs}</span>
              </span>
            ))}
          </span>
        </Row>
      )}
      {total > 0 && (
        <Row label="근거 구성">
          {/* 막대 = 등급별 문서 비율. 조각 사이 1px 틈 — 인접한 색이 붙어 한 덩어리로 읽히지 않게 */}
          <span className="flex h-2 w-full gap-px overflow-hidden rounded-sm" role="img" aria-label="근거 등급별 문서 비율">
            {tiers.map((value, i) => value > 0 && (
              <span
                key={EVIDENCE_TIERS[i].key}
                className={EVIDENCE_TIERS[i].dot}
                style={{ flex: value }}
                title={`${EVIDENCE_TIERS[i].label} ${value}건`}
              />
            ))}
          </span>
          <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
            {tiers.map((value, i) => value > 0 && (
              <span key={EVIDENCE_TIERS[i].key} className="inline-flex items-center gap-1">
                <span className={cn('h-2 w-2 rounded-sm', EVIDENCE_TIERS[i].dot)} />
                {EVIDENCE_TIERS[i].label} <span className="tabular-nums">{value}</span>
              </span>
            ))}
          </span>
        </Row>
      )}
    </div>
  );
}

/**
 * **근거 문서 — 이 업무로 배정된 문서 전부** (2026-09-28).
 *
 * 종전의 공문 근거(받은 공문·보낸 공문)를 대체한다. 이것이 «이 문서가 왜 이 업무인가»를
 * 입증하는 자료이고, 과묶임도 여기서 드러난다(2026-09-25 사용자 지시 "입증할 수 있는 evidence").
 *
 * ⚠️ **펼칠 때만 읽는다** — 한 업무 최대 1,000건이 넘어 목록 조회에 싣지 않았다.
 * ⚠️ 기본 10건, 최근이 먼저 — «지금 무슨 일을 하고 있나»가 3월보다 자주 궁금하다.
 * ⚠️ 제목이 없는 문서는 artifact 가 **가린** 것이다 — 빈칸으로 두면 «제목 없는 문서»로 읽힌다.
 */
function EvidenceList({ candidate }: { candidate: WorkCandidate }) {
  const [showAll, setShowAll] = useState(false);
  const [dir, setDir] = useState<'all' | 1 | 0>('all');
  const { data: docs = [], isLoading, error } = useWorkCandidateEvidence(candidate.id);
  const count = candidateDocCount(candidate);
  if (count === 0) return null;

  const filtered = dir === 'all' ? docs : docs.filter((d) => d.dir === dir);
  const recentFirst = [...filtered].reverse();
  const shown = showAll ? recentFirst : recentFirst.slice(0, 10);
  const made = docs.filter((d) => d.dir === 1).length;

  return (
    <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-[10px] font-medium text-slate-600">
          근거 문서 {docs.length || count}건
          <span className="ml-1 font-normal text-slate-400">· 최근 순</span>
        </p>
        {docs.length > 0 && (
          <span className="ml-auto flex gap-0.5">
            {([['all', '전체', docs.length], [1, '기안', made], [0, '담당 접수', docs.length - made]] as const).map(([value, label, n]) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => { setDir(value); setShowAll(false); }}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] tabular-nums',
                  dir === value ? 'bg-white font-medium text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {label} {n}
              </button>
            ))}
          </span>
        )}
      </div>
      {isLoading && (
        <p className="flex items-center gap-1 py-2 text-[10px] text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          문서를 불러오는 중…
        </p>
      )}
      {error && (
        <p className="py-2 text-[10px] text-slate-500">
          문서를 불러오지 못했습니다 — {error instanceof Error ? error.message : String(error)}
        </p>
      )}
      <ul className="mt-1 space-y-0.5">
        {shown.map((doc, i) => (
          <li key={`${doc.date}-${doc.title}-${i}`} className="flex items-center gap-1.5 text-[10px] leading-4">
            <span className="shrink-0 tabular-nums text-slate-400">{doc.date}</span>
            <span
              className="inline-flex w-[88px] shrink-0 items-center gap-1 text-slate-500"
              title={doc.dir === 1 ? '학교가 만든 문서' : '담당자로 지정된 받은 문서'}
            >
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', EVIDENCE_TIERS[doc.tier]?.dot ?? 'bg-slate-300')} />
              <span className="truncate">{evidenceTierLabel(doc.tier)}</span>
            </span>
            {/* 긴 제목이 모달 폭을 밀어내지 않게 — min-w-0 + truncate + title 3종 세트 */}
            {doc.title ? (
              <span className="min-w-0 flex-1 truncate text-slate-700" title={doc.title}>{doc.title}</span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-slate-400">(제목 가림)</span>
            )}
            <span className="max-w-[40%] shrink-0 truncate text-slate-500" title={doc.who.join(' · ')}>
              {doc.who.join('·') || '—'}
            </span>
          </li>
        ))}
      </ul>
      {recentFirst.length > shown.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-1 text-[10px] font-medium text-blue-600 underline underline-offset-2"
        >
          +{recentFirst.length - shown.length}건 더 보기 — 묶임이 맞는지 확인하세요
        </button>
      )}
    </div>
  );
}

/**
 * 후보의 상세 — 공문 본문 상세(19개)·사업비·문서 기간·이전 이름. 하나도 없으면 그리지 않는다.
 *
 * 여기에만 있는 것이 **모르면 손해 보는 것**이다: 기한 여유가 3일인지 8일인지, 무엇으로
 * 내는지(교데통·에듀파인), 어떤 서식을 쓰는지, 근거가 무슨 공문인지.
 */
function CandidateDetailPanel({ candidate }: { candidate: WorkCandidate }) {
  const detail = candidateDetail(candidate);
  const budget = candidateBudget(candidate);
  const supports = candidateSupports(candidate);
  const period = candidatePeriod(candidate);
  const renamedFrom = candidateRenamedFrom(candidate);
  // 문서 근거·담당은 아래 두 패널이 맡는다 — 여기는 공문 본문 상세·사업비·기간만
  if (!detail && !budget && supports.length === 0 && !period.first && !renamedFrom) return null;

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex gap-2 py-0.5">
      <span className="w-[68px] shrink-0 text-[10px] text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 text-[11px] leading-5 text-slate-600">{children}</span>
    </div>
  );

  return (
    <div className="space-y-0.5 rounded-lg bg-slate-50/70 px-3 py-2">
      {detail?.slack && (
        <Row label="기한 여유">
          중앙 {detail.slack['중앙'] ?? '—'}일 · 최소 {detail.slack['최소'] ?? '—'}일
          {Number(detail.slack['7일이하']) > 0 && (
            <span className="ml-1 rounded bg-rose-50 px-1 text-rose-600">
              7일 이하 {detail.slack['7일이하']}건
            </span>
          )}
        </Row>
      )}
      {detail && detail.methods.length > 0 && (
        <Row label="제출 방법">{detail.methods.map(([m, n]) => `${m} ${n}`).join(' · ')}</Row>
      )}
      {detail && detail.forms.length > 0 && (
        <Row label="서식">{detail.forms.join(' · ')}</Row>
      )}
      {detail && detail.bases.length > 0 && (
        <Row label="근거">{detail.bases.join(' / ')}</Row>
      )}
      {budget && budget.total > 0 && (
        <Row label="사업비">
          <b className="text-slate-700">{formatMoney(budget.total)}</b>
          {budget.spent > 0 && (
            <span className="text-slate-400"> · 집행 {formatMoney(budget.spent)}</span>
          )}
          <span className="ml-1 text-slate-400">(항목은 위에)</span>
        </Row>
      )}
      {supports.length > 0 && (
        <Row label="지원한 업무">{supports.map(([name, n]) => `${name} ${n}`).join(' · ')}</Row>
      )}
      {(period.first || period.last) && (
        <Row label="문서 기간">
          {period.first ?? '?'} ~ {period.last ?? '?'}
          {Number(candidate.counts?.people) > 0 && (
            <span className="ml-1 text-slate-400">· 문서를 다룬 사람 {candidate.counts.people}명</span>
          )}
        </Row>
      )}
      {/*
        이름이 바뀐 업무 — 유형·규모·사업비·상세는 옛 이름에서 이어받았다(2026-09-28 재검토).
        말하지 않으면 «공문 본문 상세»가 왜 지금 이름과 조금 다른 업무를 말하는지 알 수 없다.
      */}
      {renamedFrom && (
        <Row label="이전 이름">
          {renamedFrom}
          <span className="ml-1 text-slate-400">(재검토로 이름이 바뀌었습니다 — 유형·사업비·상세는 이전 이름에서 이어받음)</span>
        </Row>
      )}
      {detail && (detail.requestCount > 0 || detail.schoolStepCount > 0) && (
        <Row label="공문">
          교육청 요구 {detail.requestCount}건 · 학교 절차 {detail.schoolStepCount}건
          <span className="ml-1 text-slate-400">(공문 본문 분석 기준 — 이 업무의 문서는 아래 근거 목록에)</span>
        </Row>
      )}
      {detail?.memo?.요약 && (
        <p className="mt-1.5 border-l-2 border-blue-300 pl-2 text-[11px] leading-5 text-slate-600">
          {detail.memo.요약}
        </p>
      )}
      {detail?.memo?.개선 && detail.memo.개선.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11px] leading-5 text-blue-700">
          {detail.memo.개선.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600" aria-label="고치기" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-rose-600" aria-label="지우기" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
