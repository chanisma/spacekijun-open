/**
 * 탐구 설계 안내 — 절차 시연 씬 4편.
 *
 * 목업 근거(라벨은 실제 화면 문구): `InquiryDesignPage`(탐구 설계 / AI 종합 분석 / 분석 이력
 * 토글) · `InquirySidePanel`("내 활동 지도 v_", "탐구 방향",
 * [대화로 설계하기] · [바로 설계하기], "나의 탐구 이유", [설계 저장]) ·
 * `HistoryPanel`(상태 배지 6종 · 설계→저장→실행 3단계 · [성찰 저장]).
 * **화면 문구가 바뀌면 이 목업도 함께 고쳐야 한다.**
 *
 * **학생 화면을 그린다**(2026-09-04 사용자 결정). 이 기능은 학생이 주 설계자이고 교사는
 * 보조·제안이라, 안내도 학생이 보는 것만 보여 준다 — 그래서 ①단계에 **학생 선택이 없다**
 * (`canPickStudent = !isStudentView && (teacher|admin)` 이라 학생에게는 그 패널이 아예 없다).
 * 문구도 학생 모드 쪽을 쓴다(`바로 설계하기`·`나의 탐구 이유`·`설계 저장`).
 */
import React from 'react';
import {
  AppWindow, Caret, Pointer, clickFlash, dimAfter, easeInOut, interpolate,
  popIn, typed, typedDoneAt, useSceneTime,
} from '@/lib/walkthrough';
import {
  boxOf, centerOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect,
} from '@/components/walkthrough/stageCoords';
import { Band, Btn, Field, Hi, Pill, Stub } from '@/components/walkthrough/atoms';

/** 그래프 캔버스는 별밤 배경이다 — 이 화면을 알아보는 가장 큰 랜드마크 */
const SPACE = '#0f172a';
/** 근거로 고른 노드 색(선택 글로우) */
const PICK = '#f59e0b';

/** 지식 그래프 노드 하나 */
const Node: React.FC<{
  x: number; y: number; r: number; label?: string; on?: boolean; t: number; at: number;
}> = ({ x, y, r, label, on = false, t, at }) => (
  <>
    <span style={{
      position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2,
      borderRadius: '50%',
      background: on ? PICK : '#38bdf8',
      opacity: interpolate(t, [at, at + 0.4], [0, on ? 1 : 0.75]),
      boxShadow: on ? `0 0 0 5px rgba(245,158,11,0.28)` : 'none',
      transition: 'none',
    }} />
    {label && (
      <span style={{
        position: 'absolute', left: x + r + 5, top: y - 7,
        fontSize: 10, fontWeight: on ? 700 : 500,
        color: on ? PICK : '#cbd5e1', whiteSpace: 'nowrap',
        opacity: interpolate(t, [at + 0.1, at + 0.5], [0, 1]),
      }}>{label}</span>
    )}
  </>
);

/** 노드를 잇는 선 */
const Edge: React.FC<{ a: [number, number]; b: [number, number]; t: number; at: number }> = ({ a, b, t, at }) => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return (
    <span style={{
      position: 'absolute', left: a[0], top: a[1],
      width: len * interpolate(t, [at, at + 0.6], [0, 1], easeInOut), height: 1.5,
      background: 'rgba(148,163,184,0.45)',
      transformOrigin: '0 50%', transform: `rotate(${ang}deg)`,
    }} />
  );
};

/* ══ ① 내 활동 지도에서 근거 고르기 ═════════════════════════════════════════
   구도: 창 하나 크게 + 포인터 동선(단일 화면 반복 조작).

   **학생 화면을 그린다.** 학생 목록(왼쪽 패널)은 `canPickStudent`
   (`!isStudentView && (teacher|admin)`)라 학생에게는 애초에 없고, 로그인하면 자기
   지도가 바로 열린다. 그 자리를 지도에 돌려주면 노드 라벨이 잘리지도 않는다. */

const S1_W: Rect = { x: 90, y: 66, w: 780, h: 420 };
/** 노드 좌표는 창 기준 px — 목업과 포인터가 같은 상수를 본다 */
const S1_N1 = inWindow(S1_W, { x: 130, y: 96, w: 2, h: 2 }, CH);
const S1_N2 = inWindow(S1_W, { x: 268, y: 176, w: 2, h: 2 }, CH);

