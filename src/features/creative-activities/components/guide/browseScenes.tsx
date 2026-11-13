/**
 * 창의적 체험활동 안내 — `전체` / `내 담당` 세그먼트의 절차 시연 씬 4편.
 *
 * 목업 근거(라벨은 전부 실제 화면 문구):
 *   `ActivitiesHeader`(전체·내 담당·제안함·탐구 탐색 · 검색 placeholder · 활동 기록 · 제안하기 ·
 *                      범주 칩 자율·진로/동아리/봉사 · 전체 연도 · 전체 주최)
 *   `CategoryBoard`(분야 타일 그리드 → 좌측 레일 + 목록 · 전체 분야 · 활동 N건)
 *   `ActivityListRow`(영역 배지 · N년째 · 담당 · 참여 인원)
 *   `ActivityFormDialog`(무엇을 했는가 · 활동 이름* · 영역 · 주최 동아리 · 진로·분야 ·
 *                        비슷한 활동이 이미 있습니다 · 이 활동 이어받기 · 담당 교사·참여 학생)
 *   `ParticipantPicker`(N학년도 소속 N명 · N명 미선택 · 명단 불러오기 · 참여자 N명)
 *   `ActivityDetailDialog`(개요·참여자·기록·성찰·계보 탭 · 이어가기 · 수정 · 닫기)
 *   `ActivityPostPanel`(성찰 남기기 · 선생님만/함께한 사람/전교 공개 · 남기기)
 *   `ProposalFormDialog`(이 활동 이어가기 · 이어받을 활동 · 제안 제목*)
 * **화면 문구가 바뀌면 이 목업도 함께 고쳐야 한다.**
 */
import React from 'react';
import {
  AppWindow, Pointer, clickFlash, dimAfter, popIn, typed, useSceneTime,
} from '@/lib/walkthrough';
import {
  boxOf, centerOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect,
} from '@/components/walkthrough/stageCoords';
import { Band, Btn, Field, Hi, Pill, Stub } from '@/components/walkthrough/atoms';
import { getCategoryTone } from '../../utils/categories';
import {
  ActivityRow, AreaChips, DetailTabs, Lab, Note, ScopeBar, Sec, Tile,
} from './shared';
import { AREA, LINEAGE } from './tokens';
import { SCOPE } from './tabs';

/* ── 씬 전용 작은 부품 ────────────────────────────────────────────────────── */

/** 헤더의 연도·주최 드롭다운 */
const Sel: React.FC<{ rect: Rect; label: string }> = ({ rect, label }) => (
  <span style={{
    ...boxOf(rect), boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 6, border: '1px solid var(--hair)', background: 'var(--bg)',
    padding: '0 6px', fontSize: 9.5, color: 'var(--fg-muted)',
  }}>
    {label}<i style={{ opacity: 0.5 }}>▾</i>
  </span>
);

/** 창 안 가로 구분선 */
const Rule: React.FC<{ x: number; y: number; w: number }> = ({ x, y, w }) => (
  <i style={{ position: 'absolute', left: x, top: y, width: w, height: 1, background: 'var(--hair-2)' }} />
);

/** 상세 모달 머리의 배지 줄 — 영역 · 주최 · N년째 · 상태 */
const DetailBadges: React.FC<{ x: number; y: number; generation?: number }> = ({ x, y, generation }) => (
  <span style={{ position: 'absolute', left: x, top: y, display: 'flex', alignItems: 'center', gap: 6 }}>
    <Pill label={AREA.club.label} fg={AREA.club.fg} bg={AREA.club.bg} bd={AREA.club.bd} />
    <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
      <span style={{ color: 'var(--fg-faint)' }}>[동아리]</span> 융합과학반
    </span>
    {generation && (
      <Pill label={`${generation}년째`} fg={LINEAGE.fg} bg={LINEAGE.bg} bd={LINEAGE.bd} />
    )}
    <Pill label="완료" fg="#065f46" bg="#d1fae5" bd="#6ee7b7" />
  </span>
);

/* ══ ① 찾기 — 분야 타일 → 목록 → 상세 ══════════════════════════════════════
   이 화면의 성격은 "검색"이 아니라 **좁혀 들어가기**다. 그래서 타일이 왼쪽 레일로
   옮겨가고 오른쪽에 목록이 열리는 그 전환을 한 창 안에서 그대로 보여 준다. */

