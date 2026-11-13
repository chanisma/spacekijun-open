/**
 * 학생 신청 화면 (V2 방향) — mockup StudentApplyV2 패턴.
 *
 * 데이터:
 *  - useRoundTree     : 차수 트리
 *  - useMySelection   : 본인 기존 selections
 *  - useSlotCapacity  : 정원 카운트 (15초 폴링)
 *  - useSaveSelectionGroup : 그룹 단위 저장 RPC
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Btn, Pill, SubjectTag, CapacityBar, GroupTabs, StatusBar,
} from '../common/atoms';
import { T } from '../../utils/tokens';
import { timeRemaining } from '../../utils/time';
import {
  useRoundTree, useMySelection, useSlotCapacity, useSaveSelectionGroup,
  useSubjectSelectionDraft,
} from '../../hooks';
import { toCapacityMap } from '../../hooks/useRound';
import { capacityKey } from '../../types';
import type { CurrentActor } from '../../hooks/useCurrentActor';
import type {
  GroupView, SavePick, GroupSaveState,
} from '../../types';
import { slotDisplayTitle, groupSlotChoices, resolveDisplayOptions } from '../../types';

interface Props {
  roundId: string;
  actor: CurrentActor;
  onBack: () => void;
  previewMode?: boolean;
}

export default function StudentApply({ roundId, actor, onBack, previewMode = false }: Props) {
  const { toast } = useToast();
  const { data: tree, isLoading: treeLoading } = useRoundTree(roundId);
  const { data: mine } = useMySelection(roundId, actor.studentCode ?? null);
  const { data: capacityRows = [] } = useSlotCapacity(roundId, { refetchIntervalMs: 15_000 });
  const saveMut = useSaveSelectionGroup();
  const sel = useSubjectSelectionDraft();

  const capacityMap = useMemo(() => toCapacityMap(capacityRows), [capacityRows]);
  const displayOptions = useMemo(() => resolveDisplayOptions(tree?.round ?? null), [tree?.round]);
  // 학생용 group 필터링 정책
  //  - round.admission_year가 set이면: 입학연도 코호트가 동일 학년이라고 보고 모든 group 노출
  //  - admission_year 미지정 + 학생 grade 있음: group.target_grade(없으면 round 값) 매칭
  //  - 학생 grade null: 모든 group 노출 (데이터 누락 시 fail-open)
  const allGroups: GroupView[] = tree?.groups ?? [];
  const groups: GroupView[] = useMemo(() => {
    if (previewMode) return allGroups;
    const roundAdmission = (tree?.round as any)?.admission_year as number | null | undefined;
    if (roundAdmission != null) return allGroups;
    if (!actor.studentGrade) return allGroups;
    const rg = tree?.round?.target_grade ?? null;
    return allGroups.filter((g) => {
      const eff = g.target_grade ?? rg;
      return eff == null || eff === actor.studentGrade;
    });
  }, [allGroups, tree?.round, actor.studentGrade, previewMode]);

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  useEffect(() => {
    if (!activeGroupId && groups[0]) setActiveGroupId(groups[0].id);
  }, [groups, activeGroupId]);

  const savedGroupIds = new Set(mine?.saved_group_ids ?? []);

  useEffect(() => {
    if (!mine || !groups.length) return;
    sel.initFromItems(groups, mine.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine?.submission?.id, groups.length]);

  const onSaveGroup = async (group: GroupView) => {
    if (previewMode) {
      toast({
        title: '미리보기 모드',
        description: '학생 미리보기 모드에서는 저장할 수 없습니다.',
      });
      return;
    }
    if (!actor.studentCode) {
      toast({
        title: '학번 확인 불가',
        description: '학생 정보가 연결되지 않았습니다.',
        variant: 'destructive',
      });
      return;
    }
    const picks: SavePick[] = sel.picksForGroup(group);
    try {
      const res = await saveMut.mutateAsync({
        p_round_id: roundId,
        p_group_id: group.id,
        p_student_resource_id: actor.studentResourceId,
        p_student_code: actor.studentCode,
        p_student_name: actor.name,
        p_student_grade: actor.studentGrade,
        p_student_class: actor.studentClass,
        p_student_no: actor.studentNo,
        p_picks: picks,
        p_actor_role: 'student',
      });
      sel.clearDirty(group.id);
      toast({
        title: res.action === 'created' ? '저장 완료' : '수정 완료',
        description: `${group.name} · ${res.items_count}개 과목`,
      });
    } catch (e: any) {
      const msg = e?.message ?? '오류';
      if (msg.includes('capacity_exceeded')) {
        toast({
          title: '정원 마감',
          description: '해당 과목의 정원이 방금 마감되었습니다. 다른 과목을 선택하세요.',
          variant: 'destructive',
        });
      } else if (msg.includes('round_closed')) {
        toast({
          title: '신청 마감',
          description: '이미 마감된 차수입니다.',
          variant: 'destructive',
        });
      } else {
        toast({ title: '저장 실패', description: msg, variant: 'destructive' });
      }
    }
  };

  if (treeLoading || !tree)
    return <div style={{ padding: 24, color: T.inkDim }}>로딩 중…</div>;

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0];
  const dirty = activeGroup ? sel.dirtyGroups.has(activeGroup.id) : false;
  const savedHere = activeGroup ? savedGroupIds.has(activeGroup.id) : false;
  const totalGroups = groups.length;
  const doneCount = groups.filter(
    (g) => savedGroupIds.has(g.id) && !sel.dirtyGroups.has(g.id),
  ).length;
  const remainingText = timeRemaining(tree.round.closes_at);

  const completedMap: Record<string, GroupSaveState> = {};
  for (const g of groups) {
    const saved = savedGroupIds.has(g.id);
    const gDirty = sel.dirtyGroups.has(g.id);
    completedMap[g.id] = saved && !gDirty ? 'saved' : gDirty ? 'partial' : 'untouched';
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: T.bg,
        overflow: 'hidden',
        fontFamily:
          '"Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif',
        color: T.ink,
      }}
    >
      {/* 상단 헤더 */}
      <div
        style={{
          padding: '12px 28px',
          background: '#fff',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexShrink: 0,
        }}
      >
        <Btn variant="ghost" size="sm" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={onBack}>
          홈
        </Btn>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: T.inkDim, fontFamily: T.fontMono }}>
            {tree.round.academic_year} · {tree.round.target_grade}학년 · {tree.round.round_number}차
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>{tree.round.title}</div>
        </div>
        {remainingText && (
          <Pill tone={remainingText.includes('일') ? 'warning' : 'danger'} size="lg">
            마감까지 {remainingText}
          </Pill>
        )}
      </div>

      {/* 선택군 탭 */}
      <GroupTabs
        groups={groups.map((g) => ({ id: g.id, name: g.name, category_codes: g.category_codes }))}
        active={activeGroup?.id ?? ''}
        completedMap={completedMap}
        onChange={setActiveGroupId}
      />

      <StatusBar done={doneCount} total={totalGroups} dirtyCount={sel.dirtyGroups.size} />

      {/* 본문 */}
      {!activeGroup ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: T.inkDim,
          }}
        >
          선택군이 아직 구성되지 않았습니다. 담당 교사에게 문의하세요.
        </div>
      ) : (
        <>
          <div
            style={{
              padding: '20px 28px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 24,
              flexShrink: 0,
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                {activeGroup.category_codes.length === 0 ? (
                  <SubjectTag cat={null} size="lg" />
                ) : (
                  activeGroup.category_codes.map((c) => (
                    <SubjectTag key={c} cat={c} size="lg" />
                  ))
                )}
                <span style={{ fontSize: 11, color: T.inkDim, fontFamily: T.fontMono }}>
                  {String(groups.indexOf(activeGroup) + 1).padStart(2, '0')} /{' '}
                  {String(totalGroups).padStart(2, '0')}
                </span>
                {savedHere && !dirty && <Pill tone="success" size="sm">저장됨</Pill>}
                {dirty && <Pill tone="warning" size="sm">미저장 변경</Pill>}
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, margin: 0 }}>
                {activeGroup.name}
              </h2>
              {activeGroup.description && (
                <div style={{ color: T.inkMuted, fontSize: 12.5, marginTop: 6 }}>
                  {activeGroup.description}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '0 28px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {activeGroup.slots.length === 0 && (
              <div
                style={{
                  padding: 24,
                  background: T.surfaceSunk,
                  borderRadius: T.r3,
                  textAlign: 'center',
                  color: T.inkMuted,
                  fontSize: 13,
                }}
              >
                이 선택군에는 아직 선택그룹이 없습니다.
              </div>
            )}
            {activeGroup.slots.map((slot, sIdx) => {
              const picks = sel.draft.get(activeGroup.id)?.get(slot.id) ?? [];
              const isDone = picks.length === slot.pick_count;
              return (
                <div
                  key={slot.id}
                  style={{
                    background: '#fff',
                    border: `1px solid ${T.border}`,
                    borderRadius: T.r3,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 18px',
                      background: T.surfaceMuted,
                      borderBottom: `1px solid ${T.border}`,
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        background: isDone ? T.success : T.ink,
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'grid',
                        placeItems: 'center',
                        fontFamily: T.fontMono,
                      }}
                    >
                      {isDone ? '✓' : sIdx + 1}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>
                      {slotDisplayTitle(slot)}
                    </span>
                    {slot.semester != null && (
                      <Pill tone="neutral" size="sm">{slot.semester}학기</Pill>
                    )}
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: 11,
                        color: T.inkMuted,
                        fontFamily: T.fontMono,
                      }}
                    >
                      {picks.length}/{slot.pick_count}개 선택
                    </span>
                  </div>
                  <div>
                    {groupSlotChoices(slot.subjects ?? []).map((choice, i) => {
                      const picked = sel.isChoicePicked(activeGroup.id, slot.id, choice);
                      // 세트의 경우 가장 빠듯한 과목의 capacity를 기준으로 마감 판단
                      let anyFull = false;
                      let summaryRemain: number | null = null;
                      let summaryEnrolled = 0;
                      let summaryCapacity: number | null = null;
                      for (const s of choice.subjects) {
                        const cap = capacityMap.get(capacityKey(slot.id, s.selectable_subject_id));
                        const effCap = s.override_capacity ?? s.default_max_capacity ?? null;
                        const en = cap?.enrolled ?? 0;
                        if (effCap != null && en >= effCap) anyFull = true;
                        const rem = effCap != null ? effCap - en : null;
                        if (summaryRemain === null || (rem !== null && rem < summaryRemain)) {
                          summaryRemain = rem;
                          summaryEnrolled = en;
                          summaryCapacity = effCap;
                        }
                      }
                      const full = anyFull;
                      const dupBlocked = !picked && sel.isChoiceBlockedByDuplicate(activeGroup, slot, choice);
                      const disabled = (full && !picked) || dupBlocked;
                      return (
                        <button
                          key={choice.key}
                          type="button"
                          onClick={() =>
                            !disabled &&
                            sel.toggleChoice(activeGroup, slot, choice, () =>
                              toast({
                                title: `${slot.pick_count}개까지만 선택할 수 있어요`,
                                description: '이미 선택한 과목을 먼저 해제하세요.',
                              }),
                            )
                          }
                          disabled={disabled}
                          style={{
                            width: '100%',
                            display: 'grid',
                            gridTemplateColumns: '24px 1fr 200px 150px',
                            gap: 16,
                            alignItems: 'center',
                            padding: '14px 18px',
                            borderTop: i ? `1px solid ${T.border}` : 'none',
                            background: picked
                              ? T.primarySoft
                              : disabled
                              ? 'oklch(98.5% 0.005 280)'
                              : '#fff',
                            border: 'none',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.6 : 1,
                            textAlign: 'left',
                            fontFamily: 'inherit',
                          }}
                        >
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 4,
                              border: `1.5px solid ${picked ? T.primary : T.borderStrong}`,
                              background: picked ? T.primary : '#fff',
                              display: 'grid',
                              placeItems: 'center',
                            }}
                          >
                            {picked && <Check className="h-2.5 w-2.5" style={{ color: '#fff' }} />}
                          </span>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {choice.bundleKey && <Pill tone="primary" size="sm">세트</Pill>}
                              <span
                                style={{
                                  fontSize: 15,
                                  fontWeight: 700,
                                  color: full ? T.inkDim : T.ink,
                                  letterSpacing: -0.2,
                                  textDecoration: full ? 'line-through' : 'none',
                                  textDecorationColor: T.borderStrong,
                                }}
                              >
                                {choice.label}
                              </span>
                              {choice.subjects[0]?.semester != null && (
                                <span
                                  style={{
                                    fontSize: 10.5,
                                    color: T.inkDim,
                                    fontFamily: T.fontMono,
                                  }}
                                >
                                  {choice.subjects[0].semester}학기
                                </span>
                              )}
                            </div>
                            {choice.bundleKey && (
                              <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2 }}>
                                포함 과목: {choice.subjects.map((s) => s.name).join(', ')}
                              </div>
                            )}
                            {(() => {
                              const meta = choice.subjects[0];
                              if (!meta) return null;
                              const parts: string[] = [];
                              if (displayOptions.show_credits && meta.credits != null) {
                                parts.push(`${meta.credits}단위`);
                              }
                              if (displayOptions.show_subject_type && meta.subject_type) {
                                parts.push(meta.subject_type);
                              }
                              if (displayOptions.show_grading_type && meta.grading_type) {
                                parts.push(meta.grading_type);
                              }
                              if (displayOptions.show_area && meta.area) {
                                parts.push(meta.area);
                              }
                              if (parts.length === 0) return null;
                              return (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: T.inkDim,
                                    marginTop: 4,
                                    fontFamily: T.fontMono,
                                  }}
                                >
                                  {parts.join(' · ')}
                                </div>
                              );
                            })()}
                          </div>
                          {displayOptions.show_capacity_bar ? (
                            <CapacityBar
                              enrolled={summaryEnrolled}
                              capacity={summaryCapacity}
                              height={6}
                              showLabel={displayOptions.show_enrollment_count}
                            />
                          ) : (
                            <span />
                          )}
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            {dupBlocked ? (
                              <Pill tone="neutral" size="lg">다른 슬롯에서 선택됨</Pill>
                            ) : full ? (
                              <Pill tone="danger" size="lg">정원 마감</Pill>
                            ) : picked ? (
                              <Pill tone="primary" size="lg">선택됨</Pill>
                            ) : summaryRemain != null && summaryCapacity != null && summaryRemain <= summaryCapacity * 0.2 ? (
                              <Pill tone="warning" size="lg">잔여 {summaryRemain}명</Pill>
                            ) : (
                              <Pill tone="neutral" size="lg">
                                {summaryRemain != null ? `잔여 ${summaryRemain}명` : '제한 없음'}
                              </Pill>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 푸터 액션 바 */}
          <div
            style={{
              background: '#fff',
              borderTop: `1px solid ${T.border}`,
              padding: '14px 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5 }}>
              {(() => {
                const { picked, required } = sel.groupPickCount(activeGroup);
                return (
                  <>
                    <span style={{ color: T.inkMuted }}>선택한 과목</span>
                    <span style={{ fontWeight: 600, color: T.ink }}>
                      <span style={{ fontFamily: T.fontMono }}>{picked}</span> /{' '}
                      <span style={{ fontFamily: T.fontMono }}>{required}</span> 과목
                    </span>
                    {picked === required && <Pill tone="success" size="sm">선택 완료</Pill>}
                    {dirty && <Pill tone="warning" size="sm">미저장 변경</Pill>}
                  </>
                );
              })()}
            </div>
            <Btn
              variant="primary"
              size="md"
              icon={
                saveMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )
              }
              onClick={() => onSaveGroup(activeGroup)}
              disabled={saveMut.isPending}
            >
              {savedHere ? '이 선택군 수정 반영' : '이 선택군 저장'}
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}
