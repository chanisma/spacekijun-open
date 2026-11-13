/**
 * 변경 로그 타임라인 — 차수 단위로 모든 이벤트.
 */

import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { Btn, Input, Pill, Field } from '../common/atoms';
import { T } from '../../utils/tokens';
import { formatDt } from '../../utils/time';
import { useAuditLog } from '../../hooks';

interface Props {
  roundId: string | null;
}

const ROLE_TONE: Record<string, 'primary' | 'warning' | 'neutral' | 'success'> = {
  student: 'primary',
  teacher: 'warning',
  system: 'neutral',
  admin: 'success',
};

const ROLE_LABEL: Record<string, string> = {
  student: '학생',
  teacher: '교사',
  system: '시스템',
  admin: '관리자',
};

const ALL_ROLES = ['admin', 'teacher', 'student', 'system'] as const;

export default function LogsTab({ roundId }: Props) {
  const { data: logs = [], isLoading } = useAuditLog(roundId, { limit: 500 });
  const [rolesFilter, setRolesFilter] = useState<Set<string>>(new Set(ALL_ROLES));
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (!rolesFilter.has(l.actor_role)) return false;
      if (
        s &&
        !l.actor_name.toLowerCase().includes(s) &&
        !(l.target_label ?? '').toLowerCase().includes(s)
      )
        return false;
      return true;
    });
  }, [logs, rolesFilter, search]);

  const exportCSV = () => {
    const rows = [
      ['시간', '역할', '행위자', '액션', '대상 유형', '대상 라벨', '내용'],
      ...filtered.map((l) => [
        l.occurred_at,
        l.actor_role,
        l.actor_name,
        l.action,
        l.target_type,
        l.target_label ?? '',
        JSON.stringify(l.diff ?? {}),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `course_selection_logs_${roundId?.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!roundId) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: T.inkDim,
          fontSize: 13,
        }}
      >
        먼저 차수를 선택하세요.
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
      }}
    >
      {/* 필터 */}
      <div
        style={{
          borderRight: `1px solid ${T.border}`,
          padding: '20px 16px',
          background: T.bg,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.inkDim,
              letterSpacing: 0.4,
              marginBottom: 8,
            }}
          >
            역할
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ALL_ROLES.map((r) => {
              const on = rolesFilter.has(r);
              return (
                <button
                  key={r}
                  onClick={() => {
                    const next = new Set(rolesFilter);
                    if (on) next.delete(r);
                    else next.add(r);
                    setRolesFilter(next);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'transparent',
                    border: 'none',
                    padding: 4,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      background: on ? T.primary : T.surfaceSunk,
                      border: `1px solid ${on ? T.primary : T.borderStrong}`,
                      display: 'grid',
                      placeItems: 'center',
                      color: '#fff',
                      fontSize: 10,
                    }}
                  >
                    {on ? '✓' : ''}
                  </span>
                  <Pill tone={ROLE_TONE[r]} size="sm">{ROLE_LABEL[r]}</Pill>
                </button>
              );
            })}
          </div>
        </div>
        <Field label="행위자·대상 검색">
          <Input
            prefix={<Search className="h-3 w-3" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름·학번·과목"
          />
        </Field>
        <div
          style={{
            marginTop: 'auto',
            padding: '12px 14px',
            background: T.surfaceMuted,
            borderRadius: T.r2,
            fontSize: 11,
            color: T.inkMuted,
            lineHeight: 1.5,
          }}
        >
          로그는 학년도 종료 후 일정 기간 보관됩니다. 학생이 직접 입력한 데이터는 마스킹 없이
          저장되니 운영자 외 열람을 주의하세요.
        </div>
      </div>

      {/* 타임라인 */}
      <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            padding: '16px 28px 10px',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>
              변경 로그
            </h2>
            <div style={{ color: T.inkMuted, fontSize: 12.5, marginTop: 4 }}>
              표시{' '}
              <span style={{ fontFamily: T.fontMono, color: T.ink, fontWeight: 600 }}>
                {filtered.length}
              </span>
              건 / 전체 <span style={{ fontFamily: T.fontMono }}>{logs.length}</span>건
            </div>
          </div>
          <Btn
            variant="outline"
            size="md"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={exportCSV}
            disabled={filtered.length === 0}
          >
            CSV 내보내기
          </Btn>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 90px 1fr 1.4fr',
            background: T.surfaceMuted,
            padding: '8px 28px',
            fontSize: 11,
            fontWeight: 700,
            color: T.inkMuted,
            letterSpacing: 0.3,
          }}
        >
          <span>시간</span>
          <span>역할</span>
          <span>행위자 · 대상</span>
          <span>변경 내용</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading && (
            <div style={{ padding: 16, color: T.inkDim, fontSize: 12 }}>로딩 중…</div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: T.inkDim, fontSize: 13 }}>
              표시할 로그가 없습니다.
            </div>
          )}
          {filtered.map((log, i) => (
            <div
              key={log.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 90px 1fr 1.4fr',
                padding: '12px 28px',
                borderBottom: `1px solid ${T.border}`,
                alignItems: 'start',
                fontSize: 12.5,
                background: i % 2 ? '#fff' : T.bg,
              }}
            >
              <span
                style={{
                  fontFamily: T.fontMono,
                  fontSize: 11.5,
                  color: T.inkMuted,
                  paddingTop: 2,
                }}
              >
                {formatDt(log.occurred_at)}
              </span>
              <Pill tone={ROLE_TONE[log.actor_role] ?? 'neutral'} size="sm">
                {ROLE_LABEL[log.actor_role] ?? log.actor_role}
              </Pill>
              <div>
                <div style={{ fontWeight: 600, color: T.ink }}>{log.actor_name}</div>
                <div style={{ fontSize: 11, color: T.inkDim, marginTop: 1 }}>
                  {log.target_label ?? log.target_type}
                </div>
              </div>
              <div style={{ color: T.ink }}>
                <span style={{ fontWeight: 600 }}>{log.action.replace(/_/g, ' ')}</span>
                {log.diff && Object.keys(log.diff).length > 0 && (
                  <pre
                    style={{
                      margin: '4px 0 0',
                      padding: '6px 8px',
                      background: T.surfaceMuted,
                      borderRadius: 4,
                      fontSize: 10.5,
                      fontFamily: T.fontMono,
                      color: T.inkMuted,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 100,
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(log.diff, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
