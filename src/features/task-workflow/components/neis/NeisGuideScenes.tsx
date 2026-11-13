/**
 * NEIS 화면 사용 방법 — 시연 씬 (2026-10-05)
 *
 * 다른 기능의 씬(`features/<기능>/components/guide/scenes.tsx`)과 같은 문법이지만 **손으로 그리지
 * 않고 수집본에서 생성**한다. 화면이 수백 개라서다. 그래도 수칙은 같다:
 *   · 목업의 자리와 포인터가 **같은 값**에서 나온다 — 여기서는 수집본의 box 가 그 값이다
 *   · 모든 모션은 t 의 순수 함수, 국면 시각은 이름 있는 상수(S)
 *   · 글자 하한 — 나이스 화면(≈1,600px)을 통째로 넣으면 7px 이 되므로 **카메라가 대상 쪽으로 다가간다**
 *     (먼저 전체로 «어디쯤인지», 그다음 확대로 «무엇인지»)
 *
 * 무엇을 보여 줄지(단계·대상)는 `src/lib/neisWalkthrough.ts` 가 정한다. 여기는 그리기만.
 */
import React, { useMemo } from 'react';
import {
  AppWindow, Caret, Pointer, clickFlash, easeInOut, interpolate, popIn, typed, typedDoneAt, useSceneTime,
  type CursorKey,
} from '@/lib/walkthrough';
import { boxOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect } from '@/components/walkthrough/stageCoords';
import { Band, Hi } from '@/components/walkthrough/atoms';
import { neisVerticalMap, neisViewBounds, type NeisBox, type NeisCapture, type NeisCaptureView } from '@/lib/neisScreenModel';
import { neisCamera, neisTargetBox, neisUnionBox, type NeisCameraShot, type NeisPlanStep } from '@/lib/neisWalkthrough';
import { NeisViewLayer, type NeisMark } from './NeisViewLayer';

/** 나이스 창 — 무대(960×540) 거의 전부 */
const WIN: Rect = { x: 20, y: 46, w: 920, h: 480 };
const VIEWPORT = { w: WIN.w, h: WIN.h - CH };
const NEIS_URL_TEXT = 'jbe.neis.go.kr';

/** 접은 좌표계에서의 화면 — 카메라·포인터·그림이 함께 쓴다 */
function useLayout(view: NeisCaptureView) {
  return useMemo(() => {
    const [bx, by, bw, bh] = neisViewBounds(view);
    const { map } = neisVerticalMap(view);
    const content = { w: bw, h: map(by + bh) - map(by) };
    /** 화면 루트 좌표 → 접은 내용 좌표 */
    const toContent = ([x, y, w, h]: NeisBox): NeisBox => [x - bx, map(y) - map(by), w, map(y + h) - map(y)];
    return { origin: [bx, by] as [number, number], map, content, toContent };
  }, [view]);
}

