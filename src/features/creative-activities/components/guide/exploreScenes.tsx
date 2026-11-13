/**
 * 창의적 체험활동 안내 — `탐구 탐색` 세그먼트의 절차 시연 씬 3편.
 *
 * 목업 근거(라벨은 전부 실제 화면 문구):
 *   `InquiryExploreBoard`(전체 갈래 → 주제군 → 활동 · 해마다 하는 프로그램 ·
 *     활동 많은 순/심화 비율 순/이름 순 · 목록/그래프 · 활동 기록으로 ·
 *     이 갈래 안의 지형 · 처음 시작한다면 · 이 주제군에서 약한 곳 · 여기서 더 나갈 수 있는 것 ·
 *     "개념 노드가 활동을 잇는 다리입니다" · "두 건 이상에 붙은 개념만 그립니다")
 *   `utils/inquiryLabels.ts`(L0 비탐구 · L1 수행·보고 · L2 이해·적용 · L3 분석·해석 · L4 설계·확장 ·
 *     `depthLabel` = 심화 N% / 기록이 짧아 깊이를 판단하기 어려움 / 판정 전)
 *   `utils/inquiryToActivity.ts`(씨앗이 채우는 것 = 이름·영역·진로 분야·키워드·내용,
 *     **비우는 것 = 기간·장소·시수·예산** ·
 *     `themeToSeed` 본문 = "생기부에서 이 주제로 이뤄진 탐구 N건을 묶은 것입니다." +
 *     "· 주로 쓰인 방법: …" + "※ 위는 지난 기록을 요약한 것입니다. 올해 운영 계획으로 고쳐 주세요.")
 * **화면 문구가 바뀌면 이 목업도 함께 고쳐야 한다.**
 */
import React from 'react';
import {
  AppWindow, Pointer, clickFlash, dimAfter, popIn, useSceneTime,
} from '@/lib/walkthrough';
import {
  boxOf, centerOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect,
} from '@/components/walkthrough/stageCoords';
import { Band, Btn, Field, Hi } from '@/components/walkthrough/atoms';
import { Lab, Note, ScopeBar, Sec } from './shared';
import { AREA } from './tokens';
import { SCOPE } from './tabs';

/* ── 씬 전용 부품 ────────────────────────────────────────────────────────── */

/** 탐구 수준 배지 — `LEVEL_TONE` 과 같은 결(L0 만 회색, 나머지는 sky→violet 램프) */
const LEVEL: Record<number, { label: string; fg: string; bg: string; bd: string }> = {
  1: { label: '수행·보고', fg: '#0369a1', bg: '#f0f9ff', bd: '#bae6fd' },
  2: { label: '이해·적용', fg: '#075985', bg: '#e0f2fe', bd: '#7dd3fc' },
  3: { label: '분석·해석', fg: '#3730a3', bg: '#e0e7ff', bd: '#a5b4fc' },
  4: { label: '설계·확장', fg: '#5b21b6', bg: '#ede9fe', bd: '#c4b5fd' },
};

const LevelBadge: React.FC<{ level: number }> = ({ level }) => {
  const l = LEVEL[level];
  return (
    <span style={{
      borderRadius: 5, border: `1px solid ${l.bd}`, background: l.bg, color: l.fg,
      padding: '1px 5px', fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap',
    }}>L{level} {l.label}</span>
  );
};

/**
 * 심화 칩 + 활동당 문장 수.
 *
 * **둘을 함께 내는 것이 이 화면의 규약이다** — 짧게 적힌 주제군의 낮은 심화는
 * "이 주제로는 깊이 못 간다"가 아니라 "기록이 짧아 알 수 없다"이기 때문이다.
 */
const DepthChip: React.FC<{ x: number; y: number; ratio: number | null; sentences: number }> = ({
  x, y, ratio, sentences,
}) => {
  const readable = ratio != null;
  return (
    <span style={{ position: 'absolute', left: x, top: y, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        borderRadius: 5, padding: '1px 6px', fontSize: 9.5, fontWeight: 600,
        border: `1px solid ${readable ? '#ddd6fe' : 'var(--hair)'}`,
        background: readable ? '#f5f3ff' : '#f8fafc',
        color: readable ? '#6d28d9' : 'var(--fg-muted)',
      }}>
        {readable ? `심화 ${ratio}%` : '기록이 짧아 깊이를 판단하기 어려움'}
      </span>
      <span style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>기록 {sentences.toFixed(1)}문장</span>
    </span>
  );
};

