/**
 * 내 업무 관리 탭 안내 — 씬 2편. (내 할 일 안내는 `myTasksScenes.tsx`)
 *
 * ── 2026-09-21: 관리와 수행을 갈랐다 ─────────────────────────────────────────
 * 내 업무는 **내가 매니저인 업무**만 보이는 관리 화면이 됐다. 카드의 체크박스(=내 완료 토글)는
 * 사라지고 그 자리는 **상태 표시**다. 완료·제출·과제 단위 선택은 '내 할 일'(`/my-tasks`)에서
 * 한다. 그래서 ② 는 "체크박스로 완료"가 아니라 **"담당자 칩으로 진행 확인·대신 처리"**이고,
 * 유형별 수행을 설명하던 ③은 내 할 일 안내(`myTasksScenes.tsx` 의 `SceneKinds`)로 옮겨 갔다.
 *
 * ── 실물 구조를 그대로 따랐다 (2026-09-04 재작성) ──────────────────────────
 * 처음 만든 목업이 실제 화면과 달라 다시 그렸다. `IntegratedTaskView` 의 실제 구성:
 *
 *   [일괄 바]  `업무 N개 · 할 일 M개`            [모두 펼치기/접기]   ← 목록 위 별도 카드
 *   [업무 카드]
 *     헤더 : 업무명 (+매니저면 🛡) … 매니저면 [진행중][대기][완료] 3버튼 / 아니면 상태 배지, ↗
 *     둘째줄: 설명(없으면 "설명이 없습니다" 이탤릭) … 진행률 바 + `완료 x/y`
 *     서랍바: `☑ 세부 할 일 N개 · 완료 x/N`  … ⌄     ← **카드 폭을 채우는 바**
 *     펼침 : 회색 배경 위 할 일 카드 **그리드**(sm 2 · lg 3 · 2xl 4열)
 *   [할 일 카드] 좌상단 **번호 원형 배지**(절차형=숫자 / 일회성=흰 점) · **상태 표시**(○/✓,
 *     누르는 것이 아니다) · 제목 + 역할 아이콘 · 설명 · `마감: MM/DD` · ↗ · 하단 담당자 요약
 *
 * 그 밖 근거: `TaskHeader`(필터 4종) · `TaskAssigneeSummary`(N/M 완료 · 내 상태) ·
 * `taskStatus.ts`(표시 상태 판정) · `TaskSubmissionDialog`.
 * **화면 문구가 바뀌면 함께 고칠 것.**
 */
import React from 'react';
import {
  AppWindow, Pointer, clickFlash, popIn, useSceneTime,
} from '@/lib/walkthrough';
import {
  boxOf, centerOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect,
} from '@/components/walkthrough/stageCoords';
import { Band, Hi, Pill, Stub } from '@/components/walkthrough/atoms';
import { AssigneeChip, TabBar } from './shared';
import { TAB } from './tabs';

/* ── 실물 조각 ─────────────────────────────────────────────────────────────── */

/** 목록 위 일괄 바 — 실제로 업무 카드 **밖**에 따로 있는 카드다 */
const BulkBar: React.FC<{ rect: Rect; works: number; tasks: number; expanded: boolean; glow?: number }> = ({
  rect, works, tasks, expanded, glow = 0,
}) => (
  <span style={{
    ...boxOf(rect),
    display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
    borderRadius: 11, border: '1px solid var(--hair)', background: 'var(--bg)',
    boxShadow: 'var(--shadow)',
  }}>
    <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
      업무 {works}개 · 할 일 {tasks}개
    </span>
    <span style={{
      marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
      borderRadius: 7, border: '1px solid var(--hair)', padding: '4px 9px',
      fontSize: 10, fontWeight: 650, background: 'var(--bg)',
      boxShadow: glow > 0 ? `0 0 0 ${5 * glow}px rgba(79,70,229,0.24)` : undefined,
    }}>
      {expanded ? '⇱ 모두 접기' : '⇲ 모두 펼치기'}
    </span>
  </span>
);

/* ── 할 일 카드 기하 ───────────────────────────────────────────────────────────
   목업과 포인터가 **같은 상수**를 본다. 종전에는 체크박스 좌표를 손으로 적었다가
   실제 자리(카드 + 패딩)와 16px 어긋났다 — 이 저장소 규약대로 유도해서 쓴다. */
const CARD = { padL: 10, padT: 13, padR: 10, padB: 10, cb: 13, gap: 7, arrow: 11 };