const S1 = { W_IN: 0.25, N1: 1.8, N2: 3.4, LIST: 4.2, DONE: 5.8 };

export const SceneMap: React.FC = () => {
  const t = useSceneTime();
  const p1 = t > S1.N1;
  const p2 = t > S1.N2;

  return (
    <>
      <Band t={t}>① <Hi>내 활동 지도</Hi>에서 이어 갈 기록을 골라 탐구의 출발점으로 삼는다</Band>

      <AppWindow
        kind="browser" url="spacekijun / 탐구 설계"
        style={{ ...boxOf(S1_W), ...popIn(t, S1.W_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* 왼쪽 — 별밤 캔버스 위의 내 지식 그래프 */}
          <div style={{
            position: 'absolute', left: 0, top: 0, width: 488, bottom: 0,
            background: SPACE, overflow: 'hidden',
          }}>
            <Edge a={[130, 96]} b={[268, 176]} t={t} at={0.5} />
            <Edge a={[268, 176]} b={[148, 268]} t={t} at={0.6} />
            <Edge a={[268, 176]} b={[366, 274]} t={t} at={0.7} />
            <Edge a={[130, 96]} b={[60, 214]} t={t} at={0.8} />
            <Node x={130} y={96} r={14} label="데이터 시각화" on={p1} t={t} at={0.4} />
            <Node x={268} y={176} r={13} label="공공데이터 분석" on={p2} t={t} at={0.5} />
            <Node x={148} y={268} r={11} label="통계 포스터" t={t} at={0.65} />
            <Node x={366} y={274} r={10} label="파이썬" t={t} at={0.75} />
            <Node x={60} y={214} r={9} t={t} at={0.85} />
          </div>

          {/* 오른쪽 — 설계 패널(고른 것이 여기 쌓인다) */}
          <div style={{
            position: 'absolute', left: 488, top: 0, right: 0, bottom: 0,
            borderLeft: '1px solid var(--hair-2)', padding: 12,
          }}>
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>내 활동 지도 v3</span>
            <span style={{ display: 'block', marginTop: 6, fontSize: 10, lineHeight: 1.6, color: 'var(--fg-muted)' }}>
              지도에서 내 기록 조각을 클릭하면<br />새 탐구의 출발점(근거)으로 추가돼요
            </span>
            <span style={{ display: 'block', marginTop: 12, fontSize: 9.5, fontWeight: 700, color: 'var(--fg-faint)' }}>
              선택한 활동 {(p1 ? 1 : 0) + (p2 ? 1 : 0)}개
            </span>
            {p1 && (
              <span style={{
                ...boxOf({ x: 12, y: 96, w: 264, h: 30 }),
                display: 'flex', alignItems: 'center', gap: 6, padding: '0 9px',
                borderRadius: 8, border: `1.5px solid ${PICK}`,
                background: 'rgba(245,158,11,0.08)', fontSize: 11, fontWeight: 600,
                ...popIn(t, S1.N1, 0.4),
              }}>데이터 시각화 <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--fg-faint)' }}>세특</span></span>
            )}
            {p2 && (
              <span style={{
                ...boxOf({ x: 12, y: 132, w: 264, h: 30 }),
                display: 'flex', alignItems: 'center', gap: 6, padding: '0 9px',
                borderRadius: 8, border: `1.5px solid ${PICK}`,
                background: 'rgba(245,158,11,0.08)', fontSize: 11, fontWeight: 600,
                ...popIn(t, S1.N2, 0.4),
              }}>공공데이터 분석 <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--fg-faint)' }}>동아리</span></span>
            )}
            {t > S1.LIST && (
              <span style={{
                position: 'absolute', left: 12, bottom: 12, right: 12,
                fontSize: 9.5, lineHeight: 1.6, color: 'var(--fg-faint)',
              }}>
                선택 항목 없이도 분석할 수 있습니다
              </span>
            )}
          </div>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(400), y: pctY(45) },
        { t: S1.N1, ...centerOf(S1_N1), click: true },
        { t: S1.N2, ...centerOf(S1_N2), click: true },
        { t: S1.DONE, ...centerOf(S1_N2), hide: true },
      ]} />
    </>
  );
};

