/**
 * 학교 전체(업무 지도) 탭 안내 — 씬 3편.
 *
 * 이 화면에서 **가장 오해하기 쉬운 것은 빈 칸의 뜻**이라, 세 단계 중 한 단계를 통째로
 * 거기에 쓴다("일이 없다"가 아니라 "아직 시스템에 올라오지 않았다"). 축 고르기와 칸 열기는
 * 한 번 보면 알지만, 이건 보여 주지 않으면 **숫자를 업무량으로 읽는다**.
 *
 * 목업 근거: `WorkPivotTab`(툴바 3개 드롭다운·진행 중만·상시 문구·합계 행·고른 칸 목록) ·
 * `workPivot.ts`(값 이름 「올라온 …」·기한 없음 열·채택률).
 * **화면 문구가 바뀌면 함께 고칠 것.**
 */
import React from 'react';
import {
  AppWindow, Pointer, clickFlash, interpolate, popIn, useSceneTime,
} from '@/lib/walkthrough';
import {
  boxOf, centerOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect,
} from '@/components/walkthrough/stageCoords';
import { Band, Hi } from '@/components/walkthrough/atoms';
import { TabBar } from './shared';
import { TAB } from './tabs';

/* ── 격자 모양 (세 씬이 공유한다 — 자리를 손으로 두 번 적으면 어긋난다) ─────── */

