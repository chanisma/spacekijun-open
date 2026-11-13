/**
 * 구매 신청 안내 — 절차 시연 씬 3편.
 *
 * 목업 근거(라벨은 실제 화면 문구): `PurchaseRequestsPage`(신청 페이지 / 내 신청) ·
 * `RequesterView`(내 신청 품목 · 품목 더 신청하기 · 새 신청 · 제출 · 처리 대기/승인/불가 요약 칩) ·
 * `ManagerView`(① 신청 검토 · 품목별 · 상태 변경 · ⋯ 품의 없이 바로 공문 만들기) · `OfficialDocumentDialog`(공문 본문).
 * **화면 문구가 바뀌면 이 목업도 함께 고쳐야 한다.**
 */
import React from 'react';
import {
  AppWindow, Pointer, clickFlash, dimAfter, easeInOut, interpolate, popIn, typed, useSceneTime,
} from '@/lib/walkthrough';
import {
  boxOf, centerOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect,
} from '@/components/walkthrough/stageCoords';
import { Band, Btn, Field, Hi, Pill, Stub } from '@/components/walkthrough/atoms';

/* 상태 색 — 실제 `purchaseRequestStatus.ts` 의 의미 색과 같은 결 */
const TONE = {
  submitted: { fg: '#475569', bg: '#f1f5f9', bd: '#cbd5e1' },
  pending: { fg: '#1d4ed8', bg: '#dbeafe', bd: '#93c5fd' },
  approved: { fg: '#065f46', bg: '#d1fae5', bd: '#6ee7b7' },
  completed: { fg: '#065f46', bg: '#a7f3d0', bd: '#34d399' },
  rejected: { fg: '#be123c', bg: '#ffe4e6', bd: '#fda4af' },
};

