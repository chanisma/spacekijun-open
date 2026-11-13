/**
 * 문서 생성 안내 — 절차 시연 씬 3편.
 *
 * 목업 근거(라벨은 실제 화면 문구): `DocumentGenerationPage`(새 생성 방식 · 공개/비공개) ·
 * `DocGenCreateDialog`(생성 방식 이름) · `SpecFillActionRunner` 계획 검토 화면
 * (①AI로 초안 작성 → ②문서에 들어갈 내용 → ③실행, 작성 모드 = 알려준 내용만 / 설명 기반 생성).
 * **화면 문구가 바뀌면 이 목업도 함께 고쳐야 한다.**
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

/* ══ ① 생성 방식 만들기 ═════════════════════════════════════════════════════
   "생성 방식" 이라는 말이 낯설므로, **양식 한글 파일 = 생성 방식의 재료**라는 것을
   화면으로 먼저 보여 준다. */

const D1_W1: Rect = { x: 32, y: 62, w: 400, h: 240 };
const D1_NEW = inWindow(D1_W1, { x: 286, y: 14, w: 96, h: 26 }, CH);
const D1_W2: Rect = { x: 372, y: 178, w: 540, h: 336 };
const D1_NAME_IN = inWindow(D1_W2, { x: 16, y: 30, w: 508, h: 28 }, CH);
const D1_PICK = inWindow(D1_W2, { x: 16, y: 176, w: 508, h: 52 }, CH);
const D1_SAVE = inWindow(D1_W2, { x: 412, y: 258, w: 112, h: 30 }, CH);

const D1 = {
  W1_IN: 0.25, CLICK_NEW: 1.4, W2_IN: 2.0, CLICK_NAME: 2.5, TYPE: 2.8,
  CLICK_PICK: 5.6, PICKED: 6.2, SAVE: 7.6, DONE: 8.6,
};
const D1_NAME = '교수학습 및 평가운영 계획서';