/** 카드 하단 담당자 칩의 절대 사각형 — 매니저가 누르는 자리. 목업(`TaskCard`)과 포인터가 함께 본다 */
const CHIP_H = 24;
const chipOf = (card: Rect): Rect => ({
  x: card.x + CARD.padL, y: card.y + card.h - CARD.padB - CHIP_H,
  w: card.w - CARD.padL - CARD.padR, h: CHIP_H,
});
/** 제목·설명이 들어가는 열의 폭 — 넘치면 카드 밖으로 삐져나온다 */
const titleColW = (card: Rect) =>
  card.w - CARD.padL - CARD.padR - CARD.cb - CARD.gap - CARD.arrow - CARD.gap;

/**
 * 할 일 카드 — 번호 배지가 카드 밖으로 걸치는 것이 이 카드의 인상이다.
 *
 * 하단 담당자 칩은 **`inline`** 으로 넣는다. 절대배치(`boxOf`)로 두면 카드가
 * 위치 지정 조상이라 칩이 **카드 좌상단에 그려져 제목을 덮는다**(실제로 그렇게 깨졌다).
 */
const TaskCard: React.FC<{
  rect: Rect; n: number | null; title: string; done?: boolean;
  due?: string; role?: 'assignee' | 'manager' | 'both';
  chip?: { done: number; total: number; mine: 'pending' | 'done'; avatars?: string[] };
  glow?: number;
}> = ({ rect, n, title, done = false, due, role, chip, glow = 0 }) => {
  const colW = titleColW(rect);
  return (
    <span style={{
      ...boxOf(rect),
      boxSizing: 'border-box',
      borderRadius: 10, border: '1px solid var(--hair)', background: 'var(--bg)',
      boxShadow: 'var(--shadow)',
      padding: `${CARD.padT}px ${CARD.padR}px ${CARD.padB}px ${CARD.padL}px`,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 좌상단 번호 원형 배지 — 절차형은 숫자, 일회성은 점 */}
      <span style={{
        position: 'absolute', left: -11, top: -11,
        width: 25, height: 25, borderRadius: '50%',
        background: 'linear-gradient(135deg,#10b981,#059669)',
        border: '2px solid var(--bg)', display: 'grid', placeItems: 'center',
        color: '#fff', fontSize: 10, fontWeight: 800,
        boxShadow: '0 2px 6px rgba(5,150,105,0.35)',
      }}>
        {n == null ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} /> : n}
      </span>

      <span style={{ display: 'flex', alignItems: 'flex-start', gap: CARD.gap }}>
        {/* 상태 표시 — 동그라미다(체크박스가 아니다). 누르는 것이 아니라 할 일 전체 상태를 말한다 */}
        <span style={{
          width: CARD.cb, height: CARD.cb, borderRadius: '50%', marginTop: 1, flexShrink: 0,
          border: `1.5px solid ${done ? '#059669' : '#cbd5e1'}`,
          background: done ? '#059669' : 'var(--bg)',
          color: '#fff', fontSize: 8.5, display: 'grid', placeItems: 'center',
        }}>{done ? '✓' : ''}</span>

        <span style={{ width: colW, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700,
            lineHeight: 1.25, minWidth: 0,
          }}>
            <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {title}
            </span>
            {/* 역할 아이콘 — 파랑=담당자 · 초록=매니저 · 보라=둘 다 */}
            {role && (
              <span style={{
                width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                background: role === 'assignee' ? '#3b82f6' : role === 'manager' ? '#059669' : '#8b5cf6',
              }} />
            )}
          </span>
          <Stub w={Math.max(40, colW - 8)} h={3.5} o={0.55} />
          <Stub w={Math.max(30, colW - 46)} h={3.5} o={0.55} />
          {due && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#ea580c' }}>마감: {due}</span>
          )}
        </span>

        {/* 상세 보기 — 폭이 고정이라 제목 열이 그만큼 좁아진다(titleColW 가 이미 뺐다) */}
        <span style={{
          width: CARD.arrow, flexShrink: 0,
          fontSize: 11, color: 'var(--fg-faint)', textAlign: 'right',
        }}>↗</span>
      </span>

      {chip && (
        <span style={{ marginTop: 'auto', paddingTop: 8 }}>
          <AssigneeChip inline rect={{ x: 0, y: 0, w: rect.w - CARD.padL - CARD.padR, h: CHIP_H }}
                        {...chip} glow={glow} />
        </span>
      )}
    </span>
  );
};

/* ══ ① 내 업무 살피기 ════════════════════════════════════════════════════════
   요점 하나: **카드는 접힌 상태가 기본**이다. 이걸 모르면 "할 일이 안 보인다"가 된다. */

