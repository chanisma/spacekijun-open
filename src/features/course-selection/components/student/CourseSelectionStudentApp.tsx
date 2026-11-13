/**
 * 학생 진입점 — 홈 ↔ 신청 화면 전환.
 */

import React, { useState } from 'react';
import { useCurrentActor } from '../../hooks';
import StudentHome from './StudentHome';
import StudentApply from './StudentApply';
import { T } from '../../utils/tokens';

const FONT_STACK =
  '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

export default function CourseSelectionStudentApp({
  previewMode = false,
}: { previewMode?: boolean } = {}) {
  const { data: actor, isLoading } = useCurrentActor();
  const [pickedRoundId, setPickedRoundId] = useState<string | null>(null);

  if (isLoading || !actor) {
    return (
      <div style={{ padding: 24, color: T.inkDim, fontFamily: FONT_STACK }}>
        학생 정보 로딩 중…
      </div>
    );
  }

  // previewMode면 admin/teacher도 진입 허용
  if (!previewMode && actor.role !== 'student') {
    return (
      <div style={{ padding: 24, color: T.inkMuted, fontSize: 13, fontFamily: FONT_STACK }}>
        학생 시점에서만 접근할 수 있는 화면입니다.
      </div>
    );
  }

  if (!previewMode && !actor.studentCode) {
    return (
      <div
        style={{
          padding: 24,
          color: T.inkMuted,
          fontSize: 13,
          lineHeight: 1.6,
          fontFamily: FONT_STACK,
        }}
      >
        학번 정보가 연결되지 않았습니다. 프로필을 먼저 확인하세요.
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: T.bg,
        color: T.ink,
        fontFamily: FONT_STACK,
      }}
    >
      {pickedRoundId ? (
        <StudentApply
          roundId={pickedRoundId}
          actor={actor}
          onBack={() => setPickedRoundId(null)}
          previewMode={previewMode}
        />
      ) : (
        <StudentHome
          actor={actor}
          onPickRound={setPickedRoundId}
          previewMode={previewMode}
        />
      )}
    </div>
  );
}
