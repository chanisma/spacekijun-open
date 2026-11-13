/**
 * 수시 지원 안내 — 절차 시연 씬 4편.
 *
 * **학생이 보는 화면을 그린다**(2026-09-04 사용자 결정). 학생 뷰는 `Layout fullWidth` +
 * `WishlistView` + 우측 성적 패널이고 **학생 목록(왼쪽)이 없다** — 그건 교사·admin 경로다.
 *
 * 목업 근거(라벨은 실제 화면 문구): `WishlistView`("수시 지원 관리") ·
 * `WishlistList`(지원희망/관심대학 두 층 · "비어 있음" · `N지망` · [상세][지원희망↑][삭제]) ·
 * `AddProgramDialog`("대학명·학과명 검색 …" · "추가됨" · 푸터 [완료] + N/15) ·
 * `types.ts`(`FIT_LABELS` 안정·적정·소신·위험 / `FIT_COLORS`) ·
 * `csat.ts`(`CSAT_LABELS` 충족·미충족·판정불가) · `comparisonRows.ts`(지원 수준 · 내 내신 vs 70%컷).
 * **화면 문구가 바뀌면 이 목업도 함께 고쳐야 한다.**
 */
import React from 'react';
import {
  AppWindow, Caret, Pointer, clickFlash, dimAfter, interpolate,
  popIn, typed, typedDoneAt, useSceneTime,
} from '@/lib/walkthrough';
import {
  boxOf, centerOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect,
} from '@/components/walkthrough/stageCoords';
import { Band, Btn, Field, Hi, Pill, Stub } from '@/components/walkthrough/atoms';

/** 적합도 색 — 실제 `FIT_COLORS` 와 같은 의미 색 */
const FIT = {
  safe: { label: '안정', fg: '#047857', bg: '#ecfdf5', bd: '#a7f3d0' },
  fit: { label: '적정', fg: '#1d4ed8', bg: '#eff6ff', bd: '#bfdbfe' },
  reach: { label: '소신', fg: '#b45309', bg: '#fffbeb', bd: '#fde68a' },
  danger: { label: '위험', fg: '#b91c1c', bg: '#fef2f2', bd: '#fecaca' },
};

