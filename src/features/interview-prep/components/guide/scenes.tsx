/**
 * 면접 준비 안내 — 절차 시연 씬 4편.
 *
 * 목업 근거(라벨은 전부 실제 화면 문구):
 *   `InterviewPrepHomeCard`(오늘의 면접 질문 · 오늘의 질문 받기 · 답하기 · 답변한 날 N일) ·
 *   `InterviewPrepPage`(면접 준비 / 오늘·연습·기록) ·
 *   `TodayTab`(오늘의 면접 질문을 받아 보세요) ·
 *   `InterviewThreadView`(질문 의도 · 연습용 AI 피드백 … · 잘한 점 · 먼저 보완할 점 ·
 *     답변 고쳐서 다시 받기 · 이 질문에 답하기) ·
 *   `AnswerComposer`(답변의 뼈대 · 피드백 받기 · 초안 저장됨) ·
 *   `PracticeTab`(공통 질문 · 오늘 남은 연습 질문 N개 · 아직 질문 안 받은 활동) ·
 *   `RecordTab`(다룬 활동 · 아직 약한 기준 · 날짜순/활동별) ·
 *   `_shared/interviewPrep.ts`(루브릭 이름 · 공통 질문 주제) ·
 *   `evalog/EvaluationPanel`(생기부 분석의 [면접 준비] 탭).
 * **화면 문구가 바뀌면 이 목업도 함께 고쳐야 한다.**
 *
 * 단계는 **탭이 아니라 사용자의 목적**으로 나눴다 — 오늘·연습·기록 세 탭은 같은
 * 고리(질문 → 답변 → 피드백)를 다른 입구로 도는 것이라 탭마다 안내를 가르면
 * 같은 말을 세 번 하게 된다(스킬의 "가르는 단위는 탭 개수가 아니라 다른 기능인가").
 */
import React from 'react';
import {
  AppWindow, Pointer, clickFlash, dimAfter, interpolate, popIn, typed, useSceneTime,
} from '@/lib/walkthrough';
import { boxOf, centerOf, pctX, pctY } from '@/components/walkthrough/stageCoords';
import { Band, Btn, Hi } from '@/components/walkthrough/atoms';
// 자리는 `geometry.ts` 단일 출처 — 목업(boxOf)과 포인터(centerOf)가 같은 상수를 본다.
import {
  A_CHIP, A_CHIP_REL, A_GET, A_GET_REL, A_W1, A_W2,
  B_AREA, B_AREA_REL, B_SEND, B_SEND_REL, B_W,
  C_CARD, C_CARD_REL, C_FILTER, C_SEG1_REL, C_SEG2_REL, C_W,
  D_W1, D_W2,
} from './geometry';

/* ── 공통 조각 ──────────────────────────────────────────────────────────── */

/** 루브릭 점 4개 — 실제 화면과 같이 **숫자를 쓰지 않는다**(서열 척도라 합산을 부른다). */
const Dots: React.FC<{ score: number; on?: boolean }> = ({ score, on = true }) => (
  <span style={{ display: 'inline-flex', gap: 2, verticalAlign: 'middle' }}>
    {[0, 1, 2, 3].map((i) => (
      <span key={i} style={{
        width: 5, height: 5, borderRadius: '50%',
        background: !on ? 'var(--hair)'
          : i < score ? (score >= 3 ? '#10b981' : score >= 2 ? '#3b82f6' : '#f59e0b')
            : 'var(--hair)',
      }} />
    ))}
  </span>
);

/**
 * 탭 줄 — **모든 씬이 같은 줄을 이고 있어야** 자기가 앱의 어느 자리에 있는지 잃지 않는다.
 * 좌표가 아니라 흐름으로 그린다(창 안 어디에 놓든 따라온다).
 */
