/**
 * 생기부 분석(evalog) 안내 — 씬 4편.
 *
 * 목업 근거(**화면 문구가 바뀌면 함께 고칠 것**):
 *   · `components/layout/Header.tsx`      — EVALOG 배지 · "생활기록부 도우미" · "분석할 학생을
 *                                            선택해주세요" · 평가현황 N/M · 인쇄 · Admin
 *   · `components/student/StudentList.tsx` — 순번/학년/반/번호/이름 표 · "학생 추가" · "엑셀 업로드"
 *   · `components/evaluation/EvaluationPanel.tsx` — 탭: 검색 · 요약정보 · 교과성적 · 모의고사 ·
 *                                            성적분석 · 비교과 · 교육과정 · 과목위계 · 유사도 ·
 *                                            단어분석 · 역량분석 · 활동 타임라인
 *   · `components/writer/EvaluationWriter.tsx` — "자율활동 내용을 입력하세요..." 등 영역별
 *                                            placeholder · "평가 완료 상태 토글" · "현재 탭 내보내기"
 *   · `components/evaluation/SimilarityAnalysis.tsx` — "세부능력 및 특기사항 유사도"
 */
import React from 'react';
import {
  AppWindow, Pointer, clickFlash, dimAfter, interpolate, popIn, typed, useSceneTime,
} from '@/lib/walkthrough';
import {
  boxOf, centerOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect,
} from '@/components/walkthrough/stageCoords';
import { Band, Btn, Hi, Pill, Stub } from '@/components/walkthrough/atoms';

/* ── 공통 조각 ──────────────────────────────────────────────────────────── */

/** evalog 3패널 껍데기의 상단 헤더 줄 — 네 씬이 같은 줄을 이고 있어야 자리를 잃지 않는다 */
const HeaderBar: React.FC<{ student?: string; done?: number; total?: number }> = ({
  student, done = 12, total = 28,
}) => (
  <div style={{
    position: 'absolute', left: 0, top: 0, right: 0, height: 34,
    borderBottom: '1px solid var(--hair)',
    display: 'flex', alignItems: 'center', padding: '0 10px', gap: 9,
  }}>
    <span style={{
      borderRadius: 5, background: 'var(--primary)', color: '#fff',
      fontSize: 8.5, fontWeight: 700, padding: '2px 6px', letterSpacing: '.04em',
    }}>EVALOG</span>
    <span style={{ fontSize: 10.5, fontWeight: 700 }}>생활기록부 도우미</span>
    <span style={{
      marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 9, color: 'var(--fg-muted)',
    }}>
      {student && (
        <span style={{
          borderRadius: 999, border: '1px solid var(--hair)', padding: '2px 9px',
          fontWeight: 700, color: 'var(--fg)',
        }}>{student}</span>
      )}
      <span>평가현황 <b style={{ color: 'var(--primary)' }}>{done}</b>/{total}</span>
    </span>
  </div>
);

/** 왼쪽 학생 목록 */
const StudentRows: React.FC<{ pick?: number; t: number; at?: number }> = ({ pick, t, at = 0 }) => {
  const rows = [
    { no: 1, name: '한시우', cls: '3-1' },
    { no: 2, name: '박도윤', cls: '3-1' },
    { no: 3, name: '이하준', cls: '3-1' },
    { no: 4, name: '최유진', cls: '3-1' },
    { no: 5, name: '정민서', cls: '3-1' },
  ];
  return (
    <>
      {rows.map((r, i) => {
        const on = pick === i;
        return (
          <span key={r.name} style={{
            ...boxOf({ x: 10, y: 44 + i * 30, w: 158, h: 26 }),
            borderRadius: 7, padding: '0 8px', gap: 7,
            display: 'flex', alignItems: 'center', fontSize: 9.5,
            border: `1px solid ${on ? 'var(--primary)' : 'transparent'}`,
            background: on ? 'color-mix(in srgb, var(--primary) 7%, var(--bg))' : 'transparent',
            fontWeight: on ? 700 : 400,
            color: on ? 'var(--primary)' : 'var(--fg-muted)',
            ...popIn(t, at + i * 0.05, 0.3),
          }}>
            <span style={{ width: 10, color: 'var(--fg-faint)', fontSize: 8.5 }}>{r.no}</span>
            <span>{r.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: 8, color: 'var(--fg-faint)' }}>{r.cls}</span>
          </span>
        );
      })}
    </>
  );
};

