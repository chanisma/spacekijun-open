import { useState, useCallback } from 'react';
import { groupSlotChoices, primaryCategory } from '../types';
import type { GroupView, SlotView, SlotChoiceView, SavePick, MySelectionItem } from '../types';

export interface DraftPick {
  selectableSubjectId: string;
  subjectName: string;
  categoryCode: string;
  semester: number | null;
}
export type GroupDraft = Map<string, DraftPick[]>;   // slotId -> picks
export type AllDraft = Map<string, GroupDraft>;       // groupId -> GroupDraft

export interface UseSubjectSelectionDraftResult {
  draft: AllDraft;
  dirtyGroups: Set<string>;
  initFromItems: (groups: GroupView[], items: MySelectionItem[]) => void;
  toggleChoice: (group: GroupView, slot: SlotView, choice: SlotChoiceView, onLimit?: () => void) => void;
  isChoicePicked: (groupId: string, slotId: string, choice: SlotChoiceView) => boolean;
  isChoiceBlockedByDuplicate: (group: GroupView, slot: SlotView, choice: SlotChoiceView) => boolean;
  slotChoiceCount: (groupId: string, slot: SlotView) => number;
  groupPickCount: (group: GroupView) => { picked: number; required: number };
  picksForGroup: (group: GroupView) => SavePick[];
  clearDirty: (groupId: string) => void;
}

export function useSubjectSelectionDraft(): UseSubjectSelectionDraftResult {
  const [draft, setDraft] = useState<AllDraft>(new Map());
  const [dirtyGroups, setDirtyGroups] = useState<Set<string>>(new Set());

  const initFromItems = useCallback((groups: GroupView[], items: MySelectionItem[]) => {
    const next: AllDraft = new Map();
    for (const g of groups) {
      const slotMap: GroupDraft = new Map();
      const groupItems = items.filter((i) => i.group_id === g.id);
      for (const slot of g.slots) {
        const slotPicks = groupItems
          .filter((i) => i.slot_id === slot.id)
          .map<DraftPick>((i) => ({
            selectableSubjectId: i.selectable_subject_id,
            subjectName: i.subject_name,
            categoryCode: i.category_code ?? primaryCategory(g.category_codes) ?? '교양',
            semester: i.semester,
          }));
        if (slotPicks.length) slotMap.set(slot.id, slotPicks);
      }
      if (slotMap.size) next.set(g.id, slotMap);
    }
    setDraft(next);
    setDirtyGroups(new Set());
  }, []);

  const isChoicePicked = useCallback(
    (groupId: string, slotId: string, choice: SlotChoiceView): boolean => {
      const picks = draft.get(groupId)?.get(slotId) ?? [];
      return choice.subjects.every((s) =>
        picks.some(
          (p) =>
            p.selectableSubjectId === s.selectable_subject_id &&
            (p.semester ?? null) === (s.semester ?? null),
        ),
      );
    },
    [draft],
  );

  const toggleChoice = useCallback(
    (group: GroupView, slot: SlotView, choice: SlotChoiceView, onLimit?: () => void) => {
      setDraft((prev) => {
        const next = new Map(prev);
        const slotMap = new Map(next.get(group.id) ?? []);
        const existing = slotMap.get(slot.id) ?? [];
        const choiceSubjectIds = new Set(
          choice.subjects.map((s) => `${s.selectable_subject_id}::${s.semester ?? ''}`),
        );
        const currentlyPicked = choice.subjects.every((s) =>
          existing.some(
            (p) =>
              p.selectableSubjectId === s.selectable_subject_id &&
              (p.semester ?? null) === (s.semester ?? null),
          ),
        );

        let after: DraftPick[];
        if (currentlyPicked) {
          after = existing.filter(
            (p) => !choiceSubjectIds.has(`${p.selectableSubjectId}::${p.semester ?? ''}`),
          );
        } else {
          const newPicks: DraftPick[] = choice.subjects.map((s) => ({
            selectableSubjectId: s.selectable_subject_id,
            subjectName: s.name,
            categoryCode: s.category_code ?? primaryCategory(group.category_codes) ?? '교양',
            semester: s.semester,
          }));
          if (slot.pick_count === 1) {
            after = newPicks;
          } else {
            const slotChoices = groupSlotChoices(slot.subjects ?? []);
            const currentChoiceCount = slotChoices.filter((c) =>
              c.subjects.every((s) =>
                existing.some(
                  (p) =>
                    p.selectableSubjectId === s.selectable_subject_id &&
                    (p.semester ?? null) === (s.semester ?? null),
                ),
              ),
            ).length;
            if (currentChoiceCount >= slot.pick_count) {
              onLimit?.();
              return prev;
            }
            after = [...existing, ...newPicks];
          }
        }

        if (after.length === 0) slotMap.delete(slot.id);
        else slotMap.set(slot.id, after);
        if (slotMap.size === 0) next.delete(group.id);
        else next.set(group.id, slotMap);
        setDirtyGroups((d) => new Set(d).add(group.id));
        return next;
      });
    },
    [],
  );

  const isChoiceBlockedByDuplicate = useCallback(
    (group: GroupView, slot: SlotView, choice: SlotChoiceView): boolean => {
      const myNames = new Set(choice.subjects.map((s) => s.name));
      for (const other of group.slots ?? []) {
        if (other.id === slot.id) continue;
        const otherPicks = draft.get(group.id)?.get(other.id) ?? [];
        for (const p of otherPicks) {
          if (myNames.has(p.subjectName)) return true;
        }
      }
      return false;
    },
    [draft],
  );

  const slotChoiceCount = useCallback(
    (groupId: string, slot: SlotView): number => {
      const choices = groupSlotChoices(slot.subjects ?? []);
      return choices.filter((c) => isChoicePicked(groupId, slot.id, c)).length;
    },
    [isChoicePicked],
  );

  const groupPickCount = useCallback(
    (group: GroupView): { picked: number; required: number } => {
      const slotMap = draft.get(group.id);
      const picked = group.slots.reduce((sum, s) => sum + (slotMap?.get(s.id)?.length ?? 0), 0);
      const required = group.slots.reduce((sum, s) => sum + s.pick_count, 0);
      return { picked, required };
    },
    [draft],
  );

  const picksForGroup = useCallback(
    (group: GroupView): SavePick[] => {
      const slotMap = draft.get(group.id) ?? new Map<string, DraftPick[]>();
      const picks: SavePick[] = [];
      for (const slot of group.slots) {
        const slotPicks = slotMap.get(slot.id) ?? [];
        for (const p of slotPicks) {
          picks.push({
            slot_id: slot.id,
            selectable_subject_id: p.selectableSubjectId,
            subject_name: p.subjectName,
            semester: p.semester,
            category_code: p.categoryCode,
          });
        }
      }
      return picks;
    },
    [draft],
  );

  const clearDirty = useCallback((groupId: string) => {
    setDirtyGroups((d) => {
      const next = new Set(d);
      next.delete(groupId);
      return next;
    });
  }, []);

  return {
    draft,
    dirtyGroups,
    initFromItems,
    toggleChoice,
    isChoicePicked,
    isChoiceBlockedByDuplicate,
    slotChoiceCount,
    groupPickCount,
    picksForGroup,
    clearDirty,
  };
}
