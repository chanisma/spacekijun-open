/**
 * 창의적 체험활동 안내 — `제안함` 세그먼트의 절차 시연 씬 3편.
 *
 * 목업 근거(라벨은 전부 실제 화면 문구):
 *   `ProposalBoard`(상태 칩 전체·접수·검토 중·수락·보류 · 제안하기 · 관심 하트(개수만) ·
 *                   검토 중 · 보류 · 활동으로 개설 · 개설됨 · 선생님 코멘트)
 *   `ProposalFormDialog`(활동 제안하기 · 제안 제목* · 내용* · 영역 · 희망 학년도 · 진로·분야)
 *   `ActivityFormDialog`(제안에서 개설할 때 씨앗으로 채워지는 폼 · 계보 — 이전 활동에서 이어짐)
 * 상태 라벨·색은 `ProposalBoard` 의 `STATUS_META` 와 같은 값이다.
 * **화면 문구가 바뀌면 이 목업도 함께 고쳐야 한다.**
 */
import React from 'react';
import {
  AppWindow, Pointer, clickFlash, dimAfter, popIn, typed, useSceneTime,
} from '@/lib/walkthrough';
import {
  boxOf, centerOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect,
} from '@/components/walkthrough/stageCoords';
import { Band, Btn, Field, Hi, Pill } from '@/components/walkthrough/atoms';
import { Lab, Note, ScopeBar, Sec } from './shared';
import { AREA, type AreaKey, LINEAGE } from './tokens';
import { SCOPE } from './tabs';

/* ── 상태 색 — `ProposalBoard.STATUS_META` 와 같은 값 ─────────────────────── */
const ST = {
  submitted: { label: '접수', fg: '#475569', bg: '#f8fafc', bd: '#e2e8f0' },
  reviewing: { label: '검토 중', fg: '#1d4ed8', bg: '#eff6ff', bd: '#bfdbfe' },
  accepted: { label: '수락', fg: '#047857', bg: '#ecfdf5', bd: '#a7f3d0' },
  declined: { label: '보류', fg: '#be123c', bg: '#fff1f2', bd: '#fecdd3' },
} as const;

type StatusKey = keyof typeof ST;

const Rule: React.FC<{ x: number; y: number; w: number }> = ({ x, y, w }) => (
  <i style={{ position: 'absolute', left: x, top: y, width: w, height: 1, background: 'var(--hair-2)' }} />
);

/** 상태 필터 칩 줄 */
const StatusChips: React.FC<{ x: number; y: number; counts: number[] }> = ({ x, y, counts }) => (
  <span style={{ position: 'absolute', left: x, top: y, display: 'flex', gap: 5 }}>
    {['전체', '접수', '검토 중', '수락', '보류'].map((label, i) => (
      <span key={label} style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        borderRadius: 999, border: '1px solid var(--hair)', background: i === 0 ? '#f1f5f9' : 'var(--bg)',
        padding: '2px 8px', fontSize: 10, color: i === 0 ? 'var(--fg)' : 'var(--fg-muted)',
      }}>
        {label}<b style={{ opacity: 0.6, fontWeight: 600 }}>{counts[i]}</b>
      </span>
    ))}
  </span>
);

/**
 * 관심 하트 — **개수만** 보인다. 누가 눌렀는지는 교사만 안다.
 *
 * `boxOf` 절대배치라 **행(Row) 기준 좌표**를 받아야 한다. 메타 줄 안에 흐름으로 넣으면
 * 가장 가까운 위치 지정 조상(=메타 span)의 좌상단에 찍혀 글자를 덮는다(실제로 그랬다).
 */
const Heart: React.FC<{ rect: Rect; count: number; on?: boolean; glow?: number }> = ({
  rect, count, on = false, glow = 0,
}) => (
  <span style={{
    ...boxOf(rect), boxSizing: 'border-box',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
    borderRadius: 999, border: `1px solid ${on ? '#fecdd3' : 'var(--hair)'}`,
    background: on ? '#fff1f2' : 'transparent',
    color: on ? '#e11d48' : 'var(--fg-faint)', fontSize: 10,
    boxShadow: glow > 0 ? `0 0 0 ${5 * glow}px rgba(225,29,72,0.2)` : undefined,
  }}>
    {on ? '♥' : '♡'} {count}
  </span>
);

/**
 * 제안 한 줄 — 실제 `ProposalRow` 의 구성.
 *
 * 메타 줄과 하트는 **행 기준 절대배치**다. 흐름에 맡기면 선생님 코멘트가 있는 행에서
 * 아래로 밀려 메타 줄과 겹친다(높이가 고정이라 흐름이 빠져나갈 데가 없다).
 */