/** 표 한 줄 */
const Row: React.FC<{
  rect: Rect; cells: React.ReactNode[]; widths: number[]; head?: boolean; on?: boolean;
}> = ({ rect, cells, widths, head = false, on = false }) => (
  <span style={{
    ...boxOf(rect),
    display: 'flex', alignItems: 'center', gap: 0,
    borderBottom: '1px solid var(--hair-2)',
    background: on ? 'color-mix(in srgb, var(--primary) 6%, transparent)' : 'transparent',
    fontSize: head ? 10 : 11.5,
    fontWeight: head ? 700 : 500,
    color: head ? 'var(--fg-faint)' : 'var(--fg)',
  }}>
    {cells.map((c, i) => (
      <span key={i} style={{
        width: widths[i], paddingLeft: 8, minWidth: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{c}</span>
    ))}
  </span>
);

/* ══ ① 신청하기 ═════════════════════════════════════════════════════════════
   구도: 목록 → 신청 페이지 릴레이. 신청은 **표에 줄을 채우는 일**이라 표를 크게 보여 준다. */

const P1_W1: Rect = { x: 32, y: 62, w: 400, h: 230 };
const P1_PAGE = inWindow(P1_W1, { x: 12, y: 14, w: 180, h: 76 }, CH);
const P1_W2: Rect = { x: 360, y: 180, w: 560, h: 330 };
const P1_ADD = inWindow(P1_W2, { x: 14, y: 12, w: 110, h: 26 }, CH);
const P1_CELL = inWindow(P1_W2, { x: 14, y: 76, w: 180, h: 26 }, CH);
const P1_QTY = inWindow(P1_W2, { x: 202, y: 76, w: 60, h: 26 }, CH);
const P1_SUBMIT = inWindow(P1_W2, { x: 466, y: 250, w: 80, h: 28 }, CH);

const P1 = {
  W1_IN: 0.25, CLICK_PAGE: 1.4, W2_IN: 2.0, CLICK_ADD: 3.1,
  TYPE: 3.7, CLICK_QTY: 6.0, TYPE_QTY: 6.3, SUBMIT: 7.5, DONE: 8.3,
};
const P1_ITEM = '실험용 비커 250mL';

export const SceneRequest: React.FC = () => {
  const t = useSceneTime();
  const adding = t > P1.CLICK_ADD;
  const name = typed(t, P1_ITEM, P1.TYPE, 10);
  const qty = typed(t, '20', P1.TYPE_QTY, 6);
  const sent = t > P1.SUBMIT;
  const W = [180, 60, 90, 120];

  return (
    <>
      <Band t={t}>① 신청 페이지를 열고 <Hi>품목 더 신청하기</Hi> — 품목을 줄로 적어 제출한다</Band>

      <AppWindow
        kind="browser" url="spacekijun / 구매 신청" badge="①"
        style={{ ...boxOf(P1_W1), ...popIn(t, P1.W1_IN), ...dimAfter(t, P1.W2_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <span style={{ position: 'absolute', left: 12, top: -2, fontSize: 10, color: 'var(--fg-faint)' }} />
          {[0, 1].map((i) => (
            <div key={i} style={{
              position: 'absolute', left: 12 + i * 194, top: 14, width: 180, height: 76,
              borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
              border: `1px solid ${i === 0 ? 'var(--primary)' : 'var(--hair)'}`,
              background: i === 0 ? 'color-mix(in srgb, var(--primary) 5%, var(--bg))' : 'var(--bg)',
              boxShadow: i === 0 && clickFlash(t, P1.CLICK_PAGE) > 0
                ? `0 0 0 ${6 * clickFlash(t, P1.CLICK_PAGE)}px rgba(79,70,229,0.24)` : undefined,
            }}>
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>
                {i === 0 ? '2학기 과학실 소모품' : '도서 구입'}
              </span>
              <Pill label={i === 0 ? '신청 기간' : '마감'} {...(i === 0 ? TONE.pending : TONE.submitted)} />
              <Stub w={120} h={4} o={0.6} />
            </div>
          ))}
        </div>
      </AppWindow>

      <AppWindow
        kind="app" title="2학기 과학실 소모품" badge="②"
        style={{ ...boxOf(P1_W2), ...popIn(t, P1.W2_IN), zIndex: 3 }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <Btn rect={{ x: 14, y: 12, w: 130, h: 26 }} label="＋ 품목 더 신청하기"
               flash={clickFlash(t, P1.CLICK_ADD)} />

          {adding ? (
            <div style={{ ...boxOf({ x: 14, y: 48, w: 532, h: 190 }), ...popIn(t, P1.CLICK_ADD, 0.45) }}>
              <Row rect={{ x: 0, y: 0, w: 532, h: 24 }} widths={W} head
                   cells={['품목명', '수량', '예상 단가', '구매처 / 링크']} />
              <Row rect={{ x: 0, y: 28, w: 532, h: 26 }} widths={W} on
                   cells={[
                     // 표 셀은 position:static 이라 절대배치 Field 를 넣으면 창 좌상단으로 튄다 → inline
                     <Field inline rect={{ x: 0, y: 0, w: 166, h: 24 }} flash={clickFlash(t, P1.CLICK_ADD, 0.9)}>
                       <span style={{ color: 'var(--fg)', fontSize: 11 }}>{name}</span>
                     </Field>,
                     <Field inline rect={{ x: 0, y: 0, w: 46, h: 24 }} flash={clickFlash(t, P1.CLICK_QTY)}>
                       <span style={{ color: 'var(--fg)', fontSize: 11 }}>{qty}</span>
                     </Field>,
                     <span style={{ color: 'var(--fg-faint)', fontSize: 11 }}>3,200</span>,
                     <span style={{ color: 'var(--fg-faint)', fontSize: 11 }}>과학사</span>,
                   ]} />
              {t > P1.TYPE_QTY + 0.8 && (
                <Row rect={{ x: 0, y: 58, w: 532, h: 26 }} widths={W}
                     cells={['알코올 램프', '6', '5,500', '과학사']} />
              )}
              <span style={{
                position: 'absolute', left: 0, top: 96, fontSize: 10.5, color: 'var(--fg-faint)',
              }}>줄을 더 추가해 한 번에 여러 품목을 신청할 수 있습니다</span>
            </div>
          ) : (
            <span style={{
              ...boxOf({ x: 14, y: 60, w: 532, h: 100 }),
              display: 'grid', placeItems: 'center', borderRadius: 9,
              border: '1px dashed var(--hair)', fontSize: 11.5, color: 'var(--fg-faint)',
            }}>아직 신청한 품목이 없습니다</span>
          )}

          {adding && (
            <>
              <span style={{
                position: 'absolute', left: 14, top: 256, fontSize: 11, color: 'var(--fg-muted)',
              }}>합계 <b style={{ color: 'var(--fg)' }}>97,000원</b></span>
              <Btn rect={{ x: 466, y: 250, w: 80, h: 28 }}
                   label={sent ? '✓ 제출됨' : '제출'} tone={sent ? 'ok' : 'primary'}
                   flash={clickFlash(t, P1.SUBMIT)} />
            </>
          )}
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(240), y: pctY(50) },
        { t: P1.CLICK_PAGE, ...centerOf(P1_PAGE), click: true },
        { t: P1.CLICK_ADD, ...centerOf(P1_ADD), click: true },
        { t: P1.TYPE - 0.2, ...centerOf(P1_CELL), click: true },
        { t: P1.CLICK_QTY, ...centerOf(P1_QTY), click: true },
        { t: P1.SUBMIT, ...centerOf(P1_SUBMIT), click: true },
        { t: P1.DONE, ...centerOf(P1_SUBMIT), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 처리 상태 — 품목마다 따로 간다 ══════════════════════════════════════
   여기엔 클릭이 없다. 사용자가 **할 일**이 아니라 **보게 될 것**을 설명하는 단계라
   포인터를 두지 않고 시간에 따라 상태가 실제로 바뀌는 것을 보여 준다. */

const P2_W: Rect = { x: 150, y: 74, w: 660, h: 390 };

const P2 = { W_IN: 0.25, PENDING: 1.6, OK1: 3.0, NO2: 4.4, SPLIT: 5.6, END: 7.2 };

export const SceneStatus: React.FC = () => {
  const t = useSceneTime();
  const step = t > P2.OK1 ? 2 : t > P2.PENDING ? 1 : 0;   // 제출됨 → 검토중 → 승인
  const W = [190, 50, 96, 150];


  return (
    <>
      <Band t={t}>② 처리는 <Hi>품목마다 따로</Hi> 간다 — 신청 전체 상태는 품목에서 나온다</Band>

      <AppWindow
        kind="app" title="내 신청 · 2학기 과학실 소모품" badge=""
        style={{ ...boxOf(P2_W), ...popIn(t, P2.W_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0, padding: 16 }}>
          {/* 요약 칩 — 실제 «내 신청 품목» 머리글과 같은 모양(0 인 상태는 감춘다) */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)', marginRight: 4 }}>내 신청 품목 2</span>
            {step < 2 ? (
              <Pill label="처리 대기 2" {...TONE.pending} />
            ) : (
              <>
                <Pill label="승인 1" {...TONE.approved} />
                <Pill label="불가 1" {...TONE.rejected} />
              </>
            )}
          </span>

          {/* 품목 표 — 처리 상태 열이 품목마다 다르다 */}
          <span style={{ ...boxOf({ x: 16, y: 56, w: 628, h: 150 }) }}>
            <Row rect={{ x: 0, y: 0, w: 628, h: 24 }} widths={W} head
                 cells={['품목명', '수량', '처리 상태', '사유']} />
            <Row rect={{ x: 0, y: 28, w: 628, h: 30 }} widths={W}
                 cells={[
                   '실험용 비커 250mL', '20',
                   t > P2.OK1
                     ? <Pill label="승인" {...TONE.approved} />
                     : <Pill label={t > P2.PENDING ? '검토중' : '제출됨'}
                             {...(t > P2.PENDING ? TONE.pending : TONE.submitted)} />,
                   '',
                 ]} />
            <Row rect={{ x: 0, y: 62, w: 628, h: 30 }} widths={W}
                 cells={[
                   '알코올 램프', '6',
                   t > P2.NO2
                     ? <Pill label="불가" {...TONE.rejected} />
                     : <Pill label={t > P2.PENDING ? '검토중' : '제출됨'}
                             {...(t > P2.PENDING ? TONE.pending : TONE.submitted)} />,
                   t > P2.NO2
                     ? <span style={{ fontSize: 10.5, color: '#be123c' }}>안전 규정상 구매 불가</span>
                     : '',
                 ]} />
          </span>

          {/* 갈렸을 때만 뜨는 분포 칩 */}
          {t > P2.SPLIT && (
            <span style={{
              ...boxOf({ x: 16, y: 222, w: 628, h: 74 }),
              borderRadius: 10, border: '1px solid var(--hair)', padding: 12,
              display: 'flex', flexDirection: 'column', gap: 7,
              ...popIn(t, P2.SPLIT, 0.5),
            }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Pill label="승인 1" {...TONE.approved} />
                <Pill label="불가 1" {...TONE.rejected} />
                <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>
                  품목 상태가 갈리면 신청 전체 사유 대신 품목마다 사유가 보입니다
                </span>
              </span>
              <span style={{ fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
                아직 <b style={{ color: 'var(--fg)' }}>사지 않은</b> 승인 품목이 남아 있으므로 신청은
                &lsquo;완료&rsquo;가 아니라 <b style={{ color: 'var(--fg)' }}>&lsquo;승인&rsquo;</b>입니다.
              </span>
            </span>
          )}
        </div>
      </AppWindow>
    </>
  );
};

/* ══ ③ 매니저 — 품목 단위 승인과 공문 ═══════════════════════════════════════ */

const P3_W1: Rect = { x: 36, y: 66, w: 470, h: 254 };
const P3_CHK1 = inWindow(P3_W1, { x: 16, y: 74, w: 16, h: 16 }, CH);
const P3_CHK2 = inWindow(P3_W1, { x: 16, y: 104, w: 16, h: 16 }, CH);
const P3_APPROVE = inWindow(P3_W1, { x: 340, y: 152, w: 112, h: 28 }, CH);
const P3_DOC = inWindow(P3_W1, { x: 340, y: 188, w: 112, h: 28 }, CH);
const P3_W2: Rect = { x: 430, y: 250, w: 490, h: 260 };

const P3 = {
  W1_IN: 0.25, CHK1: 1.3, CHK2: 2.0, APPROVE: 3.1, APPLIED: 3.9,
  CLICK_DOC: 5.1, W2_IN: 5.7, END: 7.6,
};

export const SceneManager: React.FC = () => {
  const t = useSceneTime();
  const c1 = t > P3.CHK1, c2 = t > P3.CHK2;
  const applied = t > P3.APPLIED;
  const W = [26, 150, 44, 100];

  const check = (on: boolean, flash: number) => (
    <span style={{
      width: 13, height: 13, borderRadius: 3, display: 'grid', placeItems: 'center',
      border: `1.5px solid ${on ? 'var(--primary)' : 'var(--hair)'}`,
      background: on ? 'var(--primary)' : 'var(--bg)',
      color: '#fff', fontSize: 9,
      boxShadow: flash > 0 ? `0 0 0 ${5 * flash}px rgba(79,70,229,0.24)` : undefined,
    }}>{on ? '✓' : ''}</span>
  );

  return (
    <>
      <Band t={t}>③ 담당자는 <Hi>품목만 골라</Hi> 승인하고, 그대로 <Hi>공문 본문</Hi>을 만든다</Band>

      <AppWindow
        kind="app" title="① 신청 검토 · 품목별" badge="①"
        style={{ ...boxOf(P3_W1), ...popIn(t, P3.W1_IN), ...dimAfter(t, P3.W2_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0, padding: 14 }}>
          <span style={{ ...boxOf({ x: 16, y: 40, w: 438, h: 100 }) }}>
            <Row rect={{ x: 0, y: 0, w: 320, h: 22 }} widths={W} head
                 cells={['', '품목명', '수량', '상태']} />
            <Row rect={{ x: 0, y: 26, w: 320, h: 28 }} widths={W} on={c1}
                 cells={[
                   check(c1, clickFlash(t, P3.CHK1)), '실험용 비커', '20',
                   applied ? <Pill label="승인" {...TONE.approved} />
                           : <Pill label="검토중" {...TONE.pending} />,
                 ]} />
            <Row rect={{ x: 0, y: 56, w: 320, h: 28 }} widths={W} on={c2}
                 cells={[
                   check(c2, clickFlash(t, P3.CHK2)), '유리 비커', '10',
                   applied ? <Pill label="승인" {...TONE.approved} />
                           : <Pill label="검토중" {...TONE.pending} />,
                 ]} />
            <Row rect={{ x: 0, y: 86, w: 320, h: 28 }} widths={W}
                 cells={[
                   check(false, 0), '알코올 램프', '6',
                   <Pill label="검토중" {...TONE.pending} />,
                 ]} />
          </span>

          {/* 선택 막대 — 고른 품목 수와 일괄 동작 */}
          {(c1 || c2) && (
            <span style={{
              position: 'absolute', left: 16, top: 158, fontSize: 11, color: 'var(--primary)',
              fontWeight: 700,
            }}>{(c1 ? 1 : 0) + (c2 ? 1 : 0)}개 품목 선택됨</span>
          )}
          <Btn rect={{ x: 340, y: 152, w: 112, h: 28 }} label="상태 변경"
               flash={clickFlash(t, P3.APPROVE)} />
          <Btn rect={{ x: 340, y: 188, w: 112, h: 28 }} label="⋯ 바로 공문 만들기" tone="ghost"
               flash={clickFlash(t, P3.CLICK_DOC)} />
        </div>
      </AppWindow>

      <AppWindow
        kind="app" title="공문 본문 만들기" badge="②"
        style={{ ...boxOf(P3_W2), ...popIn(t, P3.W2_IN), zIndex: 3 }}
      >
        <div style={{ position: 'absolute', inset: 0, padding: 14 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
            고른 품목이 <b style={{ color: 'var(--fg)' }}>붙임 표</b>로 따라갑니다.
          </span>
          <span style={{
            ...boxOf({ x: 14, y: 34, w: 462, h: 152 }),
            borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--bg)',
            padding: 12, fontSize: 11.5, lineHeight: 1.9, color: 'var(--fg)',
            fontFamily: 'var(--font-mono)',
          }}>
            1. 관련: 2026학년도 과학과 교육과정 운영 계획<br />
            2. 2학기 과학 실험 수업 운영에 필요한 소모품을 아래와 같이<br />
            &nbsp;&nbsp;&nbsp;구입하고자 합니다.<br />
            <span style={{ color: 'var(--fg-faint)' }}>
              붙임 &nbsp;구매 품목 목록 1부. &nbsp;끝.
            </span>
          </span>
          <span style={{ position: 'absolute', left: 14, top: 200, fontSize: 10.5, color: 'var(--fg-faint)' }}>
            제목·수신·결재란은 넣지 않습니다 — 문서관리시스템 양식이 채웁니다
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(280), y: pctY(50) },
        { t: P3.CHK1, ...centerOf(P3_CHK1), click: true },
        { t: P3.CHK2, ...centerOf(P3_CHK2), click: true },
        { t: P3.APPROVE, ...centerOf(P3_APPROVE), click: true },
        { t: P3.CLICK_DOC, ...centerOf(P3_DOC), click: true },
        { t: P3.END, ...centerOf(P3_DOC), hide: true },
      ]} />
    </>
  );
};