const F_W1: Rect = { x: 26, y: 56, w: 560, h: 384 };
const F_TILE = inWindow(F_W1, { x: 12, y: 84, w: 122, h: 112 }, CH);   // 생명과학 타일(그리드)
const F_ROW = inWindow(F_W1, { x: 140, y: 110, w: 408, h: 44 }, CH);   // 목록 첫 행
const F_W2: Rect = { x: 380, y: 214, w: 540, h: 300 };

const F = { W1: 0.25, TILE: 1.7, ROW: 4.0, W2: 4.2, END: 9.4 };

/** 첫 화면 타일 — 이름과 개수만 다르고 색은 실제 화면과 같은 함수로 나온다 */
const FIELDS: [string, number][] = [
  ['생명과학', 6], ['인공지능', 4], ['교육', 3], ['환경', 3],
  ['간호·보건', 2], ['사회복지', 2], ['체육', 1], ['분야 미지정', 1],
];

export const SceneFind: React.FC = () => {
  const t = useSceneTime();
  const picked = t > F.TILE;
  const tone = getCategoryTone('생명과학');

  return (
    <>
      <Band t={t}>① <Hi>분야 타일</Hi>로 좁힌다 — 타일 → 활동 목록 → 상세</Band>

      <AppWindow
        kind="browser" url="spacekijun / 창의적 체험활동" badge="①"
        style={{ ...boxOf(F_W1), ...popIn(t, F.W1), ...dimAfter(t, F.W2) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* ── 헤더 ── */}
          <ScopeBar active={SCOPE.browse} x={12} y={10} />
          <Field rect={{ x: 238, y: 10, w: 142, h: 24 }}>
            <span style={{ fontSize: 9.5 }}>활동 이름 · 내용 · 장소</span>
          </Field>
          <Btn rect={{ x: 386, y: 10, w: 84, h: 24 }} label="＋ 활동 기록" />
          <Btn rect={{ x: 476, y: 10, w: 68, h: 24 }} label="제안하기" tone="ghost" />
          <Rule x={12} y={42} w={532} />
          <AreaChips x={12} y={50} counts={[12, 5, 6, 1]} />
          <Sel rect={{ x: 408, y: 50, w: 66, h: 20 }} label="전체 연도" />
          <Sel rect={{ x: 478, y: 50, w: 66, h: 20 }} label="전체 주최" />

          {/* ── 본문: 타일 그리드 ↔ 레일 + 목록 ── */}
          {!picked ? (
            FIELDS.map(([label, count], i) => (
              <Tile
                key={label}
                rect={{ x: 12 + (i % 4) * 132, y: 84 + Math.floor(i / 4) * 122, w: 122, h: 112 }}
                label={label} count={count}
                flash={label === '생명과학' ? clickFlash(t, F.TILE) : 0}
              />
            ))
          ) : (
            <div style={{ position: 'absolute', inset: 0, ...popIn(t, F.TILE, 0.5) }}>
              {/* 레일 — 타일이 왼쪽으로 옮겨간 모습. 고른 타일만 크고 밝다 */}
              <span style={{
                ...boxOf({ x: 12, y: 84, w: 116, h: 24 }), boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', gap: 5, padding: '0 8px',
                borderRadius: 7, border: '1px solid var(--hair)', background: 'var(--bg)',
                fontSize: 10, color: 'var(--fg-muted)',
              }}>▦ 전체 분야</span>
              <Tile rect={{ x: 12, y: 114, w: 116, h: 32 }} label="생명과학" count={6} mode="rail" selected />
              {FIELDS.slice(1, 5).map(([label, count], i) => (
                <Tile key={label} rect={{ x: 12, y: 152 + i * 28, w: 116, h: 24 }}
                      label={label} count={count} mode="rail" />
              ))}
              <Note x={12} y={268}>…</Note>

              {/* 목록 패널 — 왼쪽 색 띠가 레일의 연결 돌기와 같은 색이다 */}
              <span style={{
                ...boxOf({ x: 140, y: 84, w: 408, h: 204 }),
                borderRadius: 10, border: '1px solid var(--hair)', background: 'var(--bg)',
                overflow: 'hidden',
              }}>
                <i style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: tone.accent }} />
                <span style={{
                  ...boxOf({ x: 0, y: 0, w: 408, h: 26 }), boxSizing: 'border-box',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 10px 0 13px', borderBottom: '1px solid var(--hair-2)',
                }}>
                  <b style={{ fontSize: 11.5, color: 'var(--fg)' }}>생명과학</b>
                  <span style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>활동 6건</span>
                </span>
                <ActivityRow rect={{ x: 0, y: 26, w: 408, h: 44 }} area="club" generation={3} mine
                             name="혈액형 판별 실험" meta="2026. 4/12 · 융합과학반 · 홍시우" people={17}
                             flash={clickFlash(t, F.ROW)} />
                <ActivityRow rect={{ x: 0, y: 70, w: 408, h: 44 }} area="autonomy_career"
                             name="의료 진로 탐색 캠프" meta="2026. 5/8~5/9 · 2학년부 · 박하늘" people={41} />
                <ActivityRow rect={{ x: 0, y: 114, w: 408, h: 44 }} area="club" generation={2}
                             name="미생물 배양 관찰" meta="2026. 3/20 · 생명탐구반 · 이정민" people={14} />
                <ActivityRow rect={{ x: 0, y: 158, w: 408, h: 44 }} area="service"
                             name="요양원 배식 봉사" meta="2026. 6/1 · 봉사동아리 · 최시우" people={9} />
              </span>
            </div>
          )}
        </div>
      </AppWindow>

      {/* ── 상세 모달 ── */}
      {t > F.W2 - 0.2 && (
        <AppWindow
          kind="app" title="혈액형 판별 실험" badge="②"
          style={{ ...boxOf(F_W2), ...popIn(t, F.W2), zIndex: 3 }}
        >
          <div style={{ position: 'absolute', inset: 0 }}>
            <DetailBadges x={14} y={10} generation={3} />
            <DetailTabs x={14} y={36} active={0} counts={[null, 17, 3, null]} />
            <Sec x={14} y={70}>내용</Sec>
            <Note x={14} y={86} w={500}>
              A·B 항원 응집 반응으로 혈액형을 판별하고, 온도 조건을 바꿔 재현성을 확인했다.
            </Note>
            <Sec x={14} y={130}>언제 · 어디서</Sec>
            <span style={{ position: 'absolute', left: 14, top: 148, display: 'flex', gap: 28, fontSize: 10.5 }}>
              {[['기간', '2026. 4/12'], ['장소', '제2과학실'], ['규모', '동아리']].map(([k, v]) => (
                <span key={k}>
                  <span style={{ color: 'var(--fg-faint)', fontSize: 9.5 }}>{k}</span>
                  <b style={{ display: 'block', color: 'var(--fg)', fontWeight: 600 }}>{v}</b>
                </span>
              ))}
            </span>
            <Rule x={0} y={210} w={540} />
            <Btn rect={{ x: 14, y: 222, w: 60, h: 26 }} label="삭제" tone="ghost" />
            <Btn rect={{ x: 80, y: 222, w: 76, h: 26 }} label="이어가기" tone="ghost" />
            <Btn rect={{ x: 396, y: 222, w: 60, h: 26 }} label="수정" tone="ghost" />
            <Btn rect={{ x: 462, y: 222, w: 60, h: 26 }} label="닫기" tone="ghost" />
          </div>
        </AppWindow>
      )}

      <Pointer path={[
        { t: 0.9, x: pctX(320), y: pctY(40) },
        { t: F.TILE, ...centerOf(F_TILE), click: true },
        { t: F.ROW, ...centerOf(F_ROW), click: true },
        { t: F.ROW + 1.6, ...centerOf(F_ROW), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 기록 — 활동에 이름을 붙이고 명단을 상속한다 ══════════════════════════
   폼의 순서가 곧 설계의 주장이다: **무엇을 했는가**가 맨 위, 동아리는 그 아래 맥락 칸. */

const R_W1: Rect = { x: 24, y: 58, w: 352, h: 150 };
const R_NEW = inWindow(R_W1, { x: 240, y: 10, w: 84, h: 24 }, CH);
const R_W2: Rect = { x: 296, y: 100, w: 624, h: 428 };
const R_NAME = inWindow(R_W2, { x: 16, y: 40, w: 388, h: 26 }, CH);
const R_FLD = inWindow(R_W2, { x: 16, y: 214, w: 388, h: 26 }, CH);
const R_LOAD = inWindow(R_W2, { x: 350, y: 288, w: 80, h: 22 }, CH);
const R_SAVE = inWindow(R_W2, { x: 516, y: 344, w: 92, h: 28 }, CH);

const R = {
  W1: 0.25, NEW: 1.3, W2: 1.8, NAME: 2.6, DUP: 4.2,
  FLD: 4.9, FTYPE: 5.15, LOAD: 6.7, CHIPS: 6.95, SAVE: 8.4, END: 9.6,
};
const R_NAME_TEXT = '혈액형 판별 실험';
const R_FLD_TEXT = '생명과학, 간호·보건';

export const SceneRecord: React.FC = () => {
  const t = useSceneTime();
  const name = typed(t, R_NAME_TEXT, R.NAME, 9);
  const fields = typed(t, R_FLD_TEXT, R.FTYPE, 10);
  const loaded = t > R.CHIPS;
  const saved = t > R.SAVE;

  return (
    <>
      <Band t={t}>② <Hi>활동 기록</Hi> — 이름을 붙이고, 동아리 명단을 한 번에 불러온다</Band>

      <AppWindow
        kind="browser" url="spacekijun / 창의적 체험활동" badge="①"
        style={{ ...boxOf(R_W1), ...popIn(t, R.W1), ...dimAfter(t, R.W2) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <ScopeBar active={SCOPE.browse} x={10} y={10} />
          <Btn rect={{ x: 240, y: 10, w: 84, h: 24 }} label="＋ 활동 기록"
               flash={clickFlash(t, R.NEW)} />
          <Rule x={10} y={42} w={332} />
          <span style={{ position: 'absolute', left: 10, top: 54, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Stub w={300} h={7} /><Stub w={250} h={7} o={0.7} /><Stub w={280} h={7} o={0.5} />
          </span>
        </div>
      </AppWindow>

      <AppWindow
        kind="app" title="활동 기록" badge="②"
        style={{ ...boxOf(R_W2), ...popIn(t, R.W2), zIndex: 3 }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <Sec x={16} y={10}>무엇을 했는가</Sec>

          <Lab x={16} y={26}>활동 이름 <span style={{ color: '#e11d48' }}>*</span></Lab>
          <Field rect={{ x: 16, y: 40, w: 388, h: 26 }} flash={clickFlash(t, R.NAME - 0.1, 0.9)}>
            <span style={{ color: 'var(--fg)', fontSize: 11.5 }}>{name}</span>
          </Field>

          <Lab x={16} y={74}>영역</Lab>
          <Lab x={212} y={74}>주최 동아리 <span style={{ color: 'var(--fg-faint)' }}>(선택 · 여러 곳 가능)</span></Lab>
          <Field rect={{ x: 16, y: 88, w: 186, h: 26 }}>
            <span style={{ color: AREA.club.fg, fontSize: 11.5, fontWeight: 600 }}>동아리</span>
          </Field>
          <Field rect={{ x: 212, y: 88, w: 250, h: 26 }}>
            <span style={{ color: 'var(--fg)', fontSize: 11.5 }}>융합과학반</span>
          </Field>

          {/* 중복 감지 — 같은 활동을 두 번 만들지 않게 한다. 이름을 적는 동안 뜬다 */}
          {t > R.DUP && (
            <span style={{
              ...boxOf({ x: 16, y: 122, w: 592, h: 70 }), boxSizing: 'border-box',
              borderLeft: '2px solid #fcd34d', background: 'rgba(254,252,232,0.85)',
              borderRadius: 4, padding: '7px 10px', ...popIn(t, R.DUP, 0.4),
            }}>
              <b style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: '#b45309' }}>
                비슷한 활동이 이미 있습니다
              </b>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5 }}>
                <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>2025</span>
                <b style={{ fontSize: 11, color: 'var(--fg)' }}>혈액형 판별 실험</b>
                <span style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>융합과학반</span>
                <span style={{
                  borderRadius: 4, border: `1px solid ${LINEAGE.bd}`, background: LINEAGE.bg,
                  color: LINEAGE.fg, padding: '1px 5px', fontSize: 9.5, fontWeight: 600,
                }}>이 활동 이어받기</span>
              </span>
              <span style={{ display: 'block', marginTop: 4, fontSize: 9.5, color: 'var(--fg-muted)' }}>
                같은 해 활동이면 새로 만들지 말고 그 활동에 주최·참여자를 더하세요.
              </span>
            </span>
          )}

          <Lab x={16} y={200}>진로 · 분야 <span style={{ color: 'var(--fg-faint)' }}>(쉼표로 구분해 여러 개)</span></Lab>
          <Field rect={{ x: 16, y: 214, w: 388, h: 26 }} flash={clickFlash(t, R.FLD, 0.9)}>
            <span style={{ color: 'var(--fg)', fontSize: 11.5 }}>{fields}</span>
          </Field>
          <Note x={16} y={246} w={470}>
            여기 적은 분야가 활동 목록의 <b style={{ color: 'var(--fg-muted)' }}>분류 카드</b>가 됩니다.
          </Note>

          <Sec x={16} y={268}>담당 교사 · 참여 학생</Sec>
          <span style={{
            ...boxOf({ x: 16, y: 284, w: 424, h: 30 }), boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', gap: 6, padding: '0 9px',
            borderRadius: 6, border: '1px solid var(--hair)', background: '#f8fafc',
          }}>
            <span style={{ fontSize: 10, color: 'var(--fg-muted)', flex: 1, minWidth: 0 }}>
              <b style={{ color: 'var(--fg)' }}>융합과학반</b> 2026학년도 소속 17명
              {!loaded && <span style={{ color: '#b45309' }}> · 17명 미선택</span>}
            </span>
            <span style={{
              borderRadius: 6, border: '1px solid var(--hair)', background: 'var(--bg)',
              padding: '3px 8px', fontSize: 10, fontWeight: 600, color: 'var(--fg-muted)',
              boxShadow: clickFlash(t, R.LOAD) > 0
                ? `0 0 0 ${5 * clickFlash(t, R.LOAD)}px rgba(79,70,229,0.24)` : undefined,
            }}>명단 불러오기</span>
          </span>

          {loaded && (
            <span style={{
              ...boxOf({ x: 16, y: 320, w: 424, h: 52 }), boxSizing: 'border-box',
              borderRadius: 6, border: '1px solid var(--hair)', padding: '6px 8px',
              ...popIn(t, R.CHIPS, 0.45),
            }}>
              <b style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: 'var(--fg-faint)' }}>
                참여자 17명
              </b>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                {['2-3 한시우', '2-3 박민서', '1-5 이하람', '2-1 윤수아', '3-2 정은채', '외 12명'].map((n) => (
                  <span key={n} style={{
                    borderRadius: 999, border: '1px solid var(--hair)', background: 'var(--bg)',
                    padding: '1px 6px', fontSize: 9.5, color: 'var(--fg-muted)',
                  }}>{n}</span>
                ))}
              </span>
            </span>
          )}

          <Btn rect={{ x: 516, y: 344, w: 92, h: 28 }}
               label={saved ? '✓ 기록됨' : '활동 기록'} tone={saved ? 'ok' : 'primary'}
               flash={clickFlash(t, R.SAVE)} />
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.8, x: pctX(300), y: pctY(40) },
        { t: R.NEW, ...centerOf(R_NEW), click: true },
        { t: R.NAME - 0.1, ...centerOf(R_NAME), click: true },
        { t: R.FLD, ...centerOf(R_FLD), click: true },
        { t: R.LOAD, ...centerOf(R_LOAD), click: true },
        { t: R.SAVE, ...centerOf(R_SAVE), click: true },
        { t: R.END, ...centerOf(R_SAVE), hide: true },
      ]} />
    </>
  );
};

