/**
 * 타임라인 탭 안내 — 씬 2편.
 *
 * **억지로 3단계로 늘리지 않았다.** 이 탭에서 할 일은 "보는 것"뿐이라 단계를 쪼개면
 * 같은 화면을 두 번 보게 된다(스킬의 3~4단계는 상한이지 하한이 아니다).
 *
 * 목업 근거: `WorkTimelineTab`·`WorkGanttChart`(간트, 현재 학기 밝게) ·
 * `WorkTimelineFilters`(학기 범위 토글) · `taskDeadlines`(다중 마감 회차 전개).
 * **화면 문구가 바뀌면 함께 고칠 것.**
 */
import React from 'react';
import {
  AppWindow, Pointer, clickFlash, interpolate, popIn, useSceneTime,
} from '@/lib/walkthrough';
import {
  boxOf, centerOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect,
} from '@/components/walkthrough/stageCoords';
import { Band, Hi, Pill } from '@/components/walkthrough/atoms';
import { TabBar } from './shared';
import { TAB } from './tabs';

/** 간트 막대 */
const Bar: React.FC<{
  y: number; x: number; w: number; label: string; tone: string; t: number; at: number;
}> = ({ y, x, w, label, tone, t, at }) => (
  <span style={{
    position: 'absolute', left: x, top: y, height: 20,
    width: w * interpolate(t, [at, at + 0.5], [0, 1]),
    borderRadius: 5, background: tone,
    display: 'flex', alignItems: 'center', paddingLeft: 7,
    fontSize: 9, fontWeight: 650, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden',
  }}>{label}</span>
);

const ROWS = [
  { name: '2학기 평가계획', x: 10, w: 180, tone: '#3b82f6' },
  { name: '생기부 마감', x: 240, w: 130, tone: '#8b5cf6' },
  { name: '학교평가 자료', x: 150, w: 260, tone: '#0891b2' },
  { name: '방과후 정산', x: 400, w: 120, tone: '#059669' },
];

/* ══ ① 언제 몰리는지 보기 ═══════════════════════════════════════════════════ */

const T1_W: Rect = { x: 70, y: 62, w: 820, h: 430 };
const T1_TERM = inWindow(T1_W, { x: 640, y: 10, w: 156, h: 24 }, CH);

const T1 = { W_IN: 0.25, BARS: 1.0, TERM: 3.6, NARROW: 4.2, END: 7.0 };

