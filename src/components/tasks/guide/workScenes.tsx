/**
 * 업무 검색 탭 안내 — 씬 3편.
 *
 * 목업 근거: `TaskHeader`(부서 선택 · "업무명, 할 일, 담당자, 키워드 검색") ·
 * `WorkList`("모두 펼치기/접기", 한 줄에 업무 하나 — 2026-09-27) · `WorkCard`("세부 할 일 N개", 매니저 이름) ·
 * `WorkCreateDialog` · `SearchableMultiSelect`(태그·엑셀 붙여넣기).
 * **화면 문구가 바뀌면 함께 고칠 것.**
 */
import React from 'react';
import {
  AppWindow, Caret, Pointer, clickFlash, dimAfter, popIn, typed, typedDoneAt, useSceneTime,
} from '@/lib/walkthrough';
import {
  boxOf, centerOf, inWindow, pctX, pctY, WINDOW_CHROME as CH, type Rect,
} from '@/components/walkthrough/stageCoords';
import { Band, Btn, Field, Hi, Pill, Stub } from '@/components/walkthrough/atoms';
import { TabBar } from './shared';
import { TAB } from './tabs';

/* ══ ① 업무 만들기 ════════════════════════════════════════════════════════ */

const E1_W1: Rect = { x: 40, y: 62, w: 430, h: 260 };
const E1_NEW = inWindow(E1_W1, { x: 316, y: 42, w: 100, h: 26 }, CH);
const E1_W2: Rect = { x: 390, y: 186, w: 500, h: 310 };
const E1_NAME = inWindow(E1_W2, { x: 16, y: 30, w: 468, h: 28 }, CH);
const E1_SAVE = inWindow(E1_W2, { x: 370, y: 230, w: 114, h: 30 }, CH);

const E1 = { W1_IN: 0.25, CLICK_NEW: 1.4, W2_IN: 2.0, NAME: 2.6, TYPE: 2.9, SAVE: 6.4, DONE: 7.4 };
const E1_TITLE = '2학기 평가계획 제출';

export const SceneCreate: React.FC = () => {
  const t = useSceneTime();
  const name = typed(t, E1_TITLE, E1.TYPE, 11);
  const typing = t > E1.TYPE && t < typedDoneAt(E1_TITLE, E1.TYPE, 11) + 0.7;
  const saved = t > E1.SAVE;

  return (
    <>
      <Band t={t}>① <Hi>업무</Hi>는 할 일을 담는 묶음 — 이름·부서·기간부터 정한다</Band>

      <AppWindow kind="browser" url="spacekijun / 업무 관리" badge="①"
                 style={{ ...boxOf(E1_W1), ...popIn(t, E1.W1_IN), ...dimAfter(t, E1.W2_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <TabBar active={TAB.works} />
          <Btn rect={{ x: 316, y: 42, w: 100, h: 26 }} label="＋ 새 업무"
               flash={clickFlash(t, E1.CLICK_NEW)} />
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{
              ...boxOf({ x: 12 + (i % 2) * 202, y: 80 + Math.floor(i / 2) * 76, w: 192, h: 66 }),
              borderRadius: 10, border: '1px solid var(--hair)', padding: 9,
              display: 'flex', flexDirection: 'column', gap: 5,
            }}>
              <Stub w={110} h={6} /><Stub w={150} h={4} o={0.6} />
              <span style={{ marginTop: 'auto', fontSize: 8.5, color: 'var(--fg-faint)' }}>
                세부 할 일 {2 + i}개
              </span>
            </span>
          ))}
        </div>
      </AppWindow>

      <AppWindow kind="app" title="새 업무" badge="②"
                 style={{ ...boxOf(E1_W2), ...popIn(t, E1.W2_IN), zIndex: 3 }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <span style={{ position: 'absolute', left: 16, top: 12, fontSize: 9.5, color: 'var(--fg-faint)' }}>
            업무 이름
          </span>
          <Field rect={{ x: 16, y: 30, w: 468, h: 28 }} flash={clickFlash(t, E1.NAME)}>
            {t > E1.TYPE
              ? <span style={{ color: 'var(--fg)' }}>{name}{typing && <Caret />}</span>
              : <span>예: 2학기 평가계획 제출</span>}
          </Field>

          {[['부서', '교육과정부'], ['기간', '09/01 ~ 09/12']].map(([label, val], i) => (
            <React.Fragment key={label}>
              <span style={{ position: 'absolute', left: 16 + i * 240, top: 68, fontSize: 9.5, color: 'var(--fg-faint)' }}>
                {label}
              </span>
              <Field rect={{ x: 16 + i * 240, y: 86, w: 228, h: 28 }}>
                <span style={{ color: 'var(--fg)', fontSize: 11 }}>{val}</span>
              </Field>
            </React.Fragment>
          ))}

          <span style={{ position: 'absolute', left: 16, top: 126, fontSize: 9.5, color: 'var(--fg-faint)' }}>
            설명
          </span>
          <span style={{
            ...boxOf({ x: 16, y: 144, w: 468, h: 54 }),
            borderRadius: 7, border: '1px solid var(--hair)', padding: '8px 10px',
            fontSize: 10.5, color: 'var(--fg-muted)', lineHeight: 1.5,
          }}>
            과목별 평가계획을 확인하고 기한까지 제출합니다
          </span>

          <span style={{ position: 'absolute', left: 16, top: 240, right: 130, fontSize: 9.5, lineHeight: 1.6, color: 'var(--fg-faint)' }}>
            만든 사람이 <b style={{ color: 'var(--fg-muted)' }}>책임자</b>가 됩니다 —
            모든 담당자의 상태를 바꿀 수 있어요
          </span>
          <Btn rect={{ x: 370, y: 230, w: 114, h: 30 }}
               label={saved ? '✓ 만들었습니다' : '업무 만들기'}
               tone={saved ? 'ok' : 'primary'} flash={clickFlash(t, E1.SAVE)} />
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(300), y: pctY(40) },
        { t: E1.CLICK_NEW, ...centerOf(E1_NEW), click: true },
        { t: E1.NAME, ...centerOf(E1_NAME), click: true },
        { t: E1.SAVE, ...centerOf(E1_SAVE), click: true },
        { t: E1.DONE, ...centerOf(E1_SAVE), hide: true },
      ]} />
    </>
  );
};

