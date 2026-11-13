/**
 * 교사·관리자 진입점 — mockup AdminShell.
 *
 * selection 상태를 모두 이 컴포넌트에 lifting:
 *  - 차수 클릭 → 'round' 탭으로 자동 이동
 *  - 선택군(group) 클릭 → 'builder' 탭으로 자동 이동
 *  - 슬롯 클릭 → 'builder' 탭으로 + 슬롯 컨텍스트 유지
 */

import React, { useState } from 'react';
import { Eye, ArrowLeft } from 'lucide-react';
import { useCurrentActor, useRounds } from '../../hooks';
import { AdminTabs, Btn, HeaderAction, HeaderStat, HeaderStatDivider } from '../common/atoms';
import RoundInspector from './RoundInspector';
import GroupBuilder from './GroupBuilder';
import StatusTab from './StatusTab';
import LogsTab from './LogsTab';
import CourseSelectionStudentApp from '../student/CourseSelectionStudentApp';
import { T } from '../../utils/tokens';

const TABS = [
  { id: 'round', label: '신청 차수' },
  { id: 'builder', label: '선택군 구성' },
  { id: 'status', label: '신청 현황' },
  { id: 'logs', label: '로그·이력' },
];

// 헤더 정보 카드용 짧은 상태 라벨 (RoundInspector의 상태 선택지와 같은 어휘)
const ROUND_STATUS_LABEL: Record<string, string> = {
  draft: '준비',
  open: '개방',
  closed: '마감',
  archived: '보관',
};

export interface SlotSelection {
  id: string;
  groupId: string;
}

export default function CourseSelectionAdminApp() {
  const { data: actor, isLoading } = useCurrentActor();
  // RoundTreeRail과 같은 쿼리 키라 캐시를 공유 — 헤더 때문에 추가 요청이 생기지 않는다.
  const { data: rounds = [] } = useRounds();
  const [tab, setTab] = useState('round');
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotSelection | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  // 헤더 정보 카드 — 탭을 옮겨 다녀도 "지금 어느 차수를 보고 있는지"가 상단에 남는다.
  const currentRound = rounds.find((r) => r.id === selectedRoundId) ?? null;

  // 좌측 트리에서 차수 클릭 → 현재 탭 유지하며 차수만 변경
  const handleSelectRound = (id: string | null) => {
    setSelectedRoundId(id);
    setSelectedGroupId(null);
    setSelectedSlot(null);
    // 탭 전환 없음 — 현재 탭의 컨텍스트만 새 차수로 갱신
  };

  // 좌측 트리에서 선택군 클릭 → '선택군 구성' 탭으로 자동 이동
  const handleSelectGroup = (id: string | null) => {
    setSelectedGroupId(id);
    setSelectedSlot(null);
    if (id) setTab('builder');
  };

  // 좌측 트리에서 슬롯 클릭 → '선택군 구성' 탭으로 자동 이동
  const handleSelectSlot = (slot: SlotSelection | null) => {
    setSelectedSlot(slot);
    if (slot) {
      setSelectedGroupId(slot.groupId);
      setTab('builder');
    }
  };

  if (isLoading || !actor) {
    return (
      <div
        style={{
          padding: 24,
          color: T.inkDim,
          fontFamily: '"Pretendard Variable", Pretendard, system-ui, sans-serif',
        }}
      >
        사용자 정보 로딩 중…
      </div>
    );
  }

  // 학생 미리보기 모드
  if (previewMode) {
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
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 28px',
            background: T.warningSoft,
            borderBottom: `1px solid oklch(88% 0.06 75)`,
            flexShrink: 0,
          }}
        >
          <Eye className="h-4 w-4" style={{ color: T.warningSoftInk }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.warningSoftInk }}>
            학생 미리보기 모드
          </span>
          <span style={{ fontSize: 12, color: T.inkMuted }}>
            모든 차수와 과목 개설 내용을 학생 시점으로 확인합니다. 저장은 불가합니다.
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <Btn
              variant="outline"
              size="sm"
              icon={<ArrowLeft className="h-3.5 w-3.5" />}
              onClick={() => setPreviewMode(false)}
            >
              교사 화면으로 돌아가기
            </Btn>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <CourseSelectionStudentApp previewMode />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: T.bg,
        overflow: 'hidden',
        color: T.ink,
        fontFamily:
          '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
      }}
    >
      <AdminTabs
        tabs={TABS}
        active={tab}
        onChange={setTab}
        info={
          currentRound && (
            <>
              <HeaderStat label="학년도" value={currentRound.academic_year} />
              <HeaderStatDivider />
              <HeaderStat label="학년" value={`${currentRound.target_grade}학년`} />
              <HeaderStatDivider />
              <HeaderStat label="차수" value={`${currentRound.round_number}차`} />
              <HeaderStatDivider />
              <HeaderStat
                label="상태"
                value={ROUND_STATUS_LABEL[currentRound.status] ?? currentRound.status}
              />
            </>
          )
        }
        rightAction={
          <HeaderAction icon={<Eye size={14} />} onClick={() => setPreviewMode(true)}>
            학생 미리보기
          </HeaderAction>
        }
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'round' && (
          <RoundInspector
            selectedRoundId={selectedRoundId}
            onSelectRound={handleSelectRound}
            onSelectGroup={handleSelectGroup}
            actor={actor}
          />
        )}
        {tab === 'builder' && (
          <GroupBuilder
            roundId={selectedRoundId}
            selectedGroupId={selectedGroupId}
            selectedSlot={selectedSlot}
            onSelectRound={handleSelectRound}
            onSelectGroup={handleSelectGroup}
            onSelectSlot={handleSelectSlot}
            actor={actor}
          />
        )}
        {tab === 'status' && (
          <StatusTab
            roundId={selectedRoundId}
            onSelectRound={handleSelectRound}
            onSelectGroup={handleSelectGroup}
          />
        )}
        {tab === 'logs' && <LogsTab roundId={selectedRoundId} />}
      </div>
    </div>
  );
}
