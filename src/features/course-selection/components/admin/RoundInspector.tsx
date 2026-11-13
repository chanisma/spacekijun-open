/**
 * 신청 차수 인스펙터 — mockup TeacherRoundInspector 3-panel.
 * 좌측: RoundTreeRail (공용)
 * 중앙: 활성 차수의 group 카드 리스트 미리보기 (읽기 전용 슬롯/과목 표시)
 * 우측: 차수 속성 폼 (인스펙터)
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Save, Loader2, GripVertical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Btn, Input, Field, Pill, Toggle, Textarea, SubjectTag } from '../common/atoms';
import { T } from '../../utils/tokens';
import { formatPeriod } from '../../utils/time';
import { useRounds, useUpsertRound, useLogChange, useRoundTree } from '../../hooks';
import RoundTreeRail from './RoundTreeRail';
import type { CurrentActor } from '../../hooks/useCurrentActor';
import type { RoundRow, RoundStatus, RoundKind } from '../../types';

interface Props {
  selectedRoundId: string | null;
  onSelectRound: (id: string | null) => void;
  onSelectGroup?: (id: string | null) => void;  // 중앙 group 카드 클릭 → builder 탭 이동
  actor: CurrentActor;
}

interface RoundDraft {
  id?: string;
  title: string;
  round_number: number;
  /** 차수의 기본 학년/연도. group이 값을 가지면 group이 우선. NULL이면 group에서 반드시 지정. */
  academic_year: number | null;
  target_grade: number | null;
  /** 입학연도 제한 — 학생의 입학연도와 매칭되는 차수만 노출. NULL이면 제한 없음. */
  admission_year: number | null;
  kind: RoundKind;
  status: RoundStatus;
  opens_at: string;
  closes_at: string;
  description: string;
  show_enrollment: boolean;
  // 학생 카드 표시 옵션
  show_credits: boolean;
  show_subject_type: boolean;
  show_grading_type: boolean;
  show_capacity_bar: boolean;
  show_area: boolean;
}

const EMPTY: RoundDraft = {
  title: '',
  round_number: 1,
  academic_year: null,
  target_grade: null,
  admission_year: null,
  kind: '수요조사',
  status: 'draft',
  opens_at: '',
  closes_at: '',
  description: '',
  show_enrollment: true,
  show_credits: false,
  show_subject_type: false,
  show_grading_type: false,
  show_capacity_bar: true,
  show_area: false,
};

const ROUND_RAIL_WIDTH = 260;
const ROUND_EDITOR_WIDTH = 360;

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60_000);
  return local.toISOString().slice(0, 16);
}
function fromDatetimeLocal(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}
function rowToDraft(r: RoundRow): RoundDraft {
  const meta = (r.meta ?? {}) as Record<string, unknown>;
  const display = (meta.display_options ?? {}) as Record<string, unknown>;
  const legacyEnroll = typeof meta.show_enrollment === 'boolean' ? (meta.show_enrollment as boolean) : undefined;
  return {
    id: r.id,
    title: r.title ?? '',
    round_number: r.round_number,
    academic_year: r.academic_year,
    target_grade: r.target_grade,
    admission_year: (r as any).admission_year ?? null,
    kind: (meta.kind as RoundKind) ?? '수요조사',
    status: r.status as RoundStatus,
    opens_at: toDatetimeLocal(r.opens_at),
    closes_at: toDatetimeLocal(r.closes_at),
    description: r.description ?? '',
    show_enrollment: (display.show_enrollment_count as boolean | undefined) ?? legacyEnroll ?? true,
    show_credits: (display.show_credits as boolean | undefined) ?? false,
    show_subject_type: (display.show_subject_type as boolean | undefined) ?? false,
    show_grading_type: (display.show_grading_type as boolean | undefined) ?? false,
    show_capacity_bar: (display.show_capacity_bar as boolean | undefined) ?? true,
    show_area: (display.show_area as boolean | undefined) ?? false,
  };
}