/* ══ ② 세부 할 일과 담당자 ═══════════════════════════════════════════════════
   담당자 넣기가 이 화면의 진짜 일이라, **한 명씩 찾지 않아도 되는 방법** 두 가지를 보여 준다. */

const E2_W: Rect = { x: 150, y: 62, w: 660, h: 430 };
const E2_ADD = inWindow(E2_W, { x: 512, y: 12, w: 116, h: 26 }, CH);
const E2_PICK = inWindow(E2_W, { x: 16, y: 168, w: 612, h: 30 }, CH);

const E2 = { W_IN: 0.25, ADD: 1.5, ROW: 2.2, PICK: 3.6, TAG: 4.4, PASTE: 6.0, DONE: 7.6 };

export const SceneAssign: React.FC = () => {
  const t = useSceneTime();
  const added = t > E2.ROW;
  const tagged = t > E2.TAG;
  const pasted = t > E2.PASTE;

  return (
    <>
      <Band t={t}>② 세부 할 일을 넣고 <Hi>담당자</Hi>를 붙이면 그 사람의 &lsquo;내 할 일&rsquo;에 나타난다</Band>

      <AppWindow kind="app" title="2학기 평가계획 제출"
                 style={{ ...boxOf(E2_W), ...popIn(t, E2.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <span style={{ position: 'absolute', left: 16, top: 16, fontSize: 11.5, fontWeight: 700 }}>
            세부 할 일
          </span>
          <Btn rect={{ x: 512, y: 12, w: 116, h: 26 }} label="＋ 할 일 추가" tone="ghost"
               flash={clickFlash(t, E2.ADD)} />

          {added && (
            <span style={{ ...popIn(t, E2.ROW, 0.4) }}>
              <span style={{
                ...boxOf({ x: 16, y: 46, w: 612, h: 34 }),
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
                borderRadius: 8, border: '1px solid var(--primary)',
                background: 'color-mix(in srgb, var(--primary) 5%, transparent)',
                fontSize: 11, fontWeight: 650,
              }}>
                평가계획서 작성
                <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--fg-faint)' }}>09/12 마감</span>
              </span>
              <span style={{
                ...boxOf({ x: 16, y: 86, w: 612, h: 30 }),
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
                borderRadius: 8, border: '1px solid var(--hair)', fontSize: 10.5,
                color: 'var(--fg-muted)',
              }}>교과협의회 결과 정리</span>
            </span>
          )}

          <span style={{ position: 'absolute', left: 16, top: 132, fontSize: 9.5, fontWeight: 700, color: 'var(--fg-faint)' }}>
            담당자
          </span>
          <span style={{
            ...boxOf({ x: 16, y: 168, w: 612, h: 30 }),
            display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px',
            borderRadius: 7, fontSize: 11,
            border: `1px solid ${clickFlash(t, E2.PICK) > 0 ? 'var(--primary)' : 'var(--hair)'}`,
            background: 'var(--bg)', color: tagged ? 'var(--fg)' : 'var(--fg-faint)',
          }}>
            {tagged ? (
              <>
                {['김하늘', '박도윤', '이서준'].map((n) => (
                  <span key={n} style={{
                    borderRadius: 999, border: '1px solid var(--primary)',
                    background: 'color-mix(in srgb, var(--primary) 8%, var(--bg))',
                    padding: '2px 9px', fontSize: 10, fontWeight: 650,
                  }}>{n}</span>
                ))}
                <span style={{ fontSize: 9.5, color: 'var(--fg-faint)' }}>
                  외 {pasted ? 21 : 5}명
                </span>
              </>
            ) : '이름으로 검색'}
          </span>

          {/* 한 명씩 찾지 않아도 되는 두 가지 */}
          {tagged && (
            <span style={{ ...popIn(t, E2.TAG, 0.45) }}>
              <span style={{ position: 'absolute', left: 16, top: 212, display: 'flex', gap: 6 }}>
                {['3학년 담임', '교육과정부', '1학년 국어'].map((tag, i) => (
                  <span key={tag} style={{
                    borderRadius: 999, padding: '3px 10px', fontSize: 9.5, fontWeight: 650,
                    border: `1px solid ${i === 0 ? 'var(--primary)' : 'var(--hair)'}`,
                    background: i === 0 ? 'color-mix(in srgb, var(--primary) 8%, var(--bg))' : 'var(--bg)',
                    color: i === 0 ? 'var(--primary)' : 'var(--fg-muted)',
                  }}>＃{tag}</span>
                ))}
                <span style={{ fontSize: 9.5, color: 'var(--fg-faint)', alignSelf: 'center' }}>
                  태그·학년·반으로 한 번에
                </span>
              </span>
            </span>
          )}

          {t > E2.PASTE - 0.6 && (
            <span style={{
              ...boxOf({ x: 16, y: 250, w: 612, h: 96 }),
              borderRadius: 10, padding: 12,
              border: `1.5px ${pasted ? 'solid' : 'dashed'} ${pasted ? '#6ee7b7' : 'var(--hair)'}`,
              background: pasted ? '#ecfdf5' : 'var(--bg)',
              display: 'flex', flexDirection: 'column', gap: 6,
              ...popIn(t, E2.PASTE - 0.6, 0.5),
            }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: pasted ? '#065f46' : 'var(--fg)' }}>
                {pasted ? '✓ 붙여넣기로 18명 추가' : '엑셀·시트에서 복사한 명단을 그대로 Ctrl+V'}
              </span>
              <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {['김하늘', '박도윤', '이서준', '최유진', '정민서', '한지호'].map((n) => (
                  <span key={n} style={{
                    borderRadius: 5, padding: '2px 7px', fontSize: 9,
                    border: `1px solid ${pasted ? '#6ee7b7' : 'var(--hair)'}`,
                    background: pasted ? '#fff' : 'transparent',
                    color: pasted ? '#065f46' : 'var(--fg-faint)',
                  }}>{n}</span>
                ))}
                <span style={{ fontSize: 9, color: 'var(--fg-faint)', alignSelf: 'center' }}>…</span>
              </span>
              <span style={{ fontSize: 9, color: 'var(--fg-faint)' }}>
                이름이 안 맞는 줄은 따로 표시돼 고칠 수 있어요
              </span>
            </span>
          )}
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 0.9, x: pctX(400), y: pctY(30) },
        { t: E2.ADD, ...centerOf(E2_ADD), click: true },
        { t: E2.PICK, ...centerOf(E2_PICK), click: true },
        { t: E2.DONE, ...centerOf(E2_PICK), hide: true },
      ]} />
    </>
  );
};

