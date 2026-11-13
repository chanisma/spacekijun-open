import type { DailyTurn } from './academyDaily.ts';
import { learningTypeDimensions, learningTypeItems } from './academyLearningType.ts';

export type AssessmentKind = 'big5' | 'learning' | 'learning_type';
export interface SelfItem { id: string; dimension: string; text: string; reverse?: boolean }
export interface SelfDimension { id: string; name: string; left: string; right: string; reflection: string; practice: string }
export const assessmentVersion = 'serin-v1';
export const selfDimensions: Record<AssessmentKind, SelfDimension[]> = {
  learning_type: learningTypeDimensions,
  big5: [
    { id: 'open', name: '개방성', left: '익숙함과 구체성', right: '새로움과 상상', reflection: '익숙해서 편안했던 때와 새로워서 즐거웠던 때는 언제였어?', practice: '익숙한 활동 하나를 조금 다른 방식으로 해 보고 느낌을 적어 봐.' },
    { id: 'conscientious', name: '성실성', left: '유연한 흐름', right: '계획과 꾸준함', reflection: '계획이 도움이 되는 순간과 부담이 되는 순간은 어떻게 달랐어?', practice: '내일 할 일을 한 가지만 정하고, 바뀌어도 괜찮은 여백을 남겨 봐.' },
    { id: 'extra', name: '외향성', left: '조용히 충전하기', right: '함께하며 활력 얻기', reflection: '사람들과 보낸 뒤, 혼자 보낸 뒤의 에너지는 어떻게 달랐어?', practice: '혼자 쉬는 시간과 함께하는 시간을 각각 가져 보고 편안한 균형을 찾아봐.' },
    { id: 'agree', name: '우호성', left: '독립적인 판단', right: '공감과 협력', reflection: '상대의 마음과 내 필요를 함께 존중했던 순간이 있었어?', practice: '부탁을 받았을 때 내 여유를 먼저 확인하고 가능한 만큼만 답해 봐.' },
    { id: 'sensitive', name: '정서 민감성', left: '감정의 평온함', right: '변화를 민감하게 느끼기', reflection: '마음이 흔들릴 때 나에게 도움이 됐던 것은 무엇이었어?', practice: '감정을 한 단어로 적고, 쉬기·걷기·믿는 사람에게 말하기 중 편한 것을 골라 봐.' },
  ],
  learning: [
    { id: 'planning', name: '계획과 환경 조절', left: '그때그때 시작', right: '시작 조건 마련', reflection: '공부를 시작하기 쉬웠던 장소와 시간에는 어떤 공통점이 있었어?', practice: '이번 주 한 번, 15분 동안 할 작은 목표와 방해를 줄일 방법을 정해 봐.' },
    { id: 'retrieval', name: '떠올리고 설명하기', left: '자료를 보며 익히기', right: '꺼내서 확인하기', reflection: '익숙하게 읽히는 것과 혼자 설명할 수 있는 것은 같았어?', practice: '자료를 덮고 핵심 세 가지를 적은 뒤 원문과 비교해 봐.' },
    { id: 'monitor', name: '이해 점검과 조정', left: '하던 방식 유지', right: '확인하며 바꾸기', reflection: '막힌 부분을 알아차린 뒤 방법을 바꿨던 경험이 있었어?', practice: '짧은 문제나 설명으로 헷갈리는 부분을 찾고 다음 복습에 표시해 봐.' },
    { id: 'spacing', name: '나누어 복습하고 도움 구하기', left: '한 번에 혼자 해결', right: '다시 보고 함께 해결', reflection: '시간을 두고 돌아오거나 누군가에게 물었을 때 달라진 점은 뭐였어?', practice: '배운 내용을 내일 한 번 더 떠올리고, 막힌 질문 하나를 친구나 선생님과 나눠 봐.' },
  ],
};
// Original Korean reflection items inspired by Big Five domains and public-domain
// IPIP scoring conventions; this shortened adaptation has not been normed/validated.
export const selfItems: Record<AssessmentKind, SelfItem[]> = {
  learning_type: learningTypeItems,
  big5: [
    { id: 'o1', dimension: 'open', text: '처음 접하는 생각이나 관점을 알아보는 일이 즐겁다.' },
    { id: 'c1', dimension: 'conscientious', text: '해야 할 일을 작은 순서로 나누어 실천하는 편이다.' },
    { id: 'e1', dimension: 'extra', text: '사람들과 이야기를 나누면 활력이 생기는 편이다.' },
    { id: 'a1', dimension: 'agree', text: '친구의 말을 들을 때 그 친구의 입장을 생각해 본다.' },
    { id: 'n1', dimension: 'sensitive', text: '작은 걱정도 마음에 오래 남는 편이다.' },
    { id: 'o2', dimension: 'open', text: '낯선 방법보다는 익숙한 방법만 사용하고 싶다.', reverse: true },
    { id: 'c2', dimension: 'conscientious', text: '미리 정한 할 일을 자주 뒤로 미루는 편이다.', reverse: true },
    { id: 'e2', dimension: 'extra', text: '여럿이 모인 자리에서는 주로 조용히 있는 편이다.', reverse: true },
    { id: 'a2', dimension: 'agree', text: '생각이 다르면 상대가 느낄 기분은 잘 고려하지 않는 편이다.', reverse: true },
    { id: 'n2', dimension: 'sensitive', text: '예상하지 못한 일이 생겨도 마음의 평온을 유지하는 편이다.', reverse: true },
    { id: 'o3', dimension: 'open', text: '하나의 상황을 여러 모습으로 상상해 보는 것을 좋아한다.' },
    { id: 'c3', dimension: 'conscientious', text: '맡은 일을 마치기 위해 꾸준히 시간을 내는 편이다.' },
    { id: 'e3', dimension: 'extra', text: '처음 만난 사람에게 먼저 말을 걸기도 한다.' },
    { id: 'a3', dimension: 'agree', text: '내 여유가 있을 때 다른 사람이 어려움을 해결하도록 돕는다.' },
    { id: 'n3', dimension: 'sensitive', text: '주변의 분위기가 바뀌면 내 기분도 쉽게 영향을 받는다.' },
    { id: 'o4', dimension: 'open', text: '다른 가능성을 상상하기보다 정해진 답만 알고 싶다.', reverse: true },
    { id: 'c4', dimension: 'conscientious', text: '필요한 물건이나 약속을 챙기는 일을 자주 잊는다.', reverse: true },
    { id: 'e4', dimension: 'extra', text: '여러 사람과 이야기하기보다는 혼자 조용히 지내는 것이 편하다.', reverse: true },
    { id: 'a4', dimension: 'agree', text: '다른 사람의 어려운 이야기를 끝까지 듣는 일이 번거롭게 느껴진다.', reverse: true },
    { id: 'n4', dimension: 'sensitive', text: '속상한 일이 지나가면 비교적 빠르게 평소 마음으로 돌아온다.', reverse: true },
  ],
  learning: [
    { id: 'p1', dimension: 'planning', text: '공부를 시작하기 전에 이번에 할 일을 작게 정한다.' },
    { id: 'r1', dimension: 'retrieval', text: '자료를 덮고 기억나는 내용을 내 말로 설명해 본다.' },
    { id: 'm1', dimension: 'monitor', text: '잘 아는 부분과 헷갈리는 부분을 구분해 표시한다.' },
    { id: 's1', dimension: 'spacing', text: '배운 내용을 며칠에 나누어 다시 떠올린다.' },
    { id: 'p2', dimension: 'planning', text: '집중을 방해하는 알림이나 물건을 잠시 치운다.' },
    { id: 'r2', dimension: 'retrieval', text: '답을 보기 전에 문제를 직접 풀거나 설명을 만들어 본다.' },
    { id: 'm2', dimension: 'monitor', text: '틀린 답을 보면 왜 그렇게 생각했는지 돌아본다.' },
    { id: 's2', dimension: 'spacing', text: '혼자 해결하기 어려울 때 구체적인 질문을 만들어 도움을 구한다.' },
    { id: 'p3', dimension: 'planning', text: '무엇을 할지 정하지 않은 채 시간을 흘려보내곤 한다.', reverse: true },
    { id: 'r3', dimension: 'retrieval', text: '자료를 여러 번 읽으면, 따로 확인하지 않아도 모두 안다고 생각한다.', reverse: true },
    { id: 'm3', dimension: 'monitor', text: '잘 이해되지 않아도 같은 방법을 바꾸지 않고 계속한다.', reverse: true },
    { id: 's3', dimension: 'spacing', text: '배운 내용을 다시 보기보다 시험 직전에 한꺼번에 공부한다.', reverse: true },
    { id: 'p4', dimension: 'planning', text: '쉬는 시간까지 생각해 감당할 수 있는 분량을 정한다.' },
    { id: 'r4', dimension: 'retrieval', text: '새로 배운 내용을 예시나 이미 아는 것과 연결해 설명한다.' },
    { id: 'm4', dimension: 'monitor', text: '공부를 마친 뒤 실제로 설명할 수 있는지 확인한다.' },
    { id: 's4', dimension: 'spacing', text: '모르는 것이 있어도 다른 사람에게 묻지 않은 채 넘어간다.', reverse: true },
  ],
};
export const assessmentNames = { big5: '나의 다섯 가지 결', learning: '나의 배움 습관', learning_type: '나의 학습 유형' };
export const assessmentDescriptions = { big5: 'Big Five를 참고한 자기성찰 · 20문장', learning: '학습 습관과 시도할 방법 · 16문장', learning_type: '주요 유형·혼합 성향·나에게 맞는 시도 · 12문장' };
export function scoreAssessment(kind: AssessmentKind, answers: unknown): Record<string, number> {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw Error('모든 문장에 답해 주세요.');
  const values = answers as Record<string, unknown>, items = selfItems[kind];
  if (!items || Object.keys(values).length !== items.length) throw Error('검사 문항을 다시 확인해 주세요.');
  for (const item of items) if (!Number.isInteger(values[item.id]) || Number(values[item.id]) < 1 || Number(values[item.id]) > 5) throw Error('각 문장에 1~5 중 하나로 답해 주세요.');
  return Object.fromEntries(selfDimensions[kind].map(d => {
    const group = items.filter(i => i.dimension === d.id);
    return [d.id, group.reduce((sum, i) => sum + (i.reverse ? 6 - Number(values[i.id]) : Number(values[i.id])), 0) / group.length];
  }));
}
export type DayPeriod = 'morning' | 'daytime' | 'evening';
export function koreaPeriod(date = new Date()): DayPeriod {
  const h = new Date(date.getTime() + 9 * 3600_000).getUTCHours();
  return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'daytime' : 'evening';
}
export const periodIntents: Record<DayPeriod, string> = {
  morning: '오늘 어떤 마음으로 지내고 싶은지', daytime: '지금 어떤 마음으로 하루를 보내고 있는지', evening: '오늘 하루가 어땠고 어떤 마음이 남았는지',
};
export interface SelfAssessment { id: string; kind: AssessmentKind; version: string; answers: Record<string, number>; scores: Record<string, number>; created_at: string }
export interface RoommateConversation { day: string; period: DayPeriod; question: string | null; status: 'generating' | 'ready' | 'failed'; turns: DailyTurn[]; revision: number; lease_until: string | null; pending_message: string | null }
export interface RoommateState { day: string; period: DayPeriod; assessments: SelfAssessment[]; conversations: RoommateConversation[] }