/* ══ ② AI와 함께 설계하기 ═══════════════════════════════════════════════════
   구도: 지도(작게, 뒤로 물림) + 설계 패널(크게). 이 단계의 일은 전부 패널 안에서
   일어나지만, 지도의 선택이 그대로 재료가 된다는 관계를 잃으면 안 된다. */

const S2_W1: Rect = { x: 36, y: 108, w: 330, h: 250 };
const S2_W2: Rect = { x: 398, y: 62, w: 500, h: 430 };
const S2_TARGET = inWindow(S2_W2, { x: 16, y: 30, w: 468, h: 28 }, CH);
const S2_CTX = inWindow(S2_W2, { x: 16, y: 140, w: 468, h: 48 }, CH);
const S2_TALK = inWindow(S2_W2, { x: 16, y: 202, w: 228, h: 32 }, CH);

const S2 = {
  W1_IN: 0.25, W2_IN: 0.7, TARGET: 1.8, CTX_CLICK: 3.0, TYPE: 3.3,
  TALK: 6.4, RESULT: 7.3, DONE: 9.0,
};
const S2_CTX_TEXT = '실험 위주로, 데이터 시각화 단계 명확히';

export const SceneDesign: React.FC = () => {
  const t = useSceneTime();
  const ctx = typed(t, S2_CTX_TEXT, S2.TYPE, 12);
  const typing = t > S2.TYPE && t < typedDoneAt(S2_CTX_TEXT, S2.TYPE, 12) + 0.6;
  const hasTarget = t > S2.TARGET;
  const result = t > S2.RESULT;

  return (
    <>
      <Band t={t}>② 대상 과목과 방향을 정하고 <Hi>AI와 대화하며</Hi> 탐구를 설계한다</Band>

      <AppWindow
        kind="app" title="내 활동 지도" badge="①"
        style={{ ...boxOf(S2_W1), ...popIn(t, S2.W1_IN), ...dimAfter(t, S2.W2_IN) }}
        bodyStyle={{ background: SPACE }}
      >
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <Edge a={[70, 60]} b={[160, 120]} t={t} at={0.4} />
          <Edge a={[160, 120]} b={[90, 178]} t={t} at={0.5} />
          <Node x={70} y={60} r={11} label="데이터 시각화" on t={t} at={0.3} />
          <Node x={160} y={120} r={10} label="공공데이터" on t={t} at={0.4} />
          <Node x={90} y={178} r={8} t={t} at={0.5} />
        </div>
      </AppWindow>

      <AppWindow
        kind="app" title="탐구 설계" badge="②"
        style={{ ...boxOf(S2_W2), ...popIn(t, S2.W2_IN), zIndex: 3 }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <span style={{ position: 'absolute', left: 16, top: 10, fontSize: 9.5, fontWeight: 700, color: 'var(--fg-faint)' }}>
            설계 대상 과목
          </span>
          <Field rect={{ x: 16, y: 30, w: 468, h: 28 }} flash={clickFlash(t, S2.TARGET)}>
            {hasTarget
              ? <span style={{ color: 'var(--fg)' }}>확률과 통계 <span style={{ color: 'var(--fg-faint)', fontSize: 10 }}>2학년 2학기</span></span>
              : <span>지금 또는 앞으로 들을 과목</span>}
          </Field>

          <span style={{ position: 'absolute', left: 16, top: 68, fontSize: 9.5, fontWeight: 700, color: 'var(--fg-faint)' }}>
            선택한 활동 2개
          </span>
          <span style={{ position: 'absolute', left: 16, top: 86, display: 'flex', gap: 6 }}>
            {['데이터 시각화', '공공데이터 분석'].map((n) => (
              <span key={n} style={{
                borderRadius: 999, border: `1.5px solid ${PICK}`, background: 'rgba(245,158,11,0.08)',
                padding: '3px 9px', fontSize: 10, fontWeight: 650,
              }}>{n}</span>
            ))}
          </span>

          <span style={{ position: 'absolute', left: 16, top: 120, fontSize: 11, fontWeight: 700 }}>
            탐구 방향 <span style={{ fontSize: 9.5, fontWeight: 400, color: 'var(--fg-faint)' }}>선택</span>
          </span>
          <span style={{
            ...boxOf({ x: 16, y: 140, w: 468, h: 48 }),
            borderRadius: 8, padding: '7px 9px', fontSize: 11, lineHeight: 1.5,
            border: `1px solid ${clickFlash(t, S2.CTX_CLICK) > 0 ? 'var(--primary)' : 'var(--hair)'}`,
            background: 'var(--bg)', color: 'var(--fg)',
          }}>
            {t > S2.TYPE
              ? <>{ctx}{typing && <Caret />}</>
              : <span style={{ color: 'var(--fg-faint)' }}>예: 실험 위주의 활동으로 구성, 데이터 수집·시각화 단계 명확히…</span>}
          </span>

          {/* 학생 기본은 대화형이다 — 자기 말로 방향을 잡는 것이 이 기능의 핵심 */}
          <Btn rect={{ x: 16, y: 202, w: 228, h: 32 }} label="대화로 설계하기"
               flash={clickFlash(t, S2.TALK)} />
          <Btn rect={{ x: 256, y: 202, w: 228, h: 32 }} label="바로 설계하기" tone="ghost" />

          {/* 결과 미리보기 — 지도 위에 주황 점선으로도 함께 그려진다 */}
          {result && (
            <div style={{
              ...boxOf({ x: 16, y: 248, w: 468, h: 126 }),
              borderRadius: 9, border: `1.5px dashed ${PICK}`,
              background: 'rgba(245,158,11,0.06)', padding: 11,
              display: 'flex', flexDirection: 'column', gap: 6,
              ...popIn(t, S2.RESULT, 0.5),
            }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#b45309' }}>
                공공데이터로 우리 지역 대기질 변화 분석하기
              </span>
              <Stub w={430} h={4} o={0.7} /><Stub w={400} h={4} o={0.7} />
              <Stub w={430} h={4} o={0.7} /><Stub w={280} h={4} o={0.7} />
              <span style={{ marginTop: 'auto', fontSize: 9.5, color: 'var(--fg-faint)' }}>
                새로 생기는 개념·역량은 지도에 주황 점선으로 미리 보입니다
              </span>
            </div>
          )}
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.1, x: pctX(700), y: pctY(30) },
        { t: S2.TARGET, ...centerOf(S2_TARGET), click: true },
        { t: S2.CTX_CLICK, ...centerOf(S2_CTX), click: true },
        { t: S2.TALK, ...centerOf(S2_TALK), click: true },
        { t: S2.DONE, ...centerOf(S2_TALK), hide: true },
      ]} />
    </>
  );
};

