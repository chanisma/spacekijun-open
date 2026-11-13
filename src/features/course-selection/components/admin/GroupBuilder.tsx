/**
 * 선택군 구성 — mockup TeacherGroupBuilder 3-panel.
 *
 * Controlled component: selectedGroupId, selectedSlot을 props로 받음.
 * 좌측 트리에서의 클릭이 AdminApp 레벨 state를 통해 자동 반영됨.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, GripVertical, X, ListTree, BookOpen, Save,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Btn, Input, Field, Pill, SubjectTag } from '../common/atoms';
import { T } from '../../utils/tokens';
import {
  useRoundTree, useUpsertGroup, useDeleteGroup, useUpsertSlot, useDeleteSlot,
  useDetachSubject, useAttachCurriculumSubjects, useUpdateSlotSubject,
  useCurriculumSubjectsForGroup, useLogChange, useSetSlotSubjectBundle,
  useSetBundleCapacity, useAddCustomSubject,
} from '../../hooks';
import {
  Plus as PlusIcon,
} from 'lucide-react';
import RoundTreeRail from './RoundTreeRail';
import type { CurrentActor } from '../../hooks/useCurrentActor';
import type { GroupView, SlotView, SlotSubjectView, CategoryKey } from '../../types';
import { CATEGORY_KEYS, slotDisplayTitle, groupSlotChoices } from '../../types';
import type { CurriculumSubject } from '../../hooks/useRound';
import type { SlotSelection } from './CourseSelectionAdminApp';

interface Props {
  roundId: string | null;
  selectedGroupId: string | null;
  selectedSlot: SlotSelection | null;
  onSelectRound: (id: string | null) => void;
  onSelectGroup: (id: string | null) => void;
  onSelectSlot: (slot: SlotSelection | null) => void;
  actor: CurrentActor;
}

export default function GroupBuilder({
  roundId,
  selectedGroupId,
  selectedSlot,
  onSelectRound,
  onSelectGroup,
  onSelectSlot,
  actor,
}: Props) {
  const { data: tree } = useRoundTree(roundId);
  const { toast } = useToast();

  const upsertGroup = useUpsertGroup();
  const deleteGroup = useDeleteGroup();
  const detach = useDetachSubject();
  const logChange = useLogChange();

  const groups: GroupView[] = tree?.groups ?? [];
  const [selectedSubjectSlotId, setSelectedSubjectSlotId] = useState<string | null>(null);

  // 새 선택군 폼 — 차수가 바뀌면 기본값 재초기화
  const [newGroup, setNewGroup] = useState<{
    name: string;
    categories: CategoryKey[];
    academic_year: number | null;
    target_grade: number | null;
  }>({
    name: '',
    categories: [],
    academic_year: tree?.round?.academic_year ?? new Date().getFullYear() + 1,
    target_grade: tree?.round?.target_grade ?? 1,
  });
  useEffect(() => {
    setNewGroup({
      name: '',
      categories: [],
      academic_year: tree?.round?.academic_year ?? new Date().getFullYear() + 1,
      target_grade: tree?.round?.target_grade ?? 1,
    });
  }, [tree?.round?.id]);

  // slot 바뀌면 subject 선택 초기화
  useEffect(() => {
    setSelectedSubjectSlotId(null);
  }, [selectedSlot?.id]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;
  const selectedSlotView = selectedGroup?.slots.find((s) => s.id === selectedSlot?.id) ?? null;
  const selectedSubject =
    selectedSlotView?.subjects.find((s) => s.id === selectedSubjectSlotId) ?? null;

  if (!roundId) {
    return (
      <div
        style={{
          height: '100%',
          display: 'grid',
          gridTemplateColumns: '260px 1fr 380px',
          overflow: 'hidden',
        }}
      >
        <RoundTreeRail
          mode="builder"
          selectedRoundId={null}
          onSelectRound={onSelectRound}
          width={260}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: T.inkDim,
            fontSize: 13,
            gridColumn: 'span 2',
          }}
        >
          좌측에서 차수를 선택하세요.
        </div>
      </div>
    );
  }

  const onAddGroup = async () => {
    if (!newGroup.name.trim()) return;
    try {
      const created = await upsertGroup.mutateAsync({
        round_id: roundId,
        name: newGroup.name.trim(),
        category_codes: newGroup.categories,
        academic_year: newGroup.academic_year,
        target_grade: newGroup.target_grade,
        display_order: groups.length,
      });
      await logChange.mutateAsync({
        p_round_id: roundId, p_actor_name: actor.name, p_actor_role: actor.role,
        p_action: 'group_create', p_target_type: 'group', p_target_id: created.id,
        p_target_label: created.name,
        p_diff: {
          name: created.name, categories: created.category_codes,
          academic_year: created.academic_year, target_grade: created.target_grade,
        },
      });
      setNewGroup({
        name: '',
        categories: [],
        academic_year: tree?.round?.academic_year ?? new Date().getFullYear() + 1,
        target_grade: tree?.round?.target_grade ?? 1,
      });
      onSelectGroup(created.id);
      toast({ title: '선택군 생성됨', description: created.name });
    } catch (e: any) {
      toast({ title: '실패', description: e?.message ?? '오류', variant: 'destructive' });
    }
  };

  const onDeleteGroup = async (g: GroupView) => {
    if (!confirm(`선택군 "${g.name}"을(를) 삭제하시겠습니까?`)) return;
    await deleteGroup.mutateAsync({ id: g.id, round_id: roundId });
    await logChange.mutateAsync({
      p_round_id: roundId, p_actor_name: actor.name, p_actor_role: actor.role,
      p_action: 'group_delete', p_target_type: 'group', p_target_id: g.id, p_target_label: g.name,
      p_diff: { before: { name: g.name } },
    });
    onSelectGroup(null);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '260px 1fr 380px',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <RoundTreeRail
        mode="builder"
        selectedRoundId={roundId}
        onSelectRound={onSelectRound}
        selectedGroupId={selectedGroupId}
        onSelectGroup={onSelectGroup}
        selectedSlotId={selectedSlot?.id ?? null}
        onSelectSlot={onSelectSlot}
        width={260}
      />

      {/* 중앙 */}
      <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 28px 12px', borderBottom: `1px solid ${T.border}` }}>
          <div
            style={{
              fontSize: 11,
              color: T.inkDim,
              fontFamily: T.fontMono,
              letterSpacing: 0.4,
              marginBottom: 4,
            }}
          >
            {selectedGroup
              ? `GROUP / ${selectedGroup.id.slice(0, 8)}${selectedSlotView ? ` · SLOT / ${selectedSlotView.id.slice(0, 8)}` : ''}`
              : `ROUND / ${roundId.slice(0, 8)}`}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {selectedGroup ? (
              <>
                {(selectedGroup.category_codes ?? []).map((c) => (
                  <SubjectTag key={c} cat={c} size="lg" />
                ))}
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>
                  {selectedGroup.name}
                </h2>
                <span style={{ color: T.inkDim, fontSize: 13 }}>·</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: T.inkMuted }}>
                  {selectedSlotView
                    ? slotDisplayTitle(selectedSlotView)
                    : `선택그룹 ${(selectedGroup.slots ?? []).length}개`}
                </span>
                <div style={{ marginLeft: 'auto' }}>
                  <Btn
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="h-3 w-3" />}
                    onClick={() => onDeleteGroup(selectedGroup)}
                  >
                    선택군 삭제
                  </Btn>
                </div>
              </>
            ) : (
              <>
                <ListTree className="h-5 w-5" style={{ color: T.inkMuted }} />
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>
                  선택군 구성
                </h2>
                <Pill tone="primary" size="sm">{tree?.round?.title ?? ''}</Pill>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: T.inkMuted }}>
                  좌측 트리에서 선택군을 선택하거나, 아래에서 새로 추가하세요.
                </span>
              </>
            )}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 28px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {!selectedGroup ? (
            <GroupListAndCreate
              groups={groups}
              newGroup={newGroup}
              setNewGroup={setNewGroup}
              onAddGroup={onAddGroup}
              onSelectGroup={onSelectGroup}
              upsertPending={upsertGroup.isPending}
              roundDefaults={{
                academic_year: tree?.round?.academic_year ?? null,
                target_grade: tree?.round?.target_grade ?? null,
              }}
            />
          ) : selectedSlotView ? (
            <SlotEditor
              group={selectedGroup}
              slot={selectedSlotView}
              roundId={roundId}
              actor={actor}
              selectedSubjectId={selectedSubjectSlotId}
              onSelectSubject={setSelectedSubjectSlotId}
              onDeleteSlotDone={() => onSelectSlot(null)}
            />
          ) : (
            <GroupEditor
              group={selectedGroup}
              roundId={roundId}
              actor={actor}
              roundDefaults={{
                academic_year: tree?.round?.academic_year ?? null,
                target_grade: tree?.round?.target_grade ?? null,
              }}
              onSelectSlot={(id) =>
                onSelectSlot({ id, groupId: selectedGroup.id })
              }
            />
          )}
        </div>
      </div>

      {/* 우측 인스펙터 */}
      <div
        style={{
          borderLeft: `1px solid ${T.border}`,
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {selectedSubject && selectedSlotView ? (
          <SubjectInspector
            subject={selectedSubject}
            slot={selectedSlotView}
            roundId={roundId}
            onDetach={async () => {
              await detach.mutateAsync({ id: selectedSubject.id, round_id: roundId });
              await logChange.mutateAsync({
                p_round_id: roundId, p_actor_name: actor.name, p_actor_role: actor.role,
                p_action: 'subject_detach', p_target_type: 'slot_subject',
                p_target_id: selectedSubject.id, p_target_label: selectedSubject.name,
                p_diff: { slot: slotDisplayTitle(selectedSlotView), subject: selectedSubject.name },
              });
              setSelectedSubjectSlotId(null);
            }}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: T.inkDim,
              fontSize: 13,
              padding: 24,
              textAlign: 'center',
              lineHeight: 1.6,
              whiteSpace: 'pre-line',
            }}
          >
            {selectedSlotView
              ? '슬롯에서 과목을 클릭하면\n속성이 여기 표시됩니다.'
              : selectedGroup
              ? '선택그룹을 선택하면\n슬롯·과목 인스펙터가 활성화됩니다.'
              : '선택군 → 선택그룹 → 과목을\n순서대로 선택하세요.'}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// GroupListAndCreate — selectedGroup 없음
// ============================================================
function GroupListAndCreate({
  groups,
  newGroup,
  setNewGroup,
  onAddGroup,
  onSelectGroup,
  upsertPending,
  roundDefaults,
}: {
  groups: GroupView[];
  newGroup: { name: string; categories: CategoryKey[]; academic_year: number | null; target_grade: number | null };
  setNewGroup: (g: { name: string; categories: CategoryKey[]; academic_year: number | null; target_grade: number | null }) => void;
  onAddGroup: () => void;
  onSelectGroup: (id: string) => void;
  upsertPending: boolean;
  roundDefaults: { academic_year: number | null; target_grade: number | null };
}) {
  return (
    <>
      {groups.length === 0 && (
        <div
          style={{
            padding: 28,
            background: T.surfaceSunk,
            borderRadius: T.r3,
            textAlign: 'center',
            color: T.inkMuted,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          이 차수에는 아직 선택군이 없습니다.<br />아래에서 첫 선택군을 만드세요.
        </div>
      )}
      {groups.map((g) => {
        const eyr = g.academic_year ?? roundDefaults.academic_year;
        const egr = g.target_grade ?? roundDefaults.target_grade;
        return (
          <button
            key={g.id}
            onClick={() => onSelectGroup(g.id)}
            style={{
              background: '#fff',
              border: `1px solid ${T.border}`,
              borderRadius: T.r3,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            <GripVertical className="h-4 w-4" style={{ color: T.inkDim }} />
            {(g.category_codes ?? []).map((c) => (
              <SubjectTag key={c} cat={c} size="lg" />
            ))}
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>{g.name}</span>
            {eyr != null && <Pill tone="outline" size="sm">{eyr}</Pill>}
            {egr != null && <Pill tone="outline" size="sm">{egr}학년</Pill>}
            <span
              style={{
                marginLeft: 'auto',
                color: T.inkMuted,
                fontSize: 11.5,
                fontFamily: T.fontMono,
              }}
            >
              선택그룹 {(g.slots ?? []).length}개 · 과목 {(g.slots ?? []).reduce((a, s) => a + (s.subjects ?? []).length, 0)}개
            </span>
          </button>
        );
      })}

      <div
        style={{
          background: '#fff',
          border: `1px dashed ${T.borderStrong}`,
          borderRadius: T.r3,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Plus className="h-4 w-4" style={{ color: T.inkDim }} />
          <div style={{ flex: 1 }}>
            <Input
              placeholder="새 선택군 이름 (예: 사회 진로선택)"
              value={newGroup.name}
              onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
              onKeyDown={(e) => {
                if ((e as any).key === 'Enter') onAddGroup();
              }}
            />
          </div>
          <Btn
            variant="primary"
            size="md"
            onClick={onAddGroup}
            disabled={!newGroup.name.trim() || upsertPending}
          >
            추가
          </Btn>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingLeft: 24, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: T.inkDim, marginRight: 4 }}>
            카테고리 (복수 선택)
          </span>
          {CATEGORY_KEYS.map((c) => {
            const on = newGroup.categories.includes(c as CategoryKey);
            return (
              <Btn
                key={c}
                size="sm"
                variant={on ? 'soft' : 'outline'}
                onClick={() =>
                  setNewGroup({
                    ...newGroup,
                    categories: on
                      ? newGroup.categories.filter((x) => x !== c)
                      : [...newGroup.categories, c as CategoryKey],
                  })
                }
              >
                {c}
              </Btn>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, paddingLeft: 24, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: T.inkDim }}>수강 연도</span>
          <div style={{ width: 100 }}>
            <Input
              type="number"
              mono
              value={newGroup.academic_year ?? ''}
              onChange={(e) =>
                setNewGroup({
                  ...newGroup,
                  academic_year: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
              placeholder="연도"
            />
          </div>
          <span style={{ fontSize: 11, color: T.inkDim }}>대상 학년</span>
          {[1, 2, 3].map((g) => (
            <Btn
              key={g}
              size="sm"
              variant={newGroup.target_grade === g ? 'primary' : 'outline'}
              onClick={() => setNewGroup({ ...newGroup, target_grade: g })}
            >
              {g}학년
            </Btn>
          ))}
        </div>
      </div>
    </>
  );
}

// ============================================================
// GroupEditor — group 선택, slot 미선택 (메타 편집 + 슬롯 목록)
// ============================================================
function GroupEditor({
  group,
  roundId,
  actor,
  roundDefaults,
  onSelectSlot,
}: {
  group: GroupView;
  roundId: string;
  actor: CurrentActor;
  roundDefaults: { academic_year: number | null; target_grade: number | null };
  onSelectSlot: (id: string) => void;
}) {
  const upsertGroup = useUpsertGroup();
  const upsertSlot = useUpsertSlot();
  const logChange = useLogChange();
  const { toast } = useToast();

  // group 메타 편집 폼
  const [draft, setDraft] = useState({
    name: group.name,
    categories: (group.category_codes ?? []) as CategoryKey[],
    academic_year: group.academic_year,
    target_grade: group.target_grade,
  });
  useEffect(() => {
    setDraft({
      name: group.name,
      categories: (group.category_codes ?? []) as CategoryKey[],
      academic_year: group.academic_year,
      target_grade: group.target_grade,
    });
  }, [group.id, group.updated_at]);

  const dirty =
    draft.name !== group.name ||
    JSON.stringify(draft.categories) !== JSON.stringify(group.category_codes ?? []) ||
    draft.academic_year !== group.academic_year ||
    draft.target_grade !== group.target_grade;

  const saveGroup = async () => {
    try {
      await upsertGroup.mutateAsync({
        id: group.id,
        round_id: roundId,
        name: draft.name.trim() || group.name,
        category_codes: draft.categories,
        academic_year: draft.academic_year,
        target_grade: draft.target_grade,
      });
      await logChange.mutateAsync({
        p_round_id: roundId, p_actor_name: actor.name, p_actor_role: actor.role,
        p_action: 'group_update', p_target_type: 'group',
        p_target_id: group.id, p_target_label: draft.name,
        p_diff: {
          before: {
            name: group.name, categories: group.category_codes,
            academic_year: group.academic_year, target_grade: group.target_grade,
          },
          after: draft,
        },
      });
      toast({ title: '선택군 저장됨', description: draft.name });
    } catch (e: any) {
      toast({ title: '실패', description: e?.message ?? '오류', variant: 'destructive' });
    }
  };

  const [newSlot, setNewSlot] = useState<{ title: string; semester: number | null; pick: number }>({
    title: '',
    semester: null,
    pick: 1,
  });

  const addSlot = async () => {
    const created = await upsertSlot.mutateAsync({
      group_id: group.id,
      round_id: roundId,
      title: newSlot.title.trim() || null,
      semester: newSlot.semester,
      pick_count: Math.max(1, newSlot.pick),
      display_order: (group.slots ?? []).length,
    });
    await logChange.mutateAsync({
      p_round_id: roundId, p_actor_name: actor.name, p_actor_role: actor.role,
      p_action: 'slot_create', p_target_type: 'slot',
      p_target_id: created.id, p_target_label: created.title ?? '',
      p_diff: { pick_count: created.pick_count, semester: created.semester },
    });
    setNewSlot({ title: '', semester: null, pick: 1 });
    onSelectSlot(created.id);
  };

  const eyrFallback = roundDefaults.academic_year;
  const egrFallback = roundDefaults.target_grade;

  return (
    <>
      {/* group 메타 편집 카드 */}
      <div
        style={{
          background: '#fff',
          border: `1.5px solid ${T.primary}`,
          borderRadius: T.r3,
          padding: 18,
          boxShadow: '0 0 0 3px oklch(95% 0.04 282)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span
            style={{
              fontFamily: T.fontMono,
              fontSize: 10.5,
              padding: '1px 5px',
              background: T.surfaceSunk,
              border: `1px solid ${T.border}`,
              borderRadius: 3,
              color: T.inkDim,
            }}
          >
            GROUP
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>
            선택군 설정
          </span>
          <Pill tone="primary" size="sm">편집 중</Pill>
          {dirty && <Pill tone="warning" size="sm">미저장 변경</Pill>}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '10px 14px',
            fontSize: 12.5,
            alignItems: 'center',
          }}
        >
          <span style={{ color: T.inkDim }}>이름</span>
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="예: 사회 진로선택"
          />

          <span style={{ color: T.inkDim }}>카테고리</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {CATEGORY_KEYS.map((c) => {
              const on = draft.categories.includes(c as CategoryKey);
              return (
                <Btn
                  key={c}
                  size="sm"
                  variant={on ? 'soft' : 'outline'}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      categories: on
                        ? draft.categories.filter((x) => x !== c)
                        : [...draft.categories, c as CategoryKey],
                    })
                  }
                >
                  {c}
                </Btn>
              );
            })}
          </div>

          <span style={{ color: T.inkDim }}>수강 연도</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 100 }}>
              <Input
                type="number"
                mono
                value={draft.academic_year ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    academic_year: e.target.value ? parseInt(e.target.value, 10) : null,
                  })
                }
                placeholder={eyrFallback?.toString() ?? '연도'}
              />
            </div>
            {draft.academic_year == null && eyrFallback != null && (
              <span style={{ fontSize: 11, color: T.inkDim }}>
                · 비우면 차수 기본값({eyrFallback}) 사용
              </span>
            )}
          </div>

          <span style={{ color: T.inkDim }}>대상 학년</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {[1, 2, 3].map((g) => (
              <Btn
                key={g}
                size="sm"
                variant={draft.target_grade === g ? 'primary' : 'outline'}
                onClick={() => setDraft({ ...draft, target_grade: g })}
              >
                {g}학년
              </Btn>
            ))}
            <Btn
              size="sm"
              variant={draft.target_grade == null ? 'soft' : 'ghost'}
              onClick={() => setDraft({ ...draft, target_grade: null })}
            >
              차수 기본값
            </Btn>
            {draft.target_grade == null && egrFallback != null && (
              <span style={{ fontSize: 11, color: T.inkDim }}>
                · 차수 기본({egrFallback}학년) 사용
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <Btn
            variant="primary"
            size="md"
            icon={<Save className="h-3.5 w-3.5" />}
            onClick={saveGroup}
            disabled={!dirty || upsertGroup.isPending}
          >
            선택군 설정 저장
          </Btn>
        </div>
      </div>

      {/* slot 목록 헤더 */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: T.inkDim,
          letterSpacing: 0.4,
          marginTop: 6,
          padding: '0 4px',
        }}
      >
        선택그룹 · 슬롯
      </div>

      {/* slot 리스트 */}
      {(group.slots ?? []).map((slot, i) => (
        <button
          key={slot.id}
          onClick={() => onSelectSlot(slot.id)}
          style={{
            background: '#fff',
            border: `1px solid ${T.border}`,
            borderRadius: T.r2,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              background: T.surfaceSunk,
              color: T.inkMuted,
              fontSize: 11,
              fontWeight: 700,
              display: 'grid',
              placeItems: 'center',
              fontFamily: T.fontMono,
            }}
          >
            {i + 1}
          </span>
          {slot.semester != null && (
            <Pill tone="neutral" size="sm">{slot.semester}학기</Pill>
          )}
          {slot.title?.trim() && (
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{slot.title}</span>
          )}
          <Pill tone="neutral" size="sm">{slot.pick_count}개 선택</Pill>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(slot.subjects ?? []).map((sub) => (
              <span
                key={sub.id}
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  background: T.surfaceMuted,
                  border: `1px solid ${T.border}`,
                  borderRadius: 5,
                  color: T.inkMuted,
                }}
              >
                {sub.name}
              </span>
            ))}
          </span>
        </button>
      ))}

      {/* 새 슬롯 */}
      <div
        style={{
          background: '#fff',
          border: `1px dashed ${T.borderStrong}`,
          borderRadius: T.r2,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus className="h-3.5 w-3.5" style={{ color: T.inkDim }} />
          <div style={{ flex: 1 }}>
            <Input
              placeholder="타이틀 (선택사항 — 비우면 학기·과목수로 자동 생성)"
              value={newSlot.title}
              onChange={(e) => setNewSlot({ ...newSlot, title: e.target.value })}
              onKeyDown={(e) => {
                if ((e as any).key === 'Enter') addSlot();
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 22 }}>
          <span style={{ fontSize: 11, color: T.inkDim }}>학기</span>
          {[
            { v: 1, l: '1학기' },
            { v: 2, l: '2학기' },
            { v: null, l: '미지정' },
          ].map((o) => (
            <Btn
              key={o.l}
              size="sm"
              variant={newSlot.semester === o.v ? 'primary' : 'outline'}
              onClick={() => setNewSlot({ ...newSlot, semester: o.v })}
            >
              {o.l}
            </Btn>
          ))}
          <span style={{ fontSize: 11, color: T.inkDim, marginLeft: 8 }}>선택 과목 수</span>
          <div style={{ width: 70 }}>
            <Input
              type="number"
              mono
              value={newSlot.pick}
              onChange={(e) => setNewSlot({ ...newSlot, pick: parseInt(e.target.value || '1', 10) })}
            />
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <Btn
              variant="primary"
              size="md"
              onClick={addSlot}
              disabled={upsertSlot.isPending}
            >
              선택그룹 추가
            </Btn>
          </div>
        </div>
        <div style={{ fontSize: 11, color: T.inkDim, paddingLeft: 22 }}>
          미리보기: <strong style={{ color: T.ink }}>
            {slotDisplayTitle({ title: newSlot.title, semester: newSlot.semester, pick_count: newSlot.pick })}
          </strong>
        </div>
      </div>
    </>
  );
}

// ============================================================
// SlotEditor — slot 선택 시 중앙
// ============================================================
function SlotEditor({
  group,
  slot,
  roundId,
  actor,
  selectedSubjectId,
  onSelectSubject,
  onDeleteSlotDone,
}: {
  group: GroupView;
  slot: SlotView;
  roundId: string;
  actor: CurrentActor;
  selectedSubjectId: string | null;
  onSelectSubject: (id: string | null) => void;
  onDeleteSlotDone: () => void;
}) {
  const upsertSlot = useUpsertSlot();
  const deleteSlot = useDeleteSlot();
  const logChange = useLogChange();
  const updateSlotSubject = useUpdateSlotSubject();
  const setBundle = useSetSlotSubjectBundle();
  const setBundleCapacity = useSetBundleCapacity();
  const { toast } = useToast();

  const [editing, setEditing] = useState({
    title: slot.title ?? '',
    semester: slot.semester,
    pick: slot.pick_count,
  });
  useEffect(() => {
    setEditing({
      title: slot.title ?? '',
      semester: slot.semester,
      pick: slot.pick_count,
    });
  }, [slot.id, slot.semester, slot.title, slot.pick_count]);

  const dirty =
    (editing.title || null) !== (slot.title || null) ||
    editing.semester !== slot.semester ||
    editing.pick !== slot.pick_count;

  const [dlgOpen, setDlgOpen] = useState(false);
  const [customDlgOpen, setCustomDlgOpen] = useState(false);
  // 묶음 만들기 — 체크된 과목 ids
  const [bundleSelection, setBundleSelection] = useState<Set<string>>(new Set());
  const [bundleDlgOpen, setBundleDlgOpen] = useState(false);
  const [bundleLabel, setBundleLabel] = useState('');

  useEffect(() => {
    setBundleSelection(new Set());
  }, [slot.id]);

  const choices = useMemo(() => groupSlotChoices(slot.subjects ?? []), [slot.subjects]);

  const onCreateBundle = async () => {
    if (bundleSelection.size < 2) {
      toast({ title: '2개 이상의 과목을 선택하세요.' });
      return;
    }
    const ids = Array.from(bundleSelection);
    const bk = `set-${Date.now().toString(36)}`;
    const label = bundleLabel.trim() || null;
    await setBundle.mutateAsync({
      slot_subject_ids: ids,
      bundle_key: bk,
      bundle_label: label,
      round_id: roundId,
    });
    await logChange.mutateAsync({
      p_round_id: roundId, p_actor_name: actor.name, p_actor_role: actor.role,
      p_action: 'bundle_create', p_target_type: 'slot_subject',
      p_target_id: null, p_target_label: label ?? bk,
      p_diff: { ids, bundle_key: bk, label },
    });
    setBundleSelection(new Set());
    setBundleLabel('');
    setBundleDlgOpen(false);
  };

  const onUnbundleChoice = async (subs: SlotSubjectView[], label: string) => {
    await setBundle.mutateAsync({
      slot_subject_ids: subs.map((s) => s.id),
      bundle_key: null,
      bundle_label: null,
      round_id: roundId,
    });
    await logChange.mutateAsync({
      p_round_id: roundId, p_actor_name: actor.name, p_actor_role: actor.role,
      p_action: 'bundle_unbind', p_target_type: 'slot_subject',
      p_target_id: null, p_target_label: label,
      p_diff: { ids: subs.map((s) => s.id) },
    });
  };

  const onRelabelBundle = async (bundleKey: string, subs: SlotSubjectView[], newLabel: string) => {
    await setBundle.mutateAsync({
      slot_subject_ids: subs.map((s) => s.id),
      bundle_key: bundleKey,
      bundle_label: newLabel || null,
      round_id: roundId,
    });
  };

  const saveSlot = async () => {
    if (!dirty) return;
    await upsertSlot.mutateAsync({
      id: slot.id, group_id: slot.group_id, round_id: roundId,
      title: editing.title.trim() || null,
      semester: editing.semester,
      pick_count: Math.max(1, editing.pick),
    });
    await logChange.mutateAsync({
      p_round_id: roundId, p_actor_name: actor.name, p_actor_role: actor.role,
      p_action: 'slot_update', p_target_type: 'slot',
      p_target_id: slot.id,
      p_target_label: editing.title || slotDisplayTitle({
        title: editing.title, semester: editing.semester, pick_count: editing.pick,
      }),
      p_diff: {
        before: { title: slot.title, semester: slot.semester, pick: slot.pick_count },
        after: { title: editing.title || null, semester: editing.semester, pick: editing.pick },
      },
    });
  };

  return (
    <div
      style={{
        background: '#fff',
        border: `1.5px solid ${T.primary}`,
        borderRadius: T.r3,
        padding: 18,
        boxShadow: '0 0 0 3px oklch(95% 0.04 282)',
      }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background: T.ink,
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            display: 'grid',
            placeItems: 'center',
            fontFamily: T.fontMono,
          }}
        >
          {(group.slots ?? []).indexOf(slot) + 1}
        </span>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>
          {slotDisplayTitle({ title: editing.title, semester: editing.semester, pick_count: editing.pick })}
        </span>
        <Pill tone="primary" size="sm">편집 중</Pill>
        {dirty && <Pill tone="warning" size="sm">미저장 변경</Pill>}
        <Btn
          variant="ghost"
          size="sm"
          style={{ marginLeft: 'auto' }}
          icon={<Trash2 className="h-3.5 w-3.5" />}
          onClick={async () => {
            if (!confirm(`선택그룹 "${slotDisplayTitle(slot)}"을(를) 삭제하시겠습니까?`)) return;
            await deleteSlot.mutateAsync({ id: slot.id, round_id: roundId });
            await logChange.mutateAsync({
              p_round_id: roundId, p_actor_name: actor.name, p_actor_role: actor.role,
              p_action: 'slot_delete', p_target_type: 'slot',
              p_target_id: slot.id, p_target_label: slotDisplayTitle(slot),
              p_diff: { before: { title: slot.title } },
            });
            onDeleteSlotDone();
          }}
        >
          삭제
        </Btn>
      </div>

      {/* 메타 필드 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '10px 14px',
          fontSize: 12.5,
          marginBottom: 14,
          alignItems: 'center',
        }}
      >
        <span style={{ color: T.inkDim }}>학기</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { v: 1, l: '1학기' },
            { v: 2, l: '2학기' },
            { v: null, l: '미지정' },
          ].map((o) => (
            <Btn
              key={o.l}
              size="sm"
              variant={editing.semester === o.v ? 'primary' : 'outline'}
              onClick={() => setEditing({ ...editing, semester: o.v })}
            >
              {o.l}
            </Btn>
          ))}
        </div>
        <span style={{ color: T.inkDim }}>타이틀</span>
        <Input
          value={editing.title}
          onChange={(e) => setEditing({ ...editing, title: e.target.value })}
          placeholder="선택사항 — 비우면 학기·과목수로 자동 생성"
        />
        <span style={{ color: T.inkDim }}>선택 과목 수</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 80 }}>
            <Input
              type="number"
              mono
              value={editing.pick}
              onChange={(e) => setEditing({ ...editing, pick: parseInt(e.target.value || '1', 10) })}
            />
          </div>
          <span style={{ color: T.inkMuted }}>과목을 골라야 합니다</span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Btn
          variant="primary"
          size="sm"
          icon={<Save className="h-3.5 w-3.5" />}
          onClick={saveSlot}
          disabled={!dirty || upsertSlot.isPending}
        >
          슬롯 메타 적용
        </Btn>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: T.inkDim,
            letterSpacing: 0.4,
            flex: 1,
          }}
        >
          포함된 과목 · 정원은 과목별 설정 · 같은 묶음은 세트로 선택됨
        </div>
        {bundleSelection.size >= 2 && (
          <Btn
            variant="primary"
            size="sm"
            onClick={() => setBundleDlgOpen(true)}
          >
            {bundleSelection.size}개를 한 세트로 묶기
          </Btn>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(slot.subjects ?? []).length === 0 && (
          <div
            style={{
              padding: '12px 14px',
              background: T.surfaceMuted,
              border: `1px dashed ${T.border}`,
              borderRadius: T.r2,
              fontSize: 12,
              color: T.inkDim,
            }}
          >
            아직 과목이 없습니다. 아래 "교육과정 과목 추가"로 학기 개설 과목 중 골라 추가하세요.
          </div>
        )}
        {choices.map((choice) =>
          choice.bundleKey ? (
            <BundleCard
              key={choice.key}
              bundleKey={choice.bundleKey}
              subs={choice.subjects}
              label={choice.label}
              roundId={roundId}
              onRename={(l) => onRelabelBundle(choice.bundleKey!, choice.subjects, l)}
              onUnbundle={() => onUnbundleChoice(choice.subjects, choice.label)}
              onUpdateBundleCapacity={async (cap) => {
                const ids = choice.subjects.map((s) => s.id);
                const prev = choice.subjects[0]?.override_capacity ?? null;
                await setBundleCapacity.mutateAsync({
                  slot_subject_ids: ids,
                  capacity: cap,
                  round_id: roundId,
                });
                await logChange.mutateAsync({
                  p_round_id: roundId,
                  p_actor_name: actor.name,
                  p_actor_role: actor.role,
                  p_action: 'bundle_capacity_update',
                  p_target_type: 'slot_subject',
                  p_target_id: null,
                  p_target_label: choice.label,
                  p_diff: { before: prev, after: cap, member_count: ids.length },
                });
              }}
              activeSubjectId={selectedSubjectId}
              onSelectSubject={onSelectSubject}
            />
          ) : (
            <SlotSubjectRow
              key={choice.key}
              subject={choice.subjects[0]}
              roundId={roundId}
              active={choice.subjects[0].id === selectedSubjectId}
              onSelect={() => onSelectSubject(choice.subjects[0].id)}
              checked={bundleSelection.has(choice.subjects[0].id)}
              onToggleCheck={() => {
                const next = new Set(bundleSelection);
                const id = choice.subjects[0].id;
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setBundleSelection(next);
              }}
              onUpdateCapacity={async (cap) => {
                const sub = choice.subjects[0];
                await updateSlotSubject.mutateAsync({
                  id: sub.id,
                  round_id: roundId,
                  override_capacity: cap,
                });
                await logChange.mutateAsync({
                  p_round_id: roundId, p_actor_name: actor.name, p_actor_role: actor.role,
                  p_action: 'capacity_update', p_target_type: 'slot_subject',
                  p_target_id: sub.id, p_target_label: sub.name,
                  p_diff: { before: sub.override_capacity, after: cap },
                });
              }}
            />
          ),
        )}
      </div>

      {/* 세트 만들기 다이얼로그 */}
      <Dialog open={bundleDlgOpen} onOpenChange={setBundleDlgOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>세트로 묶기</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div style={{ fontSize: 12, color: T.inkMuted, lineHeight: 1.6 }}>
              선택된 <strong style={{ color: T.ink }}>{bundleSelection.size}개</strong> 과목이 한 세트로 묶여
              학생 화면에서 함께 선택됩니다.
            </div>
            <Field label="세트 이름 (선택사항)" hint="비우면 과목명 나열로 자동 표시 (예: 한문 + 한자)">
              <Input
                value={bundleLabel}
                onChange={(e) => setBundleLabel(e.target.value)}
                placeholder="예: 한문 + 한자 세트"
              />
            </Field>
            <div
              style={{
                background: T.surfaceMuted,
                borderRadius: T.r2,
                padding: '8px 10px',
                fontSize: 12,
                color: T.inkMuted,
              }}
            >
              포함될 과목:{' '}
              {(slot.subjects ?? [])
                .filter((s) => bundleSelection.has(s.id))
                .map((s) => s.name)
                .join(', ')}
            </div>
          </div>
          <DialogFooter>
            <Btn variant="ghost" size="md" onClick={() => setBundleDlgOpen(false)}>
              취소
            </Btn>
            <Btn variant="primary" size="md" onClick={onCreateBundle} disabled={setBundle.isPending}>
              세트 생성
            </Btn>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
          <DialogTrigger asChild>
            <button
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                fontSize: 12,
                background: '#fff',
                border: `1px solid ${T.borderStrong}`,
                borderRadius: T.r2,
                cursor: 'pointer',
                fontWeight: 600,
                color: T.ink,
                fontFamily: 'inherit',
              }}
            >
              <BookOpen className="h-3 w-3" />
              교육과정 과목 추가
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <CurriculumPicker
              roundId={roundId}
              groupId={group.id}
              slot={slot}
              actor={actor}
              onClose={() => setDlgOpen(false)}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={customDlgOpen} onOpenChange={setCustomDlgOpen}>
          <DialogTrigger asChild>
            <button
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                fontSize: 12,
                background: T.primary,
                border: `1px solid ${T.primary}`,
                borderRadius: T.r2,
                cursor: 'pointer',
                fontWeight: 600,
                color: '#fff',
                fontFamily: 'inherit',
              }}
              title="교육과정에 없는 신규 과목을 직접 입력해서 추가"
            >
              <PlusIcon className="h-3 w-3" />
              직접 과목 추가
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <CustomSubjectAdder
              roundId={roundId}
              group={group}
              slot={slot}
              actor={actor}
              onClose={() => setCustomDlgOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ============================================================
// SlotSubjectRow
// ============================================================
function SlotSubjectRow({
  subject,
  roundId,
  active,
  onSelect,
  onUpdateCapacity,
  checked,
  onToggleCheck,
  insideBundle = false,
  /** 세트의 비대표 행: capacity input 비활성, 대표 행 값으로 readonly 표시 */
  capacityFollowsBundle = false,
  bundleSharedCapacity = null,
}: {
  subject: SlotSubjectView;
  roundId: string;
  active: boolean;
  onSelect: () => void;
  onUpdateCapacity: (cap: number | null) => Promise<void>;
  checked?: boolean;
  onToggleCheck?: () => void;
  insideBundle?: boolean;
  capacityFollowsBundle?: boolean;
  bundleSharedCapacity?: number | null;
}) {
  const [cap, setCap] = useState<string>(subject.override_capacity?.toString() ?? '');
  useEffect(() => {
    setCap(subject.override_capacity?.toString() ?? '');
  }, [subject.id, subject.override_capacity]);

  const saveCap = async () => {
    const v = cap === '' ? null : parseInt(cap, 10);
    if (v === subject.override_capacity) return;
    await onUpdateCapacity(v);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: onToggleCheck && !insideBundle ? '18px 14px 1fr 100px 50px' : '14px 1fr 100px 50px',
        gap: 10,
        alignItems: 'center',
        padding: '8px 12px',
        background: active ? T.primarySoft : T.surfaceMuted,
        border: `1px solid ${active ? T.primary : T.border}`,
        borderRadius: T.r2,
      }}
    >
      {onToggleCheck && !insideBundle && (
        <button
          onClick={onToggleCheck}
          title="세트로 묶을 과목 체크"
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            background: checked ? T.primary : '#fff',
            border: `1.5px solid ${checked ? T.primary : T.borderStrong}`,
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            fontSize: 10,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {checked ? '✓' : ''}
        </button>
      )}
      <GripVertical className="h-3 w-3" style={{ color: T.inkDim }} />
      <button
        onClick={onSelect}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
          padding: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SubjectTag cat={subject.category_code} size="sm" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{subject.name}</span>
        </div>
        <div style={{ fontSize: 10.5, color: T.inkDim, fontFamily: T.fontMono, marginTop: 2 }}>
          기본 정원 {subject.default_max_capacity ?? '—'}
          {subject.semester != null && ` · ${subject.semester}학기`}
        </div>
      </button>
      {capacityFollowsBundle ? (
        <div
          title="세트 정원은 대표 과목에서 변경"
          style={{
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: T.surfaceSunk,
            border: `1px dashed ${T.border}`,
            borderRadius: T.r2,
            fontSize: 12,
            color: T.inkDim,
            fontFamily: T.fontMono,
          }}
        >
          {bundleSharedCapacity != null ? `↑ ${bundleSharedCapacity}` : '↑ 무제한'}
        </div>
      ) : (
        <div title="이 슬롯에서의 정원 (비우면 무제한)">
          <Input
            type="number"
            mono
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            onBlur={saveCap}
            placeholder="무제한"
          />
        </div>
      )}
      <span style={{ fontSize: 11, color: T.inkDim, fontFamily: T.fontMono, textAlign: 'right' }}>
        명
      </span>
    </div>
  );
}

// ============================================================
// BundleCard — 슬롯 안에서 한 묶음 (세트)
//
// 정원 정책: 세트 = 하나의 capacity. 첫 과목 행의 input만 활성화되고,
// 변경 시 세트 안 모든 과목의 override_capacity를 일괄 동기화.
// ============================================================
function BundleCard({
  bundleKey,
  subs,
  label,
  roundId,
  onRename,
  onUnbundle,
  onUpdateBundleCapacity,
  activeSubjectId,
  onSelectSubject,
}: {
  bundleKey: string;
  subs: SlotSubjectView[];
  label: string;
  roundId: string;
  onRename: (newLabel: string) => Promise<void>;
  onUnbundle: () => Promise<void>;
  /** 세트 전체 정원 동기화 — 모든 과목의 override_capacity가 같이 update */
  onUpdateBundleCapacity: (cap: number | null) => Promise<void>;
  activeSubjectId: string | null;
  onSelectSubject: (id: string | null) => void;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState(label);
  useEffect(() => setLabelDraft(label), [label]);

  // 세트 대표 정원: 첫 과목의 override_capacity (모두 같은 값이라야 정상)
  const sharedCapacity = subs[0]?.override_capacity ?? null;

  return (
    <div
      style={{
        background: T.primarySoft,
        border: `1.5px solid ${T.primary}`,
        borderRadius: T.r2,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Pill tone="primary" size="sm">세트</Pill>
        {renameOpen ? (
          <div style={{ flex: 1 }}>
            <Input
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              placeholder="세트 이름"
              autoFocus
              onBlur={async () => {
                if (labelDraft !== label) await onRename(labelDraft);
                setRenameOpen(false);
              }}
              onKeyDown={async (e) => {
                if ((e as any).key === 'Enter') {
                  if (labelDraft !== label) await onRename(labelDraft);
                  setRenameOpen(false);
                }
                if ((e as any).key === 'Escape') {
                  setLabelDraft(label);
                  setRenameOpen(false);
                }
              }}
            />
          </div>
        ) : (
          <span
            style={{ fontSize: 13, fontWeight: 700, color: T.ink, flex: 1, cursor: 'text' }}
            onDoubleClick={() => setRenameOpen(true)}
          >
            {label}
          </span>
        )}
        <span style={{ fontSize: 10.5, color: T.inkDim, fontFamily: T.fontMono }}>
          세트 정원 {sharedCapacity ?? '무제한'}
        </span>
        <Btn variant="ghost" size="sm" onClick={() => setRenameOpen(true)}>
          이름 수정
        </Btn>
        <Btn variant="ghost" size="sm" onClick={onUnbundle}>
          세트 해제
        </Btn>
      </div>
      <div style={{ paddingLeft: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {subs.map((sub, idx) => (
          <SlotSubjectRow
            key={sub.id}
            subject={sub}
            roundId={roundId}
            active={sub.id === activeSubjectId}
            onSelect={() => onSelectSubject(sub.id)}
            insideBundle
            capacityFollowsBundle={idx > 0}
            bundleSharedCapacity={sharedCapacity}
            onUpdateCapacity={async (cap) => {
              // 첫 과목 행에서만 호출됨 (idx===0). 세트 전체에 일괄 적용.
              if (idx === 0) await onUpdateBundleCapacity(cap);
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CustomSubjectAdder — 교육과정에 없는 과목을 직접 입력해서 추가
// ============================================================
function CustomSubjectAdder({
  roundId,
  group,
  slot,
  actor,
  onClose,
}: {
  roundId: string;
  group: GroupView;
  slot: SlotView;
  actor: CurrentActor;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const addCustom = useAddCustomSubject();
  const logChange = useLogChange();
  const { data: tree } = useRoundTree(roundId);

  // group이 학년/연도를 가지면 그 값, 없으면 round의 값으로 fallback
  const academic_year = group.academic_year ?? tree?.round?.academic_year ?? null;
  const grade = group.target_grade ?? tree?.round?.target_grade ?? null;

  const [form, setForm] = useState({
    subject: '',
    category: (group.category_codes?.[0] ?? '교양') as string,
    credits: 2,
    semester: slot.semester ?? 1,
    subject_type: '진로 선택' as string,
    grading_type: '5단계' as string,
    area: '' as string,
    hours: '' as string,
    override_capacity: '' as string,
  });

  const onSubmit = async () => {
    if (!form.subject.trim()) {
      toast({ title: '과목명을 입력하세요', variant: 'destructive' });
      return;
    }
    if (academic_year == null || grade == null) {
      toast({
        title: '학년/연도가 비어있음',
        description: '선택군 설정에서 학년·연도를 먼저 지정하세요.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const res = await addCustom.mutateAsync({
        slot_id: slot.id,
        subject: form.subject.trim(),
        category: form.category,
        credits: Math.max(1, form.credits),
        semester: form.semester,
        academic_year,
        grade,
        subject_type: form.subject_type || null,
        grading_type: form.grading_type || null,
        area: form.area.trim() || null,
        hours: form.hours ? parseInt(form.hours, 10) : null,
        override_capacity: form.override_capacity
          ? parseInt(form.override_capacity, 10)
          : null,
        round_id: roundId,
      });
      await logChange.mutateAsync({
        p_round_id: roundId,
        p_actor_name: actor.name,
        p_actor_role: actor.role,
        p_action: 'subject_create_custom',
        p_target_type: 'subject',
        p_target_id: res.subject_id,
        p_target_label: res.subject_name,
        p_diff: {
          slot: slotDisplayTitle(slot),
          subject: res.subject_name,
          academic_year,
          grade,
          semester: form.semester,
          category: form.category,
          credits: form.credits,
          curriculum_created: res.curriculum_created,
          subject_created: res.subject_created,
        },
      });
      toast({
        title: '직접 과목 추가됨',
        description: `${res.subject_name}${res.curriculum_created ? ' (교육과정에도 신규 등록)' : ''}`,
      });
      onClose();
    } catch (e: any) {
      toast({
        title: '추가 실패',
        description: e?.message ?? '오류',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>직접 과목 추가 — {slotDisplayTitle(slot)}</DialogTitle>
      </DialogHeader>
      <div
        style={{
          fontSize: 12,
          color: T.inkMuted,
          lineHeight: 1.6,
          padding: '8px 12px',
          background: T.surfaceMuted,
          borderRadius: T.r2,
          marginBottom: 8,
        }}
      >
        교육과정(school_curriculum)에 등록되지 않은 신규 과목을 직접 입력해 추가합니다.
        과목은 <strong style={{ color: T.ink }}>{academic_year ?? '?'}학년도 {grade ?? '?'}학년 {form.semester}학기</strong> 교육과정에도 함께 등록됩니다.
      </div>
      <div className="space-y-3">
        <Field label="과목명" required>
          <Input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="예: 환경과 생활"
          />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
          <Field label="과목군 (카테고리)" required>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minWidth: 0 }}>
              {CATEGORY_KEYS.map((c) => (
                <Btn
                  key={c}
                  size="sm"
                  variant={form.category === c ? 'primary' : 'outline'}
                  onClick={() => setForm({ ...form, category: c })}
                >
                  {c}
                </Btn>
              ))}
            </div>
          </Field>
          <Field label="학기" required>
            <div style={{ display: 'flex', gap: 6, width: '100%', minWidth: 0 }}>
              {[1, 2].map((s) => (
                <Btn
                  key={s}
                  size="sm"
                  variant={form.semester === s ? 'primary' : 'outline'}
                  onClick={() => setForm({ ...form, semester: s })}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {s}학기
                </Btn>
              ))}
            </div>
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 10 }}>
          <Field label="학점" required>
            <Input
              type="number"
              mono
              value={form.credits}
              onChange={(e) =>
                setForm({ ...form, credits: parseInt(e.target.value || '1', 10) })
              }
            />
          </Field>
          <Field label="과목 유형">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minWidth: 0 }}>
              {['일반 선택', '진로 선택', '융합 선택', '공통'].map((t) => (
                <Btn
                  key={t}
                  size="sm"
                  variant={form.subject_type === t ? 'soft' : 'outline'}
                  onClick={() => setForm({ ...form, subject_type: t })}
                >
                  {t}
                </Btn>
              ))}
            </div>
          </Field>
        </div>

        <Field label="평가 방식">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minWidth: 0 }}>
            {['5단계', '9등급', 'P/F', '성취평가'].map((t) => (
              <Btn
                key={t}
                size="sm"
                variant={form.grading_type === t ? 'soft' : 'outline'}
                onClick={() => setForm({ ...form, grading_type: t })}
              >
                {t}
              </Btn>
            ))}
          </div>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
          <Field label="영역" hint="선택사항">
            <Input
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              placeholder="예: 인문사회"
            />
          </Field>
          <Field label="주당 시수" hint="선택사항">
            <Input
              type="number"
              mono
              value={form.hours}
              onChange={(e) => setForm({ ...form, hours: e.target.value })}
              placeholder="시간"
            />
          </Field>
          <Field label="이 슬롯 정원" hint="비우면 무제한">
            <Input
              type="number"
              mono
              value={form.override_capacity}
              onChange={(e) => setForm({ ...form, override_capacity: e.target.value })}
              placeholder="명"
            />
          </Field>
        </div>
      </div>
      <DialogFooter>
        <Btn variant="ghost" size="md" onClick={onClose}>
          취소
        </Btn>
        <Btn
          variant="primary"
          size="md"
          onClick={onSubmit}
          disabled={addCustom.isPending || !form.subject.trim()}
        >
          {addCustom.isPending ? '추가 중…' : '직접 과목 추가'}
        </Btn>
      </DialogFooter>
    </>
  );
}

// ============================================================
// CurriculumPicker — school_curriculum 기반 멀티 선택
// ============================================================
function CurriculumPicker({
  roundId,
  groupId,
  slot,
  actor,
  onClose,
}: {
  roundId: string;
  groupId: string;
  slot: SlotView;
  actor: CurrentActor;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [filterSem, setFilterSem] = useState<number | null>(slot.semester);
  const { data: curriculum = [], isLoading } = useCurriculumSubjectsForGroup(groupId, filterSem);
  const attachCurriculum = useAttachCurriculumSubjects();
  const logChange = useLogChange();

  // 이미 attach된 과목 매칭 — selectable_subject_id 또는 (이름 + 학기) 둘 다 검사
  const attachedSubjectIds = useMemo(
    () => new Set(slot.subjects.map((s) => `${s.selectable_subject_id}::${s.semester ?? ''}`)),
    [slot.subjects],
  );
  const attachedNames = useMemo(
    () => new Set(slot.subjects.map((s) => `${s.name}::${s.semester ?? ''}`)),
    [slot.subjects],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const byCategory = useMemo(() => {
    const m = new Map<string, CurriculumSubject[]>();
    for (const c of curriculum) {
      const arr = m.get(c.category) ?? [];
      arr.push(c);
      m.set(c.category, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [curriculum]);

  const onAttach = async () => {
    const curriculumIds: string[] = [];
    const labels: string[] = [];
    for (const c of curriculum) {
      const key = curriculumKey(c);
      if (!selected.has(key)) continue;
      curriculumIds.push(c.curriculum_id);
      labels.push(c.subject);
    }
    if (curriculumIds.length === 0) {
      toast({ title: '선택된 과목이 없습니다', description: '체크박스를 눌러 추가할 과목을 선택하세요.' });
      return;
    }
    try {
      const res = await attachCurriculum.mutateAsync({
        slot_id: slot.id,
        round_id: roundId,
        curriculum_ids: curriculumIds,
      });
      await logChange.mutateAsync({
        p_round_id: roundId, p_actor_name: actor.name, p_actor_role: actor.role,
        p_action: 'subject_attach', p_target_type: 'slot_subject',
        p_target_id: null, p_target_label: `${res.added}개 과목 추가`,
        p_diff: { slot: slotDisplayTitle(slot), subjects: res.names, skipped: res.skipped },
      });
      toast({
        title: `${res.added}개 과목 추가됨`,
        description: res.skipped > 0 ? `(이미 있는 ${res.skipped}개는 건너뜀)` : undefined,
      });
      onClose();
    } catch (e: any) {
      toast({ title: '과목 추가 실패', description: e?.message ?? '오류', variant: 'destructive' });
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{slotDisplayTitle(slot)} — 교육과정 과목 추가</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: T.inkDim }}>학기 필터</span>
          {[
            { v: 1, l: '1학기' },
            { v: 2, l: '2학기' },
            { v: null, l: '전체' },
          ].map((o) => (
            <Btn
              key={o.l}
              size="sm"
              variant={filterSem === o.v ? 'primary' : 'outline'}
              onClick={() => setFilterSem(o.v)}
            >
              {o.l}
            </Btn>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: T.inkMuted }}>
            선택됨 <span style={{ fontFamily: T.fontMono, fontWeight: 700, color: T.ink }}>{selected.size}</span>
          </span>
        </div>

        <div
          style={{
            maxHeight: 420,
            overflowY: 'auto',
            border: `1px solid ${T.border}`,
            borderRadius: T.r2,
          }}
        >
          {isLoading && (
            <div style={{ padding: 16, color: T.inkDim, fontSize: 13 }}>로딩 중…</div>
          )}
          {!isLoading && curriculum.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: T.inkDim, fontSize: 13, lineHeight: 1.6 }}>
              해당 학년/학기의 교육과정 과목이 없습니다.<br />
              <span style={{ fontSize: 11 }}>school_curriculum 데이터를 먼저 등록하세요.</span>
            </div>
          )}
          {byCategory.map(([category, items]) => (
            <div key={category}>
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  background: T.surfaceMuted,
                  padding: '6px 14px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: T.inkMuted,
                  letterSpacing: 0.3,
                  borderBottom: `1px solid ${T.border}`,
                  zIndex: 1,
                }}
              >
                {category}
                <span style={{ marginLeft: 6, fontFamily: T.fontMono, color: T.inkDim }}>{items.length}</span>
              </div>
              {items.map((c) => {
                const key = curriculumKey(c);
                const already =
                  (c.selectable_subject_id != null &&
                    attachedSubjectIds.has(`${c.selectable_subject_id}::${c.semester ?? ''}`)) ||
                  attachedNames.has(`${c.subject}::${c.semester ?? ''}`);
                const disabled = already;
                const checked = selected.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => !disabled && toggle(key)}
                    disabled={disabled}
                    style={{
                      width: '100%',
                      display: 'grid',
                      gridTemplateColumns: '20px 1fr 60px 50px 60px',
                      gap: 10,
                      alignItems: 'center',
                      padding: '8px 14px',
                      fontSize: 13,
                      borderBottom: `1px solid ${T.border}`,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.5 : 1,
                      background: checked ? T.primarySoft : 'transparent',
                      border: 'none',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: checked ? T.primary : '#fff',
                        border: `1.5px solid ${checked ? T.primary : T.borderStrong}`,
                        display: 'grid',
                        placeItems: 'center',
                        color: '#fff',
                        fontSize: 10,
                      }}
                    >
                      {checked ? '✓' : ''}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.subject}</div>
                      <div style={{ fontSize: 10.5, color: T.inkDim, fontFamily: T.fontMono, marginTop: 2 }}>
                        {c.subject_type ?? '—'} · {c.grading_type ?? '—'}
                        {already && ' · 이미 추가됨'}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.fontMono, textAlign: 'right' }}>
                      {c.credits}단위
                    </span>
                    <span style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.fontMono, textAlign: 'right' }}>
                      {c.semester}학기
                    </span>
                    <span style={{ fontSize: 11, color: T.inkDim, fontFamily: T.fontMono, textAlign: 'right' }}>
                      {c.default_max_capacity ?? '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Btn variant="ghost" size="md" onClick={onClose}>
          취소
        </Btn>
        <Btn
          variant="primary"
          size="md"
          onClick={onAttach}
          disabled={selected.size === 0 || attachCurriculum.isPending}
        >
          {attachCurriculum.isPending ? '추가 중…' : `${selected.size}개 과목 추가`}
        </Btn>
      </DialogFooter>
    </>
  );
}

function curriculumKey(c: CurriculumSubject): string {
  return `${c.curriculum_id}::${c.semester}`;
}

// ============================================================
// SubjectInspector — 우측 패널
// ============================================================
function SubjectInspector({
  subject,
  slot,
  roundId,
  onDetach,
}: {
  subject: SlotSubjectView;
  slot: SlotView;
  roundId: string;
  onDetach: () => Promise<void>;
}) {
  return (
    <>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            fontFamily: T.fontMono,
            color: T.inkDim,
            letterSpacing: 0.4,
          }}
        >
          SUBJECT · {subject.category_code ?? '?'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <SubjectTag cat={subject.category_code} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>{subject.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {subject.semester != null && (
            <Pill tone="neutral" size="sm">{subject.semester}학기</Pill>
          )}
          <Pill tone="primary" size="sm">
            정원 {subject.override_capacity ?? '무제한'}
          </Pill>
          {subject.default_max_capacity != null && (
            <Pill tone="neutral" size="sm">기본 {subject.default_max_capacity}</Pill>
          )}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <Field label="과목명">
          <Input value={subject.name} disabled />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="과목군">
            <Input value={subject.category_code ?? '—'} mono disabled />
          </Field>
          <Field label="기본 정원">
            <Input value={subject.default_max_capacity?.toString() ?? '—'} mono disabled />
          </Field>
        </div>

        <div style={{ height: 1, background: T.border, margin: '6px 0' }} />

        <div style={{ fontSize: 11, fontWeight: 700, color: T.inkDim, letterSpacing: 0.4 }}>
          위치
        </div>
        <div style={{ fontSize: 12, color: T.inkMuted, lineHeight: 1.6 }}>
          소속 슬롯: <span style={{ color: T.ink, fontWeight: 600 }}>{slotDisplayTitle(slot)}</span><br />
          override 정원:{' '}
          <span style={{ fontFamily: T.fontMono }}>
            {subject.override_capacity ?? '미설정 (무제한)'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: T.inkDim, lineHeight: 1.5, padding: '8px 10px', background: T.surfaceSunk, borderRadius: T.r2 }}>
          정원은 슬롯의 과목 행에서 직접 편집합니다.
        </div>
      </div>

      <div
        style={{
          borderTop: `1px solid ${T.border}`,
          padding: 14,
          display: 'flex',
          gap: 8,
          justifyContent: 'space-between',
        }}
      >
        <Btn
          variant="ghost"
          size="md"
          icon={<X className="h-3.5 w-3.5" />}
          onClick={onDetach}
        >
          이 슬롯에서 제거
        </Btn>
      </div>
    </>
  );
}