/** 상위 갈래 / 주제군 카드 */
const ThemeCard: React.FC<{
  rect: Rect; name: string; size: string; summary: string;
  ratio: number | null; sentences: number; top?: boolean; flash?: number; fields?: string[];
}> = ({ rect, name, size, summary, ratio, sentences, top = false, flash = 0, fields }) => (
  <span style={{
    ...boxOf(rect), boxSizing: 'border-box',
    borderRadius: 12, border: '1px solid var(--hair)', background: 'var(--bg)',
    padding: '12px 12px 10px', overflow: 'hidden',
    boxShadow: flash > 0
      ? `0 0 0 ${6 * flash}px rgba(79,70,229,0.22)` : '0 1px 2px rgba(15,23,42,0.06)',
  }}>
    {top && (
      <i style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 3,
        background: 'linear-gradient(90deg,#3b82f6,#06b6d4,#34d399)',
      }} />
    )}
    <span style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
      <b style={{ fontSize: 12, color: 'var(--fg)' }}>{name}</b>
      <span style={{ fontSize: 9.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap' }}>{size}</span>
    </span>
    <span style={{
      display: 'block', marginTop: 6, fontSize: 10, lineHeight: 1.55, color: 'var(--fg-muted)',
    }}>{summary}</span>
    <DepthChip x={12} y={rect.h - 32} ratio={ratio} sentences={sentences} />
    {fields && (
      <span style={{ position: 'absolute', left: 12, top: rect.h - 54, display: 'flex', gap: 4 }}>
        {fields.map((f) => (
          <span key={f} style={{
            borderRadius: 5, background: '#f1f5f9', color: 'var(--fg-muted)',
            padding: '1px 5px', fontSize: 9,
          }}>{f}</span>
        ))}
      </span>
    )}
  </span>
);

/** 빵부스러기 */
const Crumb: React.FC<{ x: number; y: number; parts: string[] }> = ({ x, y, parts }) => (
  <span style={{ position: 'absolute', left: x, top: y, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5 }}>
    <span style={{ color: 'var(--fg-muted)' }}>← 전체 갈래</span>
    {parts.map((p, i) => (
      <React.Fragment key={p}>
        <span style={{ color: 'var(--fg-faint)' }}>›</span>
        <span style={{
          color: i === parts.length - 1 ? 'var(--fg)' : 'var(--fg-muted)',
          fontWeight: i === parts.length - 1 ? 700 : 400,
        }}>{p}</span>
      </React.Fragment>
    ))}
  </span>
);

/** 세그먼트 알약(정렬 · 목록/그래프) */
const Segment: React.FC<{ rect: Rect; items: string[]; active: number; glow?: number }> = ({
  rect, items, active, glow = 0,
}) => (
  <span style={{
    ...boxOf(rect), boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', gap: 2, padding: 2,
    borderRadius: 8, border: '1px solid var(--hair-2)', background: 'rgba(241,245,249,0.6)',
  }}>
    {items.map((label, i) => (
      <span key={label} style={{
        flex: 1, textAlign: 'center', borderRadius: 6, padding: '2px 0', fontSize: 9.5,
        fontWeight: i === active ? 700 : 500,
        background: i === active ? 'var(--bg)' : 'transparent',
        color: i === active ? 'var(--fg)' : 'var(--fg-muted)',
        boxShadow: i === active && glow > 0
          ? `0 0 0 ${5 * glow}px rgba(79,70,229,0.24)` : i === active ? '0 1px 2px rgba(15,23,42,0.08)' : undefined,
      }}>{label}</span>
    ))}
  </span>
);

/** 탐구 활동 한 줄 */
const InquiryRow: React.FC<{
  rect: Rect; level: number; title: string; question: string; meta: string;
}> = ({ rect, level, title, question, meta }) => (
  <span style={{
    ...boxOf(rect), boxSizing: 'border-box',
    display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px',
    borderRadius: 10, border: '1px solid var(--hair)', background: 'var(--bg)',
  }}>
    <LevelBadge level={level} />
    <span style={{ minWidth: 0, flex: 1 }}>
      <b style={{ fontSize: 11.5, color: 'var(--fg)' }}>{title}</b>
      <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'var(--fg-muted)' }}>{question}</span>
      <span style={{ display: 'block', marginTop: 3, fontSize: 9.5, color: 'var(--fg-faint)' }}>{meta}</span>
    </span>
  </span>
);