const HEART_X = 240;

const ProposalRow: React.FC<{
  rect: Rect; area: AreaKey; status: StatusKey; title: string; body: string; meta: string;
  hearts: number; hearted?: boolean; heartGlow?: number; continuation?: boolean;
  actions?: React.ReactNode; note?: string;
}> = ({
  rect, area, status, title, body, meta, hearts, hearted, heartGlow = 0,
  continuation, actions, note,
}) => {
  const tone = AREA[area];
  const st = ST[status];
  return (
    <span style={{
      ...boxOf(rect), boxSizing: 'border-box',
      borderRadius: 9, border: '1px solid var(--hair)', background: 'var(--bg)', padding: '8px 10px',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Pill label={tone.label} fg={tone.fg} bg={tone.bg} bd={tone.bd} />
        <Pill label={st.label} fg={st.fg} bg={st.bg} bd={st.bd} />
        {continuation && <Pill label="이어가기" fg={LINEAGE.fg} bg={LINEAGE.bg} bd={LINEAGE.bd} />}
        <b style={{ fontSize: 12, color: 'var(--fg)' }}>{title}</b>
      </span>
      <span style={{ display: 'block', marginTop: 5, fontSize: 10.5, color: 'var(--fg-muted)' }}>
        {body}
      </span>
      {note && (
        <span style={{
          display: 'block', marginTop: 5, borderLeft: '2px solid var(--hair)',
          paddingLeft: 7, fontSize: 10, color: 'var(--fg-muted)',
        }}>
          <b style={{ color: 'var(--fg-faint)' }}>선생님 </b>{note}
        </span>
      )}
      <span style={{
        position: 'absolute', left: 10, top: rect.h - 24, maxWidth: HEART_X - 18,
        fontSize: 10, color: 'var(--fg-faint)',
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>{meta}</span>
      <Heart rect={{ x: HEART_X, y: rect.h - 26, w: 44, h: 18 }}
             count={hearts} on={hearted} glow={heartGlow} />
      {actions}
    </span>
  );
};

/** 제안 행 오른쪽의 작은 동작 버튼 */
const Act: React.FC<{ rect: Rect; label: string; tone?: 'ghost' | 'ok'; glow?: number }> = ({
  rect, label, tone = 'ghost', glow = 0,
}) => (
  <span style={{
    ...boxOf(rect), boxSizing: 'border-box',
    display: 'grid', placeItems: 'center', borderRadius: 6, fontSize: 10, fontWeight: 600,
    border: tone === 'ghost' ? '1px solid var(--hair)' : 'none',
    background: tone === 'ghost' ? 'var(--bg)' : '#059669',
    color: tone === 'ghost' ? 'var(--fg-muted)' : '#ffffff',
    boxShadow: glow > 0 ? `0 0 0 ${5 * glow}px rgba(79,70,229,0.24)` : undefined,
  }}>{label}</span>
);

/* ══ ① 제안하기 ════════════════════════════════════════════════════════════ */

const N_W1: Rect = { x: 26, y: 58, w: 520, h: 300 };
const N_NEW = inWindow(N_W1, { x: 424, y: 48, w: 82, h: 24 }, CH);
const N_W2: Rect = { x: 330, y: 172, w: 590, h: 340 };
const N_TITLE = inWindow(N_W2, { x: 14, y: 74, w: 380, h: 26 }, CH);
const N_BODY = inWindow(N_W2, { x: 14, y: 122, w: 550, h: 52 }, CH);
const N_SEND = inWindow(N_W2, { x: 474, y: 266, w: 90, h: 28 }, CH);

const N = { W1: 0.25, NEW: 1.4, W2: 1.9, TITLE: 2.6, BODY: 4.3, SEND: 7.0, DONE: 7.3, END: 8.8 };
const N_TITLE_TEXT = '미생물 배양 관찰 동아리';
const N_BODY_TEXT = '작년 배지 만들기가 재미있어서 종류를 늘려 보고 싶습니다.';

export const ScenePropose: React.FC = () => {
  const t = useSceneTime();
  const title = typed(t, N_TITLE_TEXT, N.TITLE, 10);
  const body = typed(t, N_BODY_TEXT, N.BODY, 20);
  const sent = t > N.DONE;

  return (
    <>
      <Band t={t}>① <Hi>제안하기</Hi> — 하고 싶은 활동을 글로 올린다</Band>

      <AppWindow
        kind="browser" url="spacekijun / 창의적 체험활동" badge="①"
        style={{ ...boxOf(N_W1), ...popIn(t, N.W1), ...dimAfter(t, N.W2) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <ScopeBar active={SCOPE.proposals} x={12} y={10} />
          <Rule x={12} y={42} w={496} />
          <StatusChips x={12} y={50} counts={[2, 1, 1, 0, 0]} />
          <Btn rect={{ x: 424, y: 48, w: 82, h: 24 }} label="＋ 제안하기" flash={clickFlash(t, N.NEW)} />
          <ProposalRow
            rect={{ x: 12, y: 84, w: 496, h: 76 }} area="autonomy_career" status="reviewing"
            title="진로 인터뷰 프로젝트" body="졸업생 선배를 인터뷰해 진로 사례집을 만들고 싶습니다."
            meta="2-1 윤수아 학생 · 2027학년도 희망" hearts={7} />
          <ProposalRow
            rect={{ x: 12, y: 166, w: 496, h: 76 }} area="club" status="submitted"
            title="교내 텃밭 가꾸기" body="빈 화단을 활용해 계절 작물을 길러 보고 싶습니다."
            meta="1-5 이하람 학생 · 2027학년도 희망" hearts={2} />
        </div>
      </AppWindow>

      <AppWindow
        kind="app" title="활동 제안하기" badge="②"
        style={{ ...boxOf(N_W2), ...popIn(t, N.W2), zIndex: 3 }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <Note x={14} y={10} w={550}>
            해보고 싶은 활동을 제안하세요. 다른 학생이 관심을 표시하면 개설 판단의 근거가 됩니다.
          </Note>

          <Sec x={14} y={44}>무엇을 하고 싶은가</Sec>
          <Lab x={14} y={60}>제안 제목 <span style={{ color: '#e11d48' }}>*</span></Lab>
          <Field rect={{ x: 14, y: 74, w: 380, h: 26 }} flash={clickFlash(t, N.TITLE - 0.1, 0.9)}>
            <span style={{ color: 'var(--fg)', fontSize: 11.5 }}>{title}</span>
          </Field>

          <Lab x={14} y={108}>내용 <span style={{ color: '#e11d48' }}>*</span></Lab>
          <span style={{
            ...boxOf({ x: 14, y: 122, w: 550, h: 52 }), boxSizing: 'border-box',
            borderRadius: 7, background: 'var(--bg)', padding: '7px 9px',
            border: `1px solid ${clickFlash(t, N.BODY - 0.15) > 0 ? 'var(--primary)' : 'var(--hair)'}`,
            fontSize: 11, color: 'var(--fg)', lineHeight: 1.5,
          }}>{body}</span>
          <Note x={14} y={180} w={500}>왜 하고 싶은지, 무엇을 해보고 싶은지 적어 주세요.</Note>

          <Sec x={14} y={202}>분류</Sec>
          <Lab x={14} y={218}>영역</Lab>
          <Lab x={196} y={218}>희망 학년도</Lab>
          <Lab x={318} y={218}>진로 · 분야</Lab>
          <Field rect={{ x: 14, y: 232, w: 170, h: 26 }}>
            <span style={{ color: AREA.club.fg, fontSize: 11.5, fontWeight: 600 }}>동아리</span>
          </Field>
          <Field rect={{ x: 196, y: 232, w: 110, h: 26 }}>
            <span style={{ color: 'var(--fg)', fontSize: 11.5 }}>2027</span>
          </Field>
          <Field rect={{ x: 318, y: 232, w: 246, h: 26 }}>
            <span style={{ color: 'var(--fg)', fontSize: 11.5 }}>생명과학</span>
          </Field>

          <Btn rect={{ x: 474, y: 266, w: 90, h: 28 }}
               label={sent ? '✓ 제안됨' : '제안하기'} tone={sent ? 'ok' : 'primary'}
               flash={clickFlash(t, N.SEND)} />
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(300), y: pctY(40) },
        { t: N.NEW, ...centerOf(N_NEW), click: true },
        { t: N.TITLE - 0.1, ...centerOf(N_TITLE), click: true },
        { t: N.BODY - 0.15, ...centerOf(N_BODY), click: true },
        { t: N.SEND, ...centerOf(N_SEND), click: true },
        { t: N.SEND + 1.4, ...centerOf(N_SEND), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 관심과 검토 — 개설 판단의 근거가 쌓인다 ══════════════════════════════ */

const V_W: Rect = { x: 88, y: 52, w: 784, h: 436 };
const V_HEART = inWindow(V_W, { x: 254, y: 144, w: 44, h: 18 }, CH);
const V_REVIEW = inWindow(V_W, { x: 570, y: 136, w: 56, h: 20 }, CH);

const V = { W: 0.25, HEART: 2.2, REVIEW: 5.2, END: 8.8 };

export const SceneReview: React.FC = () => {
  const t = useSceneTime();
  const hearted = t > V.HEART;
  const reviewing = t > V.REVIEW;

  return (
    <>
      <Band t={t}>② <Hi>관심</Hi>이 쌓이고 선생님이 <Hi>검토</Hi>한다</Band>

      <AppWindow
        kind="app" title="제안함" badge=""
        style={{ ...boxOf(V_W), ...popIn(t, V.W) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <ScopeBar active={SCOPE.proposals} x={14} y={10} />
          <Rule x={14} y={42} w={756} />
          <StatusChips x={14} y={52} counts={[3, reviewing ? 0 : 1, reviewing ? 2 : 1, 1, 0]} />

          <ProposalRow
            rect={{ x: 14, y: 78, w: 756, h: 92 }} area="club"
            status={reviewing ? 'reviewing' : 'submitted'}
            title="미생물 배양 관찰 동아리"
            body="작년 배지 만들기가 재미있어서 종류를 늘려 보고 싶습니다."
            meta="1-5 이하람 학생 · 2027학년도 희망 · 생명과학"
            hearts={hearted ? 4 : 3} hearted={hearted} heartGlow={clickFlash(t, V.HEART)}
            actions={
              <>
                <Act rect={{ x: 556, y: 58, w: 56, h: 20 }} label="검토 중" glow={clickFlash(t, V.REVIEW)} />
                <Act rect={{ x: 618, y: 58, w: 48, h: 20 }} label="보류" />
                <Act rect={{ x: 672, y: 58, w: 76, h: 20 }} label="활동으로 개설" tone="ok" />
              </>
            }
          />
          <ProposalRow
            rect={{ x: 14, y: 174, w: 756, h: 92 }} area="autonomy_career" status="reviewing"
            title="진로 인터뷰 프로젝트"
            body="졸업생 선배를 인터뷰해 진로 사례집을 만들고 싶습니다."
            meta="2-1 윤수아 학생 · 2027학년도 희망 · 교육"
            hearts={7}
            note="2학년부와 일정을 조율해 볼게요."
            actions={
              <>
                <Act rect={{ x: 556, y: 58, w: 56, h: 20 }} label="검토 중" />
                <Act rect={{ x: 618, y: 58, w: 48, h: 20 }} label="보류" />
                <Act rect={{ x: 672, y: 58, w: 76, h: 20 }} label="활동으로 개설" tone="ok" />
              </>
            }
          />
          <ProposalRow
            rect={{ x: 14, y: 270, w: 756, h: 92 }} area="club" status="accepted" continuation
            title="혈액형과 수혈 안전 이어가기"
            body="판별에서 멈추지 않고 수혈 부작용 사례까지 조사하고 싶습니다."
            meta="2-3 한시우 학생 · 2027학년도 희망 · 생명과학"
            hearts={5}
            actions={<Act rect={{ x: 672, y: 58, w: 76, h: 20 }} label="✓ 개설됨" tone="ok" />}
          />

          <Note x={14} y={374} w={740}>
            관심은 <b style={{ color: 'var(--fg-muted)' }}>개수만</b> 보입니다 — 누가 눌렀는지는
            선생님만 알면 되고, 학생 명단을 화면에 늘어놓을 이유가 없습니다.
          </Note>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.0, x: pctX(300), y: pctY(80) },
        { t: V.HEART, ...centerOf(V_HEART), click: true },
        { t: V.REVIEW, ...centerOf(V_REVIEW), click: true },
        { t: V.REVIEW + 1.4, ...centerOf(V_REVIEW), hide: true },
      ]} />
    </>
  );
};

/* ══ ③ 활동으로 개설 — 제안이 계보의 마디가 된다 ════════════════════════════ */

const A_W1: Rect = { x: 26, y: 58, w: 560, h: 290 };
const A_OPEN = inWindow(A_W1, { x: 452, y: 112, w: 84, h: 20 }, CH);
const A_W2: Rect = { x: 356, y: 172, w: 564, h: 340 };
const A_SAVE = inWindow(A_W2, { x: 446, y: 250, w: 90, h: 28 }, CH);

const A = { W1: 0.25, OPEN: 1.6, W2: 2.0, SAVE: 5.8, DONE: 6.2, END: 9.0 };

export const SceneAccept: React.FC = () => {
  const t = useSceneTime();
  const opened = t > A.OPEN;
  const saved = t > A.DONE;

  return (
    <>
      <Band t={t}>③ <Hi>활동으로 개설</Hi> — 제안 내용이 기록 폼에 그대로 채워진다</Band>

      <AppWindow
        kind="app" title="제안함" badge="①"
        style={{ ...boxOf(A_W1), ...popIn(t, A.W1), ...dimAfter(t, A.W2) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <ScopeBar active={SCOPE.proposals} x={12} y={10} />
          <Rule x={12} y={42} w={536} />
          <ProposalRow
            rect={{ x: 12, y: 54, w: 536, h: 92 }} area="club"
            status={saved ? 'accepted' : 'reviewing'} continuation
            title="혈액형과 수혈 안전 이어가기"
            body="판별에서 멈추지 않고 수혈 부작용 사례까지 조사하고 싶습니다."
            meta="2-3 한시우 학생 · 2027학년도 희망" hearts={5}
            actions={
              <Act rect={{ x: 440, y: 58, w: 84, h: 20 }}
                   label={saved ? '✓ 개설됨' : '활동으로 개설'} tone="ok"
                   glow={clickFlash(t, A.OPEN)} />
            }
          />
          <ProposalRow
            rect={{ x: 12, y: 152, w: 536, h: 92 }} area="autonomy_career" status="declined"
            title="야간 별 관측 캠프" body="숙박이 필요해 올해는 어렵다는 답을 받았습니다."
            meta="3-2 정은채 학생 · 2027학년도 희망" hearts={11}
            note="숙박형은 안전 계획이 별도로 필요해 보류합니다." />
        </div>
      </AppWindow>

      {opened && (
        <AppWindow
          kind="app" title="활동 기록" badge="②"
          style={{ ...boxOf(A_W2), ...popIn(t, A.W2), zIndex: 3 }}
        >
          <div style={{ position: 'absolute', inset: 0 }}>
            <Note x={14} y={10} w={520}>
              제안의 제목 · 영역 · 진로 분야가 <b style={{ color: 'var(--fg-muted)' }}>미리 채워진 채로</b>
              {' '}열립니다. 저장 전에 확인하고 고치세요.
            </Note>

            <Sec x={14} y={42}>무엇을 했는가</Sec>
            <Lab x={14} y={58}>활동 이름 <span style={{ color: '#e11d48' }}>*</span></Lab>
            <Field rect={{ x: 14, y: 72, w: 360, h: 26 }}>
              <span style={{ color: 'var(--fg)', fontSize: 11.5 }}>혈액형과 수혈 안전</span>
            </Field>
            <Lab x={14} y={106}>영역</Lab>
            <Lab x={196} y={106}>진로 · 분야</Lab>
            <Field rect={{ x: 14, y: 120, w: 170, h: 26 }}>
              <span style={{ color: AREA.club.fg, fontSize: 11.5, fontWeight: 600 }}>동아리</span>
            </Field>
            <Field rect={{ x: 196, y: 120, w: 340, h: 26 }}>
              <span style={{ color: 'var(--fg)', fontSize: 11.5 }}>생명과학</span>
            </Field>

            <span style={{
              ...boxOf({ x: 14, y: 158, w: 522, h: 44 }), boxSizing: 'border-box',
              borderLeft: `2px solid ${LINEAGE.bd}`, background: LINEAGE.bg,
              borderRadius: 4, padding: '7px 10px',
            }}>
              <b style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: LINEAGE.fg }}>
                계보 — 이전 활동에서 이어짐
              </b>
              <span style={{ display: 'block', marginTop: 3, fontSize: 10, color: 'var(--fg-muted)' }}>
                2026 <b style={{ color: 'var(--fg)' }}>혈액형과 수혈 안전</b> 이 자동으로 연결됩니다 —
                저장하면 <b style={{ color: LINEAGE.fg }}>4년째</b> 배지가 붙습니다.
              </span>
            </span>

            <Note x={14} y={212} w={500}>
              저장하면 이 제안이 <b style={{ color: 'var(--fg-muted)' }}>수락</b>으로 바뀌고
              결과 활동이 제안에 연결됩니다 — 제안한 학생이 결과를 볼 수 있습니다.
            </Note>

            <Btn rect={{ x: 446, y: 250, w: 90, h: 28 }}
                 label={saved ? '✓ 기록됨' : '활동 기록'} tone={saved ? 'ok' : 'primary'}
                 flash={clickFlash(t, A.SAVE)} />
          </div>
        </AppWindow>
      )}

      <Pointer path={[
        { t: 1.0, x: pctX(300), y: pctY(40) },
        { t: A.OPEN, ...centerOf(A_OPEN), click: true },
        { t: A.SAVE, ...centerOf(A_SAVE), click: true },
        { t: A.SAVE + 1.4, ...centerOf(A_SAVE), hide: true },
      ]} />
    </>
  );
};