/* ══ ③ 내 이유를 쓰고 저장 ══════════════════════════════════════════════════
   이 단계가 이 기능의 목적이다 — AI 결과가 아니라 **자기 말로 쓴 이유**가 남는다. */

const S3_W: Rect = { x: 230, y: 66, w: 500, h: 420 };
const S3_RATIONALE = inWindow(S3_W, { x: 16, y: 150, w: 468, h: 96 }, CH);
const S3_SAVE = inWindow(S3_W, { x: 16, y: 306, w: 468, h: 34 }, CH);

const S3 = { W_IN: 0.25, CLICK: 1.4, TYPE: 1.8, SAVE: 7.0, DONE: 8.0 };
const S3_TEXT = '동아리에서 공공데이터를 다뤄 보니 시각화가 약했다. 직접 해보고 싶다.';

export const SceneRationale: React.FC = () => {
  const t = useSceneTime();
  const text = typed(t, S3_TEXT, S3.TYPE, 13);
  const typing = t > S3.TYPE && t < typedDoneAt(S3_TEXT, S3.TYPE, 13) + 0.6;
  const written = text.length > 0;
  const saved = t > S3.SAVE;

  return (
    <>
      <Band t={t}>③ <Hi>왜 하고 싶은지</Hi>를 내 말로 적어야 저장된다 — 그 문장이 생기부의 근거가 된다</Band>

      <AppWindow
        kind="app" title="탐구 설계"
        style={{ ...boxOf(S3_W), ...popIn(t, S3.W_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* 위 — AI 결과 요약(접힌 상태) */}
          <span style={{
            ...boxOf({ x: 16, y: 12, w: 468, h: 60 }),
            borderRadius: 9, border: `1px dashed ${PICK}`, background: 'rgba(245,158,11,0.06)',
            padding: 10, display: 'flex', flexDirection: 'column', gap: 5,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309' }}>
              공공데이터로 우리 지역 대기질 변화 분석하기
            </span>
            <Stub w={420} h={4} o={0.7} /><Stub w={330} h={4} o={0.7} />
          </span>

          <span style={{ position: 'absolute', left: 16, top: 86, fontSize: 12, fontWeight: 700 }}>
            나의 탐구 이유
          </span>
          <span style={{ position: 'absolute', left: 16, top: 106, right: 16, fontSize: 9.5, lineHeight: 1.6, color: 'var(--fg-faint)' }}>
            이 탐구가 내 기존 활동과 어떻게 이어지는지, 왜 직접 해보고 싶은지 내 말로
          </span>
          <span style={{
            ...boxOf({ x: 16, y: 150, w: 468, h: 96 }),
            borderRadius: 8, padding: '9px 11px', fontSize: 11.5, lineHeight: 1.65,
            border: `1px solid ${clickFlash(t, S3.CLICK) > 0 ? 'var(--primary)' : 'var(--hair)'}`,
            background: 'var(--bg)', color: 'var(--fg)',
          }}>
            {written ? <>{text}{typing && <Caret />}</> : <span style={{ color: 'var(--fg-faint)' }} />}
          </span>

          {/* 소프트 게이트 — 비어 있으면 저장이 잠긴다(학생 모드) */}
          <span style={{
            ...boxOf({ x: 16, y: 258, w: 468, h: 34 }),
            display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px',
            borderRadius: 8, fontSize: 10, lineHeight: 1.5,
            border: `1px solid ${written ? '#6ee7b7' : '#fcd34d'}`,
            background: written ? '#ecfdf5' : '#fffbeb',
            color: written ? '#065f46' : '#92400e',
          }}>
            {written
              ? '✓ 이제 저장할 수 있어요'
              : '한 줄이라도 적으면 저장할 수 있어요'}
          </span>

          <Btn rect={{ x: 16, y: 306, w: 468, h: 34 }}
               label={saved ? '✓ 저장했습니다' : '설계 저장'}
               tone={saved ? 'ok' : 'primary'} flash={clickFlash(t, S3.SAVE)} />
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(560), y: pctY(30) },
        { t: S3.CLICK, ...centerOf(S3_RATIONALE), click: true },
        { t: S3.SAVE, ...centerOf(S3_SAVE), click: true },
        { t: S3.DONE, ...centerOf(S3_SAVE), hide: true },
      ]} />
    </>
  );
};

/* ══ ④ 실행하고 성찰 ════════════════════════════════════════════════════════
   "끝난 뒤 어떻게 되는가" — 설계로 끝나지 않고 **실제로 한 활동과 이어야** 기록이 된다.
   모르면 손해 보는 것이 여기 모여 있다(임시 저장·선생님 제안·이어서 작업). */

const S4_W: Rect = { x: 190, y: 66, w: 580, h: 420 };
const S4_LINK = inWindow(S4_W, { x: 320, y: 96, w: 130, h: 26 }, CH);
const S4_REFLECT = inWindow(S4_W, { x: 16, y: 300, w: 548, h: 30 }, CH);

const S4 = { W_IN: 0.25, LINK: 2.0, OBSERVED: 3.0, REFLECT: 4.6, TYPE: 5.0, END: 8.0 };
const S4_TEXT = '대기질 API가 결측이 많아 보간 방법을 새로 공부했다.';

export const SceneRun: React.FC = () => {
  const t = useSceneTime();
  const observed = t > S4.OBSERVED;
  const text = typed(t, S4_TEXT, S4.TYPE, 13);
  const typing = t > S4.TYPE && t < typedDoneAt(S4_TEXT, S4.TYPE, 13) + 0.6;

  /** 설계 → 저장 → 실행 3단계 */
  const steps = (done: number) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {['설계', '저장', '실행'].map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && <span style={{ width: 16, height: 1, background: i <= done ? '#6ee7b7' : 'var(--hair)' }} />}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5,
            fontWeight: i === done ? 800 : 500,
            color: i <= done ? '#047857' : 'var(--fg-faint)',
          }}>
            <span style={{
              width: 12, height: 12, borderRadius: '50%', display: 'grid', placeItems: 'center',
              fontSize: 7, color: '#fff', background: i <= done ? '#059669' : 'var(--hair)',
            }}>{i < done ? '✓' : ''}</span>
            {s}
          </span>
        </React.Fragment>
      ))}
    </span>
  );

  return (
    <>
      <Band t={t}>④ 실제로 한 활동과 이어야 <Hi>기록</Hi>이 된다 — 그리고 성찰을 남긴다</Band>

      <AppWindow
        kind="app" title="분석 이력"
        style={{ ...boxOf(S4_W), ...popIn(t, S4.W_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0, padding: 14 }}>
          {/* 진행 중인 설계 카드 */}
          <div style={{
            ...boxOf({ x: 16, y: 12, w: 548, h: 118 }),
            borderRadius: 10, border: '1px solid var(--hair)', padding: 11,
            display: 'flex', flexDirection: 'column', gap: 7,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>공공데이터로 우리 지역 대기질 변화 분석하기</span>
              <span style={{ marginLeft: 'auto' }}>
                {observed
                  ? <Pill label="실행됨" fg="#075985" bg="#e0f2fe" bd="#7dd3fc" />
                  : <Pill label="저장" fg="#065f46" bg="#d1fae5" bd="#6ee7b7" />}
              </span>
            </span>
            {steps(observed ? 2 : 1)}
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>확률과 통계 · 2학년 2학기</span>
              <span style={{
                ...boxOf({ x: 320, y: 96, w: 130, h: 26 }),
                display: 'grid', placeItems: 'center', borderRadius: 7, fontSize: 10, fontWeight: 650,
                border: `1px solid ${observed ? 'var(--hair)' : 'var(--primary)'}`,
                color: observed ? 'var(--fg-faint)' : 'var(--primary)',
                background: 'var(--bg)',
                boxShadow: clickFlash(t, S4.LINK) > 0
                  ? `0 0 0 ${5 * clickFlash(t, S4.LINK)}px rgba(79,70,229,0.24)` : undefined,
              }}>
                {observed ? '연결 해제' : '실행한 활동 연결'}
              </span>
            </span>
          </div>

          {/* 성찰 */}
          {observed && (
            <div style={{ ...popIn(t, S4.OBSERVED, 0.5) }}>
              <span style={{ position: 'absolute', left: 16, top: 148, fontSize: 11, fontWeight: 700 }}>
                성찰 기록
              </span>
              <span style={{
                ...boxOf({ x: 16, y: 168, w: 548, h: 62 }),
                borderRadius: 8, padding: '8px 10px', fontSize: 11, lineHeight: 1.6,
                border: `1px solid ${clickFlash(t, S4.REFLECT) > 0 ? 'var(--primary)' : 'var(--hair)'}`,
                background: 'var(--bg)', color: 'var(--fg)',
              }}>
                {t > S4.TYPE
                  ? <>{text}{typing && <Caret />}</>
                  : <span style={{ color: 'var(--fg-faint)' }}>해보니 어땠는지</span>}
              </span>
              <Btn rect={{ x: 444, y: 240, w: 120, h: 28 }} label="성찰 저장" tone="ghost" />
            </div>
          )}

          {/* 다른 상태들 — 목록에서 무엇을 보게 되는지 */}
          <span style={{ position: 'absolute', left: 16, top: 292, display: 'flex', gap: 5, alignItems: 'center' }}>
            <Pill label="임시" fg="#92400e" bg="#fffbeb" bd="#fcd34d" />
            <Pill label="선생님 제안" fg="#5b21b6" bg="#f5f3ff" bd="#c4b5fd" />
            <Pill label="보관" fg="#475569" bg="#f1f5f9" bd="#cbd5e1" />
            <span style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>
              분석할 때마다 &lsquo;임시&rsquo;가 자동으로 남아, 나중에 이어서 작업할 수 있어요
            </span>
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.0, x: pctX(560), y: pctY(30) },
        { t: S4.LINK, ...centerOf(S4_LINK), click: true },
        { t: S4.REFLECT, ...centerOf(S4_REFLECT), click: true },
        { t: S4.END, ...centerOf(S4_REFLECT), hide: true },
      ]} />
    </>
  );
};