export const SceneGantt: React.FC = () => {
  const t = useSceneTime();
  const narrow = t > T1.NARROW;
  const months = narrow
    ? ['3월', '4월', '5월', '6월', '7월', '8월']
    : ['3월', '5월', '7월', '9월', '11월', '1월'];

  return (
    <>
      <Band t={t}>① 업무를 가로로 늘어놓아 <Hi>언제 일이 겹치는지</Hi> 본다</Band>

      <AppWindow kind="browser" url="spacekijun / 업무 관리"
                 style={{ ...boxOf(T1_W), ...popIn(t, T1.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <TabBar active={TAB.timeline} />

          <span style={{
            ...boxOf({ x: 640, y: 10, w: 156, h: 24 }),
            display: 'flex', alignItems: 'center', gap: 6, padding: '0 9px',
            borderRadius: 7, fontSize: 9.5, fontWeight: 650,
            border: `1px solid ${narrow ? 'var(--primary)' : 'var(--hair)'}`,
            background: narrow ? 'color-mix(in srgb, var(--primary) 7%, var(--bg))' : 'var(--bg)',
            color: narrow ? 'var(--primary)' : 'var(--fg-muted)',
            boxShadow: clickFlash(t, T1.TERM) > 0 ? `0 0 0 5px rgba(79,70,229,0.24)` : undefined,
          }}>
            <span style={{
              width: 22, height: 12, borderRadius: 999, position: 'relative',
              background: narrow ? 'var(--primary)' : 'var(--hair)',
            }}>
              <span style={{
                position: 'absolute', top: 2, left: narrow ? 12 : 2,
                width: 8, height: 8, borderRadius: '50%', background: '#fff',
              }} />
            </span>
            학기 범위만 보기
          </span>

          <span style={{ position: 'absolute', left: 148, top: 44, right: 12, height: 18 }}>
            {months.map((m, i) => (
              <span key={m} style={{
                position: 'absolute', left: i * 110, top: 0, fontSize: 9, color: 'var(--fg-faint)',
              }}>{m}</span>
            ))}
          </span>
          {months.map((_, i) => (
            <span key={i} style={{
              position: 'absolute', left: 148 + i * 110, top: 62, bottom: 40,
              width: 1, background: 'var(--hair-2)',
            }} />
          ))}

          {ROWS.map((row, i) => (
            <React.Fragment key={row.name}>
              <span style={{
                position: 'absolute', left: 12, top: 72 + i * 44, width: 130,
                fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{row.name}</span>
              <Bar y={70 + i * 44} x={148 + row.x} w={row.w} label={row.name}
                   tone={row.tone} t={t} at={T1.BARS + i * 0.15} />
            </React.Fragment>
          ))}

          <span style={{
            position: 'absolute', left: 12, bottom: 10, right: 12, fontSize: 9.5,
            lineHeight: 1.6, color: 'var(--fg-faint)',
          }}>
            <b style={{ color: 'var(--fg-muted)' }}>학기 범위만 보기</b>를 켜면 학년도 전체 대신
            학기 기간만 확대해서 봅니다 — 막대를 누르면 그 업무 상세로 갑니다
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 2.4, x: pctX(500), y: pctY(30) },
        { t: T1.TERM, ...centerOf(T1_TERM), click: true },
        { t: T1.END, ...centerOf(T1_TERM), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 마감이 여러 번인 할 일 ════════════════════════════════════════════════
   클릭이 없다. 규칙을 **화면으로 보여 주는** 단계다. */

const T2_W: Rect = { x: 90, y: 70, w: 780, h: 410 };

const T2 = { W_IN: 0.25, DOTS: 1.2, MARK: 3.2, HIDE: 4.4, END: 7.4 };

export const SceneDeadlines: React.FC = () => {
  const t = useSceneTime();
  const marked = t > T2.MARK;
  const hidden = t > T2.HIDE;

  const DOTS = [
    { x: 60, d: '05/10' },
    { x: 230, d: '07/12' },
    { x: 400, d: '09/20' },
    { x: 540, d: '11/15' },
  ];

  return (
    <>
      <Band t={t}>② 마감이 여러 번인 할 일은 <Hi>회차마다 점</Hi>으로 놓인다</Band>

      <AppWindow kind="app" title="타임라인 · 시험 출제"
                 style={{ ...boxOf(T2_W), ...popIn(t, T2.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* 잘못된 방식 vs 실제 방식 */}
          <span style={{ position: 'absolute', left: 16, top: 16, fontSize: 10, fontWeight: 700, color: 'var(--fg-faint)' }}>
            한 덩어리로 두면
          </span>
          <span style={{
            position: 'absolute', left: 16, top: 38, width: 620, height: 20,
            borderRadius: 5, background: 'var(--hair)',
            display: 'flex', alignItems: 'center', paddingLeft: 8,
            fontSize: 9, color: 'var(--fg-muted)',
          }}>시험 출제 (3월 ~ 12월)</span>
          <span style={{ position: 'absolute', left: 648, top: 40, fontSize: 9.5, color: 'var(--fg-faint)' }}>
            언제 내야 하는지가 사라진다
          </span>

          <span style={{ position: 'absolute', left: 16, top: 88, fontSize: 10, fontWeight: 700 }}>
            실제 화면
          </span>
          <span style={{ position: 'absolute', left: 16, top: 112, right: 16, height: 1, background: 'var(--hair)' }} />

          {DOTS.map((dot, i) => {
            const done = marked && i < 2;
            const gone = hidden && i < 2;
            return (
              <React.Fragment key={dot.d}>
                <span style={{
                  position: 'absolute', left: 16 + dot.x, top: 104,
                  width: 15, height: 15, borderRadius: '50%',
                  background: done ? '#059669' : '#f59e0b',
                  border: '2px solid #fff',
                  boxShadow: `0 0 0 1px ${done ? '#059669' : '#f59e0b'}`,
                  opacity: gone ? 0.12 : interpolate(t, [T2.DOTS + i * 0.2, T2.DOTS + 0.4 + i * 0.2], [0, 1]),
                }} />
                <span style={{
                  position: 'absolute', left: 8 + dot.x, top: 126, fontSize: 9,
                  color: done ? '#047857' : 'var(--fg-muted)', fontWeight: done ? 700 : 500,
                  opacity: gone ? 0.25 : interpolate(t, [T2.DOTS + i * 0.2, T2.DOTS + 0.4 + i * 0.2], [0, 1]),
                }}>{dot.d}{done ? ' ✓' : ''}</span>
              </React.Fragment>
            );
          })}

          {/* 회차별 완료 규칙 */}
          {marked && (
            <span style={{
              ...boxOf({ x: 16, y: 172, w: 356, h: 96 }),
              borderRadius: 10, border: '1px solid var(--hair)', padding: 12,
              display: 'flex', flexDirection: 'column', gap: 6,
              ...popIn(t, T2.MARK, 0.5),
            }}>
              <span style={{ fontSize: 10.5, fontWeight: 700 }}>회차마다 따로 완료</span>
              <span style={{ display: 'flex', gap: 5 }}>
                <Pill label="05/10 ✓" fg="#065f46" bg="#d1fae5" bd="#6ee7b7" />
                <Pill label="07/12 ✓" fg="#065f46" bg="#d1fae5" bd="#6ee7b7" />
                <Pill label="09/20" fg="#475569" bg="#ffffff" bd="#e2e8f0" />
                <Pill label="11/15" fg="#475569" bg="#ffffff" bd="#e2e8f0" />
              </span>
              <span style={{ fontSize: 9.5, lineHeight: 1.6, color: 'var(--fg-muted)' }}>
                <b style={{ color: 'var(--fg)' }}>전부 끝나야</b> 내가 완료됩니다.
                회차가 추가되면 완료였던 사람도 다시 미완료가 돼요.
              </span>
            </span>
          )}

          {hidden && (
            <span style={{
              ...boxOf({ x: 392, y: 172, w: 356, h: 96 }),
              borderRadius: 10, border: '1px solid #bfdbfe', background: '#eff6ff', padding: 12,
              display: 'flex', flexDirection: 'column', gap: 6,
              ...popIn(t, T2.HIDE, 0.5),
            }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1d4ed8' }}>
                끝낸 회차는 빠집니다
              </span>
              <span style={{ fontSize: 9.5, lineHeight: 1.6, color: '#1e40af' }}>
                이미 체크한 회차가 계속 남아 있으면 <b>앞으로 할 일처럼</b> 보입니다.
                타임라인·오늘 할 일에는 <b>남은 회차만</b> 놓입니다.
              </span>
            </span>
          )}
        </div>
      </AppWindow>
    </>
  );
};