/* ══ ① 갈래 → 주제군 ═══════════════════════════════════════════════════════
   이 화면의 데이터는 학교가 연 활동이 아니라 **생기부에서 뽑아 묶은 탐구 기록**이다.
   그래서 검색·범주 칩이 적용되지 않고, 위에서 아래로 좁혀 들어간다. */

const T_W: Rect = { x: 40, y: 56, w: 880, h: 420 };
const T_CARD = inWindow(T_W, { x: 14, y: 78, w: 278, h: 148 }, CH);

const T = { W: 0.25, TOP: 2.2, END: 9.0 };

export const SceneThemes: React.FC = () => {
  const t = useSceneTime();
  const opened = t > T.TOP;

  return (
    <>
      <Band t={t}>① <Hi>갈래</Hi>에서 <Hi>주제군</Hi>으로 — 생기부 탐구 기록을 뜻으로 묶은 지도</Band>

      <AppWindow
        kind="browser" url="spacekijun / 창의적 체험활동" badge=""
        style={{ ...boxOf(T_W), ...popIn(t, T.W) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <ScopeBar active={SCOPE.explore} x={14} y={10} />
          <Note x={14} y={46} w={620}>
            창의적 체험활동 3,412건을 뜻이 가까운 것끼리 묶은 8개 갈래입니다.
          </Note>
          <Btn rect={{ x: 712, y: 42, w: 154, h: 24 }} label="해마다 하는 프로그램" tone="ghost" />

          {!opened ? (
            <>
              <ThemeCard rect={{ x: 14, y: 78, w: 278, h: 148 }} top
                         name="생명과학·의학 탐구" size="742건"
                         summary="세포와 미생물을 직접 다뤄 보는 실험이 많고, 의학·보건 진로와 이어지는 조사가 뒤따릅니다."
                         ratio={34} sentences={4.1} fields={['생명과학', '간호·보건', '의학']}
                         flash={clickFlash(t, T.TOP)} />
              <ThemeCard rect={{ x: 302, y: 78, w: 278, h: 148 }} top
                         name="인공지능·데이터" size="519건"
                         summary="코드를 짜 본 기록과 데이터를 모아 그려 본 기록이 함께 묶입니다."
                         ratio={41} sentences={3.6} fields={['인공지능', '통계']} />
              <ThemeCard rect={{ x: 590, y: 78, w: 278, h: 148 }} top
                         name="행사·공연 참여" size="631건"
                         summary="학교 행사와 발표에 참여한 기록입니다."
                         ratio={null} sentences={1.8} fields={['예술', '체육']} />
              <Note x={14} y={244} w={840}>
                갈래 카드를 누르면 그 안의 주제군이 열립니다. 남은 5개 갈래는 아래에 이어집니다.
              </Note>
            </>
          ) : (
            <div style={{ position: 'absolute', inset: 0, ...popIn(t, T.TOP, 0.5) }}>
              <Crumb x={14} y={78} parts={['생명과학·의학 탐구']} />

              {/* 상위 갈래 보고서 — 지형과 시작점은 이 층에만 있다 */}
              <span style={{
                ...boxOf({ x: 14, y: 100, w: 852, h: 118 }), boxSizing: 'border-box',
                borderRadius: 12, border: '1px solid var(--hair)', background: 'var(--bg)', padding: 12,
              }}>
                <span style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--fg)' }}>
                  세포·미생물을 직접 다루는 실험이 중심이고, 관찰에서 멈추는 기록과 조건을 바꿔 본
                  기록으로 갈립니다.
                </span>
                <span style={{ position: 'absolute', left: 12, top: 52, width: 470 }}>
                  <b style={{ fontSize: 9.5, color: 'var(--fg-muted)' }}>이 갈래 안의 지형</b>
                  <span style={{ display: 'block', marginTop: 3, fontSize: 10, lineHeight: 1.55, color: 'var(--fg-muted)' }}>
                    실험 설계 / 진로 조사 / 사례 발표 세 축으로 갈립니다.
                  </span>
                </span>
                <span style={{
                  position: 'absolute', left: 496, top: 46, width: 344, borderRadius: 9,
                  background: 'rgba(239,246,255,0.7)', padding: 10,
                }}>
                  <b style={{ fontSize: 9.5, color: '#1d4ed8' }}>처음 시작한다면</b>
                  <span style={{ display: 'block', marginTop: 3, fontSize: 10, lineHeight: 1.55, color: 'var(--fg)' }}>
                    배지 만들기처럼 재료가 단순한 실험에서 조건을 하나만 바꿔 보세요.
                  </span>
                </span>
              </span>

              <Note x={14} y={230}>주제군 12개</Note>
              <Segment rect={{ x: 656, y: 226, w: 210, h: 22 }}
                       items={['활동 많은 순', '심화 비율 순', '이름 순']} active={0} />

              <ThemeCard rect={{ x: 14, y: 254, w: 278, h: 108 }}
                         name="미생물 배양과 배지" size="86건"
                         summary="배지를 직접 만들어 균을 길러 본 기록이 모여 있습니다."
                         ratio={38} sentences={4.4} />
              <ThemeCard rect={{ x: 302, y: 254, w: 278, h: 108 }}
                         name="혈액·면역 반응" size="61건"
                         summary="혈액형 판별과 항원·항체 반응 실험이 묶입니다."
                         ratio={45} sentences={4.8} />
              <ThemeCard rect={{ x: 590, y: 254, w: 278, h: 108 }}
                         name="보건 캠페인" size="54건"
                         summary="교내 캠페인·부스 운영 기록입니다."
                         ratio={null} sentences={2.1} />
            </div>
          )}
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.1, x: pctX(430), y: pctY(38) },
        { t: T.TOP, ...centerOf(T_CARD), click: true },
        { t: T.TOP + 1.2, ...centerOf(T_CARD), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 활동과 그래프 — 왜 한 묶음인지 눈으로 확인한다 ═══════════════════════ */

const G_W: Rect = { x: 60, y: 56, w: 840, h: 420 };
const G_LEAF = inWindow(G_W, { x: 14, y: 62, w: 264, h: 104 }, CH);
const G_GRAPH = inWindow(G_W, { x: 748, y: 138, w: 78, h: 22 }, CH);

const G = { W: 0.25, LEAF: 1.9, GRAPH: 5.0, END: 9.4 };

/** 주제군 그래프 — 활동 노드와, 둘 이상을 잇는 개념 노드 */
const ThemeGraph: React.FC<{ w: number; h: number }> = ({ w, h }) => {
  const acts = [
    { x: 120, y: 40, label: '배지 조성 비교' },
    { x: 120, y: 122, label: '손 씻기 세균 관찰' },
    { x: 560, y: 34, label: '항생제 감수성' },
    { x: 590, y: 126, label: '발효 식품 균총' },
  ];
  const concepts = [
    { x: 342, y: 46, label: '배양 배지' },
    { x: 352, y: 118, label: '멸균' },
  ];
  const edges: [number, number][] = [[0, 0], [1, 0], [2, 0], [1, 1], [3, 1], [0, 1]];
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {edges.map(([a, c], i) => (
        <line key={i} x1={acts[a].x} y1={acts[a].y} x2={concepts[c].x} y2={concepts[c].y}
              stroke="#94a3b8" strokeWidth={1.2} opacity={0.7} />
      ))}
      {concepts.map((c) => (
        <g key={c.label}>
          <circle cx={c.x} cy={c.y} r={16} fill="#e0e7ff" stroke="#818cf8" strokeWidth={1.4} />
          <text x={c.x} y={c.y + 32} textAnchor="middle" fontSize={10} fill="#4338ca" fontWeight={700}>
            {c.label}
          </text>
        </g>
      ))}
      {acts.map((a, i) => (
        <g key={a.label}>
          <circle cx={a.x} cy={a.y} r={12}
                  fill={i % 2 === 0 ? '#ede9fe' : '#e0f2fe'}
                  stroke={i % 2 === 0 ? '#a78bfa' : '#7dd3fc'} strokeWidth={1.4} />
          <text x={a.x} y={a.y - 18} textAnchor="middle" fontSize={10} fill="#334155">{a.label}</text>
        </g>
      ))}
    </svg>
  );
};

export const SceneThemeActivities: React.FC = () => {
  const t = useSceneTime();
  const opened = t > G.LEAF;
  const graph = t > G.GRAPH;

  return (
    <>
      <Band t={t}>② 주제군 안의 <Hi>활동</Hi>과 <Hi>그래프</Hi> — 수준 배지가 깊이를 말한다</Band>

      <AppWindow
        kind="browser" url="spacekijun / 창의적 체험활동" badge=""
        style={{ ...boxOf(G_W), ...popIn(t, G.W) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <Crumb x={14} y={10} parts={opened ? ['생명과학·의학 탐구', '미생물 배양과 배지'] : ['생명과학·의학 탐구']} />

          {!opened ? (
            <>
              <Note x={14} y={38}>주제군 12개</Note>
              <Segment rect={{ x: 616, y: 34, w: 210, h: 22 }}
                       items={['활동 많은 순', '심화 비율 순', '이름 순']} active={0} />
              <ThemeCard rect={{ x: 14, y: 62, w: 264, h: 104 }}
                         name="미생물 배양과 배지" size="86건"
                         summary="배지를 직접 만들어 균을 길러 본 기록이 모여 있습니다."
                         ratio={38} sentences={4.4} flash={clickFlash(t, G.LEAF)} />
              <ThemeCard rect={{ x: 292, y: 62, w: 264, h: 104 }}
                         name="혈액·면역 반응" size="61건"
                         summary="혈액형 판별과 항원·항체 반응 실험이 묶입니다."
                         ratio={45} sentences={4.8} />
              <ThemeCard rect={{ x: 570, y: 62, w: 264, h: 104 }}
                         name="보건 캠페인" size="54건"
                         summary="교내 캠페인·부스 운영 기록입니다."
                         ratio={null} sentences={2.1} />
            </>
          ) : (
            <div style={{ position: 'absolute', inset: 0, ...popIn(t, G.LEAF, 0.5) }}>
              {/* 주제군 보고서 — 약한 곳 / 더 나갈 수 있는 것 */}
              <span style={{
                ...boxOf({ x: 14, y: 38, w: 812, h: 92 }), boxSizing: 'border-box',
                borderRadius: 12, border: '1px solid var(--hair)', background: 'var(--bg)', padding: 11,
              }}>
                <span style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--fg)' }}>
                  배지를 직접 만들어 균을 길러 본 기록이 모여 있고, 조건을 바꿔 비교한 것과
                  한 번 관찰하고 끝난 것이 갈립니다.
                </span>
                <span style={{ position: 'absolute', left: 11, top: 44, width: 380 }}>
                  <b style={{ fontSize: 9.5, color: 'var(--fg-muted)' }}>이 주제군에서 약한 곳</b>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'var(--fg-muted)' }}>
                    · 대조군을 둔 기록이 드뭅니다
                  </span>
                </span>
                <span style={{ position: 'absolute', left: 412, top: 44, width: 380 }}>
                  <b style={{ fontSize: 9.5, color: 'var(--fg-muted)' }}>여기서 더 나갈 수 있는 것</b>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'var(--fg-muted)' }}>
                    · 배지 조성을 바꿔 균종별 선택성을 비교해 보기
                  </span>
                </span>
              </span>

              <Note x={14} y={144} w={520}>
                {graph
                  ? '개념 노드가 활동을 잇는 다리입니다 — 여러 활동이 같은 개념에 붙어 있는 것이 이 묶음의 근거입니다.'
                  : '활동 3건 · 비탐구 판정 등으로 12건은 목록에 없습니다'}
              </Note>
              <Btn rect={{ x: 532, y: 138, w: 120, h: 22 }} label="＋ 활동 기록으로" tone="ghost" />
              <Segment rect={{ x: 664, y: 138, w: 162, h: 22 }} items={['목록', '그래프']}
                       active={graph ? 1 : 0} glow={clickFlash(t, G.GRAPH)} />

              {graph ? (
                <span style={{
                  ...boxOf({ x: 14, y: 172, w: 812, h: 168 }), boxSizing: 'border-box',
                  borderRadius: 12, border: '1px solid var(--hair)', background: '#fbfcfe',
                  overflow: 'hidden', ...popIn(t, G.GRAPH, 0.5),
                }}>
                  <ThemeGraph w={812} h={168} />
                </span>
              ) : (
                <>
                  <InquiryRow rect={{ x: 14, y: 172, w: 812, h: 58 }} level={4}
                              title="배지 조성 비교 실험"
                              question="배지 조성에 따라 자라는 균종이 어떻게 달라질까?"
                              meta="동아리활동 · 2학년 · 대조군 설정 · 반복 측정 · 6문장" />
                  <InquiryRow rect={{ x: 14, y: 234, w: 812, h: 58 }} level={2}
                              title="손 씻기 전후 세균 관찰"
                              question="손 씻기가 세균 수를 줄일까?"
                              meta="자율활동 · 1학년 · 관찰 기록 · 3문장" />
                  <InquiryRow rect={{ x: 14, y: 296, w: 812, h: 58 }} level={1}
                              title="교내 미생물 전시 준비"
                              question=""
                              meta="동아리활동 · 1학년 · 자료 조사 · 2문장" />
                </>
              )}

              {graph && (
                <Note x={14} y={348} w={800}>
                  활동 4개 · 개념 2개 · 두 건 이상에 붙은 개념만 그립니다(한 건에만 붙은 개념은
                  다리 노릇을 못 합니다). 활동 노드를 누르면 상세가 열립니다.
                </Note>
              )}
            </div>
          )}
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.0, x: pctX(300), y: pctY(30) },
        { t: G.LEAF, ...centerOf(G_LEAF), click: true },
        { t: G.GRAPH, ...centerOf(G_GRAPH), click: true },
        { t: G.GRAPH + 1.4, ...centerOf(G_GRAPH), hide: true },
      ]} />
    </>
  );
};

