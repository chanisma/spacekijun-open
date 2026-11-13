/**
 * 신청 현황 - 관리자용 학생별/선택군별 진행 상태.
 */

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Pill, CapacityBar, SubjectTag, Input } from '../common/atoms';
import { T } from '../../utils/tokens';
import { formatDt } from '../../utils/time';
import { useRoundTree, useRoundSubmissions, useSlotCapacity, useAuditLog } from '../../hooks';
import { useSubmissionItems } from '../../hooks/useCourseSelection';
import { primaryCategory, slotDisplayTitle, type GroupView, type ItemRow } from '../../types';
import RoundTreeRail from './RoundTreeRail';

interface Props {
  roundId: string | null;
  onSelectRound: (id: string | null) => void;
  onSelectGroup?: (id: string | null) => void;
}

type ProgressStatus = 'complete' | 'partial' | 'empty';

interface SlotProgress {
  slotId: string;
  title: string;
  picked: number;
  required: number;
  subjects: string[];
}

interface GroupProgress {
  groupId: string;
  groupName: string;
  status: ProgressStatus;
  picked: number;
  required: number;
  slots: SlotProgress[];
}

interface StudentProgress {
  status: ProgressStatus;
  completedGroups: number;
  partialGroups: number;
  emptyGroups: number;
  totalGroups: number;
  groups: GroupProgress[];
}

const STATUS_LABEL: Record<ProgressStatus, string> = {
  complete: '완료',
  partial: '진행 중',
  empty: '미시작',
};

const STATUS_TONE: Record<ProgressStatus, 'success' | 'warning' | 'neutral'> = {
  complete: 'success',
  partial: 'warning',
  empty: 'neutral',
};

function buildStudentProgress(groups: GroupView[], items: ItemRow[]): StudentProgress {
  const itemsBySlot = new Map<string, ItemRow[]>();
  for (const item of items) {
    if (!item.slot_id) continue;
    const slotItems = itemsBySlot.get(item.slot_id) ?? [];
    slotItems.push(item);
    itemsBySlot.set(item.slot_id, slotItems);
  }

  const groupProgress = groups.map((group): GroupProgress => {
    const slots = group.slots.map((slot): SlotProgress => {
      const slotItems = itemsBySlot.get(slot.id) ?? [];
      return {
        slotId: slot.id,
        title: slotDisplayTitle(slot),
        picked: slotItems.length,
        required: slot.pick_count,
        subjects: slotItems.map((item) => item.subject_name).sort((a, b) => a.localeCompare(b, 'ko')),
      };
    });
    const picked = slots.reduce((sum, slot) => sum + slot.picked, 0);
    const required = slots.reduce((sum, slot) => sum + slot.required, 0);
    const complete = required > 0 && slots.every((slot) => slot.picked >= slot.required);
    const status: ProgressStatus = complete ? 'complete' : picked > 0 ? 'partial' : 'empty';

    return {
      groupId: group.id,
      groupName: group.name,
      status,
      picked,
      required,
      slots,
    };
  });

  const completedGroups = groupProgress.filter((group) => group.status === 'complete').length;
  const partialGroups = groupProgress.filter((group) => group.status === 'partial').length;
  const emptyGroups = groupProgress.filter((group) => group.status === 'empty').length;
  const totalGroups = groupProgress.length;
  const status: ProgressStatus =
    totalGroups > 0 && completedGroups === totalGroups
      ? 'complete'
      : completedGroups > 0 || partialGroups > 0
      ? 'partial'
      : 'empty';

  return {
    status,
    completedGroups,
    partialGroups,
    emptyGroups,
    totalGroups,
    groups: groupProgress,
  };
}