// rowH 는 «이름 + 담당자 + 부서 머리글»이 겹치지 않을 만큼이어야 한다(26 이면 겹쳤다)
const GRID = { x: 14, y: 104, rowH: 34, labelW: 150, colW: 52 };
const MONTHS = ['3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '기한 없음'];

interface SeatRow {
  name: string;
  /** 지금 그 자리를 맡은 사람 — 실제 화면이 이름을 함께 적는다 */
  who: string;
  /** 달별 값 — 0 은 빈 칸이다 */
  values: number[];
  /** 공문 분석이 말하는 후보 수 — 합계와 **다른 열**이다 */
  candidates: number;
}

/** 부서 구획 — 업무분장 축은 부서로 묶는다(2026-09-24) */
const DEPT_OF: Record<string, string> = {
  '정보기기·홈페이지': '정보화부',
  '학적·출결': '교무운영부',
  '평가계획': '교육연구부',
  '실험실 안전': '과학부',
  '수시 상담': '진로진학부',
};

const ROWS: SeatRow[] = [
  // ⚠️ 행은 **자리**다(업무 이름을 적지 말 것). 그리고 9월 칸(색인 6)의 값 3은
  //    §3 모달 목업의 «할 일 3개»·목록 3줄과 **같은 숫자여야 한다** — 어긋나면
  //    안내가 "격자의 숫자를 믿으라"고 말하면서 스스로 어기는 그림이 된다.
  { name: '정보기기·홈페이지', who: '권민결', values: [0, 2, 0, 3, 0, 0, 3, 1, 2], candidates: 13 },
  { name: '학적·출결', who: '장재윤', values: [1, 0, 0, 2, 0, 0, 3, 0, 0], candidates: 18 },
  { name: '평가계획', who: '서건우', values: [0, 0, 1, 0, 4, 0, 2, 0, 1], candidates: 6 },
  { name: '실험실 안전', who: '안도윤', values: [0, 0, 0, 0, 0, 0, 0, 0, 0], candidates: 4 },
  { name: '수시 상담', who: '정채원', values: [0, 0, 0, 0, 0, 0, 0, 0, 0], candidates: 5 },
];

/** 값의 크기를 농도로 — 실제 화면과 같은 규칙(0 은 색을 주지 않는다) */
function cellTone(value: number): { bg: string; ink: string } {
  if (value <= 0) return { bg: 'transparent', ink: 'var(--fg-faint)' };
  if (value >= 4) return { bg: '#2563eb', ink: '#fff' };
  if (value >= 2) return { bg: '#bfdbfe', ink: '#1e3a8a' };
  return { bg: '#eff6ff', ink: '#1d4ed8' };
}

const cellRect = (row: number, col: number): Rect => ({
  x: GRID.x + GRID.labelW + col * GRID.colW,
  y: GRID.y + row * GRID.rowH,
  w: GRID.colW - 4,
  h: GRID.rowH - 6,
});

/** 격자 한 벌 — `dim` 을 주면 그 행들을 흐리게(빈 자리 강조용) */
const Grid: React.FC<{ t: number; at: number; highlight?: { row: number; col: number } }> = ({
  t, at, highlight,
}) => (
  <>
    {MONTHS.map((month, col) => (
      <span key={month} style={{
        position: 'absolute',
        left: GRID.x + GRID.labelW + col * GRID.colW,
        top: GRID.y - 18,
        width: GRID.colW - 4,
        fontSize: 8.5, fontWeight: 600, textAlign: 'center', color: 'var(--fg-faint)',
      }}>{month}</span>
    ))}

    {ROWS.map((row, r) => (
      <React.Fragment key={row.name}>
        {/* 부서 구획 — 앞 행과 부서가 다르면 머리글을 얹는다(실제 화면과 같은 규칙) */}
        {DEPT_OF[row.name] !== DEPT_OF[ROWS[r - 1]?.name ?? ''] && (
          <span style={{
            position: 'absolute', left: GRID.x - 4, top: GRID.y + r * GRID.rowH - 10,
            fontSize: 8, fontWeight: 700, color: 'var(--fg-faint)',
          }}>{DEPT_OF[row.name]}</span>
        )}
        <span style={{
          position: 'absolute', left: GRID.x, top: GRID.y + r * GRID.rowH,
          width: GRID.labelW - 8, fontSize: 9.5, fontWeight: 600,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: 'var(--fg)',
        }}>{row.name}</span>
        <span style={{
          position: 'absolute', left: GRID.x, top: GRID.y + r * GRID.rowH + 12,
          fontSize: 8, color: 'var(--fg-faint)',
        }}>{row.who}</span>

        {row.values.map((value, c) => {
          const tone = cellTone(value);
          const on = highlight?.row === r && highlight?.col === c;
          return (
            <span key={c} style={{
              ...boxOf(cellRect(r, c)),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 4, fontSize: 9.5, fontWeight: 650,
              background: tone.bg, color: tone.ink,
              opacity: interpolate(t, [at + r * 0.08, at + r * 0.08 + 0.4], [0, 1]),
              boxShadow: on ? '0 0 0 2px #2563eb' : undefined,
            }}>{value > 0 ? value : '·'}</span>
          );
        })}

        {/* 후보 열 — 합계 **오른쪽에 따로**. 같은 칸에 섞으면 두 숫자의 뜻이 하나가 된다 */}
        <span style={{
          ...boxOf({
            x: GRID.x + GRID.labelW + MONTHS.length * GRID.colW + 8,
            y: GRID.y + r * GRID.rowH, w: GRID.colW - 4, h: GRID.rowH - 6,
          }),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 4, fontSize: 9.5, fontWeight: 650,
          background: '#fef3c7', color: '#b45309',
          opacity: interpolate(t, [at + r * 0.08, at + r * 0.08 + 0.4], [0, 1]),
        }}>{row.candidates}</span>
      </React.Fragment>
    ))}

    <span style={{
      position: 'absolute',
      left: GRID.x + GRID.labelW + MONTHS.length * GRID.colW + 8,
      top: GRID.y - 18, width: GRID.colW - 4,
      fontSize: 8.5, fontWeight: 700, textAlign: 'center', color: '#b45309',
    }}>후보</span>
  </>
);

/** 실제 화면과 같은 상시 문구 — 이 화면이 무엇을 재지 «않는지» */
const Caveat: React.FC<{ top: number }> = ({ top }) => (
  <span style={{
    position: 'absolute', left: 14, top, right: 14,
    borderRadius: 7, padding: '5px 9px',
    background: 'color-mix(in srgb, #f59e0b 12%, var(--bg))',
    fontSize: 9, lineHeight: 1.5, color: '#b45309', fontWeight: 600,
  }}>
    이 시스템에 올라온 업무만 셉니다 — 학교의 실제 업무량이 아닙니다
  </span>
);

/* ══ ① 축을 골라 본다 ═══════════════════════════════════════════════════════ */

const S1_W: Rect = { x: 60, y: 54, w: 840, h: 440 };
const S1_ROW_SELECT = inWindow(S1_W, { x: 470, y: 12, w: 96, h: 22 }, CH);

const S1 = { W_IN: 0.25, GRID: 0.9, OPEN: 2.6, PICK: 4.2, END: 7.2 };

export const SceneAxes: React.FC = () => {
  const t = useSceneTime();
  const open = t > S1.OPEN && t < S1.PICK + 0.3;

  return (
    <>
      <Band t={t}>① <Hi>행·열·값</Hi>을 골라 학교의 업무를 여러 각도로 본다</Band>

      <AppWindow kind="browser" url="spacekijun / 업무 관리"
                 style={{ ...boxOf(S1_W), ...popIn(t, S1.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <TabBar active={TAB.map} />

          {/* 툴바의 세 드롭다운 — 실제 화면과 같은 순서(행 · 열 · 값) */}
          {[
            { label: '행 · 업무분장', x: 470, w: 96 },
            { label: '열 · 월', x: 574, w: 68 },
            { label: '값 · 올라온 할 일', x: 650, w: 108 },
          ].map((item, i) => (
            <span key={item.label} style={{
              ...boxOf({ x: item.x, y: 12, w: item.w, h: 22 }),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 7, border: '1px solid var(--hair)', background: 'var(--bg)',
              fontSize: 8.5, fontWeight: 650, color: 'var(--fg-muted)',
              boxShadow: i === 0 && clickFlash(t, S1.OPEN) > 0
                ? `0 0 0 ${5 * clickFlash(t, S1.OPEN)}px rgba(37,99,235,0.24)` : undefined,
            }}>{item.label}</span>
          ))}

          <span style={{
            ...boxOf({ x: 766, y: 12, w: 62, h: 22 }),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, background: '#2563eb', color: '#fff',
            fontSize: 8.5, fontWeight: 700,
          }}>진행 중만</span>

          <Caveat top={44} />

          <Grid t={t} at={S1.GRID} />

          {/* 열린 드롭다운 — 고를 수 있는 행 축 */}
          {open && (
            <span style={{
              ...boxOf({ x: 470, y: 36, w: 120, h: 108 }),
              borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--bg)',
              boxShadow: '0 8px 24px rgba(15,23,42,0.16)', padding: 4,
              display: 'flex', flexDirection: 'column', gap: 1,
            }}>
              {['업무분장', '부서', '업무', '상태', '할 일 유형'].map((label, i) => (
                <span key={label} style={{
                  borderRadius: 5, padding: '3px 7px', fontSize: 9,
                  fontWeight: i === 0 ? 700 : 500,
                  background: i === 0 ? 'color-mix(in srgb, #2563eb 10%, transparent)' : 'transparent',
                  color: i === 0 ? '#1d4ed8' : 'var(--fg-muted)',
                }}>{label}</span>
              ))}
            </span>
          )}

          <span style={{
            position: 'absolute', left: 14, bottom: 10, right: 14,
            fontSize: 9.5, lineHeight: 1.6, color: 'var(--fg-faint)',
          }}>
            행을 <b style={{ color: 'var(--fg-muted)' }}>업무분장</b>으로 두면 사람이 아니라
            <b style={{ color: 'var(--fg-muted)' }}> 자리</b>가 섭니다 — 담당자가 바뀌어도 같은 행에서 비교됩니다
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.6, x: pctX(520), y: pctY(300) },
        { t: S1.OPEN, ...centerOf(S1_ROW_SELECT), click: true },
        { t: S1.PICK, ...centerOf(S1_ROW_SELECT), click: true },
        { t: S1.END, ...centerOf(S1_ROW_SELECT), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 빈 칸의 뜻 ═══════════════════════════════════════════════════════════
   클릭이 없다. **오해를 바로잡는** 단계라 화면이 스스로 말하게 둔다. */

const S2_W: Rect = { x: 70, y: 62, w: 820, h: 430 };
const S2 = { W_IN: 0.25, GRID: 0.8, MARK: 2.6, END: 7.4 };

export const SceneEmpty: React.FC = () => {
  const t = useSceneTime();
  const marked = t > S2.MARK;

  return (
    <>
      <Band t={t}>② 빈 칸은 <Hi>「일이 없다」가 아니라 「아직 올라오지 않았다」</Hi></Band>

      <AppWindow kind="app" title="학교 전체 · 업무분장 × 월"
                 style={{ ...boxOf(S2_W), ...popIn(t, S2.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <Caveat top={12} />
          <Grid t={t} at={S2.GRID} />

          {/* 업무가 하나도 없는 자리 두 줄을 감싸 보여 준다 */}
          {marked && (
            <>
              <span style={{
                ...boxOf({
                  x: GRID.x - 4, y: GRID.y + 3 * GRID.rowH - 3,
                  w: GRID.labelW + MONTHS.length * GRID.colW, h: GRID.rowH * 2,
                }),
                borderRadius: 7, border: '2px dashed #f59e0b',
                background: 'color-mix(in srgb, #f59e0b 6%, transparent)',
              }} />
              <span style={{
                position: 'absolute',
                left: GRID.x + GRID.labelW + MONTHS.length * GRID.colW + 64,
                top: GRID.y + 3 * GRID.rowH + 4,
                width: 150, fontSize: 9, lineHeight: 1.5, fontWeight: 650, color: '#b45309',
              }}>
                ← 공문 분석은 이 자리에 일이 4~5개 있다고 말한다
              </span>
            </>
          )}

          <span style={{
            position: 'absolute', left: 14, bottom: 34, right: 14,
            fontSize: 9.5, lineHeight: 1.6, color: 'var(--fg-faint)',
          }}>
            그래서 값 이름이 <b style={{ color: 'var(--fg-muted)' }}>「올라온 할 일」</b>입니다.
            업무가 없는 자리도 <b style={{ color: 'var(--fg-muted)' }}>행으로 남겨 둡니다</b> —
            빈 줄이 사라지면 「전부 올라와 있다」로 보이기 때문입니다.
          </span>
          <span style={{
            position: 'absolute', left: 14, bottom: 12, fontSize: 9, fontWeight: 650, color: 'var(--fg-muted)',
          }}>
            분장 자리 12개 중 <b style={{ color: '#2563eb' }}>3개</b>에 업무가 올라와 있습니다
          </span>
        </div>
      </AppWindow>
    </>
  );
};

/* ══ ③ 칸을 눌러 그 업무를 본다 ════════════════════════════════════════════ */

const S3_W: Rect = { x: 70, y: 56, w: 820, h: 440 };
const S3_CELL_LOCAL = cellRect(0, 6);
const S3_CELL = inWindow(S3_W, S3_CELL_LOCAL, CH);

const S3 = { W_IN: 0.25, GRID: 0.8, CLICK: 2.8, LIST: 3.2, END: 7.4 };

/** 모달 목업 자리 — 창 안 좌표(`boxOf` 기준) */
const S3_MODAL: Rect = { x: 190, y: 96, w: 420, h: 248 };

/** 문구는 실제 모달과 같은 모양: 업무 머리글 + 그 칸에 든 할 일만 */
const MODAL_GROUPS: { work: string; tasks: [string, string][] }[] = [
  { work: '정보공시', tasks: [['자료등록', '09/10'], ['검토', '09/18']] },
  { work: '홈페이지 개편', tasks: [['설계', '09/25']] },
];

export const SceneDrill: React.FC = () => {
  const t = useSceneTime();
  const listed = t > S3.LIST;

  return (
    <>
      <Band t={t}>③ 칸을 누르면 <Hi>그 칸에 든 업무</Hi>가 창으로 열린다</Band>

      <AppWindow kind="app" title="학교 전체 · 업무분장 × 월"
                 style={{ ...boxOf(S3_W), ...popIn(t, S3.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <Caveat top={12} />
          <Grid t={t} at={S3.GRID} highlight={listed ? { row: 0, col: 6 } : undefined} />

          {/* 실제 화면은 **모달**이다 — 표 아래가 아니라 표 위에 뜬다(2026-09-24).
              아래에 붙이면 목록을 보려고 스크롤하는 사이 누른 칸이 화면 밖으로 나간다. */}
          {listed && (
            <>
              <span style={{
                position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.38)',
                opacity: interpolate(t, [S3.LIST, S3.LIST + 0.25], [0, 1]),
              }} />
              <span style={{
                ...boxOf(S3_MODAL),
                borderRadius: 12, border: '1px solid var(--hair)', background: 'var(--bg)',
                boxShadow: '0 18px 48px rgba(15,23,42,0.28)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                opacity: interpolate(t, [S3.LIST, S3.LIST + 0.35], [0, 1]),
              }}>
                <span style={{
                  padding: '9px 12px', borderBottom: '1px solid var(--hair-2)',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg)' }}>
                    정보화부 · 정보기기·홈페이지 · 9월
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--fg-faint)' }}>
                    업무 2개 · 할 일 3개 (진행 중만)
                  </span>
                </span>

                <span style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {MODAL_GROUPS.map((group) => (
                    <span key={group.work} style={{
                      borderRadius: 8, border: '1px solid var(--hair-2)',
                      display: 'flex', flexDirection: 'column',
                    }}>
                      <span style={{
                        padding: '5px 9px', borderBottom: '1px solid var(--hair-2)',
                        fontSize: 9.5, fontWeight: 700, color: 'var(--fg)',
                        display: 'flex', justifyContent: 'space-between',
                      }}>
                        {group.work}
                        <span style={{ fontWeight: 500, color: 'var(--fg-faint)' }}>
                          할 일 {group.tasks.length}개
                        </span>
                      </span>
                      {group.tasks.map(([title, due]) => (
                        <span key={title} style={{
                          padding: '4px 9px', fontSize: 9, color: 'var(--fg-muted)',
                          display: 'flex', justifyContent: 'space-between', gap: 6,
                        }}>
                          {title}
                          <span style={{ color: 'var(--fg-faint)' }}>{due}</span>
                        </span>
                      ))}
                    </span>
                  ))}
                </span>

                <span style={{
                  padding: '7px 12px', borderTop: '1px solid var(--hair-2)',
                  fontSize: 8.5, color: 'var(--fg-faint)',
                }}>
                  고치려면 「업무 목록」, 수행하려면 「내 할 일」로 갑니다
                </span>
              </span>
            </>
          )}

          <span style={{
            position: 'absolute', left: 14, bottom: 10, right: 14,
            fontSize: 9.5, lineHeight: 1.6, color: 'var(--fg-faint)',
          }}>
            값을 <b style={{ color: 'var(--fg-muted)' }}>기한 초과</b>로 바꾸면 같은 격자가
            <b style={{ color: 'var(--fg-muted)' }}> 밀린 일이 쌓인 자리</b>를 붉게 보여 줍니다
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.8, x: pctX(420), y: pctY(360) },
        { t: S3.CLICK, ...centerOf(S3_CELL), click: true },
        { t: S3.END, ...centerOf(S3_CELL), hide: true },
      ]} />
    </>
  );
};
