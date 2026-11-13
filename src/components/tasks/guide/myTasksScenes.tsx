/**
 * 내 할 일(`/my-tasks`) 안내 — 씬 3편. (2026-09-21 신규)
 *
 * 내 할 일은 업무 관리의 탭이 아니라 **별도 화면**이라 탭 줄(`TabBar`)을 이지 않는다.
 * 대신 실제 헤더와 같은 모양(왼쪽 상태 필터, 오른쪽 버튼)을 그린다. **기능명·아이콘은 그리지
 * 않는다** — 실제 화면에 없다(2026-09-22 사용자 규약, CLAUDE.md "UI 큰 틀 규약" §1).
 *
 * ── 라벨의 출처 (화면 문구가 바뀌면 함께 고칠 것) ───────────────────────────
 *   · 헤더 필터 `할 일 / 완료 / 전체`·`계획표 열기/접기` …… `TaskHeader.tsx` (mode='myTasks')
 *   · 구획 이름(`오늘까지` 등)은 **그리지 않는다** — 2026-09-26 부터 실제 화면이 구획 없이 한 목록이다
 *     (순서만 `taskInboxUtils.ts` 의 `inboxGroups` 를 따른다)
 *   · 목록(2026-09-26 열 구성): 머리글 `할 일 | 마감일 | 상태` + 행(점 · 제목과 **그 아래 줄에** 업무명
 *     `순서 N` · `MM.DD 마감` · `파일 제출 남음`/`완료`/`담당자 아님 표시함`) + 버튼 `완료하기 / 완료 취소 / 제출하기 /
 *     회차별 완료 / 상세 보기`. 열 너비는 실제 `ROW_GRID` 를 목업 폭에 맞춰 줄인 값이다
 *     ……………………………………………………………………… `MyTaskInbox.tsx` 의 `InboxRow`
 *   · 제출 요청 라벨 ……………………………………………… `collectInput.ts` 의 `REQUEST_KIND_LABEL`·`requestVerb`
 *   · 계획표: `할 일 계획표`·`이번 주 마감 N건`·`오늘`·`관리 · <업무명>` … `MyTaskInbox.tsx`
 */
import React from 'react';
import {
  AppWindow, Pointer, clickFlash, popIn, useSceneTime,
} from '@/lib/walkthrough';
import {
  boxOf, centerOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect,
} from '@/components/walkthrough/stageCoords';
import { Band, Btn, Hi, Pill } from '@/components/walkthrough/atoms';

/* ── 공통 기하 — 목업과 포인터가 **같은 식**을 본다 ─────────────────────────── */

const WIN: Rect = { x: 60, y: 62, w: 840, h: 430 };
const ROW_H = 40;
/** 목록 머리글(열 이름) 높이 — 행은 그 아래부터 */
const HEAD_H = 18;
const BTN = { w: 78, h: 24, padR: 12 };

/** 목록 카드 안 i번째 행(창 기준) */
const rowOf = (list: Rect, i: number): Rect => ({ x: list.x, y: list.y + HEAD_H + i * ROW_H, w: list.w, h: ROW_H });
/** 행 n개 + 머리글이 든 목록 카드의 높이 */
const listH = (rows: number) => HEAD_H + ROW_H * rows;
/** 행 오른쪽 끝의 수행 버튼(창 기준) */
const rowBtnOf = (row: Rect): Rect => ({
  x: row.x + row.w - BTN.padR - BTN.w, y: row.y + (ROW_H - BTN.h) / 2, w: BTN.w, h: BTN.h,
});

/** 상태 필터 알약 — 활성 색이 뜻을 말한다(할 일=블루) */
const FilterPills: React.FC<{ left: number; top: number }> = ({ left, top }) => (
  <span style={{
    position: 'absolute', left, top, display: 'flex', gap: 2, padding: 2,
    borderRadius: 8, background: 'color-mix(in srgb, var(--fg) 5%, transparent)',
  }}>
    {['할 일', '완료', '전체'].map((f, i) => (
      <span key={f} style={{
        borderRadius: 6, padding: '3px 9px', fontSize: 10,
        border: `1px solid ${i === 0 ? '#bfdbfe' : 'transparent'}`,
        background: i === 0 ? '#eff6ff' : 'transparent',
        color: i === 0 ? '#1d4ed8' : 'var(--fg-faint)', fontWeight: i === 0 ? 700 : 500,
      }}>{f}</span>
    ))}
  </span>
);