const M1_W: Rect = { x: 50, y: 62, w: 860, h: 430 };
/** 목록 위 일괄 바(창 기준) — 목업과 포인터가 함께 본다 */
const M1_BULK_BAR: Rect = { x: 12, y: 42, w: 836, h: 34 };
/** 실제로 누르는 것은 바 전체가 아니라 **오른쪽 버튼**이다 */
const M1_BULK = inWindow(M1_W, { x: M1_BULK_BAR.x + M1_BULK_BAR.w - 12 - 88, y: M1_BULK_BAR.y + 6, w: 88, h: 22 }, CH);
/** 업무 카드(창 기준)와 그 안 서랍 바 */
const M1_CARD: Rect = { x: 12, y: 88, w: 836, h: 0 };
const M1_DRAWER = inWindow(M1_W, { x: M1_CARD.x, y: M1_CARD.y + 70, w: M1_CARD.w, h: 30 }, CH);
/** 펼침 영역 원점 — 할 일 카드 좌표를 창 기준으로 되돌릴 때 쓴다 */
const M1_GRID_ORIGIN = { x: M1_CARD.x, y: M1_CARD.y + 100 };
const M1_TASK1: Rect = { x: M1_GRID_ORIGIN.x + 20, y: M1_GRID_ORIGIN.y + 20, w: 256, h: 150 };

/** 매니저에게는 담당자 칩이 아바타 스택으로 보인다 */
const FIND_PEOPLE = ['김하늘', '박서준', '오아린', '윤수아', '정민재'];

const M1 = { W_IN: 0.25, BULK: 1.8, EXPAND: 3.4, OPENED: 4.0, DONE: 6.4 };