/** 카메라 두 장면 사이를 t 로 잇는다 */
function lerpShot(a: NeisCameraShot, b: NeisCameraShot, k: number): NeisCameraShot {
  return { scale: a.scale + (b.scale - a.scale) * k, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** 내용 좌표의 점 → 무대 % (포인터 웨이포인트) — 카메라가 멈춘 뒤의 자리 */
function stagePoint(box: NeisBox, shot: NeisCameraShot): { x: number; y: number } {
  const [x, y, w, h] = box;
  return {
    x: pctX(WIN.x + shot.x + (x + w / 2) * shot.scale),
    y: pctY(WIN.y + CH + shot.y + (y + h / 2) * shot.scale),
  };
}

function NeisWindow({
  capture, view, shot, marks, badge,
}: {
  capture: NeisCapture;
  view: NeisCaptureView;
  shot: NeisCameraShot;
  marks: Map<string, NeisMark>;
  badge?: string;
}) {
  const layout = useLayout(view);
  return (
    <AppWindow
      kind="browser"
      url={`${NEIS_URL_TEXT} · ${capture.name}${view.tab ? ` › ${view.tab}` : ''}`}
      badge={badge}
      style={{ ...boxOf(WIN), overflow: 'hidden' }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: VIEWPORT.w, height: VIEWPORT.h, overflow: 'hidden', background: '#fff' }}>
        <div
          style={{
            position: 'absolute', left: 0, top: 0, width: layout.content.w, height: layout.content.h,
            transform: `translate(${shot.x}px, ${shot.y}px) scale(${shot.scale})`, transformOrigin: '0 0',
          }}
        >
          <NeisViewLayer view={view} origin={layout.origin} map={layout.map} marks={marks} />
        </div>
      </div>
    </AppWindow>
  );
}

/* ══ 절차·구성·주의 — 화면 위에서 대상을 차례로 ══════════════════════════════
   흐름(flow) = 포인터가 대상마다 누른다. 구성(overview)·주의(caution) = 누르지 않고 비춘다
   (사용자가 «할 일»이 아니라 «보게 될 것»을 설명하는 단계 — 스킬 수칙). */

const S = { ZOOM_FROM: 0.7, ZOOM_TO: 1.7, FIRST: 2.4, GAP: 1.15, TAIL: 1.2 };

export const NeisStepScene: React.FC<{ capture: NeisCapture; step: NeisPlanStep; band: React.ReactNode }> = ({
  capture, step, band,
}) => {
  const t = useSceneTime();
  const view = capture.views.find((v) => v.id === step.viewId) ?? capture.views[0];
  const layout = useLayout(view);
  const boxes = useMemo(
    () => step.targets
      .map((target) => ({ target, box: neisTargetBox(view, target) }))
      .filter((item): item is { target: string; box: NeisBox } => Boolean(item.box))
      .map((item) => ({ target: item.target, box: layout.toContent(item.box) })),
    [step.targets, view, layout],
  );

  const wide = neisCamera(VIEWPORT, layout.content);
  const clicking = step.kind === 'flow';
  // 흐름 = 대상마다 카메라가 따라간다(흩어진 대상을 한 화면에 넣으면 확대가 안 된다).
  // 구성·주의 = 대상 전체를 한 장면에. 너무 다가가면 «어디쯤인지»를 잃어 배율 상한·여백을 둔다.
  const lens = { maxScale: 0.85, pad: 140 };
  const shots = clicking
    ? boxes.map(({ box }) => neisCamera(VIEWPORT, layout.content, box, lens))
    : [neisCamera(VIEWPORT, layout.content, neisUnionBox(boxes.map((b) => b.box)), lens)];
  const clickAt = (i: number) => S.FIRST + i * S.GAP;
  let shot = lerpShot(wide, shots[0] ?? wide, interpolate(t, [S.ZOOM_FROM, S.ZOOM_TO], [0, 1], easeInOut));
  for (let i = 1; clicking && i < shots.length; i++) {
    // 앞 대상을 누른 뒤 다음 대상 직전까지 미끄러진다 — 포인터가 도착할 때는 이미 멈춰 있다
    if (t > clickAt(i - 1) + 0.35) {
      shot = lerpShot(shots[i - 1], shots[i], interpolate(t, [clickAt(i - 1) + 0.35, clickAt(i) - 0.15], [0, 1], easeInOut));
    }
  }

  const marks = new Map<string, NeisMark>();
  boxes.forEach(({ target }, i) => {
    const at = clickAt(i);
    if (t < at) return;
    if (step.kind === 'caution') marks.set(target, 'write');
    else marks.set(target, t < at + S.GAP || i === boxes.length - 1 ? 'focus' : 'lit');
  });

  const path: CursorKey[] = [];
  if (clicking && boxes.length > 0) {
    path.push({ t: S.FIRST - 0.7, x: pctX(WIN.x + WIN.w * 0.72), y: pctY(WIN.y + WIN.h * 0.9) });
    boxes.forEach(({ box }, i) => path.push({ t: clickAt(i), ...stagePoint(box, shots[i]), click: true }));
    const last = path[path.length - 1];
    path.push({ ...last, t: clickAt(boxes.length) + S.TAIL, click: false, hide: true });
  }

  return (
    <>
      <Band t={t}>{band}</Band>
      <NeisWindow capture={capture} view={view} shot={shot} marks={marks} />
      {path.length > 0 && <Pointer path={path} />}
    </>
  );
};

/* ══ 화면 찾기 — 왼쪽 메뉴검색에 이름을 넣고 경로를 누른다 ═══════════════════
   나이스 도우미(NEIS_helper)가 화면을 여는 방식 그대로다. 상단 탭을 펼쳐 찾으면
   같은 이름이 여러 탭에 있을 때 엉뚱한 화면이 열린다 — 검색 결과의 «경로»로 가려낸다. */

const SIDE: Rect = { x: 0, y: 0, w: 236, h: VIEWPORT.h };
const SEARCH = { x: 14, y: 44, w: 208, h: 30 };
const RESULT = { x: 14, y: 90, w: 208, h: 62 };
const RESULT_ABS = inWindow(WIN, RESULT, CH);
const F = { TYPE: 0.9, CLICK: 0, OPEN: 0, DONE: 0 };

export const NeisFindScene: React.FC<{ capture: NeisCapture; viewId: string }> = ({ capture, viewId }) => {
  const t = useSceneTime();
  const view = capture.views.find((v) => v.id === viewId) ?? capture.views[0];
  const layout = useLayout(view);
  const name = capture.name;
  const typedName = typed(t, name, F.TYPE, 9);
  const typeDone = typedDoneAt(name, F.TYPE, 9);
  const phase = { ...F, CLICK: typeDone + 1.0, OPEN: typeDone + 1.5, DONE: typeDone + 3.2 };
  const via = (capture.reachedVia ?? name).split('>').map((part) => part.trim());
  const tab = via[0];
  const opened = t > phase.OPEN;

  const pane = { w: VIEWPORT.w - SIDE.w - 16, h: VIEWPORT.h - 56 };
  const shot = neisCamera(pane, layout.content);

  return (
    <>
      <Band t={t}>메뉴검색에 <Hi>화면 이름</Hi>을 넣고, 경로가 맞는 결과를 누른다</Band>
      <AppWindow kind="browser" url={NEIS_URL_TEXT} style={{ ...boxOf(WIN), overflow: 'hidden' }}>
        {/* 상단 파란 띠 + 탭 줄 — 랜드마크만 */}
        <div style={{ position: 'absolute', left: SIDE.w, top: 0, right: 0, height: 22, background: '#2563eb' }} />
        <div style={{ position: 'absolute', left: SIDE.w + 16, top: 26, display: 'flex', gap: 18, fontSize: 12, color: 'var(--fg-muted)' }}>
          {tab && <span style={{ fontWeight: 700, color: opened ? '#1d4ed8' : 'var(--fg-muted)' }}>{tab}</span>}
          {(capture.alsoVia ?? []).slice(0, 3).map((other) => <span key={other}>{other}</span>)}
        </div>
        {/* 왼쪽 메뉴검색 */}
        <div style={{ ...boxOf(SIDE), background: '#f8fafc', borderRight: '1px solid var(--hair)' }}>
          <span style={{ position: 'absolute', left: 14, top: 14, fontSize: 13, fontWeight: 700 }}>메뉴검색</span>
          <div style={{
            ...boxOf(SEARCH), border: '1px solid var(--hair)', borderRadius: 15, background: '#fff',
            display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 12,
          }}>
            {typedName}{t > F.TYPE && t < typeDone + 0.5 && <Caret />}
          </div>
          {t > typeDone + 0.2 && (
            <div style={{
              ...boxOf(RESULT), ...popIn(t, typeDone + 0.2, 0.4), borderRadius: 8, padding: '6px 8px',
              background: clickFlash(t, phase.CLICK) > 0 || opened ? '#eff6ff' : 'transparent',
            }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1d4ed8' }}>{name}</div>
              <div style={{ fontSize: 10.5, lineHeight: 1.35, color: 'var(--fg-muted)', marginTop: 3 }}>{via.join(' > ')}</div>
            </div>
          )}
        </div>
        {/* 오른쪽 — 누르면 화면이 열린다 */}
        <div style={{ position: 'absolute', left: SIDE.w + 16, top: 52, width: pane.w, height: pane.h, overflow: 'hidden' }}>
          {opened ? (
            <div style={{ ...popIn(t, phase.OPEN, 0.5) }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                <span style={{ color: '#2563eb', marginRight: 6 }}>▌</span>{name}
              </div>
              <div style={{
                position: 'relative', width: layout.content.w, height: layout.content.h,
                transform: `translate(${shot.x}px, 0) scale(${shot.scale})`, transformOrigin: '0 0',
              }}>
                <NeisViewLayer view={view} origin={layout.origin} map={layout.map} />
              </div>
            </div>
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--fg-faint)' }}>
              메뉴검색 결과를 누르면 화면이 열립니다
            </div>
          )}
        </div>
      </AppWindow>
      <Pointer path={[
        { t: 0.4, x: pctX(WIN.x + 120), y: pctY(WIN.y + CH + 59) },
        { t: 0.8, x: pctX(WIN.x + 120), y: pctY(WIN.y + CH + 59), click: true },
        { t: phase.CLICK - 0.4, x: pctX(WIN.x + 250), y: pctY(WIN.y + CH + 100) },
        { t: phase.CLICK, x: pctX(RESULT_ABS.x + 60), y: pctY(RESULT_ABS.y + 14), click: true },
        { t: phase.DONE, x: pctX(RESULT_ABS.x + 60), y: pctY(RESULT_ABS.y + 14), hide: true },
      ]} />
    </>
  );
};