/** 실제 헤더와 같은 모양 — 왼쪽 상태 필터, 오른쪽 버튼은 호출부가 채운다(기능명 없음) */
const InboxHeader: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <>
    <FilterPills left={12} top={13} />
    {children}
  </>
);

type Chip = { label: string; tone: 'due' | 'soon' | 'submit' | 'done' | 'notMine' };
const CHIP_TONE: Record<Chip['tone'], { fg: string; bg: string; bd: string }> = {
  due: { fg: '#b45309', bg: '#fffbeb', bd: '#fffbeb' },
  soon: { fg: '#64748b', bg: '#f1f5f9', bd: '#f1f5f9' },
  submit: { fg: '#4338ca', bg: '#eef2ff', bd: '#eef2ff' },
  done: { fg: '#047857', bg: '#ecfdf5', bd: '#ecfdf5' },
  notMine: { fg: '#b45309', bg: '#fffbeb', bd: '#fde68a' },
};

/** 열 구성 — 실제 `MyTaskInbox` 의 `ROW_GRID`(점 · 할 일(아래 줄 업무) · 마감일 · 상태 · 버튼)를 목업 폭에 맞춘 것 */
const colsFor = (w: number) => {
  const c = w >= 700 ? { date: 74, status: 150 } : { date: 66, status: 96 };
  return `10px minmax(0,1fr) ${c.date}px ${c.status}px`;
};
const ROW_PAD = { left: 14, right: BTN.padR + BTN.w + 12 };
const DATE_TONES: Chip['tone'][] = ['due', 'soon'];

/** 목록 머리글 — 열 이름. 행과 **같은 열 구성**을 쓴다 */
const ListHead: React.FC<{ list: Rect }> = ({ list }) => (
  <span style={{
    ...boxOf({ x: list.x, y: list.y + 3, w: list.w, h: HEAD_H - 3 }), boxSizing: 'border-box',
    padding: `0 ${ROW_PAD.right}px 0 ${ROW_PAD.left}px`,
    display: 'grid', gridTemplateColumns: colsFor(list.w), columnGap: 10, alignItems: 'end',
    fontSize: 9, color: 'var(--fg-faint)', borderBottom: '1px solid var(--hair)', paddingBottom: 3,
  }}>
    <span /><span>할 일</span><span>마감일</span><span>상태</span>
  </span>
);

/** 목록 행의 글 부분 — 열로 늘어놓는다. 버튼은 창 수준에서 `Btn` 으로 따로 그린다 */
const RowText: React.FC<{
  rect: Rect; title: string; work: string; chips: Chip[]; muted?: boolean; last?: boolean; glow?: number;
}> = ({ rect, title, work, chips, muted = false, last = false, glow = 0 }) => {
  const dateChips = chips.filter((c) => DATE_TONES.includes(c.tone));
  const statusChips = chips.filter((c) => !DATE_TONES.includes(c.tone));
  const done = statusChips.some((c) => c.tone === 'done');
  const clip: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 };
  return (
    <span style={{
      ...boxOf(rect), boxSizing: 'border-box',
      padding: `0 ${ROW_PAD.right}px 0 ${ROW_PAD.left}px`,
      display: 'grid', gridTemplateColumns: colsFor(rect.w), columnGap: 10, alignItems: 'center',
      borderBottom: last ? undefined : '1px solid var(--hair)',
      background: glow > 0 ? `rgba(16,185,129,${0.1 * glow})` : muted ? 'color-mix(in srgb, var(--fg) 2.5%, transparent)' : undefined,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: done ? '#059669' : '#f59e0b' }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ ...clip, fontSize: 11.5, fontWeight: 700, color: muted ? 'var(--fg-muted)' : 'var(--fg)' }}>{title}</span>
        <span style={{ ...clip, fontSize: 10, color: 'var(--fg-faint)' }}>{work}</span>
      </span>
      <span style={{ display: 'flex', fontSize: 10 }}>
        {dateChips.map((c) => <Pill key={c.label} label={c.label} {...CHIP_TONE[c.tone]} />)}
      </span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 10, minWidth: 0 }}>
        {statusChips.map((c) => <Pill key={c.label} label={c.label} {...CHIP_TONE[c.tone]} />)}
      </span>
    </span>
  );
};