/* ══ ③ 성찰 — 학생이 쓰고 교사가 답한다 ═════════════════════════════════════ */

const P_W: Rect = { x: 128, y: 66, w: 700, h: 384 };
const P_TAB = inWindow(P_W, { x: 116, y: 36, w: 58, h: 20 }, CH);
const P_TEXT = inWindow(P_W, { x: 28, y: 94, w: 644, h: 44 }, CH);
const P_VIS = inWindow(P_W, { x: 28, y: 146, w: 92, h: 24 }, CH);
const P_SEND = inWindow(P_W, { x: 582, y: 146, w: 78, h: 24 }, CH);

const P = { W: 0.25, TAB: 1.3, TYPE: 2.2, VIS: 4.7, SEND: 5.8, POST: 6.1, CMT: 7.5, END: 9.4 };
const P_TEXT_BODY = '혈청 반응이 예상과 달라 온도 조건을 바꿔 다시 실험했다.';

export const SceneReflect: React.FC = () => {
  const t = useSceneTime();
  const body = typed(t, P_TEXT_BODY, P.TYPE, 16);
  const posted = t > P.POST;

  return (
    <>
      <Band t={t}>③ 활동 상세의 <Hi>기록·성찰</Hi> — 학생이 남기고 선생님이 답한다</Band>

      <AppWindow
        kind="app" title="혈액형 판별 실험" badge=""
        style={{ ...boxOf(P_W), ...popIn(t, P.W) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <DetailBadges x={16} y={10} generation={3} />
          <DetailTabs x={16} y={36} active={2} flash={clickFlash(t, P.TAB)}
                      counts={[null, 17, posted ? 4 : 3, null]} />

          {/* 작성 — 학생에게만 보이는 자리 */}
          <span style={{
            ...boxOf({ x: 16, y: 66, w: 668, h: 116 }), boxSizing: 'border-box',
            borderRadius: 9, border: '1px solid var(--hair)', background: '#f8fafc', padding: 10,
          }}>
            <b style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: 'var(--fg-faint)' }}>
              ✎ 성찰 남기기
            </b>
            <span style={{
              ...boxOf({ x: 12, y: 28, w: 644, h: 44 }), boxSizing: 'border-box',
              borderRadius: 7, border: `1px solid ${clickFlash(t, P.TYPE - 0.15) > 0 ? 'var(--primary)' : 'var(--hair)'}`,
              background: 'var(--bg)', padding: '7px 9px', fontSize: 11.5, color: 'var(--fg)',
              lineHeight: 1.5,
            }}>{body}</span>
            <span style={{
              ...boxOf({ x: 12, y: 80, w: 92, h: 24 }), boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderRadius: 6, border: '1px solid var(--hair)', background: 'var(--bg)',
              padding: '0 7px', fontSize: 10, color: 'var(--fg)',
              boxShadow: clickFlash(t, P.VIS) > 0
                ? `0 0 0 ${5 * clickFlash(t, P.VIS)}px rgba(79,70,229,0.24)` : undefined,
            }}>함께한 사람<i style={{ opacity: 0.5 }}>▾</i></span>
            <Note x={112} y={86} w={430}>
              선생님들과 이 활동을 함께한 친구들이 볼 수 있습니다.
            </Note>
            <Btn rect={{ x: 566, y: 80, w: 78, h: 24 }} label="남기기" flash={clickFlash(t, P.SEND)} />
          </span>

          {/* 남긴 성찰 + 선생님 댓글 */}
          {posted && (
            <span style={{
              ...boxOf({ x: 16, y: 194, w: 668, h: 96 }), boxSizing: 'border-box',
              borderRadius: 9, border: '1px solid var(--hair)', padding: 10,
              ...popIn(t, P.POST, 0.45),
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Pill label="성찰" fg="#3730a3" bg="#eef2ff" bd="#c7d2fe" />
                <Pill label="함께한 사람" fg="#475569" bg="#f8fafc" bd="#e2e8f0" />
                <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>2-3 한시우 · 방금</span>
              </span>
              <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--fg)' }}>
                {P_TEXT_BODY}
              </span>
              {t > P.CMT && (
                <span style={{
                  ...boxOf({ x: 12, y: 58, w: 644, h: 26 }), boxSizing: 'border-box',
                  display: 'flex', alignItems: 'center', gap: 6,
                  borderLeft: '2px solid var(--primary)', background: '#f8fafc',
                  borderRadius: 4, padding: '0 8px', ...popIn(t, P.CMT, 0.4),
                }}>
                  <span style={{ fontSize: 9.5, color: 'var(--primary)', fontWeight: 700 }}>홍시우 선생님</span>
                  <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
                    온도 말고 혈청 농도도 바꿔 보면 어땠을까요?
                  </span>
                </span>
              )}
            </span>
          )}

          <Note x={16} y={302} w={640}>
            졸업 후에도 글은 남고 이름만 별칭으로 바뀝니다. 여기 적은 내용이 생활기록부
            창의적 체험활동 기록의 근거가 됩니다.
          </Note>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(380), y: pctY(30) },
        { t: P.TAB, ...centerOf(P_TAB), click: true },
        { t: P.TYPE - 0.15, ...centerOf(P_TEXT), click: true },
        { t: P.VIS, ...centerOf(P_VIS), click: true },
        { t: P.SEND, ...centerOf(P_SEND), click: true },
        { t: P.SEND + 1.4, ...centerOf(P_SEND), hide: true },
      ]} />
    </>
  );
};