const TabRow: React.FC<{ active: '오늘' | '연습' | '기록'; x: number; y: number }> = ({ active, x, y }) => (
  <span style={{
    position: 'absolute', left: x, top: y, display: 'inline-flex', gap: 2,
    padding: 3, borderRadius: 8, background: 'var(--hair-2)',
  }}>
    {(['오늘', '연습', '기록'] as const).map((tab) => (
      <span key={tab} style={{
        padding: '2px 10px', borderRadius: 6, fontSize: 10.5, fontWeight: 700,
        background: tab === active ? 'var(--bg)' : 'transparent',
        color: tab === active ? 'var(--fg)' : 'var(--fg-faint)',
        boxShadow: tab === active ? '0 1px 2px rgba(15,23,42,0.08)' : undefined,
      }}>{tab}</span>
    ))}
  </span>
);

/** 근거 기록 칩 — 눌러서 펼치면 생기부 원문이 그 자리에 나온다 */
const SourceChip: React.FC<{ x: number; y: number; flash?: number; open?: boolean }> = ({
  x, y, flash = 0, open = false,
}) => (
  <span style={{
    position: 'absolute', left: x, top: y,
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 600,
    border: `1px solid ${flash > 0 || open ? 'var(--primary)' : 'var(--hair)'}`,
    background: open ? 'color-mix(in srgb, var(--primary) 8%, var(--bg))' : 'var(--bg)',
    color: open ? 'var(--primary)' : 'var(--fg-muted)',
    boxShadow: flash > 0 ? `0 0 0 ${5 * flash}px rgba(79,70,229,0.22)` : undefined,
  }}>
    ▤ 2학년 · 화학Ⅰ {open ? '▴' : '▾'}
  </span>
);

const QUESTION = '적정 실험에서 지시약을 메틸오렌지로 바꾼 이유는 무엇이었나요?';
const INTENT = '실험 설계에서의 판단 근거를 확인';
const EXCERPT = '중화 적정에서 종말점의 pH 범위를 고려해 페놀프탈레인 대신 메틸오렌지를 선택하고, 그 근거를 보고서에 정리함';

/* ══ ① 오늘의 질문 ══════════════════════════════════════════════════════════
   구도: 홈 카드 → 면접 준비. 첫 단계에서 말해야 할 것은 "어디서 시작하는가" 와
   "질문이 어디서 나왔는가" 둘이다. */


const A = { W1: 0.25, GET: 1.5, W2: 2.2, READY: 3.6, CHIP: 5.2, OPEN: 5.6, DONE: 8.4 };

