/**
 * 공용 좌측 패널 — 차수 트리.
 *
 * 모든 admin 탭(신청 차수 / 선택군 구성 / 신청 현황)에서 좌측에 동일한 사이드로 사용.
 * mode 별 동작:
 *  - 'rounds'  : 차수만 나열. group/slot 펼침 없음 → 단순 차수 선택.
 *  - 'groups'  : 활성 차수의 group까지 readonly 트리.
 *  - 'builder' : 활성 차수의 group + slot까지 클릭 가능 트리.
 */

import React from 'react';
import { Plus, ChevronRight, ChevronDown } from 'lucide-react';
import { Btn, Pill, SubjectTag } from '../common/atoms';
import { T } from '../../utils/tokens';
import { formatPeriod } from '../../utils/time';
import { useRounds, useRoundTree } from '../../hooks';
import { slotDisplayTitle } from '../../types';

type Mode = 'rounds' | 'groups' | 'builder';

interface Props {
  mode: Mode;
  selectedRoundId: string | null;
  onSelectRound: (id: string | null) => void;
  onCreateNew?: () => void;

  // builder 전용 selection
  selectedGroupId?: string | null;
  onSelectGroup?: (id: string | null) => void;
  selectedSlotId?: string | null;
  onSelectSlot?: (slot: { id: string; groupId: string } | null) => void;

  width?: number;
}

export default function RoundTreeRail({
  mode,
  selectedRoundId,
  onSelectRound,
  onCreateNew,
  selectedGroupId,
  onSelectGroup,
  selectedSlotId,
  onSelectSlot,
  width = 280,
}: Props) {
  const { data: rounds = [], isLoading } = useRounds();
  const { data: tree } = useRoundTree(mode === 'rounds' ? null : selectedRoundId);

  const showSlots = mode === 'builder';
  const showGroups = mode !== 'rounds';

  return (
    <div
      style={{
        width,
        borderRight: `1px solid ${T.border}`,
        background: T.bg,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 16px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: T.inkDim, letterSpacing: 0.4 }}>
          차수 목록
        </span>
        <Pill tone="neutral" size="sm">{rounds.length}</Pill>
        {onCreateNew && (
          <div style={{ marginLeft: 'auto' }}>
            <Btn variant="ghost" size="sm" icon={<Plus className="h-3 w-3" />} onClick={onCreateNew}>
              새 차수
            </Btn>
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
        {isLoading && (
          <div style={{ padding: 12, color: T.inkDim, fontSize: 12 }}>로딩…</div>
        )}
        {!isLoading && rounds.length === 0 && (
          <div style={{ padding: 14, fontSize: 12, color: T.inkDim, lineHeight: 1.5 }}>
            아직 차수가 없습니다.
          </div>
        )}
        {rounds.map((r) => {
          const isActive = r.id === selectedRoundId;
          const meta = (r.meta ?? {}) as Record<string, unknown>;
          return (
            <div key={r.id} style={{ marginBottom: 4 }}>
              <button
                onClick={() => onSelectRound(r.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: T.r2,
                  background: isActive ? '#fff' : 'transparent',
                  border: `1px solid ${isActive ? T.borderFocus : 'transparent'}`,
                  boxShadow: isActive ? '0 1px 2px rgba(20,18,28,.04)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 6,
                      background:
                        r.status === 'open'
                          ? T.success
                          : r.status === 'draft'
                          ? T.warning
                          : T.inkDim,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: isActive ? 700 : 600,
                      color: isActive ? T.ink : T.inkMuted,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={r.title ?? undefined}
                  >
                    {r.title?.trim()
                      ? r.title
                      : `${r.academic_year ?? ''} · ${r.target_grade ?? ''}학년 · ${r.round_number}차 ${(meta.kind as string) ?? ''}`}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: T.inkDim,
                    fontFamily: T.fontMono,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  {r.title?.trim() && (
                    <span>
                      {r.academic_year} · {r.target_grade}학년 · {r.round_number}차 {(meta.kind as string) ?? ''}
                    </span>
                  )}
                  <span>{formatPeriod(r.opens_at, r.closes_at)}</span>
                </div>
              </button>

              {/* 활성 차수의 group/slot 트리 */}
              {isActive && showGroups && tree && (
                <div
                  style={{
                    paddingLeft: 14,
                    marginTop: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  {(tree.groups ?? []).map((g) => {
                    const gActive = g.id === selectedGroupId;
                    return (
                      <div key={g.id}>
                        <button
                          onClick={() => onSelectGroup?.(g.id)}
                          disabled={!onSelectGroup}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 8px',
                            background: gActive ? T.primarySoft : 'transparent',
                            color: gActive ? T.primarySoftInk : T.inkMuted,
                            fontSize: 11.5,
                            fontWeight: gActive ? 600 : 500,
                            border: 'none',
                            borderRadius: 5,
                            cursor: onSelectGroup ? 'pointer' : 'default',
                            fontFamily: 'inherit',
                            textAlign: 'left',
                          }}
                        >
                          {showSlots && gActive ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          {(g.category_codes ?? []).slice(0, 1).map((c) => (
                            <SubjectTag key={c} cat={c} size="sm" />
                          ))}
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {g.name}
                          </span>
                          <span style={{ fontSize: 10, color: T.inkDim, fontFamily: T.fontMono }}>
                            {(g.slots ?? []).length}
                          </span>
                        </button>
                        {/* slot 트리 — builder 모드에서 펼친 group일 때만 */}
                        {showSlots && gActive && (g.slots ?? []).length > 0 && (
                          <div
                            style={{
                              paddingLeft: 18,
                              marginTop: 2,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2,
                            }}
                          >
                            {g.slots.map((s, i) => {
                              const sActive = s.id === selectedSlotId;
                              return (
                                <button
                                  key={s.id}
                                  onClick={() =>
                                    onSelectSlot?.({ id: s.id, groupId: g.id })
                                  }
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '3px 8px',
                                    background: sActive ? T.primarySoft : 'transparent',
                                    color: sActive ? T.primarySoftInk : T.inkMuted,
                                    fontSize: 11,
                                    fontWeight: sActive ? 600 : 500,
                                    border: 'none',
                                    borderRadius: 5,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    textAlign: 'left',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: T.fontMono,
                                      fontSize: 9.5,
                                      padding: '0 4px',
                                      background: '#fff',
                                      border: `1px solid ${T.border}`,
                                      borderRadius: 3,
                                      color: T.inkDim,
                                    }}
                                  >
                                    S{i + 1}
                                  </span>
                                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {slotDisplayTitle(s)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {showSlots && onSelectGroup && (
                    <button
                      onClick={() => onSelectGroup(null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 8px',
                        background: 'transparent',
                        color: T.inkDim,
                        fontSize: 11,
                        border: 'none',
                        borderRadius: 5,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <Plus className="h-3 w-3" />
                      선택군 추가 / 차수 전체 보기
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
