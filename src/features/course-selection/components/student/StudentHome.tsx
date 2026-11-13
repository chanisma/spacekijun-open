/**
 * 학생 홈 — mockup StudentHome 디자인.
 * 안내문(borderLeft warning) + 차수 카드 리스트.
 */

import React from 'react';
import { ArrowRight, Clock } from 'lucide-react';
import { Btn, Pill } from '../common/atoms';
import { T } from '../../utils/tokens';
import { formatPeriod, timeRemaining, isRoundOpenNow } from '../../utils/time';
import { useRounds } from '../../hooks';
import type { CurrentActor } from '../../hooks/useCurrentActor';
import type { RoundRow } from '../../types';

interface Props {
  actor: CurrentActor;
  onPickRound: (roundId: string) => void;
  previewMode?: boolean;
}

export default function StudentHome({ actor, onPickRound, previewMode = false }: Props) {
  const grade = actor.studentGrade ?? undefined;
  const admissionYear = actor.studentAdmissionYear ?? undefined;
  const { data: rounds = [], isLoading } = useRounds();
  const myRounds = previewMode
    ? rounds.filter((r) => r.status !== 'archived')
    : rounds.filter((r) => {
        if (r.status === 'archived') return false;
        const rAdmission = (r as any).admission_year as number | null | undefined;
        if (rAdmission != null) {
          return admissionYear != null && rAdmission === admissionYear;
        }
        if (grade == null) return true;
        if (r.target_grade != null && r.target_grade === grade) return true;
        return r.target_grade == null;
      });

  return (
    <div style={{ padding: '36px 56px', maxWidth: 960, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, margin: 0, color: T.ink }}>
          수강 신청
        </h1>
        <span style={{ color: T.inkDim, fontSize: 13, paddingBottom: 4 }}>
          {grade ? `${grade}학년` : '학년 정보 없음'}
          {admissionYear != null && ` · ${admissionYear}년 입학`}
        </span>
      </div>
      <p
        style={{
          color: T.inkMuted,
          fontSize: 13.5,
          lineHeight: 1.6,
          margin: '0 0 28px',
          maxWidth: 720,
        }}
      >
        본 페이지는 본인 학년에 개설된 진로선택 과목 수요조사·신청 차수를 안내합니다. 각 차수의
        안내문과 마감 시간을 확인하고 신청해 주세요.
      </p>

      <div
        style={{
          borderLeft: `2px solid ${T.warning}`,
          padding: '4px 0 4px 16px',
          marginBottom: 28,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: T.warningSoftInk,
            marginBottom: 6,
            letterSpacing: 0.2,
          }}
        >
          신청 전 반드시 확인
        </div>
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            fontSize: 12.5,
            color: T.inkMuted,
            lineHeight: 1.55,
          }}
        >
          <li>
            · 각 선택군마다 <strong style={{ color: T.ink }}>저장 버튼</strong>을 반드시 눌러야
            신청이 완료됩니다.
          </li>
          <li>· 신청 기간 안에는 자유롭게 수정할 수 있으며, 모든 변경은 시간과 함께 기록됩니다.</li>
          <li>· 인원 제한이 있는 과목은 정원이 차면 더 이상 선택할 수 없습니다.</li>
        </ul>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <h2
          style={{
            fontSize: 14,
            fontWeight: 700,
            margin: 0,
            color: T.ink,
            letterSpacing: -0.2,
          }}
        >
          내 학년 신청 차수
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: T.inkDim,
              marginLeft: 10,
              fontFamily: T.fontMono,
            }}
          >
            · {grade ? `${grade}학년` : '?'}
          </span>
        </h2>
      </div>

      {isLoading && <div style={{ color: T.inkDim, fontSize: 13 }}>로딩 중…</div>}
      {!isLoading && myRounds.length === 0 && (
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
          현재 본인 학년에 개설된 신청 차수가 없습니다.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {myRounds.map((r) => (
          <RoundCard key={r.id} round={r} onPick={() => onPickRound(r.id)} />
        ))}
      </div>

      <div
        style={{
          marginTop: 24,
          padding: '14px 18px',
          background: T.surfaceSunk,
          borderRadius: T.r3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12.5,
          color: T.inkMuted,
        }}
      >
        <span>도움이 필요하면 담임교사 또는 교무실로 문의하세요.</span>
      </div>
    </div>
  );
}

function RoundCard({ round, onPick }: { round: RoundRow; onPick: () => void }) {
  const active = isRoundOpenNow(round);
  const remaining = active ? timeRemaining(round.closes_at) : null;
  const meta = (round.meta ?? {}) as Record<string, unknown>;
  const kind = (meta.kind as string) ?? '수요조사';
  const admissionYear = (round as any).admission_year as number | null | undefined;

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${active ? T.borderFocus : T.border}`,
        borderRadius: T.r3,
        padding: '18px 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        boxShadow: active
          ? '0 1px 2px rgba(20,18,28,.04), 0 4px 12px rgba(20,18,28,.04)'
          : 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Pill tone={kind === '최종 신청' ? 'primary' : 'neutral'} size="sm">
            {kind}
          </Pill>
          <Pill tone="outline" size="sm">{round.round_number}차</Pill>
          {admissionYear != null && (
            <Pill tone="outline" size="sm">{admissionYear}년 입학 대상</Pill>
          )}
          {active && (
            <Pill tone="success" size="sm">
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 5,
                  background: T.success,
                }}
              />
              신청 진행중
            </Pill>
          )}
          {!active && round.status === 'closed' && <Pill tone="neutral" size="sm">마감</Pill>}
          {!active && round.status === 'draft' && <Pill tone="warning" size="sm">준비 중</Pill>}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>
          {round.title ??
            `${round.academic_year} · ${round.target_grade}학년 · ${round.round_number}차`}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            color: T.inkMuted,
            fontSize: 12,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: T.fontMono }}>
            <Clock className="h-3 w-3" />
            {formatPeriod(round.opens_at, round.closes_at)}
          </span>
          {remaining && (
            <span style={{ color: T.warningSoftInk, fontWeight: 600 }}>
              · 마감까지 {remaining}
            </span>
          )}
        </div>
      </div>
      {active ? (
        <Btn
          variant="primary"
          size="md"
          iconRight={<ArrowRight className="h-3.5 w-3.5" />}
          onClick={onPick}
        >
          신청 시작
        </Btn>
      ) : round.status === 'closed' ? (
        <Btn variant="outline" size="md" onClick={onPick}>
          제출 내역 보기
        </Btn>
      ) : (
        <Btn variant="ghost" size="md" disabled>
          준비 중
        </Btn>
      )}
    </div>
  );
}