function GroupProgressBadge({
  group,
  onSelect,
}: {
  group: GroupProgress;
  onSelect?: () => void;
}) {
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          style={{
            display: 'inline-flex',
            padding: 0,
            border: 0,
            background: 'transparent',
            cursor: onSelect ? 'pointer' : 'default',
          }}
        >
          <Pill tone={STATUS_TONE[group.status]} size="sm">
            {group.groupName} {group.picked}/{group.required}
          </Pill>
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-3" align="start" sideOffset={8}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{group.groupName}</span>
            <Pill tone={STATUS_TONE[group.status]} size="sm">
              {STATUS_LABEL[group.status]}
            </Pill>
          </div>
          <div style={{ fontSize: 11.5, color: T.inkMuted }}>
            선택 {group.picked}개 / 필요 {group.required}개
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.slots.map((slot) => (
              <div key={slot.slotId} style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    color: T.ink,
                  }}
                >
                  <span>{slot.title}</span>
                  <span style={{ fontFamily: T.fontMono, color: T.inkMuted }}>
                    {slot.picked}/{slot.required}
                  </span>
                </div>
                <div style={{ marginTop: 5, fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>
                  {slot.subjects.length > 0 ? slot.subjects.join(', ') : '선택한 과목 없음'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export default function StatusTab({ roundId, onSelectRound, onSelectGroup }: Props) {
  const [search, setSearch] = useState('');
  const { data: tree } = useRoundTree(roundId);
  const { data: subs = [] } = useRoundSubmissions(roundId);
  const submissionIds = useMemo(() => subs.map((sub) => sub.id), [subs]);
  const { data: submissionItems = [] } = useSubmissionItems(submissionIds);
  const { data: capacityRows = [] } = useSlotCapacity(roundId, { refetchIntervalMs: 30_000 });
  const { data: logs = [] } = useAuditLog(roundId, { limit: 30 });

  const totalGroups = tree?.groups.length ?? 0;
  const studentGridColumns =
    '54px 100px 70px minmax(90px, 0.8fr) minmax(220px, 1.5fr) 92px 100px';

  const progressBySubmission = useMemo(() => {
    const itemsBySubmission = new Map<string, ItemRow[]>();
    for (const item of submissionItems) {
      const items = itemsBySubmission.get(item.submission_id) ?? [];
      items.push(item);
      itemsBySubmission.set(item.submission_id, items);
    }

    const groups = tree?.groups ?? [];
    const progress = new Map<string, StudentProgress>();
    for (const submission of subs) {
      progress.set(submission.id, buildStudentProgress(groups, itemsBySubmission.get(submission.id) ?? []));
    }
    return progress;
  }, [subs, submissionItems, tree]);

  const progressStats = useMemo(() => {
    let complete = 0;
    let partial = 0;
    let empty = 0;
    for (const submission of subs) {
      const status = progressBySubmission.get(submission.id)?.status ?? 'empty';
      if (status === 'complete') complete += 1;
      else if (status === 'partial') partial += 1;
      else empty += 1;
    }
    return { complete, partial, empty };
  }, [subs, progressBySubmission]);

  const filteredSubs = useMemo(() => {
    const s = search.trim();
    if (!s) return subs;
    return subs.filter(
      (sub) => sub.student_name.includes(s) || (sub.student_code ?? '').includes(s),
    );
  }, [subs, search]);

  const hotSubjects = useMemo(() => {
    return capacityRows
      .filter((r) => r.capacity != null)
      .map((r) => {
        const subj = tree?.groups
          .flatMap((g) => g.slots ?? [])
          .flatMap((s) => s.subjects ?? [])
          .find(
            (sub) =>
              sub.selectable_subject_id === r.selectable_subject_id &&
              (sub.semester ?? null) === (r.semester ?? null),
          );
        const group = tree?.groups.find((g) => g.id === r.group_id);
        return {
          ...r,
          name: subj?.name ?? '?',
          category: primaryCategory(group?.category_codes) ?? subj?.category_code ?? '교양',
          pct: r.capacity ? (r.enrolled / r.capacity) * 100 : 0,
        };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 6);
  }, [capacityRows, tree]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '260px 1fr',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <RoundTreeRail
        mode="groups"
        selectedRoundId={roundId}
        onSelectRound={onSelectRound}
        width={260}
      />

      <div
        style={{
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {!roundId ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: T.inkDim,
              fontSize: 13,
            }}
          >
            좌측에서 차수를 선택하세요.
          </div>
        ) : (
          <>
            <div style={{ padding: '20px 28px 14px' }}>
              <div
                style={{
                  fontSize: 11,
                  color: T.inkDim,
                  fontFamily: T.fontMono,
                  letterSpacing: 0.4,
                  marginBottom: 4,
                }}
              >
                STATUS / {roundId.slice(0, 8)}
              </div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>
                {tree?.round?.title ?? '신청 현황'}
              </h2>
              <div style={{ color: T.inkMuted, fontSize: 12.5, marginTop: 4 }}>
                전체 {subs.length}명 / 완료 {progressStats.complete}명 / 진행 중 {progressStats.partial}명 / 미시작 {progressStats.empty}명
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 14,
                padding: '0 28px 14px',
              }}
            >
              {[
                { label: '전체 완료', value: progressStats.complete, tone: T.success, suffix: '명' },
                { label: '진행 중', value: progressStats.partial, tone: T.warning, suffix: '명' },
                { label: '미시작', value: progressStats.empty, tone: T.inkMuted, suffix: '명' },
                { label: '선택군', value: totalGroups, tone: T.primary, suffix: '개' },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: '#fff',
                    border: `1px solid ${T.border}`,
                    borderRadius: T.r3,
                    padding: 16,
                  }}
                >
                  <div style={{ fontSize: 11.5, color: T.inkMuted, fontWeight: 600 }}>{s.label}</div>
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span
                      style={{
                        fontFamily: T.fontMono,
                        fontSize: 28,
                        fontWeight: 700,
                        color: T.ink,
                        letterSpacing: -1,
                      }}
                    >
                      {s.value}
                    </span>
                    <span style={{ fontSize: 12, color: T.inkDim }}>{s.suffix}</span>
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      height: 4,
                      background: T.surfaceSunk,
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, ((s.value as number) / Math.max(1, subs.length)) * 100)}%`,
                        height: '100%',
                        background: s.tone,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                flex: 1,
                overflow: 'hidden',
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr',
                gap: 14,
                padding: '0 28px 24px',
              }}
            >
              <div
                style={{
                  background: '#fff',
                  border: `1px solid ${T.border}`,
                  borderRadius: T.r3,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '12px 16px',
                    borderBottom: `1px solid ${T.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 14,
                      fontWeight: 700,
                      letterSpacing: -0.2,
                    }}
                  >
                    학생별 진행
                  </h3>
                  <Pill tone="neutral" size="sm">{subs.length}명</Pill>
                  <div style={{ marginLeft: 'auto', width: 200 }}>
                    <Input
                      prefix={<Search className="h-3 w-3" />}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="이름·학번"
                    />
                  </div>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: studentGridColumns,
                    padding: '8px 16px',
                    background: T.surfaceMuted,
                    fontSize: 11,
                    fontWeight: 700,
                    color: T.inkMuted,
                    letterSpacing: 0.3,
                  }}
                >
                  <span>#</span>
                  <span>학번</span>
                  <span>반 번호</span>
                  <span>이름</span>
                  <span>선택군별 상태</span>
                  <span>상태</span>
                  <span>최근</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {filteredSubs.map((s, i) => {
                    const progress = progressBySubmission.get(s.id) ?? buildStudentProgress(tree?.groups ?? [], []);
                    return (
                      <div
                        key={s.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: studentGridColumns,
                          padding: '10px 16px',
                          borderBottom: `1px solid ${T.border}`,
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 12.5,
                        }}
                      >
                        <span style={{ color: T.inkDim, fontFamily: T.fontMono }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span style={{ fontFamily: T.fontMono, color: T.inkMuted }}>
                          {s.student_code}
                        </span>
                        <span style={{ color: T.inkMuted }}>
                          {s.student_class}-{s.student_no}
                        </span>
                        <span style={{ fontWeight: 600, color: T.ink }}>{s.student_name}</span>
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {progress.groups.length > 0 ? (
                            progress.groups.map((group) => (
                              <GroupProgressBadge
                                key={group.groupId}
                                group={group}
                                onSelect={onSelectGroup ? () => onSelectGroup(group.groupId) : undefined}
                              />
                            ))
                          ) : (
                            <Pill tone="neutral" size="sm">선택군 없음</Pill>
                          )}
                        </span>
                        <Pill tone={STATUS_TONE[progress.status]} size="sm">
                          {progress.status === 'complete' ? '전체 완료' : STATUS_LABEL[progress.status]}
                        </Pill>
                        <span style={{ fontSize: 11, fontFamily: T.fontMono, color: T.inkDim }}>
                          {formatDt(s.last_modified_at)}
                        </span>
                      </div>
                    );
                  })}
                  {filteredSubs.length === 0 && (
                    <div
                      style={{
                        padding: 24,
                        textAlign: 'center',
                        color: T.inkDim,
                        fontSize: 13,
                      }}
                    >
                      {subs.length === 0 ? '아직 저장 이력이 있는 학생이 없습니다.' : '검색 결과 없음'}
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    background: '#fff',
                    border: `1px solid ${T.border}`,
                    borderRadius: T.r3,
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                      정원 임박·마감 과목
                    </h3>
                    {hotSubjects.some((s) => s.pct >= 100) && (
                      <Pill tone="danger" size="sm">마감 있음</Pill>
                    )}
                  </div>
                  {hotSubjects.length === 0 && (
                    <div style={{ fontSize: 12, color: T.inkDim, padding: 4 }}>
                      정원이 설정된 과목이 없습니다.
                    </div>
                  )}
                  {hotSubjects.map((s) => (
                    <div
                      key={`${s.slot_id}-${s.selectable_subject_id}-${s.semester ?? 'none'}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr 130px',
                        gap: 10,
                        alignItems: 'center',
                        padding: '8px 10px',
                        background: T.surfaceMuted,
                        borderRadius: T.r2,
                      }}
                    >
                      <SubjectTag cat={s.category} size="sm" />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                      <CapacityBar enrolled={s.enrolled} capacity={s.capacity} height={4} showLabel />
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    background: '#fff',
                    border: `1px solid ${T.border}`,
                    borderRadius: T.r3,
                    padding: '14px 16px',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>최근 활동</h3>
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: 11,
                        color: T.inkDim,
                        fontFamily: T.fontMono,
                      }}
                    >
                      최근 30건
                    </span>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {logs.length === 0 && (
                      <div style={{ fontSize: 12, color: T.inkDim, padding: 8 }}>
                        아직 활동 기록이 없습니다.
                      </div>
                    )}
                    {logs.map((log, i) => (
                      <div
                        key={log.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '70px 8px 1fr',
                          gap: 8,
                          padding: '6px 0',
                          borderBottom: i < logs.length - 1 ? `1px dashed ${T.border}` : 'none',
                          alignItems: 'baseline',
                          fontSize: 12,
                        }}
                      >
                        <span style={{ fontSize: 10.5, color: T.inkDim, fontFamily: T.fontMono }}>
                          {formatDt(log.occurred_at)}
                        </span>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 6,
                            background:
                              log.actor_role === 'student'
                                ? T.primary
                                : log.actor_role === 'system'
                                ? T.inkDim
                                : T.warning,
                            marginTop: 6,
                          }}
                        />
                        <div>
                          <span style={{ fontWeight: 600 }}>{log.actor_name}</span>
                          <span style={{ color: T.inkMuted }}> · {log.action.replace(/_/g, ' ')}</span>
                          {log.target_label && (
                            <span style={{ color: T.inkMuted }}> · {log.target_label}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
