import type { KgEntityRow } from '@/features/inquiry-design/types';

/**
 * 제1장 «나의 첫 별» 의 단계별 안내 (2026-10-03).
 *
 * 새 별 찾기는 한 화면에 선택 넷(수업·재료·질문·설계)과 입력 둘(질문·이유)이 함께 있어 처음
 * 온 학생은 어디부터 손대야 할지 모른다. 그래서 제1장에서는 ①망원경에서 **카시안이 고른 별
 * 하나**를 찾아 누르게 하고 ②연구대에서 설계지를 **한 칸씩 실제로 조작하게** 안내한다 —
 * 수업을 고르고, 지도를 펼쳐 재료 별을 보고, 질문을 적고, 버튼을 누른다(2026-10-03 사용자 지시:
 * «확인» 버튼으로 넘기는 설명이 아니라 망원경에서 별을 고르게 한 것처럼 절차를 눈으로 안내).
 * 안내는 상태에서 유도한다 — 학생이 그 조작을 하면 다음 단계로 넘어가고, 어디서 새로고침해도
 * 같은 자리로 돌아온다(저장할 것이 없다).
 */

/** 카시안이 고르는 별 — Thread 를 먼저, 없으면 Activity. 무작위이되 **결정적**(학생·버전이 같으면 같은 별)이라 새로고침해도 바뀌지 않는다. */
export function pickTutorialStar(entities: Pick<KgEntityRow, 'entity_id' | 'label' | 'type'>[], seed: string): Pick<KgEntityRow, 'entity_id' | 'label' | 'type'> | null {
  const threads = entities.filter(e => e.type === 'Thread');
  const pool = threads.length ? threads : entities.filter(e => e.type === 'Activity');
  if (!pool.length) return null;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  // 같은 입력이면 같은 별 — 라벨 순으로 정렬해 두어 DB 가 주는 행 순서에도 흔들리지 않는다.
  const sorted = [...pool].sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  return sorted[(h >>> 0) % sorted.length];
}

/** 지금 비추는 칸 — `data-guide=active` 가 붙는 요소. `mapBack` 은 지도를 펼친 동안 «설계지 펼치기» 버튼. */
export type DesignTutorialTarget = 'stage' | 'material' | 'mapBack' | 'question' | 'build' | 'rationale' | 'confirm';
export interface DesignTutorialStep { index: number; total: number; target: DesignTutorialTarget; title: string; text: string; /** 그 칸 옆에 붙는 손가락 표시의 짧은 말. */ hint: string }
export interface DesignTutorialState {
  targetName: string | null;
  starLabel: string | null;
  sourceCount: number;
  /** 수업 목록을 실제로 열어 골랐는가(바꾸지 않고 닫아도 «골랐다»로 친다). */
  stageTouched: boolean;
  /** 책상 위 지도를 한 번이라도 펼쳤는가. */
  mapOpened: boolean;
  /** 지금 지도가 펼쳐져 있는가(설계지 접힘). */
  mapOpen: boolean;
  requirementLength: number;
  hasAnalysis: boolean;
  rationaleLength: number;
  busy: boolean;
}
export const QUESTION_MIN = 15;
export const RATIONALE_MIN = 10;
const TOTAL = 6;

export function designTutorialStep(s: DesignTutorialState): DesignTutorialStep {
  const star = s.starLabel ? `「${s.starLabel}」` : '고른 별';
  if (!s.stageTouched) return { index: 1, total: TOTAL, target: 'stage', hint: '여기서 수업 고르기', title: '01 · 어디에서 별을 찾을까요?', text: `탐구가 시작될 수업이나 활동을 **목록을 열어 직접 골라** 주세요. ${s.targetName ? `지금은 「${s.targetName}」이 골라져 있어요. 그대로 쓰려면 목록을 열었다가 그대로 닫아도 돼요.` : '목록에서 하나를 골라 주세요.'}` };
  if (!s.mapOpened) return { index: 2, total: TOTAL, target: 'material', hint: '이 버튼으로 지도 펼치기', title: '02 · 나의 별에서 출발하기', text: s.sourceCount ? `망원경에서 본 ${star}이 연구 재료로 들어와 있어요. 「책상 위 별자리 지도에서 재료 고르기」를 눌러 지도에서 그 별을 확인해 보세요. 설계도는 이 기록에서 출발해요.` : `아직 재료가 없어요. 「책상 위 별자리 지도에서 재료 고르기」를 눌러 지도에서 ${star}을 눌러 주세요.` };
  if (s.mapOpen) return { index: 2, total: TOTAL, target: 'mapBack', hint: '다 봤으면 이 버튼', title: '02 · 나의 별에서 출발하기', text: `노랗게 빛나는 별이 ${star}이에요 — 설계지의 재료예요. 다른 별을 더 고르려면 눌러도 되지만 오늘은 하나로 충분해요. 다 봤으면 「별자리 지도 위에 설계지 펼치기」로 돌아오세요.` };
  if (s.requirementLength < QUESTION_MIN) return { index: 3, total: TOTAL, target: 'question', hint: '여기에 질문 적기', title: '03 · 내가 궁금한 것', text: `${star}을 보며 궁금해진 것을 한두 문장으로 적어 보세요. «무엇을», «어떻게 알아보고 싶은지»가 들어가면 좋아요. 예: «이 활동에서 재어 본 값이 조건을 바꾸면 어떻게 달라지는지 실험으로 비교해 보고 싶어요.» (${QUESTION_MIN}자 이상)` };
  if (!s.hasAnalysis) return { index: 4, total: TOTAL, target: 'build', hint: s.busy ? '설계도를 그리는 중' : '이 버튼 누르기', title: '04 · 설계도 만들기', text: s.busy ? '카시안이 설계도를 그리고 있어요. 다른 곳을 다녀와도 괜찮아요 — 완성되면 여기에서 펼쳐져요.' : '질문이 준비됐어요. 「교수와 새로운 별의 설계도 만들기」 버튼을 누르면 질문과 재료를 이어 설계도를 만들어요. 아직 질문이 흐릿하면 「교수와 대화하며 설계하기」로 함께 다듬어도 돼요.' };
  if (s.rationaleLength < RATIONALE_MIN) return { index: 5, total: TOTAL, target: 'rationale', hint: '여기에 이유 적기', title: '05 · 설계도 읽고 나의 이유 적기', text: `오른쪽 설계도를 읽어 보세요 — 알아보고 싶은 것, 이어갈 순서, 살펴볼 점이 있어요. 마음에 들면 «이 탐구를 선택한 나의 이유»를 ${RATIONALE_MIN}자 이상 적어 주세요. 마음에 안 들면 「다른 방향으로 다시 생각하기」로 돌아가 질문을 고쳐도 돼요.` };
  return { index: 6, total: TOTAL, target: 'confirm', hint: '이 버튼으로 확정', title: '06 · 탐구 확정하기', text: '이유까지 적었어요. 「나의 이유와 함께 탐구 확정하기」 버튼을 누르면 연구 수첩에 보관되고 카시안에게 보여 줄 수 있어요.' };
}