export const SceneFind: React.FC = () => {
  const t = useSceneTime();
  const open = t > M1.OPENED;

  return (
    <>
      <Band t={t}>① 업무 카드는 <Hi>접힌 상태가 기본</Hi> — 펼쳐야 세부 할 일이 나온다</Band>

      <AppWindow kind="browser" url="spacekijun / 업무 관리"
                 style={{ ...boxOf(M1_W), ...popIn(t, M1.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <TabBar active={TAB.myWorks} />
          <span style={{ position: 'absolute', right: 12, top: 12, display: 'flex', gap: 3 }}>
            {['전체', '진행 중', '완료된 업무'].map((f, i) => (
              <span key={f} style={{
                borderRadius: 6, padding: '3px 8px', fontSize: 9.5,
                border: `1px solid ${i === 1 ? '#bfdbfe' : 'transparent'}`,
                background: i === 1 ? '#eff6ff' : 'transparent',
                color: i === 1 ? '#1d4ed8' : 'var(--fg-faint)',
                fontWeight: i === 1 ? 700 : 500,
              }}>{f}</span>
            ))}
          </span>

          {/* 목록 위 일괄 바 — 업무 카드 밖의 독립 카드다 */}
          <BulkBar rect={M1_BULK_BAR} works={3} tasks={7}
                   expanded={open} glow={clickFlash(t, M1.BULK)} />

          {/* 업무 카드 */}
          <div style={{
            ...boxOf({ ...M1_CARD, h: open ? 292 : 100 }),
            borderRadius: 12, border: '1px solid var(--hair)',
            background: 'linear-gradient(135deg,var(--bg),color-mix(in srgb,var(--fg) 3%,var(--bg)))',
            overflow: 'hidden',
          }}>
            {/* 헤더 */}
            <span style={{ position: 'absolute', left: 14, top: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>2학기 평가계획 제출</span>
            </span>
            <span style={{ position: 'absolute', right: 46, top: 12 }}>
              <Pill label="진행 중" fg="#1d4ed8" bg="#dbeafe" bd="#93c5fd" />
            </span>
            <span style={{ position: 'absolute', right: 16, top: 11, fontSize: 13, color: 'var(--fg-faint)' }}>↗</span>

            {/* 둘째 줄: 설명 … 진행률 */}
            <span style={{
              position: 'absolute', left: 14, top: 40, width: 560,
              fontSize: 10.5, lineHeight: 1.5, color: 'var(--fg-muted)',
            }}>
              과목별 평가계획을 확인하고 기한까지 제출합니다
            </span>
            <span style={{ position: 'absolute', right: 16, top: 40, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 62, height: 7, borderRadius: 4, background: 'var(--hair)' }}>
                  <span style={{ display: 'block', width: 26, height: 7, borderRadius: 4, background: '#3b82f6' }} />
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 700 }}>42%</span>
              </span>
              <span style={{ fontSize: 9, color: 'var(--fg-faint)' }}>3/7 완료</span>
            </span>

            {/* 서랍 바 — 카드 폭을 채운다 */}
            <span style={{
              position: 'absolute', left: 0, top: 70, right: 0, height: 30,
              borderTop: '1px solid var(--hair-2)',
              display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px',
              fontSize: 10, fontWeight: 650, color: 'var(--fg-muted)',
              background: clickFlash(t, M1.EXPAND) > 0
                ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent',
            }}>
              <span style={{ color: '#3b82f6' }}>☑</span>
              세부 할 일 3개
              <span style={{ fontWeight: 400, color: 'var(--fg-faint)' }}>· 완료 1/3</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-faint)' }}>
                {open ? '⌃' : '⌄'}
              </span>
            </span>

            {/* 펼침 — 회색 배경 위 할 일 카드 그리드 */}
            {open && (
              <span style={{
                position: 'absolute', left: 0, top: 100, right: 0, bottom: 0,
                borderTop: '1px solid var(--hair-2)',
                background: 'color-mix(in srgb, var(--fg) 3%, transparent)',
                ...popIn(t, M1.OPENED, 0.45),
              }}>
                {/* 좌표는 펼침 영역 기준 — 창 기준 상수(M1_TASK1)에서 원점을 빼 되돌린다 */}
                <TaskCard rect={{ x: M1_TASK1.x - M1_GRID_ORIGIN.x, y: M1_TASK1.y - M1_GRID_ORIGIN.y,
                                  w: M1_TASK1.w, h: M1_TASK1.h }}
                          n={1} title="평가계획서 작성" role="manager" due="09/12"
                          chip={{ done: 3, total: 5, mine: 'pending', avatars: FIND_PEOPLE }} />
                <TaskCard rect={{ x: 292, y: 20, w: 256, h: 150 }} n={2} title="교과협의회 결과 정리"
                          done chip={{ done: 5, total: 5, mine: 'done', avatars: FIND_PEOPLE }} />
                <TaskCard rect={{ x: 564, y: 20, w: 256, h: 150 }} n={null} title="부장 검토 요청"
                          chip={{ done: 1, total: 5, mine: 'pending', avatars: FIND_PEOPLE }} />
              </span>
            )}
          </div>

          {/* 접혀 있는 다음 카드들 — 목록이라는 것이 보여야 한다 */}
          {!open && [0, 1].map((i) => (
            <span key={i} style={{
              ...boxOf({ x: 12, y: 196 + i * 58, w: 836, h: 50 }),
              borderRadius: 12, border: '1px solid var(--hair)', background: 'var(--bg)',
              display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
            }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>
                {i === 0 ? '생기부 마감 점검' : '학교평가 자료 수집'}
              </span>
              <Stub w={150} h={4} o={0.5} />
              <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--fg-faint)' }}>
                세부 할 일 {i === 0 ? 2 : 2}개 ⌄
              </span>
            </span>
          ))}

          <span style={{
            position: 'absolute', left: 12, bottom: 10, fontSize: 9.5, color: 'var(--fg-faint)',
          }}>
            펼친 상태는 <b style={{ color: 'var(--fg-muted)' }}>다음에 와도 그대로</b>예요 —
            자주 보는 업무만 열어 두면 됩니다
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.1, x: pctX(430), y: pctY(28) },
        { t: M1.BULK, ...centerOf(M1_BULK), click: true },
        { t: M1.EXPAND, ...centerOf(M1_DRAWER), click: true },
        { t: M1.DONE, ...centerOf(M1_DRAWER), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 담당자 진행 확인 ══════════════════════════════════════════════════════
   책임자가 누르는 자리는 **카드 하단 담당자 칩**이다. 누르면 전체 명단이 열리고 누구든
   완료/대기로 바꿀 수 있다(서버가 책임자 권한을 다시 확인한다). 왼쪽 위 동그라미는 표시일 뿐이다. */

const M2_W: Rect = { x: 130, y: 70, w: 700, h: 410 };
/** 할 일 카드(창 기준) — 목업·포인터가 함께 본다 */
const M2_CARD: Rect = { x: 26, y: 30, w: 300, h: 170 };
const M2_CHIP = inWindow(M2_W, chipOf(M2_CARD), CH);
/** 칩을 누르면 열리는 명단 팝오버 — 카드 오른쪽 */
const M2_POP: Rect = { x: M2_CARD.x + M2_CARD.w + 30, y: M2_CARD.y, w: 300, h: 170 };
const M2_ROW_H = 26;
/** 명단의 i번째 행(팝오버 기준이 아니라 **창 기준**) — 행과 포인터가 같은 식을 쓴다 */
const m2Row = (i: number): Rect => ({ x: M2_POP.x + 10, y: M2_POP.y + 34 + i * (M2_ROW_H + 4), w: M2_POP.w - 20, h: M2_ROW_H });
const M2_TOGGLE = inWindow(M2_W, m2Row(2), CH);

const M2 = { W_IN: 0.25, OPEN: 1.8, OPENED: 2.3, TOGGLE: 3.6, CHANGED: 4.2, NOTE: 5.4, DONE: 8.0 };
const M2_PEOPLE = ['김하늘', '박서준', '오아린', '윤수아'];

export const SceneProgress: React.FC = () => {
  const t = useSceneTime();
  const opened = t > M2.OPENED;
  const changed = t > M2.CHANGED;
  const doneCount = changed ? 3 : 2;

  return (
    <>
      <Band t={t}>② <Hi>담당자 칩</Hi>을 눌러 누가 끝냈는지 보고, 필요하면 대신 바꾼다</Band>

      <AppWindow kind="app" title="2학기 평가계획 제출 · 세부 할 일"
                 style={{ ...boxOf(M2_W), ...popIn(t, M2.W_IN) }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'color-mix(in srgb, var(--fg) 3%, transparent)',
        }}>
          <TaskCard rect={M2_CARD} n={1} title="평가계획서 작성"
                    role="manager" due="09/12"
                    chip={{ done: doneCount, total: 4, mine: 'pending', avatars: M2_PEOPLE }}
                    glow={clickFlash(t, M2.OPEN)} />

          {opened && (
            <span style={{
              ...boxOf(M2_POP), boxSizing: 'border-box',
              borderRadius: 10, border: '1px solid var(--hair)', background: 'var(--bg)',
              boxShadow: 'var(--shadow)', ...popIn(t, M2.OPENED, 0.35),
            }}>
              <span style={{ position: 'absolute', left: 12, top: 10, fontSize: 10, fontWeight: 700 }}>
                담당자 {doneCount}/4 완료
              </span>
            </span>
          )}
          {opened && M2_PEOPLE.map((name, i) => {
            const done = i < 2 || (i === 2 && changed);
            return (
              <span key={name} style={{
                ...boxOf(m2Row(i)), boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', gap: 7, padding: '0 9px',
                borderRadius: 7, fontSize: 10,
                border: `1px solid ${done ? '#6ee7b7' : 'var(--hair)'}`,
                background: done ? '#ecfdf5' : 'var(--bg)',
                color: done ? '#065f46' : 'var(--fg-muted)',
                boxShadow: i === 2 && clickFlash(t, M2.TOGGLE) > 0
                  ? `0 0 0 ${5 * clickFlash(t, M2.TOGGLE)}px rgba(5,150,105,0.28)` : undefined,
                ...popIn(t, M2.OPENED + 0.05 * i, 0.3),
              }}>
                <span style={{ fontWeight: 650 }}>{name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 9 }}>{done ? '✓ 완료' : '진행 중'}</span>
              </span>
            );
          })}

          {t > M2.NOTE - 0.5 && (
            <span style={{
              ...boxOf({ x: M2_CARD.x, y: M2_CARD.y + M2_CARD.h + 32, w: 630, h: 88 }),
              borderRadius: 10, border: '1px solid #bfdbfe', background: '#eff6ff',
              padding: 12, display: 'flex', flexDirection: 'column', gap: 6,
              ...popIn(t, M2.NOTE - 0.5, 0.5),
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1e40af' }}>
                  내가 담당이기도 하다면
                </span>
              </span>
              <span style={{ fontSize: 10, lineHeight: 1.65, color: '#1d4ed8' }}>
                완료·파일 제출·과제 단위 선택은 <b>내 할 일</b>에서 합니다. 여기 카드의 왼쪽 위
                동그라미는 <b>할 일 전체의 상태</b>를 보여 줄 뿐 누르는 것이 아닙니다.
              </span>
            </span>
          )}

          <span style={{
            position: 'absolute', left: M2_CARD.x, bottom: 12, right: 20, fontSize: 9.5, color: 'var(--fg-faint)',
          }}>
            담당자 이름은 <b style={{ color: 'var(--fg-muted)' }}>책임자에게만</b> 보입니다 —
            할 일을 <b style={{ color: 'var(--fg-muted)' }}>완료로 닫으면</b> 아직 안 낸 담당자의 목록에서도 사라집니다
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.0, x: pctX(500), y: pctY(30) },
        { t: M2.OPEN, ...centerOf(M2_CHIP), click: true },
        { t: M2.TOGGLE, ...centerOf(M2_TOGGLE), click: true },
        { t: M2.DONE, ...centerOf(M2_TOGGLE), hide: true },
      ]} />
    </>
  );
};
