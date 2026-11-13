/**
 * 업무 흐름 탭 안내 — 씬 3편.
 *
 * 목업 근거: `TaskWorkflowTab`·`WorkflowCanvas`(노드·화살표 캔버스, 부서 단위) ·
 * `TaskActionPanel`(실행 연결·실행, 실행·검수 이력) · `actionRegistry`(실행 유형 allowlist).
 * **화면 문구가 바뀌면 함께 고칠 것.**
 */
import React from 'react';
import {
  AppWindow, Pointer, clickFlash, interpolate, popIn, useSceneTime,
} from '@/lib/walkthrough';
import {
  boxOf, centerOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect,
} from '@/components/walkthrough/stageCoords';
import { Band, Btn, Hi, Pill, Stub } from '@/components/walkthrough/atoms';
import { TabBar } from './shared';
import { TAB } from './tabs';

/** 캔버스 노드 하나 — 세 씬이 함께 쓴다 */
const Node: React.FC<{
  x: number; y: number; label: string; work?: string;
  on?: boolean; glow?: number; t: number; at: number;
}> = ({ x, y, label, work, on = false, glow = 0, t, at }) => (
  <span style={{
    ...boxOf({ x, y, w: 150, h: 62 }),
    borderRadius: 10, padding: 9,
    border: `1.5px solid ${on ? 'var(--primary)' : 'var(--hair)'}`,
    background: on ? 'color-mix(in srgb, var(--primary) 6%, var(--bg))' : 'var(--bg)',
    display: 'flex', flexDirection: 'column', gap: 5,
    boxShadow: glow > 0 ? `0 0 0 ${5 * glow}px rgba(79,70,229,0.24)` : 'var(--shadow)',
    ...popIn(t, at, 0.45),
  }}>
    <span style={{ fontSize: 10.5, fontWeight: 700 }}>{label}</span>
    <Stub w={108} h={4} o={0.6} />
    <span style={{ marginTop: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
      {work ? (
        <>
          <span style={{
            borderRadius: 5, background: 'var(--primary)', color: '#fff',
            fontSize: 8, fontWeight: 700, padding: '1px 5px',
          }}>작업</span>
          <span style={{ fontSize: 8.5, color: 'var(--fg-faint)' }}>{work}</span>
        </>
      ) : (
        <span style={{ fontSize: 8.5, color: 'var(--fg-faint)' }}>도구 없음</span>
      )}
    </span>
  </span>
);

/**
 * 노드 사이 화살표 — `(x, y)` 는 **중심선 위의 시작점**, `len` 은 화살촉 끝까지의 길이.
 *
 * 이 선은 장식이 아니라 **정보**다. 단계의 순서와 방향을 말하는 유일한 표시라 dataviz
 * 규약("데이터 색은 표면 대비 3:1 이상")이 그대로 적용된다. 종전엔 세 가지가 틀려 있었다:
 *   ① 색이 `--hair`(#e2e8f0 slate-200) — 흰 배경 대비 **1.20:1** 로 사실상 안 보였다.
 *      경계선용 색을 의미를 가진 선에 쓴 것. 지금은 `--fg-muted`(#64748b, 4.76:1).
 *   ② **화살촉이 없었다** — 머리 없는 선은 화살표로 읽히지 않는데 배너는 "노드와 화살표로
 *      그려 둔다"고 말한다. 말과 그림이 어긋나면 그림 쪽을 못 믿게 된다.
 *   ③ 세로를 지원하지 않아, 세로 연결선이 `w={2}` 로 불려 **2×2 점** 하나로 그려졌다.
 *
 * 자라나는 연출은 컨테이너를 `overflow:hidden` 으로 두고 그 크기만 키워서 얻는다 —
 * SVG 를 다시 그리지 않으므로 화살촉 모양이 도중에 찌그러지지 않는다.
 */
const ARROW_THICK = 9;  // 화살촉이 들어갈 폭
const ARROW_HEAD = 7;   // 화살촉 길이

const Arrow: React.FC<{
  x: number; y: number; len: number;
  dir?: 'right' | 'down';
  t: number; at: number;
}> = ({ x, y, len, dir = 'right', t, at }) => {
  const p = interpolate(t, [at, at + 0.5], [0, 1]);
  const horizontal = dir === 'right';
  const mid = ARROW_THICK / 2;
  const shaftEnd = Math.max(0, len - ARROW_HEAD);

  return (
    <span style={{
      position: 'absolute',
      left: horizontal ? x : x - mid,
      top: horizontal ? y - mid : y,
      width: horizontal ? len * p : ARROW_THICK,
      height: horizontal ? ARROW_THICK : len * p,
      overflow: 'hidden',
    }}>
      <svg
        width={horizontal ? len : ARROW_THICK}
        height={horizontal ? ARROW_THICK : len}
        viewBox={`0 0 ${horizontal ? len : ARROW_THICK} ${horizontal ? ARROW_THICK : len}`}
        style={{ position: 'absolute', left: 0, top: 0, display: 'block' }}
        aria-hidden
      >
        {horizontal ? (
          <>
            <line x1={0} y1={mid} x2={shaftEnd} y2={mid}
                  stroke="var(--fg-muted)" strokeWidth={2} />
            <polygon points={`${len},${mid} ${shaftEnd},${mid - 3.5} ${shaftEnd},${mid + 3.5}`}
                     fill="var(--fg-muted)" />
          </>
        ) : (
          <>
            <line x1={mid} y1={0} x2={mid} y2={shaftEnd}
                  stroke="var(--fg-muted)" strokeWidth={2} />
            <polygon points={`${mid},${len} ${mid - 3.5},${shaftEnd} ${mid + 3.5},${shaftEnd}`}
                     fill="var(--fg-muted)" />
          </>
        )}
      </svg>
    </span>
  );
};

/* ══ ① 흐름 그리기 ══════════════════════════════════════════════════════════ */

const F1_W: Rect = { x: 70, y: 62, w: 820, h: 430 };
const F1_ADD = inWindow(F1_W, { x: 660, y: 12, w: 148, h: 26 }, CH);

const F1 = { W_IN: 0.25, N1: 1.0, N2: 2.0, N3: 3.2, ADD: 4.6, N4: 5.3, SAVE: 6.6, END: 8.2 };

export const SceneDraw: React.FC = () => {
  const t = useSceneTime();
  const dirty = t > F1.N4 && t < F1.SAVE;

  return (
    <>
      <Band t={t}>① 여러 단계를 거치는 일을 <Hi>노드와 화살표</Hi>로 그려 둔다</Band>

      <AppWindow kind="browser" url="spacekijun / 업무 관리"
                 style={{ ...boxOf(F1_W), ...popIn(t, F1.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <TabBar active={TAB.workflow} />

          <span style={{
            ...boxOf({ x: 520, y: 12, w: 126, h: 24 }),
            display: 'flex', alignItems: 'center', padding: '0 9px',
            borderRadius: 7, fontSize: 9.5, color: 'var(--fg-muted)',
            border: '1px solid var(--hair)',
          }}>교육과정부 ▾</span>
          <Btn rect={{ x: 660, y: 12, w: 148, h: 26 }}
               label={dirty ? '● 저장하지 않음' : '＋ 단계 추가'}
               tone={dirty ? 'primary' : 'ghost'} flash={clickFlash(t, F1.ADD)} />

          <div style={{
            position: 'absolute', left: 12, top: 46, right: 12, bottom: 40,
            borderRadius: 10, border: '1px solid var(--hair-2)',
            background: 'color-mix(in srgb, var(--fg) 2%, transparent)',
          }} />

          <Arrow x={174} y={125} len={118} t={t} at={F1.N2 - 0.4} />
          <Arrow x={442} y={125} len={118} t={t} at={F1.N3 - 0.4} />
          <Node x={24} y={94} label="계획 수립" t={t} at={F1.N1} />
          <Node x={292} y={94} label="문서 작성" t={t} at={F1.N2} />
          <Node x={560} y={94} label="부장 검토" t={t} at={F1.N3} />

          {t > F1.N4 && (
            <>
              <Arrow x={635} y={156} len={40} dir="down" t={t} at={F1.N4 - 0.2} />
              <Node x={560} y={196} label="결재 상신" t={t} at={F1.N4} on />
            </>
          )}

          <span style={{
            position: 'absolute', left: 12, bottom: 10, right: 12, fontSize: 9.5,
            lineHeight: 1.6, color: 'var(--fg-faint)',
          }}>
            흐름은 <b style={{ color: 'var(--fg-muted)' }}>부서 단위</b>로 관리됩니다.
            캔버스 변경은 <b style={{ color: 'var(--fg-muted)' }}>자동 저장되지 않아</b>,
            저장 전에 다른 페이지로 가면 확인을 묻습니다
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 3.8, x: pctX(500), y: pctY(60) },
        { t: F1.ADD, ...centerOf(F1_ADD), click: true },
        { t: F1.END, ...centerOf(F1_ADD), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 실행 붙이기 ══════════════════════════════════════════════════════════ */

const F2_W: Rect = { x: 70, y: 62, w: 820, h: 430 };
const F2_NODE = inWindow(F2_W, { x: 292, y: 94, w: 150, h: 62 }, CH);

/**
 * 실행 고르기 패널과 그 안의 후보 행 — **목업과 포인터가 같은 상수를 본다**.
 *
 * 종전엔 포인터 좌표를 손으로 적어 `y: 168` 이었는데, 그건 패널 top(46) + 첫 행(122) 이라
 * 실제로는 바로 위의 **"없음"** 행을 가리켰다. 정작 클릭 연출이 붙는 "문서 생성" 행은
 * 패널-로컬 y=158 → 화면 y=204 다. 한 칸(36px) 어긋난 채로 포인터가 엉뚱한 줄을 눌렀다.
 * stageCoords 의 규약("자리를 Rect 로 한 번만 적고 boxOf·centerOf 가 함께 참조")을
 * 이 씬만 지키지 않아 생긴 드리프트라, 행 좌표를 상수로 올려 구성으로 보장한다.
 */
const F2_PANEL = { x: 584, y: 46, w: 224, h: 336 };
/** 패널 안 후보 행(패널-로컬 좌표) — 목업이 그대로 `boxOf` 에 넣는다 */
const F2_ROW = {
  none:   { x: 12, y: 122, w: 200, h: 30 },
  docgen: { x: 12, y: 158, w: 200, h: 30 },
  web:    { x: 12, y: 194, w: 200, h: 30 },
} as const;
/** 패널-로컬 → 창 본문 좌표. 패널을 옮기면 포인터가 따라온다 */
const panelRow = (r: Rect): Rect =>
  ({ x: F2_PANEL.x + r.x, y: F2_PANEL.y + r.y, w: r.w, h: r.h });

const F2_PICK = inWindow(F2_W, panelRow(F2_ROW.docgen), CH);

const F2 = { W_IN: 0.25, CLICK: 1.6, PANEL: 2.2, PICK: 3.8, LINKED: 4.6, END: 6.8 };

export const SceneWork: React.FC = () => {
  const t = useSceneTime();
  const panel = t > F2.PANEL;
  const linked = t > F2.LINKED;

  return (
    <>
      <Band t={t}>② 노드에 <Hi>작업</Hi>을 붙이면 그 도구를 흐름 안에서 바로 쓴다</Band>

      <AppWindow kind="browser" url="spacekijun / 업무 관리"
                 style={{ ...boxOf(F2_W), ...popIn(t, F2.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <TabBar active={TAB.workflow} />

          <div style={{
            position: 'absolute', left: 12, top: 46, right: panel ? 236 : 12, bottom: 40,
            borderRadius: 10, border: '1px solid var(--hair-2)',
            background: 'color-mix(in srgb, var(--fg) 2%, transparent)',
          }} />
          <Arrow x={174} y={125} len={118} t={t} at={0.5} />
          <Node x={24} y={94} label="계획 수립" t={t} at={0.4} />
          <Node x={292} y={94} label="문서 작성" work={linked ? '문서 생성' : undefined}
                on={t > F2.CLICK} glow={clickFlash(t, F2.CLICK)} t={t} at={0.5} />

          {panel && (
            <div style={{
              ...boxOf(F2_PANEL),
              borderRadius: 10, border: '1px solid var(--hair)', background: 'var(--bg)',
              padding: 11, display: 'flex', flexDirection: 'column', gap: 7,
              ...popIn(t, F2.PANEL, 0.45),
            }}>
              <span style={{ fontSize: 11, fontWeight: 700 }}>문서 작성</span>
              <Stub w={190} h={4} o={0.6} />
              <span style={{ marginTop: 6, fontSize: 9.5, fontWeight: 700, color: 'var(--fg-faint)' }}>
                연결할 작업
              </span>
              <span style={{
                ...boxOf(F2_ROW.none),
                display: 'flex', alignItems: 'center', padding: '0 9px',
                borderRadius: 7, fontSize: 10, color: 'var(--fg-faint)',
                border: '1px solid var(--hair)',
              }}>없음</span>
              <span style={{
                ...boxOf(F2_ROW.docgen),
                display: 'flex', alignItems: 'center', gap: 6, padding: '0 9px',
                borderRadius: 7, fontSize: 10, fontWeight: 650,
                border: `1.5px solid ${linked ? 'var(--primary)' : 'var(--hair)'}`,
                background: linked ? 'color-mix(in srgb, var(--primary) 7%, var(--bg))' : 'var(--bg)',
                color: linked ? 'var(--primary)' : 'var(--fg-muted)',
                boxShadow: clickFlash(t, F2.PICK) > 0 ? `0 0 0 5px rgba(79,70,229,0.24)` : undefined,
              }}>
                {linked && '✓ '}문서 생성 (HWPX 양식)
              </span>
              <span style={{
                ...boxOf(F2_ROW.web),
                display: 'flex', alignItems: 'center', padding: '0 9px',
                borderRadius: 7, fontSize: 10, color: 'var(--fg-muted)',
                border: '1px solid var(--hair)',
              }}>웹 페이지 열기</span>

              <span style={{ marginTop: 'auto', fontSize: 9, lineHeight: 1.6, color: 'var(--fg-faint)' }}>
                쓸 수 있는 도구는 미리 정해져 있습니다 — 아무 기능이나 붙일 수는 없어요
              </span>
            </div>
          )}
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(200), y: pctY(30) },
        { t: F2.CLICK, ...centerOf(F2_NODE), click: true },
        { t: F2.PICK, ...centerOf(F2_PICK), click: true },
        { t: F2.END, ...centerOf(F2_PICK), hide: true },
      ]} />
    </>
  );
};

/* ══ ③ 실행과 이력 ══════════════════════════════════════════════════════════ */

const F3_W1: Rect = { x: 40, y: 74, w: 380, h: 250 };
const F3_RUN = inWindow(F3_W1, { x: 244, y: 158, w: 110, h: 28 }, CH);
const F3_W2: Rect = { x: 350, y: 180, w: 540, h: 320 };

const F3 = { W1_IN: 0.25, RUN: 1.8, W2_IN: 2.5, DONE: 4.8, HIST: 5.8, END: 8.0 };

export const SceneRun: React.FC = () => {
  const t = useSceneTime();
  const finished = t > F3.DONE;

  return (
    <>
      <Band t={t}>③ 실행하면 결과가 <Hi>이력</Hi>으로 남는다 — 누가 언제 무엇을 만들었는지</Band>

      <AppWindow kind="app" title="문서 작성" badge="①"
                 style={{ ...boxOf(F3_W1), ...popIn(t, F3.W1_IN) }}>
        <div style={{ position: 'absolute', inset: 0, padding: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>평가계획서 생성 방식</span>
          <span style={{ display: 'block', marginTop: 6, fontSize: 9.5, color: 'var(--fg-faint)' }}>
            document.spec_fill
          </span>
          <span style={{ display: 'block', marginTop: 10 }}>
            <Stub w={300} h={4} o={0.6} />
          </span>
          <span style={{ display: 'block', marginTop: 6 }}>
            <Stub w={250} h={4} o={0.6} />
          </span>
          <Btn rect={{ x: 244, y: 158, w: 110, h: 28 }} label="▶ 실행"
               flash={clickFlash(t, F3.RUN)} />
        </div>
      </AppWindow>

      <AppWindow kind="app" title="실행·검수 이력" badge="②"
                 style={{ ...boxOf(F3_W2), ...popIn(t, F3.W2_IN), zIndex: 3 }}>
        <div style={{ position: 'absolute', inset: 0, padding: 14 }}>
          {/* 방금 만든 RUN */}
          <span style={{
            ...boxOf({ x: 16, y: 14, w: 508, h: 60 }),
            borderRadius: 10, padding: 11, display: 'flex', alignItems: 'center', gap: 10,
            border: `1px solid ${finished ? '#fcd34d' : 'var(--hair)'}`,
            background: finished ? '#fffbeb' : 'var(--bg)',
          }}>
            <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700 }}>평가계획서_1학년 통합과학.hwpx</span>
              <span style={{ fontSize: 9, color: 'var(--fg-faint)' }}>김하늘 · 방금</span>
            </span>
            <Pill label={finished ? '검수 대기' : '진행 중'}
              {...(finished
                ? { fg: '#92400e', bg: '#fef3c7', bd: '#fcd34d' }
                : { fg: '#1d4ed8', bg: '#dbeafe', bd: '#93c5fd' })} />
          </span>

          {t > F3.HIST && (
            <span style={{ ...popIn(t, F3.HIST, 0.5) }}>
              {[
                { f: '평가계획서_2학년 화학.hwpx', who: '박도윤 · 09/02', s: '완료' },
                { f: '평가계획서_3학년 생명.hwpx', who: '이서준 · 08/28', s: '완료' },
              ].map((r, i) => (
                <span key={r.f} style={{
                  ...boxOf({ x: 16, y: 86 + i * 56, w: 508, h: 48 }),
                  borderRadius: 10, border: '1px solid var(--hair)', padding: 10,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 10.5 }}>{r.f}</span>
                    <span style={{ fontSize: 8.5, color: 'var(--fg-faint)' }}>{r.who}</span>
                  </span>
                  <Pill label={r.s} fg="#065f46" bg="#d1fae5" bd="#6ee7b7" />
                </span>
              ))}
            </span>
          )}

          <span style={{
            position: 'absolute', left: 16, bottom: 12, right: 16, fontSize: 9.5,
            lineHeight: 1.6, color: 'var(--fg-faint)',
          }}>
            실행은 곧바로 완료가 아니라 <b style={{ color: '#b45309' }}>검수 대기</b>로 기록됩니다 —
            만든 것과 확인한 것을 갈라 두기 위해서예요
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.1, x: pctX(150), y: pctY(40) },
        { t: F3.RUN, ...centerOf(F3_RUN), click: true },
        { t: F3.END, ...centerOf(F3_RUN), hide: true },
      ]} />
    </>
  );
};