export const SceneCreateMethod: React.FC = () => {
  const t = useSceneTime();
  const name = typed(t, D1_NAME, D1.TYPE, 11);
  const typing = t > D1.TYPE && t < typedDoneAt(D1_NAME, D1.TYPE, 11) + 0.6;
  const picked = t > D1.PICKED;
  const saved = t > D1.SAVE;

  return (
    <>
      <Band t={t}>① 이름을 적고 <Hi>한글 양식 파일</Hi>을 올려 &lsquo;생성 방식&rsquo;을 만든다</Band>

      <AppWindow
        kind="browser" url="spacekijun / 문서 생성" badge="①"
        style={{ ...boxOf(D1_W1), ...popIn(t, D1.W1_IN), ...dimAfter(t, D1.W2_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <span style={{ position: 'absolute', left: 12, top: 18, fontSize: 13, fontWeight: 700 }}>
            문서 생성
          </span>
          <Btn rect={{ x: 286, y: 14, w: 96, h: 26 }} label="＋ 새 생성 방식"
               flash={clickFlash(t, D1.CLICK_NEW)} />
          <span style={{
            ...boxOf({ x: 12, y: 56, w: 370, h: 110 }),
            display: 'grid', placeItems: 'center', borderRadius: 10,
            border: '1px dashed var(--hair)', fontSize: 11.5, color: 'var(--fg-faint)',
            textAlign: 'center', lineHeight: 1.7,
          }}>
            아직 만든 문서 생성 방식이 없습니다<br />
            &lsquo;새 생성 방식&rsquo;으로 시작하세요
          </span>
        </div>
      </AppWindow>

      <AppWindow
        kind="app" title="새 문서 생성 방식" badge="②"
        style={{ ...boxOf(D1_W2), ...popIn(t, D1.W2_IN), zIndex: 3 }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <span style={{ position: 'absolute', left: 16, top: 10, fontSize: 10.5, color: 'var(--fg-faint)' }}>
            생성 방식 이름
          </span>
          <Field rect={{ x: 16, y: 30, w: 508, h: 28 }} flash={clickFlash(t, D1.CLICK_NAME)}>
            {t > D1.TYPE
              ? <span style={{ color: 'var(--fg)' }}>{name}{typing && <Caret />}</span>
              : <span>예: 교수학습 및 평가운영 계획서 작성</span>}
          </Field>

          <span style={{ position: 'absolute', left: 16, top: 66, fontSize: 10.5, color: 'var(--fg-faint)' }}>
            설명 (선택)
          </span>
          <Field rect={{ x: 16, y: 86, w: 508, h: 32 }}>
            <span style={{ fontSize: 11 }}>어떤 문서를 만드는 방식인지</span>
          </Field>

          {/* 공개 체크 — 실제 모달에 있는 항목이라 함께 보여 준다 */}
          <span style={{
            ...boxOf({ x: 16, y: 126, w: 508, h: 30 }),
            display: 'flex', alignItems: 'center', gap: 7, padding: '0 9px',
            borderRadius: 8, border: '1px solid var(--hair-2)',
            background: 'color-mix(in srgb, var(--fg) 3%, transparent)',
            fontSize: 11, color: 'var(--fg-muted)',
          }}>
            <span style={{
              width: 13, height: 13, borderRadius: 3, border: '1.5px solid var(--hair)',
              background: 'var(--bg)',
            }} />
            다른 교사·직원에게 공개
          </span>

          {/* 주 경로 — 내 한글 양식을 그대로 올린다 */}
          <span style={{ position: 'absolute', left: 16, top: 160, fontSize: 10.5, fontWeight: 700 }}>
            양식
          </span>
          <span style={{
            ...boxOf({ x: 16, y: 176, w: 508, h: 52 }),
            display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
            borderRadius: 9,
            border: `1.5px ${picked ? 'solid' : 'dashed'} ${picked ? '#93c5fd' : '#93c5fd'}`,
            background: picked ? '#eff6ff' : 'rgba(239,246,255,0.5)',
            boxShadow: clickFlash(t, D1.CLICK_PICK) > 0
              ? `0 0 0 ${6 * clickFlash(t, D1.CLICK_PICK)}px rgba(79,70,229,0.24)` : undefined,
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: 8, background: '#dbeafe', color: '#2563eb',
              display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800,
            }}>{picked ? '✓' : '↑'}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1d4ed8' }}>
                {picked ? '평가운영계획서_양식.hwpx' : '한글 양식 파일 올리기'}
              </span>
              <span style={{ display: 'block', fontSize: 10, color: 'var(--fg-faint)' }}>
                {picked ? '만들면 바로 채울 자리를 확인하는 화면이 열립니다'
                        : 'HWPX · 채울 자리를 자동으로 찾아 줍니다'}
              </span>
            </span>
          </span>

          {/* 옵션 — 이미 등록된 양식 */}
          <span style={{
            ...boxOf({ x: 16, y: 236, w: 300, h: 22 }),
            display: 'flex', alignItems: 'center',
            fontSize: 10.5, color: 'var(--fg-faint)',
          }}>
            또는 이미 등록된 양식에서 고르기
          </span>

          <Btn rect={{ x: 412, y: 258, w: 112, h: 30 }}
               label={saved ? '✓ 만들었습니다' : '만들기'} tone={saved ? 'ok' : 'primary'}
               flash={clickFlash(t, D1.SAVE)} />
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(250), y: pctY(40) },
        { t: D1.CLICK_NEW, ...centerOf(D1_NEW), click: true },
        { t: D1.CLICK_NAME, ...centerOf(D1_NAME_IN), click: true },
        { t: D1.CLICK_PICK, ...centerOf(D1_PICK), click: true },
        { t: D1.SAVE, ...centerOf(D1_SAVE), click: true },
        { t: D1.DONE, ...centerOf(D1_SAVE), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 문서 만들기 — 설명 → 내용 → 실행 ════════════════════════════════════
   구도: 창 하나 크게. 계획 검토 화면의 **세 묶음 순서 자체**가 안내할 내용이라
   창을 늘어놓지 않고 그 화면을 크게 보여 준다. */

const D2_W: Rect = { x: 130, y: 68, w: 700, h: 420 };
const D2_CTX = inWindow(D2_W, { x: 16, y: 42, w: 660, h: 62 }, CH);
const D2_AI = inWindow(D2_W, { x: 552, y: 112, w: 124, h: 28 }, CH);
const D2_RUN = inWindow(D2_W, { x: 552, y: 336, w: 124, h: 32 }, CH);

const D2 = {
  W_IN: 0.25, CLICK_CTX: 1.3, TYPE: 1.7, CLICK_AI: 6.0, FILLING: 6.6,
  FILLED: 8.2, RUN: 9.4, DONE: 10.2,
};
const D2_CTX_TEXT = '2학기 1학년 통합과학, 수행 40% 지필 60%';

export const SceneFillPlan: React.FC = () => {
  const t = useSceneTime();
  const ctx = typed(t, D2_CTX_TEXT, D2.TYPE, 12);
  const typingCtx = t > D2.TYPE && t < typedDoneAt(D2_CTX_TEXT, D2.TYPE, 12) + 0.6;
  const filled = t > D2.FILLED;
  const filling = t > D2.FILLING && !filled;
  const ran = t > D2.RUN;

  /** 폼 한 줄 — AI 가 채우면 값이 나타난다 */
  const line = (y: number, label: string, value: string, delay: number, prose = false) => (
    <span key={label} style={{ ...boxOf({ x: 16, y, w: 520, h: prose ? 42 : 26 }), display: 'flex', gap: 8 }}>
      <span style={{ width: 76, fontSize: 10.5, color: 'var(--fg-muted)', paddingTop: 6 }}>{label}</span>
      <span style={{
        flex: 1, borderRadius: 6, border: '1px solid var(--hair)', background: 'var(--bg)',
        padding: '5px 8px', fontSize: 11, color: 'var(--fg)', lineHeight: 1.5,
        minHeight: prose ? 32 : 18,
      }}>
        {t > D2.FILLING + delay
          ? <span style={{ opacity: interpolate(t, [D2.FILLING + delay, D2.FILLING + delay + 0.4], [0, 1]) }}>
              {value}
            </span>
          : <span style={{ color: 'var(--fg-faint)' }}>{filling ? '…' : ''}</span>}
      </span>
    </span>
  );

  return (
    <>
      <Band t={t}>③ <Hi>설명</Hi>을 적고 → AI 가 초안을 채우고 → 확인한 뒤 <Hi>실행</Hi></Band>

      <AppWindow
        kind="app" title="교수학습 및 평가운영 계획서 · 계획 검토" badge=""
        style={{ ...boxOf(D2_W), ...popIn(t, D2.W_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* ① AI 카드 — 부각된 파란 묶음 */}
          <span style={{
            ...boxOf({ x: 16, y: 12, w: 660, h: 132 }),
            borderRadius: 10, border: '1px solid #93c5fd', background: '#eff6ff',
          }} />
          <span style={{ position: 'absolute', left: 28, top: 22, fontSize: 11, fontWeight: 700, color: '#1d4ed8' }}>
            AI로 초안 작성
          </span>
          <span style={{ position: 'absolute', left: 28, top: 42, fontSize: 10, color: '#3b82f6' }}>
            어떤 문서를 만들지 설명해 주세요
          </span>
          <span style={{
            ...boxOf({ x: 28, y: 60, w: 636, h: 44 }),
            borderRadius: 7, border: `1px solid ${clickFlash(t, D2.CLICK_CTX) > 0 ? '#2563eb' : '#bfdbfe'}`,
            background: '#fff', padding: '7px 9px', fontSize: 11.5, color: 'var(--fg)', lineHeight: 1.5,
          }}>
            {t > D2.TYPE
              ? <>{ctx}{typingCtx && <Caret color="#2563eb" />}</>
              : <span style={{ color: 'var(--fg-faint)' }}>예: 2학기 1학년 통합과학 평가 계획</span>}
          </span>
          <Btn rect={{ x: 552, y: 112, w: 124, h: 28 }}
               label={filled ? '✓ 초안 작성됨' : filling ? '작성 중…' : 'AI로 초안 작성'}
               tone={filled ? 'ok' : 'primary'} flash={clickFlash(t, D2.CLICK_AI)} />

          {/* ② 문서에 들어갈 내용 */}
          <span style={{ position: 'absolute', left: 16, top: 156, fontSize: 11, fontWeight: 700 }}>
            문서에 들어갈 내용
          </span>
          <span style={{
            ...boxOf({ x: 16, y: 174, w: 660, h: 148 }),
            borderRadius: 10, border: '1px solid var(--hair)',
          }} />
          {line(186, '과목명', '통합과학', 0.2)}
          {line(216, '담당 교사', '김하늘', 0.5)}
          {line(246, '평가 방법', '수행평가 40% · 지필평가 60%, 논술형 포함', 0.9, true)}

          {/* 작성 모드 — 오해하기 쉬운 자리라 화면에 명시 */}
          <span style={{ position: 'absolute', left: 556, top: 186, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>작성 모드</span>
            <Pill label="알려준 내용만" fg="#065f46" bg="#d1fae5" bd="#6ee7b7" />
            <Pill label="설명 기반 생성" fg="#92400e" bg="#fef3c7" bd="#fcd34d" />
          </span>

          {/* ③ 실행 */}
          <Btn rect={{ x: 552, y: 336, w: 124, h: 32 }}
               label={ran ? '✓ 문서 완성' : '실행'} tone={ran ? 'ok' : 'primary'}
               flash={clickFlash(t, D2.RUN)} />
          {!filled && (
            <span style={{ position: 'absolute', left: 16, top: 340, fontSize: 10, color: 'var(--fg-faint)' }}>
              필수 칸이 다 차야 실행할 수 있습니다 — 못 누르는 이유는 버튼 위에 적힙니다
            </span>
          )}
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(500), y: pctY(30) },
        { t: D2.CLICK_CTX, ...centerOf(D2_CTX), click: true },
        { t: D2.CLICK_AI, ...centerOf(D2_AI), click: true },
        { t: D2.RUN, ...centerOf(D2_RUN), click: true },
        { t: D2.DONE, ...centerOf(D2_RUN), hide: true },
      ]} />
    </>
  );
};

/* ══ ③ 확인하고 내려받기 ════════════════════════════════════════════════════ */

const D3_W1: Rect = { x: 40, y: 66, w: 430, h: 270 };
const D3_W2: Rect = { x: 420, y: 236, w: 500, h: 274 };
const D3_DL = inWindow(D3_W2, { x: 356, y: 196, w: 128, h: 30 }, CH);

const D3 = { W1_IN: 0.25, CHECK: 1.6, W2_IN: 2.4, WARN: 3.8, DL: 5.4, DONE: 6.4 };

export const SceneReview: React.FC = () => {
  const t = useSceneTime();
  const dl = t > D3.DL;

  return (
    <>
      <Band t={t}>④ 완성 문서를 <Hi>확인</Hi>하고 한글 파일로 내려받는다</Band>

      {/* 완성 문서 미리보기 */}
      <AppWindow
        kind="app" title="완성 문서" badge="①"
        style={{ ...boxOf(D3_W1), ...popIn(t, D3.W1_IN), ...dimAfter(t, D3.W2_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <div style={{
            width: 208, height: 190, background: '#fff', borderRadius: 4,
            border: '1px solid var(--hair)', boxShadow: 'var(--shadow)',
            padding: 14, display: 'flex', flexDirection: 'column', gap: 7,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700 }}>교수학습 및 평가운영 계획</span>
            {[['과목명', '통합과학'], ['담당 교사', '김하늘']].map(([k, v]) => (
              <span key={k} style={{ display: 'flex', gap: 6, fontSize: 8.5 }}>
                <span style={{ width: 46, color: 'var(--fg-muted)' }}>{k}</span>
                <span style={{ fontWeight: 650 }}>{v}</span>
              </span>
            ))}
            <span style={{ display: 'flex', gap: 6, fontSize: 8.5 }}>
              <span style={{ width: 46, color: 'var(--fg-muted)' }}>평가 방법</span>
              <span style={{ flex: 1, lineHeight: 1.6 }}>수행평가 40% · 지필평가 60%, 논술형 포함</span>
            </span>
            <span style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Stub w={172} h={3.5} o={0.5} /><Stub w={152} h={3.5} o={0.5} />
            </span>
          </div>
        </div>
      </AppWindow>

      {/* 검토·내려받기 */}
      <AppWindow
        kind="app" title="검토하고 내려받기" badge="②"
        style={{ ...boxOf(D3_W2), ...popIn(t, D3.W2_IN), zIndex: 3 }}
      >
        <div style={{ position: 'absolute', inset: 0, padding: 16 }}>
          <span style={{
            ...boxOf({ x: 16, y: 16, w: 468, h: 62 }),
            borderRadius: 9, border: '1px solid #fcd34d', background: '#fffbeb',
            padding: 11, display: 'flex', flexDirection: 'column', gap: 4,
            opacity: interpolate(t, [D3.WARN - 0.5, D3.WARN], [0, 1]),
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>
              AI가 지어낸 값 2곳
            </span>
            <span style={{ fontSize: 10.5, color: '#a16207', lineHeight: 1.55 }}>
              두 작성 모드 모두 <b>지어낸 칸을 표시</b>합니다. 보내기 전에 반드시 확인하세요.
            </span>
          </span>

          <span style={{ position: 'absolute', left: 16, top: 96, fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.7 }}>
            같은 생성 방식으로 <b style={{ color: 'var(--fg)' }}>몇 번이든</b> 다시 만들 수 있습니다.<br />
            실행 이력과 완성 문서는 그대로 남습니다.
          </span>

          <span style={{ position: 'absolute', left: 16, top: 200, display: 'flex', gap: 6 }}>
            <Pill label="🔒 비공개 (기본)" fg="#475569" bg="#f1f5f9" bd="#cbd5e1" />
            <Pill label="🌐 공개하면 다른 교사도 실행" fg="#1d4ed8" bg="#dbeafe" bd="#93c5fd" />
          </span>

          <Btn rect={{ x: 356, y: 196, w: 128, h: 30 }}
               label={dl ? '✓ 내려받았습니다' : '한글 파일 내려받기'} tone={dl ? 'ok' : 'primary'}
               flash={clickFlash(t, D3.DL)} />
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.1, x: pctX(300), y: pctY(60) },
        { t: D3.DL, ...centerOf(D3_DL), click: true },
        { t: D3.DONE, ...centerOf(D3_DL), hide: true },
      ]} />
    </>
  );
};

/* ══ ②' 스펙 검수 — 채울 자리를 확인하고 이름을 붙인다 ══════════════════════
   이 단계를 빠뜨리면 안내가 실제 흐름과 어긋난다(실제 = 양식 → **스펙 검수** →
   계획 검토 → 결과). 게다가 **여기서 정한 순서가 다음 단계의 입력 칸 순서**라
   "그냥 넘어가면 되는 화면" 이 아니다.

   구도: 창 하나 크게 + 좌 문서 / 우 목록. 이 화면의 요점이 **문서와 목록이 짝**이라는
   것이라, 창을 나누면 오히려 그 관계가 사라진다. */

const D15_W: Rect = { x: 120, y: 68, w: 720, h: 420 };
const D15_DOC = inWindow(D15_W, { x: 45, y: 20, w: 240, h: 326 }, CH);
/** 문서 위에서 자동으로 찾아낸 '채울 자리' 3곳 */
const D15_T: Rect[] = [
  { x: D15_DOC.x + 80, y: D15_DOC.y + 60, w: 130, h: 22 },
  { x: D15_DOC.x + 80, y: D15_DOC.y + 96, w: 130, h: 22 },
  { x: D15_DOC.x + 34, y: D15_DOC.y + 150, w: 176, h: 40 },
];
const D15_AI = inWindow(D15_W, { x: 346, y: 300, w: 124, h: 28 }, CH);
const D15_SAVE = inWindow(D15_W, { x: 576, y: 300, w: 128, h: 28 }, CH);

const D15 = {
  W_IN: 0.25, DETECT: 1.2, CLICK_T2: 2.8, AI: 4.2, LABELS: 4.9, SAVE: 7.2, DONE: 8.0,
};

/** 스펙 검수의 타깃 한 줄 — 왼쪽 문서의 칸과 1:1 로 대응한다 */
const TargetRow: React.FC<{
  rect: Rect; n: number; label: string; kind: string; on: boolean; filled: boolean;
}> = ({ rect, n, label, kind, on, filled }) => (
  <span style={{
    ...boxOf(rect),
    display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
    borderRadius: 8, fontSize: 11.5,
    border: `1.5px solid ${on ? 'var(--primary)' : 'var(--hair)'}`,
    background: on ? 'color-mix(in srgb, var(--primary) 7%, var(--bg))' : 'var(--bg)',
  }}>
    <span style={{
      width: 17, height: 17, borderRadius: 5, display: 'grid', placeItems: 'center',
      background: on ? 'var(--primary)' : 'var(--hair)',
      color: on ? '#fff' : 'var(--fg-muted)', fontSize: 9.5, fontWeight: 800,
    }}>{n}</span>
    <span style={{
      minWidth: 0, flex: 1, fontWeight: 650,
      color: filled ? 'var(--fg)' : 'var(--fg-faint)',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {filled ? label : '이름 없음'}
    </span>
    <Pill label={kind} fg="#475569" bg="#f1f5f9" bd="#cbd5e1" />
  </span>
);

export const SceneSpecReview: React.FC = () => {
  const t = useSceneTime();
  const found = t > D15.DETECT;
  const sel = t > D15.CLICK_T2 ? 1 : -1;
  const labeled = t > D15.LABELS;
  const saved = t > D15.SAVE;

  const TARGETS = [
    { label: '과목명', kind: '한 줄' },
    { label: '담당 교사', kind: '사람' },
    { label: '평가 방법', kind: '서술' },
  ];

  return (
    <>
      <Band t={t}>② 자동으로 찾은 <Hi>채울 자리</Hi>를 확인하고 이름·유형을 정한다</Band>

      <AppWindow
        kind="app" title="스펙 검수 · 평가운영계획서_양식.hwpx" badge=""
        style={{ ...boxOf(D15_W), ...popIn(t, D15.W_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* 왼쪽 — 문서 위에서 자리를 직접 본다 */}
          <div style={{
            position: 'absolute', left: 0, top: 0, width: 330, bottom: 0,
            background: 'color-mix(in srgb, var(--fg) 4%, var(--bg))',
          }} />
          <div style={{
            ...boxOf({ x: D15_DOC.x - D15_W.x, y: D15_DOC.y - D15_W.y - CH, w: D15_DOC.w, h: D15_DOC.h }),
            background: '#fff', borderRadius: 3, border: '1px solid var(--hair)',
            boxShadow: 'var(--shadow)', padding: 18,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>교수학습 및 평가운영 계획</span>
            <span style={{ display: 'block', marginTop: 10, fontSize: 9.5, color: 'var(--fg-muted)', lineHeight: 3.9 }}>
              과목명<br />담당 교사
            </span>
            <span style={{ display: 'block', marginTop: 14, fontSize: 9.5, color: 'var(--fg-muted)' }}>
              평가 방법
            </span>
          </div>

          {/* 찾아낸 자리 — 번호가 오른쪽 목록과 짝이다 */}
          {found && D15_T.map((r, i) => (
            <span key={i} style={{
              position: 'absolute',
              left: r.x - D15_W.x, top: r.y - D15_W.y - CH, width: r.w, height: r.h,
              borderRadius: 4,
              border: `1.5px ${i === sel ? 'solid' : 'dashed'} var(--primary)`,
              background: `color-mix(in srgb, var(--primary) ${i === sel ? 16 : 9}%, transparent)`,
              ...popIn(t, D15.DETECT + i * 0.14, 0.45),
            }}>
              <span style={{
                position: 'absolute', left: -8, top: -8,
                width: 15, height: 15, borderRadius: '50%', display: 'grid', placeItems: 'center',
                background: 'var(--primary)', color: '#fff', fontSize: 8.5, fontWeight: 800,
              }}>{i + 1}</span>
            </span>
          ))}

          {/* 오른쪽 — 목록. 여기 순서가 다음 단계 입력 순서다 */}
          <span style={{ position: 'absolute', left: 346, top: 14, fontSize: 11, fontWeight: 700 }}>
            채울 자리 {found ? D15_T.length : 0}곳
          </span>
          <span style={{ position: 'absolute', left: 346, top: 32, width: 358, fontSize: 9.5, color: 'var(--fg-faint)' }}>
            여기서 정한 순서 그대로 다음 단계의 입력 칸이 됩니다
          </span>
          {found && TARGETS.map((tg, i) => (
            <TargetRow
              key={tg.label}
              rect={{ x: 346, y: 52 + i * 44, w: 358, h: 38 }}
              n={i + 1} label={tg.label} kind={tg.kind}
              on={i === sel} filled={labeled}
            />
          ))}

          <Btn rect={{ x: 346, y: 300, w: 124, h: 28 }}
               label={labeled ? '✓ 이름 채움' : 'AI 라벨 보완'}
               tone={labeled ? 'ok' : 'ghost'} flash={clickFlash(t, D15.AI)} />
          <Btn rect={{ x: 576, y: 300, w: 128, h: 28 }}
               label={saved ? '✓ 저장됨' : '스펙 저장 → 계획'}
               tone={saved ? 'ok' : 'primary'} flash={clickFlash(t, D15.SAVE)} />
          <span style={{ position: 'absolute', left: 346, top: 338, width: 358, fontSize: 9.5, color: 'var(--fg-faint)', lineHeight: 1.6 }}>
            한 번 저장하면 이 양식으로 만드는 모든 문서가 이 스펙을 씁니다
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.0, x: pctX(700), y: pctY(60) },
        { t: D15.CLICK_T2, x: pctX(D15_T[1].x + D15_T[1].w / 2), y: pctY(D15_T[1].y + D15_T[1].h / 2), click: true },
        { t: D15.AI, ...centerOf(D15_AI), click: true },
        { t: D15.SAVE, ...centerOf(D15_SAVE), click: true },
        { t: D15.DONE, ...centerOf(D15_SAVE), hide: true },
      ]} />
    </>
  );
};
