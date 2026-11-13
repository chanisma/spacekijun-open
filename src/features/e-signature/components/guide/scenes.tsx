/**
 * 전자서명 안내 — 절차 시연 씬 4편.
 *
 * presentation 프로젝트의 `software-walkthrough-builder` 문법을 따른다:
 * 창 목업 + 움직이는 포인터 + 타이핑을 `useSceneTime()` t 의 순수 함수로 조립하고,
 * 목업은 실물을 베끼지 않고 **랜드마크만** 재현한다(로고·핵심 버튼·구조 하나).
 *
 * ── 이 파일이 원래 문법과 다르게 하는 것 하나 ──────────────────────────────
 * 원래 문법은 포인터 좌표를 손으로 계산한 뒤 **캡처 스크립트로 눈으로 확정**하라고 한다
 * (자유 JSX 목업이라 ±2% 오차가 흔하다). 여기서는 **버튼 자리를 `Rect` 상수로 한 번만
 * 적고** 목업 배치(`boxOf`)와 포인터 웨이포인트(`centerOf`)가 그 상수를 함께 참조한다 —
 * 포인터가 대상 위에 오는 것이 계산이 아니라 **구성으로 보장**되고, 배치를 옮겨도
 * 포인터가 따라온다.
 *
 * ── 목업의 근거 ────────────────────────────────────────────────────────────
 * 시연 대상이 우리 앱이므로 실물은 코드가 정본이다. 라벨은 실제 화면 문구를 그대로 썼다:
 * `SignatureRequestsPage`(서명 요청·요청 받은 서명) · `SignatureRequestWizard`(문서를
 * 붙이면 모달이 넓어진다) · `SignatureSignDialog`(왼쪽 문서·오른쪽 서명 패널) ·
 * `ExportPanel`(Google Drive로 보관 → 내려받기·출력) · `types.ts`(정리 기한 D-day).
 * **화면 문구가 바뀌면 이 목업도 함께 고쳐야 한다.**
 */
import React from 'react';
import {
  AppWindow, Caret, Pointer, clickFlash, dimAfter, easeInOut, interpolate,
  popIn, typed, useSceneTime,
} from '@/lib/walkthrough';
import {
  boxOf, centerOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect,
} from '@/components/walkthrough/stageCoords';
import { Band, Btn, Field, Hi, Stub } from '@/components/walkthrough/atoms';

/** 서명자 색 — 실제 `signerColor.ts` 팔레트의 앞 두 색 */
const SIGNER_A = '#4f46e5';
const SIGNER_B = '#ea580c';

/** 서명칸 — 문서 위에 그려지는 사각형. `grow` 0~1 이면 드래그 중 */
const FieldBox: React.FC<{
  rect: Rect; color: string; name: string; grow?: number; signed?: boolean;
}> = ({ rect, color, name, grow = 1, signed = false }) => (
  <span style={{
    position: 'absolute', left: rect.x, top: rect.y,
    width: rect.w * grow, height: rect.h * Math.min(1, grow * 1.6),
    borderRadius: 5,
    border: `1.5px ${grow < 1 ? 'dashed' : 'solid'} ${color}`,
    background: `color-mix(in srgb, ${color} 12%, transparent)`,
    overflow: 'hidden',
  }}>
    {grow >= 1 && (
      <span style={{
        position: 'absolute', left: 4, top: -1,
        fontSize: 8.5, fontWeight: 700, color,
        whiteSpace: 'nowrap',
      }}>{name}</span>
    )}
    {signed && (
      <svg viewBox="0 0 90 34" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <path d="M8 24 C16 6, 24 6, 30 20 S44 30, 52 12 S70 8, 82 22"
              fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    )}
  </span>
);

/* ══ ① 요청 만들기 — 문서와 서명자 ═════════════════════════════════════════
   구도: 목록 화면 → 그 위에 요청 모달. 모달이 **문서를 붙이는 순간 넓어지는 것**이
   이 화면의 핵심 동작이라 폭을 실제로 애니메이션한다. */

const S1_W1: Rect = { x: 32, y: 60, w: 420, h: 250 };
const S1_BTN_NEW = inWindow(S1_W1, { x: 324, y: 19, w: 74, h: 24 }, CH);