export const SceneToday: React.FC = () => {
  const t = useSceneTime();
  const asked = t > A.GET;
  const ready = t > A.READY;
  const open = t > A.OPEN;

  return (
    <>
      <Band t={t}>① 홈에서 <Hi>오늘의 질문</Hi>을 받는다 — 내 생기부 기록에서 하나</Band>

      <AppWindow
        kind="browser" url="spacekijun / 홈" badge="①"
        style={{ ...boxOf(A_W1), ...popIn(t, A.W1), ...dimAfter(t, A.W2) }}
      >
        <div style={{ position: 'absolute', inset: 0, padding: 14 }}>
          <span style={{
            ...boxOf({ x: 14, y: 12, w: 352, h: 150 }),
            borderRadius: 12, border: '1px solid var(--hair)', background: 'var(--bg)',
            padding: 12, overflow: 'hidden',
          }}>
            <span style={{
              position: 'absolute', left: 0, top: 0, right: 0, height: 3,
              background: asked ? 'linear-gradient(90deg,#3b82f6,#06b6d4,#34d399)' : 'var(--hair)',
            }} />
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--fg)' }}>💬 오늘의 면접 질문</span>
              <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>답변한 날 12일</span>
            </span>
            <span style={{
              display: 'block', marginTop: 10, fontSize: 11, lineHeight: 1.7, color: 'var(--fg-muted)',
            }}>
              내 생기부에서 아직 다루지 않은 활동으로<br />면접 질문을 하나 만들어 드려요.
            </span>
          </span>
          <Btn rect={A_GET_REL} label="✦ 오늘의 질문 받기"
               flash={clickFlash(t, A.GET)} />
        </div>
      </AppWindow>

      <AppWindow
        kind="app" title="면접 준비" badge="②"
        style={{ ...boxOf(A_W2), ...popIn(t, A.W2), zIndex: 3 }}
      >
        <div style={{ position: 'absolute', inset: 0, padding: 16 }}>
          <TabRow active="오늘" x={16} y={10} />

          {!ready ? (
            <span style={{
              ...boxOf({ x: 16, y: 56, w: 552, h: 200 }),
              display: 'grid', placeItems: 'center', borderRadius: 12,
              border: '1px dashed var(--hair)', fontSize: 12, color: 'var(--fg-faint)',
            }}>
              질문을 만들고 있어요…
            </span>
          ) : (
            <span style={{ ...boxOf({ x: 16, y: 48, w: 552, h: 220 }), ...popIn(t, A.READY, 0.5) }}>
              <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>오늘의 질문 · 9/18</span>
              <span style={{
                display: 'block', marginTop: 8, fontSize: 15, fontWeight: 700,
                lineHeight: 1.6, color: 'var(--fg)',
              }}>{QUESTION}</span>
              <span style={{ display: 'block', marginTop: 8, fontSize: 10.5, color: 'var(--fg-muted)' }}>
                <span style={{ color: 'var(--fg-faint)' }}>질문 의도</span> · {INTENT}
              </span>
              {/* 부모 span 이 (16,48)에 있으므로 칩의 창 기준 자리는 (16+0, 48+80)=A_CHIP_REL 이다.
                  포인터는 같은 상수를 쓰므로 배치를 옮겨도 함께 따라온다. */}
              <SourceChip x={A_CHIP_REL.x - 16} y={A_CHIP_REL.y - 48} flash={clickFlash(t, A.CHIP)} open={open} />
              {open && (
                <span style={{
                  ...boxOf({ x: 0, y: 108, w: 470, h: 56 }), ...popIn(t, A.OPEN, 0.4),
                  borderRadius: 9, background: 'var(--hair-2)', padding: 10,
                  fontSize: 10.5, lineHeight: 1.7, color: 'var(--fg-muted)',
                }}>“{EXCERPT}”</span>
              )}
            </span>
          )}
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(250), y: pctY(58) },
        { t: A.GET, ...centerOf(A_GET), click: true },
        { t: A.CHIP, ...centerOf(A_CHIP), click: true },
        { t: A.DONE, ...centerOf(A_CHIP), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 답하고 피드백 ════════════════════════════════════════════════════════
   창 하나로 끝낸다 — 답변칸과 피드백은 같은 자리에 이어 나타나므로 창을 나누면
   오히려 "어디서 어디로 갔는지"가 흐려진다. */


const B = { W: 0.25, FOCUS: 1.1, TYPE: 1.4, SEND: 5.4, THINK: 5.6, RESULT: 6.9, DONE: 9.4 };
const ANSWER = '종말점의 pH가 산성 쪽에 있다고 판단해 지시약을 바꾸었습니다. 그렇게 생각한 이유는…';

export const SceneAnswer: React.FC = () => {
  const t = useSceneTime();
  const text = typed(t, ANSWER, B.TYPE, 22);
  const sent = t > B.SEND;
  const done = t > B.RESULT;

  return (
    <>
      <Band t={t}>② 답을 쓰면 <Hi>항목별 피드백</Hi>이 온다 — 점수가 아니라 약한 곳 표시</Band>

      <AppWindow kind="app" title="면접 준비" style={{ ...boxOf(B_W), ...popIn(t, B.W) }}>
        <div style={{ position: 'absolute', inset: 0, padding: 16 }}>
          <TabRow active="오늘" x={16} y={10} />

          <span style={{
            ...boxOf({ x: 16, y: 48, w: 620, h: 32 }),
            fontSize: 12.5, fontWeight: 700, lineHeight: 1.5, color: 'var(--fg)',
          }}>{QUESTION}</span>

          {!done ? (
            <>
              <span style={{ position: 'absolute', left: 16, top: 84, fontSize: 10, color: 'var(--fg-faint)' }}>
                ▾ 답변의 뼈대 (결론 → 이유 → 사례 → 전공 연결)
              </span>
              <span style={{
                ...boxOf(B_AREA_REL),
                borderRadius: 10, border: `1px solid ${t > B.FOCUS ? 'var(--primary)' : 'var(--hair)'}`,
                background: 'var(--bg)', padding: 10, fontSize: 11.5, lineHeight: 1.8,
                color: 'var(--fg)', overflow: 'hidden',
              }}>{text || <span style={{ color: 'var(--fg-faint)' }}>결론을 먼저 말하고, 그렇게 생각한 이유와 실제 경험을 이어서 적어 보세요.</span>}</span>
              <span style={{ position: 'absolute', left: 16, top: 184, fontSize: 10, color: 'var(--fg-faint)' }}>
                {text.length}자{text.length >= 20 && ' · 말하면 약 1분'}
                {text.length > 30 && <span style={{ color: '#059669' }}> · 초안 저장됨</span>}
              </span>
              <Btn rect={B_SEND_REL}
                   label={sent ? '답변을 읽고 있어요' : '✈ 피드백 받기'}
                   flash={clickFlash(t, B.SEND)} />
              {sent && (
                <span style={{ position: 'absolute', left: 16, top: 212, fontSize: 10, color: 'var(--fg-faint)' }}>
                  보통 20~40초 걸려요. 창을 닫아도 결과는 저장됩니다.
                </span>
              )}
            </>
          ) : (
            <span style={{ ...boxOf({ x: 16, y: 88, w: 662, h: 270 }), ...popIn(t, B.RESULT, 0.5) }}>
              <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
                연습용 AI 피드백 · 항목별 0~4단계 · 실제 입시 점수가 아닙니다
              </span>
              <span style={{ display: 'block', marginTop: 10 }}>
                {[
                  ['결론 제시', 4], ['이유 설명', 3], ['구체적 사례', 2], ['전공·진로 연결', 1],
                ].map(([label, score], i) => (
                  <span key={label as string} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
                    background: i === 3 ? 'color-mix(in srgb, var(--primary) 5%, transparent)' : undefined,
                    borderRadius: 5,
                  }}>
                    <Dots score={score as number} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg)' }}>{label}</span>
                    {i === 3 && (
                      <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
                        · 배운 점이 전공 학습과 어떻게 이어지는지 한 문장 더
                      </span>
                    )}
                  </span>
                ))}
              </span>
              <span style={{ display: 'block', marginTop: 12, fontSize: 11, lineHeight: 1.8 }}>
                <b style={{ color: '#047857' }}>잘한 점 </b>
                <span style={{ color: 'var(--fg-muted)' }}>판단 기준을 먼저 밝히고 근거를 붙였습니다.</span><br />
                <b style={{ color: '#1d4ed8' }}>먼저 보완할 점 </b>
                <span style={{ color: 'var(--fg-muted)' }}>실험에서 본인이 직접 한 행동이 드러나지 않습니다.</span>
              </span>
              <span style={{
                ...boxOf({ x: 0, y: 176, w: 520, h: 34 }),
                borderLeft: '2px solid #818cf8', background: 'rgba(99,102,241,0.06)',
                padding: '8px 10px', fontSize: 11, lineHeight: 1.6, color: '#3730a3',
              }}>✦ 그 판단이 틀렸다면 어떻게 확인했을까요?</span>
              <span style={{ position: 'absolute', left: 0, top: 222, display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 10.5, color: 'var(--fg-muted)' }}>답변 고쳐서 다시 받기</span>
                <span style={{
                  padding: '3px 9px', borderRadius: 7, background: '#4f46e5',
                  color: '#fff', fontSize: 10.5, fontWeight: 700,
                }}>이 질문에 답하기</span>
              </span>
            </span>
          )}
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.8, x: pctX(400), y: pctY(300) },
        { t: B.FOCUS, ...centerOf(B_AREA), click: true },
        { t: B.SEND, ...centerOf(B_SEND), click: true },
        { t: B.DONE, ...centerOf(B_SEND), hide: true },
      ]} />
    </>
  );
};