const ListCard: React.FC<{ rect: Rect; accent: string; children: React.ReactNode }> = ({ rect, accent, children }) => (
  <>
    <span style={{
      ...boxOf(rect), boxSizing: 'border-box', borderRadius: 12,
      border: '1px solid var(--hair)', background: 'var(--bg)', boxShadow: 'var(--shadow)', overflow: 'hidden',
    }}>
      <span style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, background: accent }} />
    </span>
    {children}
  </>
);

/* ══ ① 확인하고 완료하기 ═══════════════════════════════════════════════════════
   업무를 펼칠 필요 없이 내 할 일만 마감순으로 나온다. 행의 버튼 하나가 곧 수행이다. */

const A_LIST: Rect = { x: 12, y: 74, w: 816, h: listH(3) };
const A_DONE_BTN = rowBtnOf(rowOf(A_LIST, 0));
const A_DONE_PTR = inWindow(WIN, A_DONE_BTN, CH);

const A = { W_IN: 0.25, CLICK: 2.2, CHANGED: 2.8, NOTE: 4.4, END: 8.0 };

export const SceneInbox: React.FC = () => {
  const t = useSceneTime();
  const done = t > A.CHANGED;

  return (
    <>
      <Band t={t}>① 내 할 일만 <Hi>마감순</Hi>으로 — 행의 버튼 하나가 곧 수행이다</Band>

      <AppWindow kind="browser" url="spacekijun / 내 할 일"
                 style={{ ...boxOf(WIN), ...popIn(t, A.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <InboxHeader />

          <ListCard rect={A_LIST} accent="#f59e0b">
            <ListHead list={A_LIST} />
            <RowText rect={rowOf(A_LIST, 0)} title="평가계획서 작성"
                     work="2학기 평가계획 제출 · 순서 1"
                     chips={[{ label: '09.21 마감', tone: 'due' }, ...(done ? [{ label: '완료', tone: 'done' } as Chip] : [])]}
                     glow={clickFlash(t, A.CLICK)} />
            <Btn rect={A_DONE_BTN} label={done ? '↶ 완료 취소' : '✓ 완료하기'} tone="ghost"
                 flash={clickFlash(t, A.CLICK)} />

            <RowText rect={rowOf(A_LIST, 1)} title="1학기 성적 입력 확인서"
                     work="성적 처리"
                     chips={[{ label: '09.21 마감', tone: 'due' }, { label: '파일 제출 남음', tone: 'submit' }]} />
            <Btn rect={rowBtnOf(rowOf(A_LIST, 1))} label="제출하기" tone="primary" />

            <RowText rect={rowOf(A_LIST, 2)} title="방과후 강좌 개설 신청" muted last
                     work="2학기 방과후학교 운영"
                     chips={[{ label: '09.21 마감', tone: 'due' }, { label: '담당자 아님 표시함', tone: 'notMine' }]} />
            <Btn rect={rowBtnOf(rowOf(A_LIST, 2))} label="상세 보기" tone="ghost" />
          </ListCard>

          {t > A.NOTE - 0.5 && (
            <span style={{
              ...boxOf({ x: A_LIST.x, y: A_LIST.y + A_LIST.h + 18, w: A_LIST.w, h: 92 }), boxSizing: 'border-box',
              borderRadius: 10, border: '1px solid #fde68a', background: '#fffbeb',
              padding: 12, display: 'flex', flexDirection: 'column', gap: 6,
              ...popIn(t, A.NOTE - 0.5, 0.5),
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <b style={{ fontSize: 10.5, color: '#92400e' }}>내 일이 아닌 것 같다면</b>
                <Pill label="상세 → 제 담당 할 일이 아닙니다" fg="#92400e" bg="#fef3c7" bd="#fcd34d" />
              </span>
              <span style={{ fontSize: 10, lineHeight: 1.65, color: '#b45309' }}>
                사유를 적어 표시하면 <b>홈 대시보드에서는 사라지고</b> 여기에는 <b>담당자 아님 표시함</b>과 함께 남습니다 —
                책임자가 담당자를 고치면 목록에서 빠지고, 잘못 눌렀다면 같은 자리에서 취소합니다.
              </span>
            </span>
          )}

          <span style={{ position: 'absolute', left: 16, bottom: 12, right: 16, fontSize: 10, color: 'var(--fg-faint)' }}>
            제목을 누르면 <b style={{ color: 'var(--fg-muted)' }}>설명과 첨부</b>가 열립니다(잠시 머물면 설명 미리보기) · 완료로 바뀌는 것은 <b style={{ color: 'var(--fg-muted)' }}>내 상태뿐</b>입니다
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.1, x: pctX(520), y: pctY(40) },
        { t: A.CLICK, ...centerOf(A_DONE_PTR), click: true },
        { t: A.END, ...centerOf(A_DONE_PTR), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 유형별 수행 ════════════════════════════════════════════════════════════
   클릭이 없다. "이런 할 일을 만나면 행의 버튼이 이렇게 달라진다"를 **보여 주는** 단계다.
   (2026-09-21 까지는 내 업무 안내의 ③이었다 — 수행이 이 화면으로 오면서 함께 옮겨 왔다.) */

const B = { W_IN: 0.25, A: 1.0, B: 2.6, C: 4.2 };
const B_W: Rect = { x: 60, y: 70, w: 840, h: 410 };

export const SceneKinds: React.FC = () => {
  const t = useSceneTime();

  const card = (x: number, at: number, title: string, button: string, desc: string, body: React.ReactNode) => (
    <div style={{
      ...boxOf({ x, y: 40, w: 256, h: 312 }), boxSizing: 'border-box',
      borderRadius: 11, border: '1px solid var(--hair)', padding: 12,
      display: 'flex', flexDirection: 'column', gap: 8,
      ...popIn(t, at, 0.5),
    }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <b style={{ fontSize: 11.5 }}>{title}</b>
        <Pill label={button} fg="#1d4ed8" bg="#eff6ff" bd="#bfdbfe" />
      </span>
      <span style={{ fontSize: 10, lineHeight: 1.6, color: 'var(--fg-muted)' }}>{desc}</span>
      {body}
    </div>
  );

  return (
    <>
      <Band t={t}>② 할 일에 따라 <Hi>행의 버튼</Hi>이 달라진다</Band>

      <AppWindow kind="app" title="할 일 유형" style={{ ...boxOf(B_W), ...popIn(t, B.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          {card(16, B.A, '제출 받는 할 일', '제출하기',
            '완료하기 대신 제출 버튼이 나옵니다. 내야 할 것을 다 내면 그게 곧 완료예요.',
            <>
              <span style={{
                borderRadius: 9, border: '1.5px dashed var(--primary)',
                background: 'color-mix(in srgb, var(--primary) 5%, transparent)',
                padding: 14, display: 'grid', placeItems: 'center',
                fontSize: 10, color: 'var(--primary)', fontWeight: 650,
              }}>파일 올리기</span>
              <span style={{ fontSize: 10, color: 'var(--fg-faint)', textAlign: 'center' }}>또는 양식에 작성</span>
              <span style={{ borderRadius: 9, border: '1px solid var(--hair)', padding: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {['과목명', '평가 비율'].map((f) => (
                  <span key={f} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ width: 48, fontSize: 10, color: 'var(--fg-muted)' }}>{f}</span>
                    <span style={{ flex: 1, height: 14, borderRadius: 4, border: '1px solid var(--hair)' }} />
                  </span>
                ))}
              </span>
              <span style={{ marginTop: 'auto', fontSize: 10, color: 'var(--fg-faint)' }}>
                제출을 취소하면 다시 대기로 돌아갑니다
              </span>
            </>)}

          {card(292, B.B, '마감이 여러 번인 할 일', '회차별 완료 ⌄',
            '버튼을 누르면 행 아래에 회차가 펼쳐집니다. 회차마다 따로 완료해요.',
            <>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  { d: '1회 · 05/10', done: true },
                  { d: '2회 · 07/12', done: true },
                  { d: '3회 · 09/20', done: false },
                ].map((r) => (
                  <span key={r.d} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px',
                    borderRadius: 7, fontSize: 10,
                    border: `1px solid ${r.done ? '#6ee7b7' : 'var(--hair)'}`,
                    background: r.done ? '#ecfdf5' : 'var(--bg)',
                    color: r.done ? '#065f46' : 'var(--fg-muted)',
                  }}>
                    {r.done && <span style={{ fontWeight: 800 }}>✓</span>}
                    {r.d} · {r.done ? '완료' : '완료하기'}
                  </span>
                ))}
              </span>
              <span style={{ marginTop: 'auto', fontSize: 10, color: 'var(--fg-faint)' }}>
                전부 끝나야 내가 완료됩니다
              </span>
            </>)}

          {card(568, B.C, '과제 단위 할 일', '과제 선택·완료 ⌄',
            '사람이 아니라 과제 항목에 배분됩니다. 남은 것을 직접 골라 수행해요.',
            <>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { s: '국어', who: '내가 맡음', mine: true, free: false },
                  { s: '영어', who: '＋ 내가 하기', mine: false, free: true },
                ].map((u) => (
                  <span key={u.s} style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '6px 9px',
                    borderRadius: 7, fontSize: 10,
                    border: `1px solid ${u.mine ? 'var(--primary)' : '#fcd34d'}`,
                    background: u.mine ? 'color-mix(in srgb, var(--primary) 7%, transparent)' : '#fffbeb',
                  }}>
                    <b>{u.s}</b>
                    <span style={{ marginLeft: 'auto', color: u.mine ? 'var(--primary)' : '#b45309' }}>{u.who}</span>
                  </span>
                ))}
                <span style={{ fontSize: 10, color: 'var(--fg-faint)', padding: '2px 2px 0' }}>남이 맡은 단위 3개</span>
              </span>
              <span style={{ marginTop: 'auto', fontSize: 10, color: 'var(--fg-faint)' }}>
                남이 맡은 단위는 개수만 보입니다
              </span>
            </>)}
        </div>
      </AppWindow>
    </>
  );
};

/* ══ ③ 계획표로 한 주 보기 ════════════════════════════════════════════════════
   헤더의 [계획표 열기]로 옆 패널을 연다. 계획표에는 **내가 관리하는 업무의 할 일도** 함께 나온다. */

const C_TOGGLE: Rect = { x: WIN.w - 12 - 92, y: 12, w: 92, h: 24 };
const C_TOGGLE_PTR = inWindow(WIN, C_TOGGLE, CH);
const C_PANEL: Rect = { x: 520, y: 50, w: 308, h: 330 };
const C_LIST_WIDE: Rect = { x: 12, y: 74, w: 816, h: listH(3) };
const C_LIST_NARROW: Rect = { x: 12, y: 74, w: 496, h: listH(3) };

const C = { W_IN: 0.25, CLICK: 1.8, OPENED: 2.4, MANAGED: 4.2, END: 8.0 };

const PLAN_ROWS = [
  { day: '9/21', dow: '월', today: true, title: '평가계획서 작성', sub: '2학기 평가계획 제출' },
  { day: '9/23', dow: '수', today: false, title: '추정분할 점수 수합', sub: '관리 · 성적 처리', managed: true },
  { day: '9/25', dow: '금', today: false, title: '1학기 성적 입력 확인서', sub: '성적 처리' },
];

export const ScenePlanner: React.FC = () => {
  const t = useSceneTime();
  const open = t > C.OPENED;
  const list = open ? C_LIST_NARROW : C_LIST_WIDE;

  return (
    <>
      <Band t={t}>③ <Hi>계획표</Hi>로 한 주를 본다 — 내가 관리하는 할 일도 함께 나온다</Band>

      <AppWindow kind="browser" url="spacekijun / 내 할 일"
                 style={{ ...boxOf(WIN), ...popIn(t, C.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <InboxHeader>
            <Btn rect={C_TOGGLE} label={open ? '계획표 접기' : '계획표 열기'} tone="ghost"
                 flash={clickFlash(t, C.CLICK)} />
          </InboxHeader>

          <ListCard rect={list} accent="#f59e0b">
            <ListHead list={list} />
            <RowText rect={rowOf(list, 0)} title="평가계획서 작성" work="2학기 평가계획 제출 · 순서 1"
                     chips={[{ label: '09.21 마감', tone: 'due' }]} />
            <Btn rect={rowBtnOf(rowOf(list, 0))} label="✓ 완료하기" tone="ghost" />
            <RowText rect={rowOf(list, 1)} title="1학기 성적 입력 확인서" work="성적 처리"
                     chips={[{ label: '09.25 마감', tone: 'soon' }, { label: '파일 제출 남음', tone: 'submit' }]} />
            <Btn rect={rowBtnOf(rowOf(list, 1))} label="제출하기" tone="primary" />
            <RowText rect={rowOf(list, 2)} title="동아리 활동 계획 입력" work="창의적 체험활동 운영" last
                     chips={[{ label: '마감일 없음', tone: 'soon' }]} />
            <Btn rect={rowBtnOf(rowOf(list, 2))} label="✓ 완료하기" tone="ghost" />
          </ListCard>

          {open && (
            <span style={{
              ...boxOf(C_PANEL), boxSizing: 'border-box', borderRadius: 12, overflow: 'hidden',
              border: '1px solid var(--hair)', background: 'var(--bg)', boxShadow: 'var(--shadow)',
              display: 'flex', flexDirection: 'column',
              ...popIn(t, C.OPENED, 0.4),
            }}>
              <span style={{ padding: '9px 12px', borderBottom: '1px solid var(--hair)', display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                <b style={{ fontSize: 11.5 }}>할 일 계획표</b>
                <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>이번 주 마감 3건</span>
              </span>
              <span style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: 'var(--fg-muted)' }}>
                <span>‹ &nbsp;2026. 9. 21 – 9. 27&nbsp; ›</span>
                <span style={{ borderRadius: 6, border: '1px solid var(--hair)', padding: '2px 7px' }}>오늘</span>
              </span>
              {PLAN_ROWS.map((r) => (
                <span key={r.day} style={{
                  display: 'flex', borderTop: '1px solid var(--hair)', minHeight: 62,
                  background: r.today ? 'rgba(59,130,246,0.06)'
                    : r.managed && t > C.MANAGED ? 'rgba(16,185,129,0.08)' : undefined,
                }}>
                  <span style={{
                    width: 46, flexShrink: 0, padding: '8px 0 0 12px', borderRight: '1px solid var(--hair)',
                    fontSize: 10, lineHeight: 1.5, color: r.today ? '#2563eb' : 'var(--fg-faint)', fontWeight: r.today ? 700 : 500,
                  }}>{r.day}<br />{r.dow}</span>
                  <span style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <b style={{ fontSize: 10.5 }}>{r.title}</b>
                    <span style={{ fontSize: 10, color: r.managed ? '#047857' : 'var(--fg-faint)', fontWeight: r.managed ? 650 : 400 }}>{r.sub}</span>
                  </span>
                </span>
              ))}
              <span style={{ marginTop: 'auto', padding: '8px 12px', borderTop: '1px solid var(--hair)', fontSize: 10, color: 'var(--fg-faint)' }}>
                마감일 미정 · 동아리 활동 계획 입력
              </span>
            </span>
          )}

          <span style={{ position: 'absolute', left: 16, bottom: 12, right: 16, fontSize: 10, color: 'var(--fg-faint)' }}>
            <b style={{ color: '#047857' }}>관리 ·</b> 가 붙은 것은 내가 책임자인 업무의 할 일입니다 —
            목록에는 없고 <b style={{ color: 'var(--fg-muted)' }}>계획표에만</b> 나옵니다
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(420), y: pctY(300) },
        { t: C.CLICK, ...centerOf(C_TOGGLE_PTR), click: true },
        { t: C.END, ...centerOf(C_TOGGLE_PTR), hide: true },
      ]} />
    </>
  );
};