/* ══ ③ 활동 기록으로 옮기기 — 저장하지 않고 폼을 채워 연다 ══════════════════ */

const S_W1: Rect = { x: 26, y: 56, w: 540, h: 330 };
const S_SEED = inWindow(S_W1, { x: 268, y: 118, w: 120, h: 22 }, CH);
const S_W2: Rect = { x: 360, y: 172, w: 560, h: 348 };

const S = { W1: 0.25, SEED: 1.9, W2: 2.3, END: 8.8 };

/** 일부러 비워 두는 칸 — 빈 칸은 "채워야 한다"고 스스로 말한다 */
const Empty: React.FC<{ rect: Rect; hint: string }> = ({ rect, hint }) => (
  <span style={{
    ...boxOf(rect), boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', padding: '0 9px',
    borderRadius: 7, border: '1px dashed #fbbf24', background: 'rgba(254,252,232,0.6)',
    fontSize: 10, color: '#b45309',
  }}>{hint}</span>
);

export const SceneSeed: React.FC = () => {
  const t = useSceneTime();
  const seeded = t > S.SEED;

  return (
    <>
      <Band t={t}>③ <Hi>활동 기록으로</Hi> — 폼을 채워 열 뿐, 저장은 사람이 한다</Band>

      <AppWindow
        kind="browser" url="spacekijun / 창의적 체험활동" badge="①"
        style={{ ...boxOf(S_W1), ...popIn(t, S.W1), ...dimAfter(t, S.W2) }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          <Crumb x={12} y={10} parts={['생명과학·의학 탐구', '미생물 배양과 배지']} />
          <span style={{
            ...boxOf({ x: 12, y: 34, w: 516, h: 74 }), boxSizing: 'border-box',
            borderRadius: 11, border: '1px solid var(--hair)', background: 'var(--bg)', padding: 10,
            fontSize: 10.5, lineHeight: 1.55, color: 'var(--fg)',
          }}>
            배지를 직접 만들어 균을 길러 본 기록 86건입니다. 조건을 바꿔 비교한 것과 한 번
            관찰하고 끝난 것이 갈립니다.
          </span>
          <Btn rect={{ x: 268, y: 118, w: 120, h: 22 }} label="＋ 활동 기록으로" tone="ghost"
               flash={clickFlash(t, S.SEED)} />
          <Segment rect={{ x: 396, y: 118, w: 132, h: 22 }} items={['목록', '그래프']} active={0} />
          <InquiryRow rect={{ x: 12, y: 150, w: 516, h: 56 }} level={4}
                      title="배지 조성 비교 실험"
                      question="배지 조성에 따라 자라는 균종이 어떻게 달라질까?"
                      meta="동아리활동 · 2학년 · 6문장" />
          <InquiryRow rect={{ x: 12, y: 212, w: 516, h: 56 }} level={2}
                      title="손 씻기 전후 세균 관찰"
                      question="손 씻기가 세균 수를 줄일까?"
                      meta="자율활동 · 1학년 · 3문장" />
        </div>
      </AppWindow>

      {seeded && (
        <AppWindow
          kind="app" title="활동 기록" badge="②"
          style={{ ...boxOf(S_W2), ...popIn(t, S.W2), zIndex: 3 }}
        >
          <div style={{ position: 'absolute', inset: 0 }}>
            <Note x={14} y={10} w={520}>
              탐구 데이터로 <b style={{ color: 'var(--fg-muted)' }}>폼을 채워 열 뿐 저장하지 않습니다</b> —
              이 기록이 생활기록부의 근거가 되므로 사람이 보고 고친 뒤 저장합니다.
            </Note>

            <Sec x={14} y={48}>무엇을 했는가</Sec>
            <Lab x={14} y={64}>활동 이름 <span style={{ color: '#e11d48' }}>*</span></Lab>
            <Field rect={{ x: 14, y: 78, w: 360, h: 26 }}>
              <span style={{ color: 'var(--fg)', fontSize: 11.5 }}>미생물 배양과 배지</span>
            </Field>
            <Lab x={14} y={112}>영역</Lab>
            <Lab x={186} y={112}>진로 · 분야</Lab>
            <Field rect={{ x: 14, y: 126, w: 160, h: 26 }}>
              <span style={{ color: AREA.club.fg, fontSize: 11.5, fontWeight: 600 }}>동아리</span>
            </Field>
            <Field rect={{ x: 186, y: 126, w: 340, h: 26 }}>
              <span style={{ color: 'var(--fg)', fontSize: 11.5 }}>생명과학, 간호·보건</span>
            </Field>

            <Lab x={14} y={160}>내용</Lab>
            <span style={{
              ...boxOf({ x: 14, y: 174, w: 512, h: 46 }), boxSizing: 'border-box',
              borderRadius: 7, border: '1px solid var(--hair)', padding: '7px 9px',
              fontSize: 10, color: 'var(--fg-muted)', lineHeight: 1.5,
            }}>
              {/* `themeToSeed` 출력 그대로. 86 = 왼쪽 창의 주제 건수,
                  방법 값은 `method_types` 고정 어휘(실험·관찰·문헌조사 …)에서 고른다 —
                  "대조군 설정" 같은 자유 서술은 이 자리에 오지 않는다. */}
              생기부에서 이 주제로 이뤄진 탐구 86건을 묶은 것입니다. · 주로 쓰인 방법: 실험, 관찰
              <span style={{ display: 'block', color: 'var(--fg-faint)' }}>
                ※ 위는 지난 기록을 요약한 것입니다. 올해 운영 계획으로 고쳐 주세요.
              </span>
            </span>

            <Lab x={14} y={232}>시작일 <span style={{ color: '#e11d48' }}>*</span></Lab>
            <Lab x={146} y={232}>장소</Lab>
            <Empty rect={{ x: 14, y: 246, w: 120, h: 26 }} hint="비어 있음" />
            <Empty rect={{ x: 146, y: 246, w: 160, h: 26 }} hint="비어 있음" />
            <Note x={318} y={250} w={210}>
              기간 · 장소 · 예산은 <b style={{ color: '#b45309' }}>일부러 비웁니다</b>.
            </Note>

            <Btn rect={{ x: 434, y: 286, w: 92, h: 28 }} label="활동 기록" />
          </div>
        </AppWindow>
      )}

      <Pointer path={[
        { t: 1.0, x: pctX(260), y: pctY(30) },
        { t: S.SEED, ...centerOf(S_SEED), click: true },
        { t: S.SEED + 1.4, ...centerOf(S_SEED), hide: true },
      ]} />
    </>
  );
};