/* ══ ③ 연습 ═════════════════════════════════════════════════════════════════ */


const C = { W: 0.25, FILTER: 1.7, FILTERED: 2.1, CARD: 3.6, Q: 4.4, DONE: 7.8 };

const ACTIVITIES: [string, string, number][] = [
  ['적정 실험 지시약 비교', '화학Ⅰ', 3],
  ['학급 환경 캠페인 기획', '자율활동', 0],
  ['효소 반응 속도 탐구', '생명과학Ⅰ', 0],
  ['진로 탐색 보고서', '진로활동', 1],
];

export const ScenePractice: React.FC = () => {
  const t = useSceneTime();
  const filtered = t > C.FILTERED;
  const picked = t > C.CARD;
  const shown = filtered ? ACTIVITIES.filter((a) => a[2] === 0) : ACTIVITIES;

  return (
    <>
      <Band t={t}>③ 더 하고 싶으면 <Hi>활동을 직접 골라</Hi> 질문을 받는다</Band>

      <AppWindow kind="app" title="면접 준비" style={{ ...boxOf(C_W), ...popIn(t, C.W) }}>
        <div style={{ position: 'absolute', inset: 0, padding: 16 }}>
          <TabRow active="연습" x={16} y={10} />

          {/* 공통 질문 — 생기부가 얇아도 할 수 있는 트랙 */}
          <span style={{
            ...boxOf({ x: 16, y: 46, w: 722, h: 60 }),
            borderRadius: 11, border: '1px solid var(--hair)', padding: 10,
          }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--fg)' }}>📖 공통 질문</span>
            <span style={{ display: 'flex', gap: 5, marginTop: 8 }}>
              {['지원 동기', '학업 계획', '성장 경험', '공동체·협업', '독서·관심 분야'].map((s) => (
                <span key={s} style={{
                  padding: '2px 8px', borderRadius: 999, border: '1px solid var(--hair)',
                  fontSize: 10, color: 'var(--fg-muted)',
                }}>✦ {s}</span>
              ))}
            </span>
          </span>

          <span style={{ position: 'absolute', left: 16, top: 118, fontSize: 10.5, color: 'var(--fg-muted)' }}>
            오늘 남은 연습 질문 <b style={{ color: '#2563eb' }}>{picked ? 3 : 4}개</b>
          </span>

          {/* 세그먼트 — 아직 안 다룬 활동만 보기. 두 알약을 **절대 배치**해 포인터와 자리를 공유한다. */}
          <span style={{
            ...boxOf({ x: C_SEG1_REL.x - 3, y: C_SEG1_REL.y - 3, w: C_SEG2_REL.x + C_SEG2_REL.w - C_SEG1_REL.x + 6, h: 30 }),
            borderRadius: 8, background: 'var(--hair-2)',
          }} />
          {([[C_SEG1_REL, '전체', 4, false], [C_SEG2_REL, '아직 질문 안 받은 활동', 2, true]] as const).map(
            ([rect, label, n, isSecond]) => {
              const on = isSecond === filtered;
              return (
                <span key={label} style={{
                  ...boxOf(rect),
                  display: 'grid', placeItems: 'center', borderRadius: 6,
                  fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                  background: on ? 'var(--bg)' : 'transparent',
                  color: on ? 'var(--fg)' : 'var(--fg-faint)',
                  boxShadow: on ? '0 1px 2px rgba(15,23,42,0.08)' : undefined,
                  outline: clickFlash(t, C.FILTER) > 0 && isSecond
                    ? `${3 * clickFlash(t, C.FILTER)}px solid rgba(79,70,229,0.25)` : undefined,
                }}>{label} {n}</span>
              );
            },
          )}

          <span style={{ position: 'absolute', left: 16, top: 178, fontSize: 10, fontWeight: 700, color: 'var(--fg-faint)' }}>
            2학년
          </span>
          <span style={{ ...boxOf({ x: C_CARD_REL.x, y: C_CARD_REL.y, w: 470, h: 140 }) }}>
            {shown.map((a, i) => (
              <span key={a[0]} style={{
                position: 'absolute', left: (i % 2) * 232, top: Math.floor(i / 2) * 70,
                width: C_CARD_REL.w, height: C_CARD_REL.h, borderRadius: 10, padding: 9,
                border: `1px solid ${picked && i === 0 ? 'var(--primary)' : 'var(--hair)'}`,
                background: picked && i === 0 ? 'color-mix(in srgb, var(--primary) 5%, var(--bg))' : 'var(--bg)',
                display: 'flex', flexDirection: 'column', gap: 3,
                boxShadow: i === 0 && clickFlash(t, C.CARD) > 0
                  ? `0 0 0 ${5 * clickFlash(t, C.CARD)}px rgba(79,70,229,0.22)` : undefined,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg)' }}>{a[0]}</span>
                <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{a[1]}</span>
                <span style={{ fontSize: 10, color: a[2] ? 'var(--fg-muted)' : 'var(--fg-faint)' }}>
                  {a[2] ? `질문 ${a[2]}개` : '아직 질문 없음'}
                </span>
              </span>
            ))}
          </span>

          {t > C.Q && (
            <span style={{
              ...boxOf({ x: 500, y: 194, w: 238, h: 128 }), ...popIn(t, C.Q, 0.5),
              borderRadius: 11, border: '1px solid var(--primary)', padding: 11,
              background: 'var(--bg)',
            }}>
              <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>연습 질문 · 방금</span>
              <span style={{
                display: 'block', marginTop: 7, fontSize: 11.5, fontWeight: 700,
                lineHeight: 1.6, color: 'var(--fg)',
              }}>캠페인을 기획할 때 가장 먼저 확인한 것은 무엇이었나요?</span>
            </span>
          )}
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(420), y: pctY(320) },
        { t: C.FILTER, ...centerOf(C_FILTER), click: true },
        { t: C.CARD, ...centerOf(C_CARD), click: true },
        { t: C.DONE, ...centerOf(C_CARD), hide: true },
      ]} />
    </>
  );
};