export default function RoundInspector({ selectedRoundId, onSelectRound, onSelectGroup, actor }: Props) {
  const { data: rounds = [] } = useRounds();
  const { data: tree } = useRoundTree(selectedRoundId);
  const upsert = useUpsertRound();
  const logChange = useLogChange();
  const { toast } = useToast();
  const [draft, setDraft] = useState<RoundDraft>(EMPTY);
  const [creatingNew, setCreatingNew] = useState(false);

  const currentRound = useMemo(
    () => rounds.find((r) => r.id === selectedRoundId) ?? null,
    [rounds, selectedRoundId],
  );

  useEffect(() => {
    if (creatingNew) return;
    if (currentRound) setDraft(rowToDraft(currentRound));
    else setDraft(EMPTY);
  }, [currentRound, creatingNew]);

  const onSave = async () => {
    try {
      const meta = {
        ...((currentRound?.meta as Record<string, unknown>) ?? {}),
        kind: draft.kind,
        show_enrollment: draft.show_enrollment, // legacy
        display_options: {
          show_enrollment_count: draft.show_enrollment,
          show_capacity_bar: draft.show_capacity_bar,
          show_credits: draft.show_credits,
          show_subject_type: draft.show_subject_type,
          show_grading_type: draft.show_grading_type,
          show_area: draft.show_area,
        },
      };
      const patch: any = {
        id: draft.id,
        title: draft.title,
        round_number: draft.round_number,
        academic_year: draft.academic_year,
        target_grade: draft.target_grade,
        admission_year: draft.admission_year,
        status: draft.status,
        opens_at: fromDatetimeLocal(draft.opens_at),
        closes_at: fromDatetimeLocal(draft.closes_at),
        description: draft.description,
        meta,
      };
      const saved = await upsert.mutateAsync(patch);
      const isCreate = !draft.id;
      await logChange.mutateAsync({
        p_round_id: saved.id,
        p_actor_name: actor.name,
        p_actor_role: actor.role,
        p_action: isCreate ? 'round_create' : 'round_update',
        p_target_type: 'round',
        p_target_id: saved.id,
        p_target_label: saved.title ?? `${saved.academic_year} · ${saved.target_grade}학년 · ${saved.round_number}차`,
        p_diff: { after: patch },
      });
      toast({ title: isCreate ? '차수 생성됨' : '차수 저장됨', description: saved.title ?? '' });
      setCreatingNew(false);
      onSelectRound(saved.id);
    } catch (e: any) {
      toast({ title: '저장 실패', description: e?.message ?? '오류', variant: 'destructive' });
    }
  };

  const showForm = !!selectedRoundId || creatingNew;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `${ROUND_RAIL_WIDTH}px minmax(0, 1fr) ${ROUND_EDITOR_WIDTH}px`,
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <RoundTreeRail
        mode="groups"
        selectedRoundId={selectedRoundId}
        onSelectRound={(id) => {
          setCreatingNew(false);
          onSelectRound(id);
        }}
        onSelectGroup={onSelectGroup}
        onCreateNew={() => {
          setCreatingNew(true);
          setDraft({ ...EMPTY });
          onSelectRound(null);
        }}
        width={ROUND_RAIL_WIDTH}
      />

      {/* 중앙: 라운드 미리보기 + 그룹 카드 리스트 */}
      <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!showForm ? (
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
            좌측에서 차수를 선택하거나 "새 차수"로 시작하세요.
          </div>
        ) : creatingNew ? (
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
            }}
          >
            새 차수를 생성한 뒤 "선택군 구성" 탭에서<br />선택군 → 선택그룹 → 과목 풀을 구성하세요.
          </div>
        ) : (
          <>
            <div
              style={{
                padding: '20px 28px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                borderBottom: `1px solid ${T.border}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 4,
                    fontSize: 11,
                    color: T.inkDim,
                    fontFamily: T.fontMono,
                    letterSpacing: 0.4,
                  }}
                >
                  ROUND / {draft.id?.slice(0, 8)}
                  {currentRound && (
                    <Pill
                      tone={
                        currentRound.status === 'open'
                          ? 'success'
                          : currentRound.status === 'draft'
                          ? 'warning'
                          : 'neutral'
                      }
                      size="sm"
                    >
                      {currentRound.status === 'open'
                        ? '신청 진행중'
                        : currentRound.status === 'draft'
                        ? '준비 중'
                        : '마감'}
                    </Pill>
                  )}
                </div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>
                  {draft.title || '제목 없음'}
                </h1>
                {currentRound && (
                  <div style={{ fontSize: 12.5, color: T.inkMuted, marginTop: 4 }}>
                    {formatPeriod(currentRound.opens_at, currentRound.closes_at)}
                  </div>
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
              {(tree?.groups ?? []).length === 0 && (
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
                  아직 선택군이 없습니다.<br />
                  "선택군 구성" 탭에서 선택군을 추가하세요.
                </div>
              )}
              {(tree?.groups ?? []).map((g) => (
                <div
                  key={g.id}
                  onClick={() => onSelectGroup?.(g.id)}
                  style={{
                    background: '#fff',
                    border: `1px solid ${T.border}`,
                    borderRadius: T.r3,
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    cursor: onSelectGroup ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <GripVertical className="h-4 w-4" style={{ color: T.inkDim }} />
                    {(g.category_codes ?? []).map((c) => (
                      <SubjectTag key={c} cat={c} size="lg" />
                    ))}
                    <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>{g.name}</span>
                    {(g.academic_year ?? currentRound?.academic_year) != null && (
                      <Pill tone="outline" size="sm">{g.academic_year ?? currentRound?.academic_year}</Pill>
                    )}
                    {(g.target_grade ?? currentRound?.target_grade) != null && (
                      <Pill tone="outline" size="sm">{g.target_grade ?? currentRound?.target_grade}학년</Pill>
                    )}
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
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 22 }}>
                    {(g.slots ?? []).map((slot) => (
                      <div
                        key={slot.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '6px 10px',
                          background: T.surfaceMuted,
                          borderRadius: T.r2,
                          fontSize: 12,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: T.fontMono,
                            fontSize: 10.5,
                            color: T.inkDim,
                            letterSpacing: 0.3,
                          }}
                        >
                          SLOT
                        </span>
                        {slot.title?.trim() && (
                          <span style={{ fontWeight: 600, color: T.ink }}>{slot.title}</span>
                        )}
                        {slot.semester != null && (
                          <Pill tone="neutral" size="sm">{slot.semester}학기</Pill>
                        )}
                        <Pill tone="neutral" size="sm">{slot.pick_count}개 선택</Pill>
                        <Pill tone="neutral" size="sm">
                          과목 {(slot.subjects ?? []).length}개
                        </Pill>
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {(slot.subjects ?? []).map((sub) => (
                            <span
                              key={sub.id}
                              style={{
                                fontSize: 11,
                                padding: '2px 7px',
                                background: '#fff',
                                border: `1px solid ${T.border}`,
                                borderRadius: 5,
                                color: T.inkMuted,
                                fontWeight: 500,
                              }}
                            >
                              {sub.name}
                            </span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
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
        {!showForm ? (
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
            차수 선택 시 속성 인스펙터가 표시됩니다.
          </div>
        ) : (
          <>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
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
                ROUND
                <Pill tone="primary" size="sm">선택됨</Pill>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>차수 속성</div>
              <div style={{ fontSize: 11.5, color: T.inkMuted, marginTop: 2 }}>
                저장 시 변경 사항이 audit log에 기록됩니다.
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <Field label="차수 타이틀" required>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="예: 2026학년도 1학년 진로선택 3차"
                />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
                <Field label="실제 차수">
                  <Input
                    type="number"
                    mono
                    value={draft.round_number}
                    onChange={(e) =>
                      setDraft({ ...draft, round_number: parseInt(e.target.value || '1', 10) })
                    }
                  />
                </Field>
                <Field label="구분">
                  <SegmentBtn
                    options={['수요조사', '최종 신청']}
                    value={draft.kind}
                    onChange={(v) => setDraft({ ...draft, kind: v as RoundKind })}
                  />
                </Field>
              </div>

              <div
                style={{
                  background: T.surfaceSunk,
                  borderRadius: T.r2,
                  padding: '9px 10px',
                  fontSize: 11.5,
                  color: T.inkMuted,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: T.ink, fontWeight: 700 }}>수강 연도·대상 학년은 선택군 단위</span>로
                지정합니다. 한 차수에 1·2학년을 함께 묶거나 학년·연도가 다른 선택군을 섞을 수 있습니다.
              </div>

              <Field
                label="입학연도 제한"
                hint="설정하면 해당 입학연도 학생만 이 차수를 볼 수 있습니다. 비우면 제한 없음."
              >
                <Input
                  type="number"
                  mono
                  value={draft.admission_year ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      admission_year: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  placeholder="예: 2026 (제한 없으면 비워둠)"
                />
              </Field>

              <Field label="신청 기간" hint="시간대 KST">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Input
                    type="datetime-local"
                    mono
                    value={draft.opens_at}
                    onChange={(e) => setDraft({ ...draft, opens_at: e.target.value })}
                  />
                  <span style={{ color: T.inkDim, fontSize: 11, textAlign: 'center' }}>↓</span>
                  <Input
                    type="datetime-local"
                    mono
                    value={draft.closes_at}
                    onChange={(e) => setDraft({ ...draft, closes_at: e.target.value })}
                  />
                </div>
              </Field>

              <Field label="차수 상태">
                <SegmentBtn
                  options={[
                    { value: 'draft', label: '준비' },
                    { value: 'open', label: '개방' },
                    { value: 'closed', label: '마감' },
                    { value: 'archived', label: '보관' },
                  ]}
                  value={draft.status}
                  onChange={(v) => setDraft({ ...draft, status: v as RoundStatus })}
                />
              </Field>

              <div style={{ height: 1, background: T.border, margin: '6px 0' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.inkDim, letterSpacing: 0.4 }}>
                  학생 카드에 표시할 정보
                </div>
                <Toggle
                  label="현재 신청 인원 수"
                  value={draft.show_enrollment}
                  onChange={(v) => setDraft({ ...draft, show_enrollment: v })}
                />
                <Toggle
                  label="정원 진행바 (그래프)"
                  value={draft.show_capacity_bar}
                  onChange={(v) => setDraft({ ...draft, show_capacity_bar: v })}
                />
                <Toggle
                  label="학점 (단위)"
                  value={draft.show_credits}
                  onChange={(v) => setDraft({ ...draft, show_credits: v })}
                />
                <Toggle
                  label="과목 유형 (일반/진로/융합)"
                  value={draft.show_subject_type}
                  onChange={(v) => setDraft({ ...draft, show_subject_type: v })}
                />
                <Toggle
                  label="평가 방식 (5단계/9등급/P-F)"
                  value={draft.show_grading_type}
                  onChange={(v) => setDraft({ ...draft, show_grading_type: v })}
                />
                <Toggle
                  label="영역"
                  value={draft.show_area}
                  onChange={(v) => setDraft({ ...draft, show_area: v })}
                />
              </div>

              <Field label="학생 화면 안내문">
                <Textarea
                  value={draft.description}
                  onChange={(v) => setDraft({ ...draft, description: v })}
                  rows={5}
                  placeholder="이번 차수는 1·2학기 진로선택 과목을 최종 확정하는 신청입니다."
                />
              </Field>
            </div>

            <div
              style={{
                borderTop: `1px solid ${T.border}`,
                padding: '12px 14px',
                display: 'flex',
                gap: 8,
                justifyContent: 'space-between',
              }}
            >
              {creatingNew ? (
                <Btn
                  variant="ghost"
                  size="md"
                  onClick={() => {
                    setCreatingNew(false);
                    setDraft(EMPTY);
                  }}
                >
                  취소
                </Btn>
              ) : (
                <Btn variant="ghost" size="md">차수 마감</Btn>
              )}
              <Btn
                variant="primary"
                size="md"
                icon={
                  upsert.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )
                }
                onClick={onSave}
                disabled={upsert.isPending || !draft.title.trim()}
              >
                변경 사항 적용
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SegmentBtn — 세그먼트 토글
// ============================================================
function SegmentBtn({
  options,
  value,
  onChange,
}: {
  options: (string | { value: string; label: string })[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, width: '100%', minWidth: 0 }}>
      {options.map((opt) => {
        const v = typeof opt === 'string' ? opt : opt.value;
        const l = typeof opt === 'string' ? opt : opt.label;
        const active = v === value;
        return (
          <Btn
            key={v}
            variant={active ? 'primary' : 'outline'}
            size="sm"
            onClick={() => onChange(v)}
            style={{ flex: 1, minWidth: 0 }}
          >
            {l}
          </Btn>
        );
      })}
    </div>
  );
}