/** 가운데 분석 패널의 탭 줄 */
const ANALYSIS_TABS = ['요약정보', '교과성적', '모의고사', '성적분석', '비교과', '유사도'] as const;
const TAB_W = 62;
const TAB_ROW: Rect = { x: 186, y: 44, w: ANALYSIS_TABS.length * TAB_W, h: 24 };
/** 탭 하나의 자리 — 목업과 포인터가 함께 참조한다 */
const tabRect = (i: number): Rect => ({ x: TAB_ROW.x + i * TAB_W, y: TAB_ROW.y, w: TAB_W, h: TAB_ROW.h });

const AnalysisTabs: React.FC<{ active: number }> = ({ active }) => (
  <>
    {ANALYSIS_TABS.map((label, i) => (
      <span key={label} style={{
        ...boxOf(tabRect(i)),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 7, fontSize: 9, fontWeight: i === active ? 700 : 500,
        background: i === active ? 'var(--bg)' : 'transparent',
        color: i === active ? 'var(--primary)' : 'var(--fg-muted)',
        boxShadow: i === active ? '0 1px 3px rgba(15,23,42,0.12)' : undefined,
      }}>{label}</span>
    ))}
  </>
);

/* ══ ① 학생 고르기 ═══════════════════════════════════════════════════════ */

const S1_W: Rect = { x: 56, y: 66, w: 848, h: 420 };
const S1_ROW = inWindow(S1_W, { x: 10, y: 44 + 1 * 30, w: 158, h: 26 }, CH);

const S1 = { W_IN: 0.25, LIST: 0.9, PICK: 2.6, FILL: 3.4, END: 7.4 };