/* ══ ③ 진행 보기 ════════════════════════════════════════════════════════════
   클릭 최소. 책임자가 **무엇을 보게 되는가**가 이 단계의 내용이다. */

const E3_W: Rect = { x: 60, y: 62, w: 840, h: 430 };
const E3_FILTER = inWindow(E3_W, { x: 560, y: 46, w: 110, h: 24 }, CH);

const E3 = { W_IN: 0.25, CARDS: 1.0, FILTER: 3.0, FILTERED: 3.7, END: 6.6 };

export const SceneManage: React.FC = () => {
  const t = useSceneTime();
  const filtered = t > E3.FILTERED;

  const EVENTS = [
    { name: '2학기 평가계획 제출', dept: '교육과정부', manager: '김교사', done: 3, total: 5, tone: '진행 중' },
    { name: '생기부 마감 점검', dept: '교무기획부', manager: '이교사', done: 8, total: 8, tone: '완료' },
    { name: '학교평가 자료 수집', dept: '교육과정부', manager: '박교사', done: 1, total: 6, tone: '진행 중' },
    { name: '방과후 정산', dept: '방과후부', manager: '최교사', done: 0, total: 4, tone: '예정' },
  ];
  const shown = filtered ? EVENTS.filter((e) => e.dept === '교육과정부') : EVENTS;

  return (
    <>
      <Band t={t}>③ 업무 목록을 <Hi>부서·상태</Hi>로 좁혀 진행을 본다</Band>

      <AppWindow kind="browser" url="spacekijun / 업무 관리"
                 style={{ ...boxOf(E3_W), ...popIn(t, E3.W_IN) }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <TabBar active={TAB.works} />

          <span style={{
            ...boxOf({ x: 560, y: 46, w: 110, h: 24 }),
            display: 'flex', alignItems: 'center', gap: 5, padding: '0 9px',
            borderRadius: 7, fontSize: 9.5, fontWeight: 650,
            border: `1px solid ${filtered ? 'var(--primary)' : 'var(--hair)'}`,
            background: filtered ? 'color-mix(in srgb, var(--primary) 7%, var(--bg))' : 'var(--bg)',
            color: filtered ? 'var(--primary)' : 'var(--fg-muted)',
            boxShadow: clickFlash(t, E3.FILTER) > 0 ? `0 0 0 5px rgba(79,70,229,0.24)` : undefined,
          }}>
            {filtered ? '교육과정부' : '모든 부서'} ▾
          </span>
          <span style={{
            ...boxOf({ x: 680, y: 46, w: 128, h: 24 }),
            display: 'flex', alignItems: 'center', padding: '0 9px',
            borderRadius: 7, fontSize: 9.5, color: 'var(--fg-faint)',
            border: '1px solid var(--hair)',
          }}>업무명·담당자 검색</span>

          {t > E3.CARDS && (
            <span style={{ ...popIn(t, E3.CARDS, 0.5) }}>
              {/* 한 줄에 업무 하나(2026-09-27 — 내 업무 관리와 같은 카드). 실제 = WorkCard */}
              {shown.map((e, i) => (
                <div key={e.name} style={{
                  ...boxOf({ x: 12, y: 84 + i * 72, w: 816, h: 64 }), boxSizing: 'border-box',
                  borderRadius: 11, border: '1px solid var(--hair)', padding: '9px 14px',
                  display: 'flex', alignItems: 'center', gap: 14, overflow: 'hidden',
                }}>
                  <span style={{
                    position: 'absolute', left: 0, right: 0, top: 0, height: 3,
                    background: e.done === e.total ? '#10b981' : 'linear-gradient(90deg,#3b82f6,#06b6d4,#34d399)',
                  }} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.name}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 9.5, color: 'var(--fg-faint)' }}>
                      <span style={{ borderRadius: 4, padding: '1px 5px', background: 'color-mix(in srgb, var(--fg) 6%, transparent)', color: 'var(--fg-muted)' }}>{e.dept}</span>
                      <span>책임자 {e.manager}</span>
                      <span style={{ color: 'var(--primary)', fontWeight: 650 }}>세부 할 일 {e.total}개 ▼</span>
                    </span>
                  </span>
                  <Pill label={e.tone}
                    {...(e.tone === '완료'
                      ? { fg: '#065f46', bg: '#d1fae5', bd: '#6ee7b7' }
                      : e.tone === '진행 중'
                        ? { fg: '#1d4ed8', bg: '#dbeafe', bd: '#93c5fd' }
                        : { fg: '#475569', bg: '#f1f5f9', bd: '#cbd5e1' })} />
                  <span style={{ width: 120, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                      <span style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--hair)' }}>
                        <span style={{
                          display: 'block', width: `${(e.done / e.total) * 100}%`, height: 5,
                          borderRadius: 3, background: e.done === e.total ? '#059669' : '#3b82f6',
                        }} />
                      </span>
                      <span style={{ fontSize: 9.5, fontWeight: 650 }}>{Math.round((e.done / e.total) * 100)}%</span>
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--fg-muted)' }}>{e.done}/{e.total} 완료</span>
                  </span>
                </div>
              ))}
            </span>
          )}

          <span style={{
            position: 'absolute', left: 12, bottom: 10, fontSize: 9.5, color: 'var(--fg-faint)',
          }}>
            펼치면 할 일 표 — 담당자는 <b style={{ color: 'var(--fg-muted)' }}>인원 수</b>만 보입니다.
            담당자 상태는 <b style={{ color: 'var(--fg-muted)' }}>내가 책임자인 업무</b>에서 바꿉니다
          </span>
        </div>
      </AppWindow>

      <Pointer path={[
        { t: 1.8, x: pctX(300), y: pctY(30) },
        { t: E3.FILTER, ...centerOf(E3_FILTER), click: true },
        { t: E3.END, ...centerOf(E3_FILTER), hide: true },
      ]} />
    </>
  );
};