/* ══ ④ 이어가기 — 계보는 동아리가 아니라 활동에 붙는다 ══════════════════════ */

const L_W1: Rect = { x: 40, y: 56, w: 600, h: 400 };
const L_TAB = inWindow(L_W1, { x: 185, y: 36, w: 24, h: 20 }, CH);
const L_CONT = inWindow(L_W1, { x: 78, y: 330, w: 78, h: 26 }, CH);
const L_W2: Rect = { x: 430, y: 216, w: 490, h: 296 };

const L = { W1: 0.25, TAB: 1.4, TREE: 1.6, CONT: 4.8, W2: 5.1, END: 9.6 };

/** 계보 한 마디 */
const Node: React.FC<{
  x: number; y: number; year: string; name: string; gen: number; now?: boolean;
}> = ({ x, y, year, name, gen, now }) => (
  <span style={{
    position: 'absolute', left: x, top: y,
    display: 'flex', alignItems: 'center', gap: 7,
  }}>
    <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{year}</span>
    <b style={{ fontSize: 11.5, color: now ? LINEAGE.fg : 'var(--fg)' }}>{name}</b>
    <Pill label={`${gen}년째`} fg={LINEAGE.fg} bg={LINEAGE.bg} bd={LINEAGE.bd} />
    {now && <span style={{ fontSize: 9.5, color: LINEAGE.fg }}>지금 보는 활동</span>}
  </span>
);