export const SceneSelect: React.FC = () => {
  const t = useSceneTime();
  const picked = t > S1.PICK;

  return (
    <>
      <Band t={t}>① 왼쪽에서 학생을 고르면 <Hi>가운데·오른쪽이 그 학생으로 채워진다</Hi></Band>

      <AppWindow kind="browser" url="spacekijun / 생기부 분석"
                 style={{ ...boxOf(S1_W), ...popIn(t, S1.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <HeaderBar student={picked ? '박도윤 · 3-1 #2' : undefined} />

          {/* 왼쪽 패널 */}
          <div style={{
            position: 'absolute', left: 0, top: 34, bottom: 0, width: 178,
            borderRight: '1px solid var(--hair)',
          }} />
          <span style={{
            ...boxOf({ x: 10, y: 42 - 30, w: 158, h: 22 }),
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 9,
            color: 'var(--fg-faint)', fontWeight: 700,
          }}>학생 목록</span>
          <StudentRows pick={picked ? 1 : undefined} t={t} at={S1.LIST} />
          <Btn rect={{ x: 10, y: 196, w: 76, h: 22 }} label="학생 추가" tone="ghost" />
          <Btn rect={{ x: 92, y: 196, w: 76, h: 22 }} label="엑셀 업로드" tone="ghost" />

          {/* 가운데·오른쪽 — 선택 전에는 비어 있다 */}
          {picked ? (
            <>
              <AnalysisTabs active={0} />
              <div style={{
                ...boxOf({ x: 186, y: 76, w: 424, h: 300 }),
                borderRadius: 10, border: '1px solid var(--hair)', padding: 11,
                display: 'flex', flexDirection: 'column', gap: 8,
                ...popIn(t, S1.FILL, 0.5),
              }}>
                <span style={{ fontSize: 10, fontWeight: 700 }}>요약정보</span>
                <Stub w={380} h={5} o={0.55} />
                <Stub w={330} h={5} o={0.45} />
                <Stub w={356} h={5} o={0.45} />
              </div>
              <div style={{
                ...boxOf({ x: 622, y: 44, w: 216, h: 332 }),
                borderRadius: 10, border: '1px solid var(--hair)', padding: 11,
                display: 'flex', flexDirection: 'column', gap: 8,
                ...popIn(t, S1.FILL + 0.15, 0.5),
              }}>
                <span style={{ fontSize: 10, fontWeight: 700 }}>기록 작성</span>
                <Stub w={180} h={5} o={0.5} />
                <Stub w={160} h={5} o={0.4} />
              </div>
            </>
          ) : (
            <span style={{
              position: 'absolute', left: 186, top: 44, right: 12, bottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10.5, color: 'var(--fg-faint)',
            }}>분석할 학생을 선택해주세요</span>
          )}
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.4, x: pctX(300), y: pctY(80) },
        { t: S1.PICK, ...centerOf(S1_ROW), click: true },
        { t: S1.END, ...centerOf(S1_ROW), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 근거 읽기 ═════════════════════════════════════════════════════════ */

const S2_W: Rect = { x: 56, y: 66, w: 848, h: 420 };
const S2_TAB_GRADE = inWindow(S2_W, tabRect(1), CH);
const S2_TAB_MOCK = inWindow(S2_W, tabRect(2), CH);

const S2 = { W_IN: 0.25, GRADE: 1.6, MOCK: 4.0, END: 7.6 };

export const SceneRead: React.FC = () => {
  const t = useSceneTime();
  const active = t > S2.MOCK ? 2 : t > S2.GRADE ? 1 : 0;

  return (
    <>
      <Band t={t}>② 가운데 탭들이 <Hi>세특에 쓸 근거</Hi>다 — 성적·모의고사·비교과를 한자리에서</Band>

      <AppWindow kind="browser" url="spacekijun / 생기부 분석"
                 style={{ ...boxOf(S2_W), ...popIn(t, S2.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <HeaderBar student="박도윤 · 3-1 #2" />
          <div style={{
            position: 'absolute', left: 0, top: 34, bottom: 0, width: 178,
            borderRight: '1px solid var(--hair)',
          }} />
          <StudentRows pick={1} t={t} at={0} />

          <AnalysisTabs active={active} />

          <div style={{
            ...boxOf({ x: 186, y: 76, w: 652, h: 300 }),
            borderRadius: 10, border: '1px solid var(--hair)', padding: 12,
            display: 'flex', flexDirection: 'column', gap: 9,
          }}>
            <span style={{ fontSize: 10.5, fontWeight: 700 }}>
              {['요약정보', '교과성적', '모의고사'][active]}
            </span>

            {active === 1 && (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 6, ...popIn(t, S2.GRADE, 0.4) }}>
                {[
                  { s: '화법과 작문', g: '2등급', n: '92/100' },
                  { s: '미적분', g: '1등급', n: '96/100' },
                  { s: '생명과학Ⅰ', g: '3등급', n: '84/100' },
                ].map((r) => (
                  <span key={r.s} style={{
                    display: 'flex', alignItems: 'center', gap: 10, fontSize: 9.5,
                    borderBottom: '1px solid var(--hair-2)', paddingBottom: 5,
                  }}>
                    <span style={{ width: 120, fontWeight: 600 }}>{r.s}</span>
                    <Pill label={r.g} fg="#1d4ed8" bg="#dbeafe" bd="#93c5fd" />
                    <span style={{ color: 'var(--fg-muted)' }}>{r.n}</span>
                  </span>
                ))}
              </span>
            )}

            {active === 2 && (
              <span style={{ display: 'flex', gap: 14, alignItems: 'flex-end', height: 150, ...popIn(t, S2.MOCK, 0.4) }}>
                {[62, 74, 70, 88].map((h, i) => (
                  <span key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <span style={{
                      width: 34, borderRadius: '4px 4px 0 0', background: 'var(--primary)',
                      height: h * interpolate(t, [S2.MOCK, S2.MOCK + 0.6], [0, 1]),
                    }} />
                    <span style={{ fontSize: 8, color: 'var(--fg-faint)' }}>{['3월', '6월', '9월', '10월'][i]}</span>
                  </span>
                ))}
              </span>
            )}

            {active === 0 && (
              <>
                <Stub w={600} h={5} o={0.55} />
                <Stub w={540} h={5} o={0.45} />
              </>
            )}

            <span style={{
              marginTop: 'auto', fontSize: 9, lineHeight: 1.6, color: 'var(--fg-faint)',
            }}>
              탭은 학생이 바뀌어도 그대로 유지됩니다 — 같은 항목으로 여러 학생을 훑을 때 편합니다
            </span>
          </div>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(420), y: pctY(30) },
        { t: S2.GRADE, ...centerOf(S2_TAB_GRADE), click: true },
        { t: S2.MOCK, ...centerOf(S2_TAB_MOCK), click: true },
        { t: S2.END, ...centerOf(S2_TAB_MOCK), hide: true },
      ]} />
    </>
  );
};

/* ══ ③ 기록 쓰기 ═════════════════════════════════════════════════════════ */

const S3_W: Rect = { x: 56, y: 66, w: 848, h: 420 };
const S3_FIELD = inWindow(S3_W, { x: 622, y: 96, w: 216, h: 96 }, CH);

const S3 = { W_IN: 0.25, FOCUS: 1.3, TYPE: 1.9, AI: 5.0, END: 8.6 };

export const SceneWrite: React.FC = () => {
  const t = useSceneTime();
  const text = typed(
    t,
    '미적분 심화 탐구에서 급수의 수렴 조건을 스스로 정리하고',
    S3.TYPE, 2.6,
  );

  return (
    <>
      <Band t={t}>③ 오른쪽에서 <Hi>영역별로</Hi> 쓴다 — 자율·진로·동아리·세특·행동특성</Band>

      <AppWindow kind="browser" url="spacekijun / 생기부 분석"
                 style={{ ...boxOf(S3_W), ...popIn(t, S3.W_IN), ...dimAfter(t, S3.AI) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <HeaderBar student="박도윤 · 3-1 #2" />
          <div style={{
            position: 'absolute', left: 0, top: 34, bottom: 0, width: 178,
            borderRight: '1px solid var(--hair)',
          }} />
          <StudentRows pick={1} t={t} at={0} />
          <AnalysisTabs active={1} />
          <div style={{
            ...boxOf({ x: 186, y: 76, w: 424, h: 300 }),
            borderRadius: 10, border: '1px solid var(--hair)', padding: 11,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700 }}>교과성적</span>
            <span style={{ display: 'block', marginTop: 8 }}><Stub w={380} h={5} o={0.5} /></span>
            <span style={{ display: 'block', marginTop: 6 }}><Stub w={330} h={5} o={0.4} /></span>
          </div>

          {/* 오른쪽 작성 패널 */}
          <div style={{
            position: 'absolute', left: 614, top: 34, bottom: 0, right: 0,
            borderLeft: '1px solid var(--hair)',
          }} />
          <span style={{
            ...boxOf({ x: 622, y: 44, w: 216, h: 18 }),
            fontSize: 9.5, fontWeight: 700,
          }}>기록 작성</span>
          <span style={{
            ...boxOf({ x: 622, y: 68, w: 216, h: 20 }),
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5,
            color: 'var(--fg-faint)',
          }}>
            {['자율', '진로', '동아리', '세특'].map((s, i) => (
              <span key={s} style={{
                borderRadius: 5, padding: '2px 6px',
                border: `1px solid ${i === 3 ? 'var(--primary)' : 'var(--hair)'}`,
                color: i === 3 ? 'var(--primary)' : 'var(--fg-faint)',
                fontWeight: i === 3 ? 700 : 400,
              }}>{s}</span>
            ))}
          </span>
          <span style={{
            ...boxOf({ x: 622, y: 96, w: 216, h: 96 }),
            borderRadius: 8, border: `1.5px solid ${t > S3.FOCUS ? 'var(--primary)' : 'var(--hair)'}`,
            padding: 8, fontSize: 9, lineHeight: 1.65, color: 'var(--fg-muted)',
            display: 'block', overflow: 'hidden',
          }}>
            {text || (
              <span style={{ color: 'var(--fg-faint)' }}>과목별 세부능력 및 특기사항을 입력하세요...</span>
            )}
          </span>

          {t > S3.AI && (
            <div style={{
              ...boxOf({ x: 622, y: 200, w: 216, h: 96 }),
              borderRadius: 8, border: '1px solid var(--primary)',
              background: 'color-mix(in srgb, var(--primary) 5%, var(--bg))',
              padding: 9, display: 'flex', flexDirection: 'column', gap: 6,
              ...popIn(t, S3.AI, 0.5),
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--primary)' }}>AI 문장 도우미</span>
              <span style={{ fontSize: 8.5, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
                현재 작성 중인 평가 내용을 바탕으로 문장을 다듬습니다
              </span>
              <Stub w={170} h={4} o={0.5} />
            </div>
          )}
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.8, x: pctX(500), y: pctY(70) },
        { t: S3.FOCUS, ...centerOf(S3_FIELD), click: true },
        { t: S3.END, ...centerOf(S3_FIELD), hide: true },
      ]} />
    </>
  );
};

/* ══ ④ 점검하고 내보내기 ═════════════════════════════════════════════════ */

const S4_W: Rect = { x: 56, y: 66, w: 848, h: 420 };
const S4_TAB_SIM = inWindow(S4_W, tabRect(5), CH);

const S4 = { W_IN: 0.25, SIM: 1.5, RESULT: 2.4, DONE: 5.2, END: 8.4 };

export const SceneCheck: React.FC = () => {
  const t = useSceneTime();
  const shown = t > S4.RESULT;
  const done = t > S4.DONE;

  return (
    <>
      <Band t={t}>④ 내보내기 전에 <Hi>유사도</Hi>를 본다 — 같은 문장이 여러 학생에게 들어가면 문제가 된다</Band>

      <AppWindow kind="browser" url="spacekijun / 생기부 분석"
                 style={{ ...boxOf(S4_W), ...popIn(t, S4.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <HeaderBar student="박도윤 · 3-1 #2" done={done ? 13 : 12} />
          <div style={{
            position: 'absolute', left: 0, top: 34, bottom: 0, width: 178,
            borderRight: '1px solid var(--hair)',
          }} />
          <StudentRows pick={1} t={t} at={0} />
          <AnalysisTabs active={5} />

          <div style={{
            ...boxOf({ x: 186, y: 76, w: 424, h: 300 }),
            borderRadius: 10, border: '1px solid var(--hair)', padding: 12,
            display: 'flex', flexDirection: 'column', gap: 9,
          }}>
            <span style={{ fontSize: 10.5, fontWeight: 700 }}>세부능력 및 특기사항 유사도</span>
            {shown ? (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 7, ...popIn(t, S4.RESULT, 0.5) }}>
                {[
                  { n: '이하준 · 3-1', v: 71, tone: 'warn' as const },
                  { n: '최유진 · 3-1', v: 38, tone: 'ok' as const },
                  { n: '정민서 · 3-1', v: 22, tone: 'ok' as const },
                ].map((r) => (
                  <span key={r.n} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 9.5 }}>
                    <span style={{ width: 96 }}>{r.n}</span>
                    <span style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--hair-2)', overflow: 'hidden' }}>
                      <span style={{
                        display: 'block', height: '100%', borderRadius: 4,
                        width: `${r.v}%`,
                        background: r.tone === 'warn' ? '#f59e0b' : 'var(--primary)',
                      }} />
                    </span>
                    <span style={{
                      width: 30, textAlign: 'right', fontWeight: 700,
                      color: r.tone === 'warn' ? '#b45309' : 'var(--fg-muted)',
                    }}>{r.v}%</span>
                  </span>
                ))}
              </span>
            ) : (
              <Stub w={380} h={5} o={0.4} />
            )}

            <span style={{
              marginTop: 'auto', fontSize: 9, lineHeight: 1.6, color: 'var(--fg-faint)',
            }}>
              높게 나온 학생끼리는 문장을 <b style={{ color: '#b45309' }}>서로 다르게</b> 고쳐야 합니다
            </span>
          </div>

          {/* 오른쪽: 완료 토글 + 내보내기 */}
          <div style={{
            position: 'absolute', left: 614, top: 34, bottom: 0, right: 0,
            borderLeft: '1px solid var(--hair)',
          }} />
          <span style={{
            ...boxOf({ x: 622, y: 44, w: 216, h: 34 }),
            borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
            border: `1.5px solid ${done ? '#6ee7b7' : 'var(--hair)'}`,
            background: done ? '#ecfdf5' : 'var(--bg)',
            fontSize: 9.5, fontWeight: 700,
            color: done ? '#065f46' : 'var(--fg-muted)',
          }}>
            <span style={{
              width: 13, height: 13, borderRadius: 4, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff',
              background: done ? '#059669' : 'var(--hair)',
            }}>{done ? '✓' : ''}</span>
            평가 완료
          </span>
          <Btn rect={{ x: 622, y: 88, w: 216, h: 28 }} label="현재 탭 내보내기"
               tone={done ? 'primary' : 'ghost'} />
          <span style={{
            ...boxOf({ x: 622, y: 124, w: 216, h: 60 }),
            fontSize: 8.5, lineHeight: 1.7, color: 'var(--fg-faint)',
          }}>
            완료로 표시하면 헤더의 <b style={{ color: 'var(--fg-muted)' }}>평가현황</b> 숫자가 올라갑니다 —
            반 전체가 어디까지 왔는지 이 숫자로 봅니다
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(420), y: pctY(28) },
        { t: S4.SIM, ...centerOf(S4_TAB_SIM), click: true },
        { t: S4.END, ...centerOf(S4_TAB_SIM), hide: true },
      ]} />
    </>
  );
};