/** 목록 한 줄 — 지원희망·관심대학이 같은 모양이라 한 부품으로 그린다 */
const Row: React.FC<{
  rect: Rect;
  /** 지망 번호. null 이면 관심대학(하트 자리) */
  rank: number | null;
  univ: string; dept: string; adm: string;
  fit: keyof typeof FIT;
  grade: string; comp: string;
  apply?: boolean;
  glow?: number;
}> = ({ rect, rank, univ, dept, adm, fit, grade, comp, apply = true, glow = 0 }) => (
  <span style={{
    ...boxOf(rect),
    display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
    borderBottom: '1px solid var(--hair-2)',
    // 지원희망은 옅은 브랜드 톤 — 배경색이 두 층을 가른다
    background: apply ? 'color-mix(in srgb, var(--primary) 4%, transparent)' : 'transparent',
    boxShadow: glow > 0 ? `inset 0 0 0 2px rgba(79,70,229,${0.35 * glow})` : undefined,
  }}>
    <span style={{
      width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center',
      fontSize: 9.5, fontWeight: 800,
      background: apply ? 'var(--primary)' : 'var(--hair)',
      color: apply ? '#fff' : 'var(--fg-muted)',
    }}>{rank ?? '♡'}</span>
    <Pill label={FIT[fit].label} {...FIT[fit]} />
    <span style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{univ}</span>
      <span style={{ fontSize: 10.5, color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>{dept}</span>
      <span style={{ fontSize: 9.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap' }}>{adm}</span>
    </span>
    <span style={{ width: 84, textAlign: 'right', fontSize: 10.5, fontWeight: 650, whiteSpace: 'nowrap' }}>{grade}</span>
    <span style={{ width: 52, textAlign: 'right', fontSize: 10, color: 'var(--fg-muted)' }}>{comp}</span>
  </span>
);

/** 빈 지망 자리 — 6회 제한이 곧 전략이라 잔여 칸이 먼저 읽혀야 한다 */
const EmptyRow: React.FC<{ rect: Rect; rank: number }> = ({ rect, rank }) => (
  <span style={{
    ...boxOf(rect),
    display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
    borderBottom: '1px solid var(--hair-2)',
    background: 'color-mix(in srgb, var(--primary) 4%, transparent)',
  }}>
    <span style={{
      width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center',
      fontSize: 9.5, fontWeight: 800, background: 'var(--hair)', color: 'var(--fg-muted)',
    }}>{rank}</span>
    <span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>＋ 비어 있음</span>
  </span>
);

/* ══ ① 대학 담기 ════════════════════════════════════════════════════════════
   구도: 목록 → 추가 모달 릴레이. 이 모달이 **담아도 닫히지 않는다**는 것이 이 화면의
   중요한 성질이라(여러 곳을 담는 것이 정상 사용법) 두 번 담는 장면까지 보여 준다. */

const S1_W1: Rect = { x: 40, y: 62, w: 420, h: 250 };
const S1_ADD = inWindow(S1_W1, { x: 300, y: 14, w: 106, h: 26 }, CH);
const S1_W2: Rect = { x: 380, y: 176, w: 520, h: 330 };
const S1_SEARCH = inWindow(S1_W2, { x: 16, y: 14, w: 488, h: 28 }, CH);
const S1_TAKE1 = inWindow(S1_W2, { x: 428, y: 84, w: 76, h: 24 }, CH);
const S1_TAKE2 = inWindow(S1_W2, { x: 428, y: 120, w: 76, h: 24 }, CH);
const S1_DONE_BTN = inWindow(S1_W2, { x: 400, y: 252, w: 104, h: 30 }, CH);

const S1 = {
  W1_IN: 0.25, CLICK_ADD: 1.4, W2_IN: 2.0, SEARCH: 2.6, TYPE: 2.9,
  TAKE1: 5.4, TAKE2: 6.6, CLOSE: 8.0, DONE: 9.0,
};
const S1_QUERY = '간호';

export const SceneAdd: React.FC = () => {
  const t = useSceneTime();
  const q = typed(t, S1_QUERY, S1.TYPE, 8);
  const typing = t > S1.TYPE && t < typedDoneAt(S1_QUERY, S1.TYPE, 8) + 0.8;
  const listed = t > S1.TYPE + 1.1;
  const took1 = t > S1.TAKE1;
  const took2 = t > S1.TAKE2;
  const count = (took1 ? 1 : 0) + (took2 ? 1 : 0);

  const hit = (y: number, univ: string, dept: string, taken: boolean, flash: number) => (
    <span key={univ} style={{
      ...boxOf({ x: 16, y, w: 488, h: 30 }),
      display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px',
      borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--bg)',
    }}>
      <span style={{ fontSize: 11, fontWeight: 700 }}>{univ}</span>
      <span style={{ fontSize: 10.5, color: 'var(--fg-muted)' }}>{dept}</span>
      <span style={{ marginLeft: 'auto' }}>
        {taken
          ? <Pill label="✓ 추가됨" fg="#047857" bg="#ecfdf5" bd="#a7f3d0" />
          : <span style={{
              width: 76, height: 24, display: 'grid', placeItems: 'center',
              borderRadius: 7, fontSize: 10, fontWeight: 650,
              background: 'var(--primary)', color: '#fff',
              boxShadow: flash > 0 ? `0 0 0 ${5 * flash}px rgba(79,70,229,0.24)` : undefined,
            }}>담기</span>}
      </span>
    </span>
  );

  return (
    <>
      <Band t={t}>① <Hi>대학·학과·전형</Hi>을 검색해 담는다 — 여러 곳을 이어서 담을 수 있다</Band>

      <AppWindow
        kind="browser" url="spacekijun / 수시 지원" badge="①"
        style={{ ...boxOf(S1_W1), ...popIn(t, S1.W1_IN), ...dimAfter(t, S1.W2_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <span style={{ position: 'absolute', left: 12, top: 18, fontSize: 12.5, fontWeight: 700 }}>
            수시 지원 관리
          </span>
          <Btn rect={{ x: 300, y: 14, w: 106, h: 26 }} label="＋ 지원희망 추가" tone="ghost"
               flash={clickFlash(t, S1.CLICK_ADD)} />
          <span style={{
            ...boxOf({ x: 12, y: 58, w: 394, h: 120 }),
            display: 'grid', placeItems: 'center', borderRadius: 10,
            border: '1px dashed var(--hair)', fontSize: 11, color: 'var(--fg-faint)',
            textAlign: 'center', lineHeight: 1.7,
          }}>
            아직 저장한 수시 지원 학교가 없습니다
          </span>
        </div>
      </AppWindow>

      <AppWindow
        kind="app" title="대학 추가" badge="②"
        style={{ ...boxOf(S1_W2), ...popIn(t, S1.W2_IN), zIndex: 3 }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <Field rect={{ x: 16, y: 14, w: 488, h: 28 }} flash={clickFlash(t, S1.SEARCH)}>
            {t > S1.TYPE
              ? <span style={{ color: 'var(--fg)' }}>{q}{typing && <Caret />}</span>
              : <span>대학명·학과명 검색 (예: 간호, 충남대 사회학과)</span>}
          </Field>

          {/* 지역·컷·정렬 필터 — 랜드마크로만 */}
          <span style={{ position: 'absolute', left: 16, top: 50, display: 'flex', gap: 5 }}>
            {['지역', '70%컷', '경쟁률순'].map((f) => (
              <span key={f} style={{
                borderRadius: 999, border: '1px solid var(--hair)', background: 'var(--bg)',
                padding: '2px 9px', fontSize: 9.5, color: 'var(--fg-muted)',
              }}>{f}</span>
            ))}
          </span>

          {listed && (
            <>
              {hit(84, '전북대학교', '간호학과', took1, clickFlash(t, S1.TAKE1))}
              {hit(120, '충남대학교', '간호학과', took2, clickFlash(t, S1.TAKE2))}
              {hit(156, '원광대학교', '간호학과', false, 0)}
              <span style={{
                position: 'absolute', left: 16, top: 196, fontSize: 9.5, color: 'var(--fg-faint)',
              }}>
                담아도 창은 닫히지 않아요 — 검색어와 필터를 그대로 두고 계속 담으세요
              </span>
            </>
          )}

          {/* 푸터 — 스스로 닫히지 않으므로 닫기를 항상 노출한다 */}
          <span style={{ position: 'absolute', left: 16, top: 260, fontSize: 10.5, color: 'var(--fg-muted)' }}>
            관심대학 {count}/15
          </span>
          <Btn rect={{ x: 400, y: 252, w: 104, h: 30 }}
               label={count > 0 ? `완료 (${count}곳 담음)` : '닫기'}
               tone={count > 0 ? 'primary' : 'ghost'}
               flash={clickFlash(t, S1.CLOSE)} />
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(250), y: pctY(40) },
        { t: S1.CLICK_ADD, ...centerOf(S1_ADD), click: true },
        { t: S1.SEARCH, ...centerOf(S1_SEARCH), click: true },
        { t: S1.TAKE1, ...centerOf(S1_TAKE1), click: true },
        { t: S1.TAKE2, ...centerOf(S1_TAKE2), click: true },
        { t: S1.CLOSE, ...centerOf(S1_DONE_BTN), click: true },
        { t: S1.DONE, ...centerOf(S1_DONE_BTN), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 목록 읽기 — 여섯 칸과 적합도 ═════════════════════════════════════════
   구도: 창 하나 크게. 이 화면의 요점은 **여섯 줄을 한눈에 늘어놓고 무엇을 뺄까**이므로,
   목록 전체가 한 화면에 들어오는 것이 곧 설명이다. */

const S2_W: Rect = { x: 70, y: 62, w: 820, h: 430 };
const S2_UP = inWindow(S2_W, { x: 700, y: 268, w: 96, h: 24 }, CH);

const S2 = { W_IN: 0.25, ROWS: 0.9, INTEREST: 2.4, MOVE: 4.4, MOVED: 5.2, END: 7.4 };

export const SceneList: React.FC = () => {
  const t = useSceneTime();
  const moved = t > S2.MOVED;

  return (
    <>
      <Band t={t}>② <Hi>여섯 칸</Hi>과 적합도를 한눈에 — 관심대학은 아래에 담아 두고 비교한다</Band>

      <AppWindow
        kind="app" title="수시 지원 관리"
        style={{ ...boxOf(S2_W), ...popIn(t, S2.W_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <span style={{ position: 'absolute', left: 12, top: 10, fontSize: 10.5, fontWeight: 700 }}>
            지원희망 대학 <span style={{ fontWeight: 400, color: 'var(--fg-faint)' }}>
              {moved ? 4 : 3}/6
            </span>
          </span>

          <span style={{ opacity: interpolate(t, [S2.ROWS, S2.ROWS + 0.5], [0, 1]) }}>
            <Row rect={{ x: 12, y: 30, w: 796, h: 34 }} rank={1}
                 univ="전북대학교" dept="간호학과" adm="일반학생"
                 fit="fit" grade="3.42 vs 3.60" comp="8.4:1" />
            <Row rect={{ x: 12, y: 66, w: 796, h: 34 }} rank={2}
                 univ="충남대학교" dept="간호학과" adm="학생부교과"
                 fit="reach" grade="3.42 vs 3.20" comp="11.2:1" />
            <Row rect={{ x: 12, y: 102, w: 796, h: 34 }} rank={3}
                 univ="원광대학교" dept="간호학과" adm="교과우수자"
                 fit="safe" grade="3.42 vs 4.10" comp="6.1:1" />
            {moved && (
              <span style={{ ...popIn(t, S2.MOVED, 0.45) }}>
                <Row rect={{ x: 12, y: 138, w: 796, h: 34 }} rank={4}
                     univ="군산대학교" dept="간호학과" adm="지역인재"
                     fit="safe" grade="3.42 vs 4.35" comp="4.8:1" />
              </span>
            )}
            <EmptyRow rect={{ x: 12, y: moved ? 174 : 138, w: 796, h: 30 }} rank={moved ? 5 : 4} />
            <EmptyRow rect={{ x: 12, y: moved ? 206 : 170, w: 796, h: 30 }} rank={moved ? 6 : 5} />
          </span>

          {/* 관심대학 — 결정 전 담아 두는 후보 */}
          {t > S2.INTEREST && (
            <span style={{ ...popIn(t, S2.INTEREST, 0.5) }}>
              <span style={{
                position: 'absolute', left: 12, top: moved ? 246 : 210,
                fontSize: 10.5, fontWeight: 700,
              }}>
                관심대학 <span style={{ fontWeight: 400, color: 'var(--fg-faint)' }}>
                  {moved ? 1 : 2}곳
                </span>
              </span>
              {!moved && (
                <span style={{ position: 'relative' }}>
                  <Row rect={{ x: 12, y: 232, w: 796, h: 34 }} rank={null}
                       univ="군산대학교" dept="간호학과" adm="지역인재"
                       fit="safe" grade="3.42 vs 4.35" comp="4.8:1" apply={false}
                       glow={clickFlash(t, S2.MOVE)} />
                  <span style={{
                    ...boxOf({ x: 700, y: 268, w: 96, h: 24 }),
                    display: 'grid', placeItems: 'center', borderRadius: 7,
                    border: '1px solid var(--primary)', color: 'var(--primary)',
                    background: 'var(--bg)', fontSize: 9.5, fontWeight: 650,
                    boxShadow: clickFlash(t, S2.MOVE) > 0
                      ? `0 0 0 5px rgba(79,70,229,0.24)` : undefined,
                  }}>지원희망 ↑</span>
                </span>
              )}
              <Row rect={{ x: 12, y: moved ? 268 : 300, w: 796, h: 34 }} rank={null}
                   univ="한서대학교" dept="간호학과" adm="일반학생"
                   fit="danger" grade="3.42 vs 2.90" comp="14.7:1" apply={false} />
            </span>
          )}

          <span style={{
            position: 'absolute', left: 12, bottom: 10, fontSize: 9.5, color: 'var(--fg-faint)',
          }}>
            적합도는 <b style={{ color: FIT.safe.fg }}>안정</b> ·{' '}
            <b style={{ color: FIT.fit.fg }}>적정</b> ·{' '}
            <b style={{ color: FIT.reach.fg }}>소신</b> ·{' '}
            <b style={{ color: FIT.danger.fg }}>위험</b> 네 단계 — 내 내신을 합격자 컷과 견준 결과예요
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.4, x: pctX(500), y: pctY(30) },
        { t: S2.MOVE, ...centerOf(S2_UP), click: true },
        { t: S2.END, ...centerOf(S2_UP), hide: true },
      ]} />
    </>
  );
};

/* ══ ③ 상세로 근거 확인 ═════════════════════════════════════════════════════
   여기서 말해야 할 것은 숫자가 아니라 **숫자를 못 낼 때 무엇을 보여 주는가**다
   (전형 반영 내신 보류 → '내 내신 평균'). 그걸 모르면 라벨이 바뀐 걸 눈치채지 못한다. */

const S3_W: Rect = { x: 180, y: 62, w: 600, h: 430 };

const S3 = { W_IN: 0.25, GRADE: 1.4, WITHHELD: 3.0, CSAT: 4.4, TREND: 5.8, END: 8.0 };

export const SceneDetail: React.FC = () => {
  const t = useSceneTime();

  return (
    <>
      <Band t={t}>③ <Hi>상세</Hi>에서 그 숫자가 어떻게 나왔는지 확인한다</Band>

      <AppWindow
        kind="app" title="전북대학교 · 간호학과 · 일반학생"
        style={{ ...boxOf(S3_W), ...popIn(t, S3.W_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* 내 내신 vs 컷 */}
          <span style={{
            ...boxOf({ x: 16, y: 14, w: 568, h: 74 }),
            borderRadius: 10, border: '1px solid var(--hair)', padding: 12,
            display: 'flex', alignItems: 'center', gap: 14,
            opacity: interpolate(t, [S3.GRADE - 0.4, S3.GRADE], [0, 1]),
          }}>
            <Pill label="적정" {...FIT.fit} style={{ fontSize: 12, padding: '3px 11px' }} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>전형 반영 내신 vs 합격자 70%컷</span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>
                3.42 <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg-muted)' }}>vs 3.60</span>
              </span>
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--fg-faint)', textAlign: 'right', lineHeight: 1.6 }}>
              50%컷 3.20 · 25%컷 2.80(추정)<br />낮을수록 우수
            </span>
          </span>

          {/* 보류 안내 — 이 기능의 가장 중요한 정직함 */}
          {t > S3.WITHHELD && (
            <span style={{
              ...boxOf({ x: 16, y: 100, w: 568, h: 62 }),
              borderRadius: 10, border: '1px solid #fcd34d', background: '#fffbeb',
              padding: 11, display: 'flex', flexDirection: 'column', gap: 4,
              ...popIn(t, S3.WITHHELD, 0.45),
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>
                전형 반영 내신을 계산하지 못한 경우
              </span>
              <span style={{ fontSize: 10, lineHeight: 1.6, color: '#a16207' }}>
                반영 방법이 복잡해 정확히 재현할 수 없으면 <b>숫자를 지어내지 않고 보류</b>하고,
                라벨이 <b>&lsquo;내 내신 평균&rsquo;</b>으로 바뀌며 사유를 함께 적어요.
              </span>
            </span>
          )}

          {/* 수능최저 */}
          {t > S3.CSAT && (
            <span style={{ ...popIn(t, S3.CSAT, 0.45) }}>
              <span style={{ position: 'absolute', left: 16, top: 176, fontSize: 10.5, fontWeight: 700 }}>
                수능 최저학력기준
              </span>
              <span style={{
                ...boxOf({ x: 16, y: 196, w: 568, h: 46 }),
                display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
                borderRadius: 9, border: '1px solid var(--hair)',
              }}>
                <span style={{ fontSize: 10.5, color: 'var(--fg-muted)' }}>국·수·영·탐 중 2개 합 6 이내</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>6월</span>
                  <Pill label="충족" fg="#047857" bg="#ecfdf5" bd="#a7f3d0" />
                  <span style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>9월</span>
                  <Pill label="미충족" fg="#b91c1c" bg="#fef2f2" bd="#fecaca" />
                </span>
              </span>
            </span>
          )}

          {/* 최근 추이 */}
          {t > S3.TREND && (
            <span style={{ ...popIn(t, S3.TREND, 0.45) }}>
              <span style={{ position: 'absolute', left: 16, top: 256, fontSize: 10.5, fontWeight: 700 }}>
                최근 3개년 추이
              </span>
              {[0, 1].map((i) => (
                <span key={i} style={{
                  ...boxOf({ x: 16 + i * 292, y: 276, w: 276, h: 86 }),
                  borderRadius: 9, border: '1px solid var(--hair)', padding: 9,
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <span style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>
                    {i === 0 ? '70%컷 + 경쟁률' : '50%컷 + 경쟁률'}
                  </span>
                  <svg viewBox="0 0 250 40" style={{ width: '100%', height: 40 }}>
                    <path d={i === 0 ? 'M8 28 L88 22 L168 26 L240 18' : 'M8 30 L88 20 L168 24 L240 14'}
                          fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" />
                    <path d={i === 0 ? 'M8 12 L88 18 L168 10 L240 20' : 'M8 14 L88 16 L168 12 L240 22'}
                          fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 3" />
                  </svg>
                  <span style={{ display: 'flex', gap: 10 }}>
                    <Stub w={44} h={3.5} o={0.6} /><Stub w={44} h={3.5} o={0.6} />
                    <Stub w={44} h={3.5} o={0.6} />
                  </span>
                </span>
              ))}
            </span>
          )}
        </div>
      </AppWindow>
    </>
  );
};

/* ══ ④ 비교표로 여섯 곳을 나란히 ════════════════════════════════════════════
   "끝난 뒤 어떻게 되는가" — 수시는 **6회가 곧 전략**이라 마지막 일은 늘어놓고 빼는 것이다. */

const S4_W: Rect = { x: 60, y: 62, w: 840, h: 430 };
const S4_NOTE = inWindow(S4_W, { x: 116, y: 268, w: 160, h: 40 }, CH);

const S4 = { W_IN: 0.25, ROWS: 1.0, CSAT: 2.6, NOTE: 4.0, TYPE: 4.4, END: 8.6 };
const S4_NOTE_TEXT = '면접 준비 필요';

/** 표 한 칸 */
const Cell: React.FC<{
  x: number; y: number; w: number; children?: React.ReactNode; head?: boolean; empty?: boolean;
}> = ({ x, y, w, children, head = false, empty = false }) => (
  <span style={{
    position: 'absolute', left: x, top: y, width: w, height: 28,
    display: 'flex', alignItems: 'center', justifyContent: head ? 'flex-start' : 'center',
    padding: '0 8px', fontSize: 10, fontWeight: head ? 700 : 500,
    borderRight: '1px solid var(--hair-2)', borderBottom: '1px solid var(--hair-2)',
    color: head ? 'var(--fg-muted)' : 'var(--fg)',
    background: empty ? 'color-mix(in srgb, var(--fg) 3%, transparent)' : 'transparent',
    whiteSpace: 'nowrap', overflow: 'hidden',
  }}>{children}</span>
);

export const SceneCompare: React.FC = () => {
  const t = useSceneTime();
  const note = typed(t, S4_NOTE_TEXT, S4.TYPE, 10);
  const typing = t > S4.TYPE && t < typedDoneAt(S4_NOTE_TEXT, S4.TYPE, 10) + 0.8;

  const COL = [116, 264, 412, 560, 660, 760];
  const W = [148, 148, 148, 100, 100, 80];
  const NAMES = ['전북대\n간호', '충남대\n간호', '원광대\n간호', '4지망', '5지망', '6지망'];

  return (
    <>
      <Band t={t}>④ <Hi>비교표</Hi>로 여섯 곳을 나란히 놓고 무엇을 뺄지 정한다</Band>

      <AppWindow
        kind="app" title="지망 비교표"
        style={{ ...boxOf(S4_W), ...popIn(t, S4.W_IN) }}
      >
        <div style={{ position: 'absolute', inset: 0, fontSize: 10 }}>
          {/* 헤더 행 — 빈 지망도 열로 남긴다(잔여 칸이 표에서 읽혀야 한다) */}
          <Cell x={12} y={10} w={100} head>지망</Cell>
          {COL.map((x, i) => (
            <span key={i} style={{
              position: 'absolute', left: x, top: 10, width: W[i], height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRight: '1px solid var(--hair-2)', borderBottom: '2px solid var(--hair)',
              fontSize: 10, fontWeight: 700, textAlign: 'center', lineHeight: 1.25,
              color: i < 3 ? 'var(--fg)' : 'var(--fg-faint)',
              background: i < 3 ? 'color-mix(in srgb, var(--primary) 5%, transparent)' : 'transparent',
              whiteSpace: 'pre-line',
            }}>{i < 3 ? `${i + 1}지망\n${NAMES[i]}` : NAMES[i]}</span>
          ))}

          {t > S4.ROWS && (
            <span style={{ opacity: interpolate(t, [S4.ROWS, S4.ROWS + 0.5], [0, 1]) }}>
              {[
                ['지원 수준', ['적정', '소신', '안정']],
                ['내 내신 vs 70%컷', ['3.42 / 3.60', '3.42 / 3.20', '3.42 / 4.10']],
                ['경쟁률 (24)', ['8.4:1', '11.2:1', '6.1:1']],
                ['전형요소', ['교과 100', '교과 80+면접', '교과 100']],
              ].map(([label, vals], r) => (
                <React.Fragment key={label as string}>
                  <Cell x={12} y={42 + r * 30} w={100} head>{label as string}</Cell>
                  {COL.map((x, i) => (
                    <Cell key={i} x={x} y={42 + r * 30} w={W[i]} empty={i >= 3}>
                      {i < 3 ? (
                        r === 0
                          ? <Pill label={(vals as string[])[i]}
                                  {...(i === 0 ? FIT.fit : i === 1 ? FIT.reach : FIT.safe)} />
                          : (vals as string[])[i]
                      ) : ''}
                    </Cell>
                  ))}
                </React.Fragment>
              ))}
            </span>
          )}

          {/* 수능최저 — 6월/9월 자동 판정 */}
          {t > S4.CSAT && (
            <span style={{ ...popIn(t, S4.CSAT, 0.45) }}>
              <Cell x={12} y={162} w={100} head>수능최저 6월</Cell>
              <Cell x={12} y={192} w={100} head>수능최저 9월</Cell>
              {COL.map((x, i) => (
                <React.Fragment key={i}>
                  <Cell x={x} y={162} w={W[i]} empty={i >= 3}>
                    {i < 3 && <Pill label={i === 1 ? '미충족' : '충족'}
                      {...(i === 1
                        ? { fg: '#b91c1c', bg: '#fef2f2', bd: '#fecaca' }
                        : { fg: '#047857', bg: '#ecfdf5', bd: '#a7f3d0' })} />}
                  </Cell>
                  <Cell x={x} y={192} w={W[i]} empty={i >= 3}>
                    {i < 3 && <Pill label={i === 2 ? '판정불가' : '충족'}
                      {...(i === 2
                        ? { fg: '#64748b', bg: '#f8fafc', bd: '#e2e8f0' }
                        : { fg: '#047857', bg: '#ecfdf5', bd: '#a7f3d0' })} />}
                  </Cell>
                </React.Fragment>
              ))}
            </span>
          )}

          {/* 메모 — 내용에 맞춰 세로로 자란다 */}
          {t > S4.NOTE - 0.4 && (
            <>
              <Cell x={12} y={266} w={100} head>메모</Cell>
              <span style={{
                position: 'absolute', left: 116, top: 266, width: 160, minHeight: 40,
                borderRight: '1px solid var(--hair-2)', borderBottom: '1px solid var(--hair-2)',
                padding: '6px 8px', fontSize: 10, lineHeight: 1.5,
                background: clickFlash(t, S4.NOTE) > 0
                  ? 'color-mix(in srgb, var(--primary) 7%, transparent)' : 'transparent',
              }}>
                {t > S4.TYPE ? <>{note}{typing && <Caret />}</> : ''}
              </span>
              {COL.slice(1).map((x, i) => (
                <span key={i} style={{
                  position: 'absolute', left: x, top: 266, width: W[i + 1], height: 40,
                  borderRight: '1px solid var(--hair-2)', borderBottom: '1px solid var(--hair-2)',
                  background: i + 1 >= 3 ? 'color-mix(in srgb, var(--fg) 3%, transparent)' : 'transparent',
                }} />
              ))}
            </>
          )}

          <span style={{
            position: 'absolute', left: 12, bottom: 10, fontSize: 9.5, color: 'var(--fg-faint)',
          }}>
            빈 지망도 열로 남습니다 — <b>수시는 6번</b>이라 몇 자리가 남았는지가 곧 전략이에요.
            표는 그대로 <b>인쇄·엑셀</b>로 낼 수 있어요.
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.6, x: pctX(600), y: pctY(30) },
        { t: S4.NOTE, ...centerOf(S4_NOTE), click: true },
        { t: S4.END, ...centerOf(S4_NOTE), hide: true },
      ]} />
    </>
  );
};