const S1_W2_X = 350, S1_W2_Y = 190, S1_W2_H = 320;
const S1_W2_NARROW = 296, S1_W2_WIDE = 580;
/** 왼쪽 입력 열은 폭이 변해도 그대로다 — 그래서 좌표를 폭과 무관하게 적을 수 있다 */
const S1_W2_L: Rect = { x: S1_W2_X, y: S1_W2_Y, w: S1_W2_NARROW, h: S1_W2_H };
const S1_DROP = inWindow(S1_W2_L, { x: 14, y: 12, w: 240, h: 56 }, CH);
const S1_TITLE = inWindow(S1_W2_L, { x: 14, y: 80, w: 240, h: 26 }, CH);
const S1_SIGNER_IN = inWindow(S1_W2_L, { x: 14, y: 140, w: 240, h: 26 }, CH);
const S1_SIGNER_OPT = inWindow(S1_W2_L, { x: 14, y: 170, w: 240, h: 26 }, CH);

const S1 = {
  W1_IN: 0.25, CLICK_NEW: 1.5, W2_IN: 2.1, CLICK_FILE: 3.3, EXPAND: 3.9,
  CLICK_SIGNER: 5.5, TYPE: 5.9, PICK: 7.5, DONE: 8.4,
};
const S1_NAME = '김하늘';

