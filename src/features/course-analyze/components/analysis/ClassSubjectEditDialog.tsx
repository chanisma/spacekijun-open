/**
 * 학급 관리 — 학생 1명의 현재 차수 선택과목 편집 모달.
 * round tree(group/slot) 위에서 슬롯별 과목 선택 → group 단위 save RPC(p_actor_role:'teacher').
 * 선택 로직은 useSubjectSelectionDraft(course-selection)을 재사용, UI는 축소판.
 */
import React, { useEffect, useMemo } from 'react';
import { Check, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  useRoundTree, useMySelection, useSaveSelectionGroup, useSubjectSelectionDraft,
} from '@/features/course-selection/hooks';
import { groupSlotChoices, slotDisplayTitle } from '@/features/course-selection/types';
import type { RosterRow } from '../../hooks/useClassRoster';

interface Props {
  open: boolean;
  onClose: () => void;
  roundId: string;
  row: RosterRow;
  /** 저장 성공 후 호출 — 해당 차수 재로드 트리거 */
  onSaved: () => void;
}

export function ClassSubjectEditDialog({ open, onClose, roundId, row, onSaved }: Props) {
  const { toast } = useToast();
  const { data: tree, isLoading: treeLoading } = useRoundTree(open ? roundId : null);
  const { data: mine, isLoading: mineLoading } = useMySelection(open ? roundId : null, row.studentCode);
  const saveMut = useSaveSelectionGroup();
  const sel = useSubjectSelectionDraft();

  const groups = useMemo(() => tree?.groups ?? [], [tree?.groups]);

  useEffect(() => {
    if (!open) return;
    if (!groups.length) return;
    // 두 쿼리 경합 가드: 과목 트리가 먼저 오면 mine(기존 선택)이 아직 로딩 중인데
    // 그 시점에 빈 배열로 초기화하면 기존 신청이 잠깐 "미신청"으로 보이고, 그 사이
    // 편집을 시작한 경우 mine 도착 시 재초기화가 입력을 덮어쓴다 — 로딩 완료 후 1회 초기화.
    // (미제출 학생은 submission:null·items:[]로 정상 도착하고, 학생 코드 미연결이면
    // 쿼리가 비활성이라 v5에서 isLoading=false — 양쪽 다 이 가드에 막히지 않는다.)
    if (mineLoading) return;
    sel.initFromItems(groups, mine?.items ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groups.length, mineLoading, mine?.submission?.id]);

  const handleSaveAll = async () => {
    if (!row.studentCode) {
      toast({ title: '학생 코드 미연결', description: '이 학생은 편집할 수 없습니다.', variant: 'destructive' });
      return;
    }
    try {
      // dirty group만 저장 (없으면 전체 group 저장 — 신규 신청 케이스)
      const targetGroups = sel.dirtyGroups.size > 0
        ? groups.filter((g) => sel.dirtyGroups.has(g.id))
        : groups.filter((g) => sel.picksForGroup(g).length > 0);
      if (targetGroups.length === 0) {
        toast({ title: '변경 사항 없음', description: '저장할 내용이 없습니다.' });
        return;
      }
      for (const g of targetGroups) {
        await saveMut.mutateAsync({
          p_round_id: roundId,
          p_group_id: g.id,
          p_student_resource_id: null,
          p_student_code: row.studentCode,
          p_student_name: row.name,
          p_student_grade: row.grade,
          p_student_class: row.classNum,
          p_student_no: row.number,
          p_picks: sel.picksForGroup(g),
          p_actor_role: 'teacher',
        });
      }
      toast({ title: '저장 완료', description: `${row.name} 학생 선택과목이 저장되었습니다.` });
      onSaved();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '오류';
      if (msg.includes('capacity_exceeded')) {
        toast({ title: '정원 마감', description: '선택한 과목 정원이 마감되었습니다.', variant: 'destructive' });
      } else if (msg.includes('round_closed')) {
        toast({ title: '신청 마감', description: '이미 마감된 차수입니다.', variant: 'destructive' });
      } else {
        toast({ title: '저장 실패', description: msg, variant: 'destructive' });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {row.number}번 {row.name} · 선택과목 편집
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto custom-scrollbar -mx-1 px-1 space-y-4">
          {treeLoading || !tree ? (
            <div className="py-10 text-center text-sm text-slate-500">로딩 중…</div>
          ) : groups.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              이 차수에는 선택군이 구성되어 있지 않습니다.
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="rounded-xl border border-slate-200/60 bg-white/60">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/70">
                  <span className="text-sm font-bold text-slate-700">{group.name}</span>
                </div>
                <div className="p-3 space-y-3">
                  {group.slots.map((slot) => (
                    <div key={slot.id}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-bold text-slate-600">{slotDisplayTitle(slot)}</span>
                        {slot.semester != null && (
                          <span className="text-[10px] text-slate-400">{slot.semester}학기</span>
                        )}
                        <span className="ml-auto text-[10px] font-mono text-slate-400">
                          {sel.slotChoiceCount(group.id, slot)}/{slot.pick_count}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {groupSlotChoices(slot.subjects ?? []).map((choice) => {
                          const picked = sel.isChoicePicked(group.id, slot.id, choice);
                          const dupBlocked = !picked && sel.isChoiceBlockedByDuplicate(group, slot, choice);
                          return (
                            <button
                              key={choice.key}
                              type="button"
                              disabled={dupBlocked}
                              onClick={() =>
                                sel.toggleChoice(group, slot, choice, () =>
                                  toast({ title: `${slot.pick_count}개까지만 선택할 수 있어요` }),
                                )
                              }
                              className={cn(
                                'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                                picked
                                  ? 'bg-brand-500 text-white border-brand-500'
                                  : dupBlocked
                                    ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300',
                              )}
                            >
                              {picked && <Check className="inline h-3 w-3 mr-0.5" />}
                              {choice.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button onClick={handleSaveAll} disabled={saveMut.isPending || !row.studentCode}>
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