export const SceneLineage: React.FC = () => {
  const t = useSceneTime();
  const onLineage = t > L.TREE;

  return (
    <>
      <Band t={t}>④ <Hi>계보</Hi> — 해마다 이어지고, 다음 해는 제안으로 시작한다</Band>

      <AppWindow
        kind="app" title="혈액형과 수혈 안전" badge="①"
        style={{ ...boxOf(L_W1), ...popIn(t, L.W1), ...dimAfter(t, L.W2) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <DetailBadges x={14} y={10} generation={3} />
          <DetailTabs x={14} y={36} active={onLineage ? 3 : 0} flash={clickFlash(t, L.TAB)}
                      counts={[null, 17, 3, null]} />

          {onLineage ? (
            <div style={{ position: 'absolute', inset: 0, ...popIn(t, L.TREE, 0.45) }}>
              <Note x={14} y={70} w={560}>
                이 활동이 해마다 어떻게 이어지고 갈라져 왔는지 보여줍니다. 후배가 이어받을 때
                무엇이 이미 시도됐는지 알 수 있는 자리입니다.
              </Note>
              <span style={{
                ...boxOf({ x: 14, y: 106, w: 570, h: 112 }),
                borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--bg)',
              }}>
                <Node x={12} y={12} year="2024" name="혈액형 판별 실험" gen={1} />
                <i style={{ position: 'absolute', left: 22, top: 32, width: 1, height: 22, background: LINEAGE.bd }} />
                <Node x={30} y={50} year="2025" name="혈액형 판별 실험 II" gen={2} />
                <i style={{ position: 'absolute', left: 40, top: 70, width: 1, height: 22, background: LINEAGE.bd }} />
                <Node x={48} y={84} year="2026" name="혈액형과 수혈 안전" gen={3} now />
              </span>
              <span style={{
                ...boxOf({ x: 14, y: 232, w: 570, h: 40 }), boxSizing: 'border-box',
                borderLeft: `2px solid ${LINEAGE.bd}`, background: LINEAGE.bg,
                borderRadius: 4, padding: '8px 10px', fontSize: 10.5, color: 'var(--fg)',
              }}>
                <b style={{ color: LINEAGE.fg, fontWeight: 700 }}>이번에 달라진 점 </b>
                판별에서 멈추지 않고 수혈 부작용 사례까지 조사해 발표로 이었습니다.
              </span>
            </div>
          ) : (
            <span style={{ position: 'absolute', left: 14, top: 74, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Stub w={520} h={7} /><Stub w={470} h={7} o={0.7} /><Stub w={500} h={7} o={0.5} />
            </span>
          )}

          <Rule x={0} y={316} w={600} />
          <Btn rect={{ x: 14, y: 330, w: 56, h: 26 }} label="삭제" tone="ghost" />
          <span style={{
            ...boxOf({ x: 78, y: 330, w: 78, h: 26 }), boxSizing: 'border-box',
            display: 'grid', placeItems: 'center', borderRadius: 8,
            border: `1px solid ${LINEAGE.bd}`, background: t > L.CONT ? LINEAGE.bg : 'transparent',
            color: LINEAGE.fg, fontSize: 11.5, fontWeight: 650,
            boxShadow: clickFlash(t, L.CONT) > 0
              ? `0 0 0 ${6 * clickFlash(t, L.CONT)}px rgba(162,28,175,0.22)` : undefined,
          }}>이어가기</span>
          <Btn rect={{ x: 452, y: 330, w: 56, h: 26 }} label="수정" tone="ghost" />
          <Btn rect={{ x: 516, y: 330, w: 56, h: 26 }} label="닫기" tone="ghost" />
        </div>
      </AppWindow>

      {t > L.W2 - 0.2 && (
        <AppWindow
          kind="app" title="이 활동 이어가기" badge="②"
          style={{ ...boxOf(L_W2), ...popIn(t, L.W2), zIndex: 3 }}
        >
          <div style={{ position: 'absolute', inset: 0 }}>
            <span style={{
              ...boxOf({ x: 14, y: 12, w: 462, h: 46 }), boxSizing: 'border-box',
              borderLeft: `2px solid ${LINEAGE.bd}`, background: LINEAGE.bg,
              borderRadius: 4, padding: '7px 10px', fontSize: 10.5, color: 'var(--fg-muted)',
            }}>
              이어받을 활동 <b style={{ color: 'var(--fg)' }}>혈액형과 수혈 안전</b>
              <span style={{ color: 'var(--fg-faint)' }}> (2026학년도)</span>
              <span style={{ display: 'block', marginTop: 3, fontSize: 9.5, color: 'var(--fg-faint)' }}>
                개설되면 그 활동의 다음 연차로 이어집니다.
              </span>
            </span>
            <Sec x={14} y={72}>무엇을 하고 싶은가</Sec>
            <Lab x={14} y={88}>제안 제목 <span style={{ color: '#e11d48' }}>*</span></Lab>
            <Field rect={{ x: 14, y: 102, w: 330, h: 26 }}>
              <span style={{ color: 'var(--fg)', fontSize: 11.5 }}>혈액형과 수혈 안전 이어가기</span>
            </Field>
            <Lab x={14} y={136}>내용 <span style={{ color: '#e11d48' }}>*</span></Lab>
            <span style={{
              ...boxOf({ x: 14, y: 150, w: 462, h: 46 }), boxSizing: 'border-box',
              borderRadius: 7, border: '1px solid var(--hair)', padding: '7px 9px',
              fontSize: 10.5, color: 'var(--fg-muted)', lineHeight: 1.5,
            }}>
              무엇을 그대로 두고 무엇을 바꾸고 싶은지 적으면 선생님이 판단하기 쉽습니다.
            </span>
            <Btn rect={{ x: 386, y: 208, w: 90, h: 28 }} label="제안하기" />
          </div>
        </AppWindow>
      )}

      <Pointer path={[
        { t: 0.9, x: pctX(300), y: pctY(30) },
        { t: L.TAB, ...centerOf(L_TAB), click: true },
        { t: L.CONT, ...centerOf(L_CONT), click: true },
        { t: L.CONT + 1.4, ...centerOf(L_CONT), hide: true },
      ]} />
    </>
  );
};