export const SceneCreateRequest: React.FC = () => {
  const t = useSceneTime();
  const wide = interpolate(t, [S1.EXPAND, S1.EXPAND + 0.55], [S1_W2_NARROW, S1_W2_WIDE], easeInOut);
  const hasFile = t > S1.EXPAND;
  const typedName = typed(t, S1_NAME, S1.TYPE, 9);
  const picked = t > S1.PICK;

  return (
    <>
      <Band t={t}>① 전자서명 → <span style={{ color: 'var(--primary)' }}>서명 요청</span> → 문서를 붙이고 서명자를 고른다</Band>

      {/* ── 창① 전자서명 목록 ── */}
      <AppWindow
        kind="browser" url="spacekijun / 전자서명" badge="①"
        style={{ ...boxOf(S1_W1), ...popIn(t, S1.W1_IN), ...dimAfter(t, S1.W2_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* 헤더 글래스 카드 — 실제 화면의 랜드마크. 실제 화면처럼 기능명은 그리지 않는다 */}
          <div style={{
            position: 'absolute', left: 12, top: 10, width: 396, height: 44,
            borderRadius: 10, border: '1px solid var(--hair)',
            background: 'color-mix(in srgb, var(--fg) 3%, var(--bg))',
            display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
          }}>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{
                fontSize: 10, color: 'var(--fg-muted)', border: '1px solid var(--hair)',
                borderRadius: 999, padding: '2px 7px', background: 'var(--bg)',
              }}>요청 받은 서명</span>
            </span>
          </div>
          <Btn rect={{ ...S1_BTN_NEW, x: S1_BTN_NEW.x - S1_W1.x, y: S1_BTN_NEW.y - S1_W1.y - CH }}
               label="＋ 서명 요청" tone="brand" flash={clickFlash(t, S1.CLICK_NEW)} />
          {/* 목록 카드 자리 */}
          {[0, 1].map((i) => (
            <div key={i} style={{
              position: 'absolute', left: 12 + i * 202, top: 66, width: 192, height: 66,
              borderRadius: 10, border: '1px solid var(--hair)', padding: 10,
              display: 'flex', flexDirection: 'column', gap: 7,
            }}>
              <Stub w={104} h={7} /><Stub w={140} h={5} o={0.7} /><Stub w={70} h={5} o={0.5} />
            </div>
          ))}
        </div>
      </AppWindow>

      {/* ── 창② 서명 요청 만들기 (문서를 붙이면 넓어진다) ── */}
      <AppWindow
        kind="app" title="서명 요청 만들기" badge="②"
        style={{
          ...boxOf({ ...S1_W2_L, w: wide }),
          ...popIn(t, S1.W2_IN),
          zIndex: 3,
        }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* 왼쪽 입력 열 */}
          <span style={{ position: 'absolute', left: 14, top: -2, fontSize: 10, color: 'var(--fg-faint)' }} />
          {hasFile ? (
            <Field rect={{ x: 14, y: 12, w: 240, h: 56 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--fg)' }}>
                  체험학습 신청서.hwpx
                </span>
                <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>한글 문서 · 1쪽</span>
              </span>
            </Field>
          ) : (
            <span style={{
              ...boxOf({ x: 14, y: 12, w: 240, h: 56 }),
              display: 'grid', placeItems: 'center', gap: 2,
              borderRadius: 9, border: '1.5px dashed var(--hair)',
              fontSize: 11.5, color: 'var(--fg-muted)',
              boxShadow: clickFlash(t, S1.CLICK_FILE) > 0
                ? `0 0 0 ${6 * clickFlash(t, S1.CLICK_FILE)}px rgba(79,70,229,0.24)` : undefined,
            }}>
              한글·PDF·이미지 파일 올리기
            </span>
          )}

          <Field rect={{ x: 14, y: 80, w: 240, h: 26 }}>
            {hasFile ? <span style={{ color: 'var(--fg)' }}>체험학습 신청서 결재</span> : '제목'}
          </Field>

          <span style={{ position: 'absolute', left: 14, top: 118, fontSize: 10.5, color: 'var(--fg-faint)' }}>
            서명자
          </span>
          <Field rect={{ x: 14, y: 140, w: 240, h: 26 }} flash={clickFlash(t, S1.CLICK_SIGNER)}>
            {t > S1.TYPE && !picked
              ? <span style={{ color: 'var(--fg)' }}>{typedName}<Caret /></span>
              : <span>이름으로 검색</span>}
          </Field>

          {/* 검색 후보 — 타이핑 중에만 */}
          {t > S1.TYPE + 0.5 && !picked && (
            <span style={{
              ...boxOf({ x: 14, y: 170, w: 240, h: 26 }),
              display: 'flex', alignItems: 'center', gap: 6, padding: '0 9px',
              borderRadius: 7, border: '1px solid var(--primary)',
              background: 'color-mix(in srgb, var(--primary) 8%, var(--bg))',
              fontSize: 12, color: 'var(--fg)',
              boxShadow: clickFlash(t, S1.PICK) > 0
                ? `0 0 0 ${6 * clickFlash(t, S1.PICK)}px rgba(79,70,229,0.24)` : undefined,
            }}>
              <span style={{
                width: 15, height: 15, borderRadius: '50%', background: SIGNER_A,
                color: '#fff', fontSize: 8.5, display: 'grid', placeItems: 'center', fontWeight: 700,
              }}>김</span>
              {S1_NAME} <span style={{ color: 'var(--fg-faint)', fontSize: 10.5 }}>교사</span>
            </span>
          )}

          {/* 선택된 서명자 행 */}
          {picked && (
            <span style={{
              ...boxOf({ x: 14, y: 170, w: 240, h: 30 }),
              display: 'flex', alignItems: 'center', gap: 7, padding: '0 9px',
              borderRadius: 8, border: `1.5px solid ${SIGNER_A}`,
              background: `color-mix(in srgb, ${SIGNER_A} 8%, var(--bg))`,
              fontSize: 12, fontWeight: 600,
              ...popIn(t, S1.PICK),
            }}>
              <span style={{
                width: 16, height: 16, borderRadius: 5, background: SIGNER_A, color: '#fff',
                fontSize: 9, display: 'grid', placeItems: 'center', fontWeight: 800,
              }}>1</span>
              {S1_NAME}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-faint)' }}>
                서명칸 0개
              </span>
            </span>
          )}

          {/* 오른쪽 문서 — 붙인 뒤에만 */}
          {hasFile && (
            <div style={{
              position: 'absolute', left: 282, top: 10, width: 284, height: 262,
              borderRadius: 9, background: 'color-mix(in srgb, var(--fg) 4%, var(--bg))',
              display: 'grid', placeItems: 'center',
              opacity: interpolate(t, [S1.EXPAND + 0.25, S1.EXPAND + 0.8], [0, 1]),
            }}>
              <div style={{
                width: 160, height: 226, background: '#fff', borderRadius: 3,
                border: '1px solid var(--hair)', boxShadow: 'var(--shadow)',
                padding: 16, display: 'flex', flexDirection: 'column', gap: 7,
              }}>
                <Stub w={90} h={7} />
                <Stub w={126} h={4} o={0.6} /><Stub w={118} h={4} o={0.6} />
                <Stub w={126} h={4} o={0.6} /><Stub w={72} h={4} o={0.6} />
                <span style={{ marginTop: 'auto', display: 'flex', gap: 6 }}>
                  <Stub w={56} h={4} o={0.5} /><Stub w={56} h={4} o={0.5} />
                </span>
              </div>
            </div>
          )}
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(300), y: pctY(60) },
        { t: S1.CLICK_NEW, ...centerOf(S1_BTN_NEW), click: true },
        { t: S1.CLICK_FILE, ...centerOf(S1_DROP), click: true },
        { t: S1.CLICK_SIGNER, ...centerOf(S1_SIGNER_IN), click: true },
        { t: S1.PICK, ...centerOf(S1_SIGNER_OPT), click: true },
        { t: S1.DONE, ...centerOf(S1_TITLE), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 서명 위치 지정 ═══════════════════════════════════════════════════════
   구도: 창 하나 크게 + 포인터 동선만(단일 화면 반복 조작). 드래그 두 번이 전부라
   창을 늘어놓을 이유가 없고, 문서를 크게 보여 주는 편이 이 단계의 요점이다. */

const S2_W: Rect = { x: 140, y: 70, w: 690, h: 420 };
const S2_ROW1 = inWindow(S2_W, { x: 12, y: 74, w: 196, h: 32 }, CH);
const S2_ROW2 = inWindow(S2_W, { x: 12, y: 112, w: 196, h: 32 }, CH);
const S2_DOC = inWindow(S2_W, { x: 310, y: 16, w: 240, h: 330 }, CH);
const S2_BOX1: Rect = { x: S2_DOC.x + 26, y: S2_DOC.y + 232, w: 88, h: 36 };
const S2_BOX2: Rect = { x: S2_DOC.x + 126, y: S2_DOC.y + 232, w: 88, h: 36 };
const S2_SEND = inWindow(S2_W, { x: 580, y: 338, w: 96, h: 30 }, CH);

const S2 = {
  W_IN: 0.25, DRAG1_S: 1.6, DRAG1_E: 2.7, SEL2: 3.7, DRAG2_S: 4.4, DRAG2_E: 5.5,
  SEND: 6.9, DONE: 7.7,
};

export const SceneFieldPlacement: React.FC = () => {
  const t = useSceneTime();
  const grow1 = interpolate(t, [S2.DRAG1_S, S2.DRAG1_E], [0, 1], easeInOut);
  const grow2 = interpolate(t, [S2.DRAG2_S, S2.DRAG2_E], [0, 1], easeInOut);
  const active2 = t > S2.SEL2;
  const sent = t > S2.SEND;

  const row = (r: Rect, color: string, order: string, name: string, count: number, on: boolean) => (
    <span style={{
      ...boxOf({ x: r.x - S2_W.x, y: r.y - S2_W.y - CH, w: r.w, h: r.h }),
      display: 'flex', alignItems: 'center', gap: 7, padding: '0 9px',
      borderRadius: 8, fontSize: 12, fontWeight: 600,
      border: `1.5px solid ${on ? color : 'var(--hair)'}`,
      background: on ? `color-mix(in srgb, ${color} 9%, var(--bg))` : 'var(--bg)',
    }}>
      <span style={{
        width: 16, height: 16, borderRadius: 5, background: color, color: '#fff',
        fontSize: 9, display: 'grid', placeItems: 'center', fontWeight: 800,
      }}>{order}</span>
      {name}
      <span style={{ marginLeft: 'auto', fontSize: 10, color: on ? color : 'var(--fg-faint)' }}>
        서명칸 {count}개
      </span>
    </span>
  );

  return (
    <>
      <Band t={t}>② 서명자를 고른 뒤 <span style={{ color: 'var(--primary)' }}>문서 위에 드래그</span>해 그 사람의 서명칸을 그린다</Band>

      <AppWindow
        kind="app" title="서명 요청 만들기" badge=""
        style={{ ...boxOf(S2_W), ...popIn(t, S2.W_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* 왼쪽 — 서명자 목록. 행 자체가 '지금 그릴 사람' 선택이다 */}
          <span style={{ position: 'absolute', left: 12, top: 14, fontSize: 11, fontWeight: 700 }}>
            서명자
          </span>
          <span style={{ position: 'absolute', left: 12, top: 36, width: 196, fontSize: 10, color: 'var(--fg-faint)', lineHeight: 1.5 }}>
            같은 번호 = 동시에 서명<br />다음 번호 = 앞이 끝나야 차례
          </span>
          {row(S2_ROW1, SIGNER_A, '1', '김하늘', grow1 >= 1 ? 1 : 0, !active2)}
          {row(S2_ROW2, SIGNER_B, '2', '박도윤', grow2 >= 1 ? 1 : 0, active2)}
          <span style={{
            ...boxOf({ x: 12, y: 156, w: 196, h: 26 }),
            display: 'grid', placeItems: 'center', borderRadius: 7,
            border: '1px dashed var(--hair)', fontSize: 11, color: 'var(--fg-faint)',
          }}>＋ 서명자 추가</span>

          {/* 오른쪽 — 문서 */}
          <div style={{
            position: 'absolute', left: 220, top: 0, right: 0, bottom: 0,
            background: 'color-mix(in srgb, var(--fg) 4%, var(--bg))',
            borderLeft: '1px solid var(--hair-2)',
          }} />
          <div style={{
            ...boxOf({ x: S2_DOC.x - S2_W.x, y: S2_DOC.y - S2_W.y - CH, w: S2_DOC.w, h: S2_DOC.h }),
            background: '#fff', borderRadius: 3, border: '1px solid var(--hair)',
            boxShadow: 'var(--shadow)', padding: 20,
            display: 'flex', flexDirection: 'column', gap: 9,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>체험학습 신청서</span>
            <Stub w={196} h={5} o={0.6} /><Stub w={186} h={5} o={0.6} />
            <Stub w={196} h={5} o={0.6} /><Stub w={132} h={5} o={0.6} />
            <span style={{ marginTop: 6 }}><Stub w={196} h={5} o={0.6} /></span>
            <Stub w={168} h={5} o={0.6} />
            <span style={{ marginTop: 'auto', fontSize: 9.5, color: 'var(--fg-faint)' }}>
              담임 / 학부모 확인
            </span>
          </div>

          {/* 서명칸 — 문서 위 절대 좌표. 창 기준으로 환산해 그린다 */}
          {grow1 > 0 && (
            <span style={{ position: 'absolute', left: -S2_W.x, top: -S2_W.y - CH, width: 960, height: 540 }}>
              <FieldBox rect={S2_BOX1} color={SIGNER_A} name="김하늘" grow={grow1} />
              {grow2 > 0 && <FieldBox rect={S2_BOX2} color={SIGNER_B} name="박도윤" grow={grow2} />}
            </span>
          )}

          <Btn rect={{ x: S2_SEND.x - S2_W.x, y: S2_SEND.y - S2_W.y - CH, w: S2_SEND.w, h: S2_SEND.h }}
               label={sent ? '보냈습니다' : '요청 보내기'}
               flash={clickFlash(t, S2.SEND)} />
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(700), y: pctY(150) },
        { t: S2.DRAG1_S, x: pctX(S2_BOX1.x), y: pctY(S2_BOX1.y), click: true },
        { t: S2.DRAG1_E, x: pctX(S2_BOX1.x + S2_BOX1.w), y: pctY(S2_BOX1.y + S2_BOX1.h) },
        { t: S2.SEL2, ...centerOf(S2_ROW2), click: true },
        { t: S2.DRAG2_S, x: pctX(S2_BOX2.x), y: pctY(S2_BOX2.y), click: true },
        { t: S2.DRAG2_E, x: pctX(S2_BOX2.x + S2_BOX2.w), y: pctY(S2_BOX2.y + S2_BOX2.h) },
        { t: S2.SEND, ...centerOf(S2_SEND), click: true },
        { t: S2.DONE, ...centerOf(S2_SEND), hide: true },
      ]} />
    </>
  );
};

/* ══ ③ 서명하기 ═════════════════════════════════════════════════════════════
   구도: 목록 → 서명 화면 릴레이. 서명 화면이 **왼쪽 문서·오른쪽 패널** 2단이라는
   사실 자체가 안내할 내용이라 목업도 그 구조를 그대로 보여 준다. */

const S3_W1: Rect = { x: 32, y: 66, w: 380, h: 190 };
const S3_CARD = inWindow(S3_W1, { x: 12, y: 12, w: 356, h: 74 }, CH);
const S3_W2: Rect = { x: 300, y: 180, w: 630, h: 330 };
const S3_DOC = inWindow(S3_W2, { x: 70, y: 14, w: 220, h: 264 }, CH);
const S3_MYBOX: Rect = { x: S3_DOC.x + 30, y: S3_DOC.y + 186, w: 92, h: 38 };
const S3_PAD = inWindow(S3_W2, { x: 374, y: 44, w: 242, h: 98 }, CH);
const S3_SUBMIT = inWindow(S3_W2, { x: 374, y: 244, w: 242, h: 30 }, CH);

const S3 = {
  W1_IN: 0.25, CLICK_CARD: 1.5, W2_IN: 2.1, DRAW_S: 3.5, DRAW_E: 5.2,
  SUBMIT: 6.4, DONE: 7.2,
};

export const SceneSign: React.FC = () => {
  const t = useSceneTime();
  const draw = interpolate(t, [S3.DRAW_S, S3.DRAW_E], [0, 1], easeInOut);
  const submitted = t > S3.SUBMIT;

  return (
    <>
      <Band t={t}>③ <span style={{ color: 'var(--primary)' }}>내 차례</span> 문서를 열어 문서를 보면서 서명하고 제출한다</Band>

      {/* 창① 목록의 내 차례 카드 */}
      <AppWindow
        kind="browser" url="spacekijun / 전자서명" badge="①"
        style={{ ...boxOf(S3_W1), ...popIn(t, S3.W1_IN), ...dimAfter(t, S3.W2_IN) }}
      >
        <div style={{
          ...boxOf({ x: 12, y: 12, w: 356, h: 74 }),
          borderRadius: 10, border: `1.5px solid ${SIGNER_A}`,
          background: `color-mix(in srgb, ${SIGNER_A} 5%, var(--bg))`,
          padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
          boxShadow: clickFlash(t, S3.CLICK_CARD) > 0
            ? `0 0 0 ${6 * clickFlash(t, S3.CLICK_CARD)}px rgba(79,70,229,0.24)` : undefined,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>체험학습 신청서 결재</span>
          {/* 진행 칩 — 실제 SignatureProgressChip 과 같은 구성 */}
          <span style={{
            display: 'flex', alignItems: 'center', gap: 6, height: 24,
            borderRadius: 7, background: 'color-mix(in srgb, var(--fg) 4%, transparent)',
            padding: '0 7px', fontSize: 10.5, color: 'var(--fg-muted)',
          }}>
            <span style={{ fontWeight: 700, color: 'var(--fg)' }}>0/2</span> 완료
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3,
              borderRadius: 999, background: '#dbeafe', color: '#1e40af',
              border: '1px solid #93c5fd', padding: '1px 6px', fontWeight: 700 }}>
              내 차례
            </span>
          </span>
        </div>
      </AppWindow>

      {/* 창② 서명 화면 */}
      <AppWindow
        kind="app" title="체험학습 신청서 결재" badge="②"
        style={{ ...boxOf(S3_W2), ...popIn(t, S3.W2_IN), zIndex: 3 }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* 왼쪽 문서 */}
          <div style={{
            position: 'absolute', left: 0, top: 0, width: 360, bottom: 0,
            background: 'color-mix(in srgb, var(--fg) 4%, var(--bg))',
            display: 'grid', placeItems: 'center',
          }}>
            <div style={{
              width: 220, height: 264, background: '#fff', borderRadius: 3,
              border: '1px solid var(--hair)', boxShadow: 'var(--shadow)', padding: 16,
              display: 'flex', flexDirection: 'column', gap: 7,
            }}>
              <span style={{ fontSize: 10.5, fontWeight: 700 }}>체험학습 신청서</span>
              <Stub w={182} h={4} o={0.6} /><Stub w={170} h={4} o={0.6} />
              <Stub w={182} h={4} o={0.6} /><Stub w={120} h={4} o={0.6} />
            </div>
          </div>
          {/* 내 서명칸 — 강조 */}
          <span style={{ position: 'absolute', left: -S3_W2.x, top: -S3_W2.y - CH, width: 960, height: 540 }}>
            <FieldBox rect={S3_MYBOX} color={SIGNER_A} name="내 칸" signed={draw > 0.98} />
          </span>

          {/* 오른쪽 서명 패널 */}
          <div style={{
            position: 'absolute', left: 360, top: 0, right: 0, bottom: 0,
            borderLeft: '1px solid var(--hair-2)', padding: 14,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>여기에 서명</span>
            <div style={{
              ...boxOf({ x: 14, y: 44, w: 242, h: 98 }),
              borderRadius: 9, border: '1.5px solid var(--hair)', background: 'var(--bg)',
            }}>
              <svg viewBox="0 0 242 98" style={{ width: '100%', height: '100%' }}>
                <path d="M24 70 C46 18, 68 18, 84 58 S120 84, 140 32 S186 20, 218 62"
                      fill="none" stroke={SIGNER_A} strokeWidth="3.2" strokeLinecap="round"
                      pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
              </svg>
            </div>
            {/* QR — 휴대폰으로 서명 */}
            <div style={{ ...boxOf({ x: 14, y: 154, w: 242, h: 60 }), display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{
                width: 52, height: 52, borderRadius: 7, border: '1px solid var(--hair)',
                display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 1.5, padding: 5,
              }}>
                {Array.from({ length: 25 }).map((_, i) => (
                  <i key={i} style={{
                    background: [0, 1, 2, 4, 5, 7, 9, 10, 12, 14, 15, 17, 19, 20, 22, 24].includes(i)
                      ? 'var(--fg)' : 'transparent',
                    borderRadius: 1,
                  }} />
                ))}
              </span>
              <span style={{ fontSize: 10, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                마우스 서명이 어색하면<br />QR을 찍어 <b style={{ color: 'var(--fg)' }}>휴대폰에서 손으로</b>
              </span>
            </div>
            <Btn rect={{ x: 14, y: 244, w: 242, h: 30 }}
                 label={submitted ? '✓ 서명했습니다' : '서명 제출'}
                 flash={clickFlash(t, S3.SUBMIT)} />
          </div>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(200), y: pctY(60) },
        { t: S3.CLICK_CARD, ...centerOf(S3_CARD), click: true },
        { t: S3.DRAW_S, x: pctX(S3_PAD.x + 24), y: pctY(S3_PAD.y + 70) },
        { t: S3.DRAW_E, x: pctX(S3_PAD.x + 218), y: pctY(S3_PAD.y + 62) },
        { t: S3.SUBMIT, ...centerOf(S3_SUBMIT), click: true },
        { t: S3.DONE, ...centerOf(S3_SUBMIT), hide: true },
      ]} />
    </>
  );
};

/* ══ ④ 끝난 뒤 — 보관과 정리 기한 ═══════════════════════════════════════════
   이 단계는 "하는 법" 이 아니라 **모르면 파일을 잃는 규칙**이라 안내에 반드시 넣는다. */

const S4_W1: Rect = { x: 40, y: 66, w: 420, h: 250 };
const S4_EXPORT = inWindow(S4_W1, { x: 314, y: 168, w: 92, h: 30 }, CH);
const S4_W2: Rect = { x: 400, y: 230, w: 520, h: 280 };
const S4_DRIVE = inWindow(S4_W2, { x: 16, y: 56, w: 488, h: 34 }, CH);

const S4 = {
  W1_IN: 0.25, CLICK_EXPORT: 1.4, W2_IN: 2.0, CLICK_DRIVE: 3.4, DONE: 4.9, PURGE: 5.9,
};

export const SceneExport: React.FC = () => {
  const t = useSceneTime();
  const archived = t > S4.DONE;

  return (
    <>
      <Band t={t}>④ 모두 서명하면 <span style={{ color: 'var(--primary)' }}>내보내기</span> — 옮기지 않으면 7일 뒤 지워진다</Band>

      {/* 창① 완료된 문서 */}
      <AppWindow
        kind="app" title="체험학습 신청서 결재" badge="①"
        style={{ ...boxOf(S4_W1), ...popIn(t, S4.W1_IN), ...dimAfter(t, S4.W2_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0, padding: 12 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999,
            border: '1px solid #6ee7b7', background: '#d1fae5', color: '#065f46',
            padding: '2px 9px', fontSize: 10.5, fontWeight: 700,
          }}>✓ 서명 완료 2/2</span>
          <div style={{
            marginTop: 10, width: 130, height: 128, background: '#fff', borderRadius: 3,
            border: '1px solid var(--hair)', boxShadow: 'var(--shadow)', padding: 11,
            display: 'flex', flexDirection: 'column', gap: 5,
          }}>
            <Stub w={70} h={5} /><Stub w={104} h={3.5} o={0.6} /><Stub w={96} h={3.5} o={0.6} />
            <span style={{ marginTop: 'auto', display: 'flex', gap: 5 }}>
              <svg viewBox="0 0 50 20" width={50} height={20}>
                <path d="M4 15 C10 3, 16 3, 20 12 S30 18, 36 6 S46 5, 47 13"
                      fill="none" stroke={SIGNER_A} strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <svg viewBox="0 0 50 20" width={50} height={20}>
                <path d="M4 14 C11 5, 18 6, 23 13 S33 16, 38 7 S46 6, 47 12"
                      fill="none" stroke={SIGNER_B} strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          <Btn rect={{ x: 314, y: 168, w: 92, h: 30 }} label="내보내기"
               flash={clickFlash(t, S4.CLICK_EXPORT)} />
        </div>
      </AppWindow>

      {/* 창② 내보내기 패널 */}
      <AppWindow
        kind="app" title="보관 및 내보내기" badge="②"
        style={{ ...boxOf(S4_W2), ...popIn(t, S4.W2_IN), zIndex: 3 }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <span style={{ position: 'absolute', left: 16, top: 16, fontSize: 11, color: 'var(--fg-muted)' }}>
            먼저 <b style={{ color: 'var(--fg)' }}>Drive로 옮기고</b>, 필요하면 내려받거나 출력하세요.
          </span>
          <span style={{
            ...boxOf({ x: 16, y: 56, w: 488, h: 34 }),
            display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
            borderRadius: 9, fontSize: 12, fontWeight: 650,
            border: `1.5px solid ${archived ? '#6ee7b7' : 'var(--primary)'}`,
            background: archived ? '#ecfdf5' : 'color-mix(in srgb, var(--primary) 7%, var(--bg))',
            color: archived ? '#065f46' : 'var(--primary)',
            boxShadow: clickFlash(t, S4.CLICK_DRIVE) > 0
              ? `0 0 0 ${6 * clickFlash(t, S4.CLICK_DRIVE)}px rgba(79,70,229,0.24)` : undefined,
          }}>
            {archived ? '✓ Google Drive에 보관했습니다 · Drive에서 열기' : 'Google Drive로 보관'}
          </span>

          <span style={{ ...boxOf({ x: 16, y: 100, w: 236, h: 32 }) }}>
            <Btn rect={{ x: 0, y: 0, w: 236, h: 32 }} label="내려받기" tone="ghost" />
          </span>
          <span style={{ ...boxOf({ x: 268, y: 100, w: 236, h: 32 }) }}>
            <Btn rect={{ x: 0, y: 0, w: 236, h: 32 }} label="출력" tone="ghost" />
          </span>

          {/* 정리 기한 — 이 안내의 핵심 */}
          <span style={{
            ...boxOf({ x: 16, y: 152, w: 488, h: 62 }),
            borderRadius: 9, padding: 11,
            border: `1px solid ${archived ? 'var(--hair)' : '#fecdd3'}`,
            background: archived ? 'var(--hair-2)' : '#fff1f2',
            display: 'flex', flexDirection: 'column', gap: 4,
            opacity: interpolate(t, [S4.PURGE - 0.6, S4.PURGE], [0.35, 1]),
          }}>
            <span style={{
              fontSize: 11.5, fontWeight: 700,
              color: archived ? 'var(--fg-muted)' : '#be123c',
            }}>
              {archived ? 'Drive로 옮겨져 서버에서는 정리되었습니다' : '9월 11일(목) 14:30 · 7일 남음'}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
              {archived
                ? 'Drive의 파일은 그대로 남습니다. 요청 기록과 서명 이력도 남습니다.'
                : '기한이 지나면 원본과 서명본이 모두 지워집니다. 요청 기록은 남습니다.'}
            </span>
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(300), y: pctY(70) },
        { t: S4.CLICK_EXPORT, ...centerOf(S4_EXPORT), click: true },
        { t: S4.CLICK_DRIVE, ...centerOf(S4_DRIVE), click: true },
        { t: S4.PURGE, x: pctX(S4_W2.x + 260), y: pctY(S4_W2.y + CH + 183), hide: true },
      ]} />
    </>
  );
};