/* ══ ④ 쌓인 기록과 선생님 ═══════════════════════════════════════════════════
   **클릭이 없는 단계다.** 사용자가 *할 일*이 아니라 *알아야 할 것*을 말한다 —
   기록이 어떻게 쌓이는지, 그리고 그 기록을 **선생님이 본다**는 사실. */


const D = { W1: 0.25, BAR: 1.1, WEAK: 2.4, W2: 4.0, NOTE: 5.6, DONE: 8.6 };

export const SceneRecord: React.FC = () => {
  const t = useSceneTime();
  const fill = interpolate(t, [D.BAR, D.BAR + 1.0], [0, 31]);

  return (
    <>
      <Band t={t}>④ 기록이 쌓이고 — <Hi>선생님도 같은 답변을 본다</Hi></Band>

      <AppWindow
        kind="app" title="면접 준비" badge="①"
        style={{ ...boxOf(D_W1), ...popIn(t, D.W1), ...dimAfter(t, D.W2, 0.55) }}
      >
        <div style={{ position: 'absolute', inset: 0, padding: 16 }}>
          <TabRow active="기록" x={16} y={10} />

          <span style={{ ...boxOf({ x: 16, y: 48, w: 392, h: 104 }),
            borderRadius: 11, border: '1px solid var(--hair)', padding: 12 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg)' }}>다룬 활동</span>
              <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
                활동 54개 중 <b style={{ color: 'var(--fg)' }}>{Math.round(fill * 0.54)}개</b> · {Math.round(fill)}%
              </span>
            </span>
            <span style={{
              display: 'block', marginTop: 7, height: 7, borderRadius: 999,
              background: 'var(--hair-2)', overflow: 'hidden',
            }}>
              <span style={{
                display: 'block', height: '100%', width: `${fill}%`, borderRadius: 999,
                background: 'linear-gradient(90deg,#3b82f6,#34d399)',
              }} />
            </span>
            <span style={{ display: 'flex', gap: 14, marginTop: 8 }}>
              {[['1학년', '2/12'], ['2학년', '9/24'], ['3학년', '6/18']].map(([g, n]) => (
                <span key={g} style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
                  {g} <span style={{ color: 'var(--fg-faint)' }}>{n}</span>
                </span>
              ))}
            </span>
            {t > D.WEAK && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 10, marginTop: 10,
                paddingTop: 8, borderTop: '1px solid var(--hair-2)', ...popIn(t, D.WEAK, 0.4),
              }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg)' }}>아직 약한 기준</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--fg-muted)' }}>
                  전공·진로 연결 <Dots score={1} />
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--fg-muted)' }}>
                  구체적 사례 <Dots score={2} />
                </span>
              </span>
            )}
          </span>

          <span style={{ ...boxOf({ x: 16, y: 166, w: 392, h: 200 }) }}>
            {[['2학년 · 화학Ⅰ', '질문 3개 · 평가받은 답변 4개', true],
              ['2학년 · 자율활동', '질문 1개 · 평가받은 답변 1개', true],
              ['공통 질문 · 지원 동기', '질문 2개 · 평가받은 답변 2개', false]].map(([a, b, done], i) => (
              <span key={a as string} style={{
                position: 'absolute', left: 0, top: i * 52, width: 392, height: 44,
                borderRadius: 10, border: '1px solid var(--hair)', padding: '8px 10px',
                display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden',
              }}>
                <span style={{
                  position: 'absolute', left: 0, top: 0, right: 0, height: 2,
                  background: done ? '#10b981' : 'var(--hair)',
                }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg)' }}>{a}</span>
                <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{b}</span>
              </span>
            ))}
          </span>
        </div>
      </AppWindow>

      <AppWindow
        kind="browser" url="spacekijun / 생기부 분석" badge="②"
        style={{ ...boxOf(D_W2), ...popIn(t, D.W2), zIndex: 3 }}
      >
        <div style={{ position: 'absolute', inset: 0, padding: 14 }}>
          <span style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {['요약정보', '비교과', '역량분석', '활동 타임라인', '면접 준비'].map((tab) => (
              <span key={tab} style={{
                padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                background: tab === '면접 준비' ? 'var(--bg)' : 'transparent',
                color: tab === '면접 준비' ? 'var(--primary)' : 'var(--fg-faint)',
                border: `1px solid ${tab === '면접 준비' ? 'var(--primary)' : 'transparent'}`,
              }}>{tab}</span>
            ))}
          </span>

          <span style={{ position: 'absolute', left: 14, top: 40, fontSize: 10, color: 'var(--fg-muted)' }}>
            질문 6개 · 평가받은 답변 7개 <span style={{ color: 'var(--fg-faint)' }}>· 최근 9/18</span>
          </span>

          <span style={{
            ...boxOf({ x: 14, y: 62, w: 388, h: 120 }),
            borderRadius: 10, border: '1px solid var(--hair)', padding: 11,
          }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg)' }}>2학년 · 화학Ⅰ</span>
            <span style={{ display: 'block', marginTop: 6, fontSize: 10, lineHeight: 1.7, color: 'var(--fg-muted)' }}>
              Q. 지시약을 메틸오렌지로 바꾼 이유는…<br />
              A. 종말점의 pH가 산성 쪽에 있다고 판단해…
            </span>
            <span style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {[['결론', 4], ['이유', 3], ['사례', 2], ['전공', 1]].map(([l, s]) => (
                <span key={l as string} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--fg-faint)' }}>
                  {l} <Dots score={s as number} />
                </span>
              ))}
            </span>
          </span>

          {t > D.NOTE && (
            <span style={{
              ...boxOf({ x: 14, y: 194, w: 388, h: 34 }), ...popIn(t, D.NOTE, 0.4),
              borderRadius: 9, background: 'rgba(16,185,129,0.09)',
              border: '1px solid rgba(16,185,129,0.35)',
              padding: '8px 10px', fontSize: 10, lineHeight: 1.5, color: '#065f46',
            }}>
              선생님은 <b>활동별</b>로 본다 — 아직 질문을 받지 않은 활동도 함께 보인다
            </span>
          )}
        </div>
      </AppWindow>
    </>
  );
};
