import type { SelfDimension, SelfItem } from './academyRoommate.ts';

export const learningTypeDimensions: SelfDimension[] = [
  { id: 'company', name: '함께 배우는 방식', left: '혼자 정리하기', right: '함께 대화하기', reflection: '혼자 생각할 때와 대화할 때, 각각 어떤 도움이 있었어?', practice: '혼자 핵심을 적고 친구에게 설명해 보는 두 단계를 함께 시도해 봐.' },
  { id: 'approach', name: '새로운 내용에 다가가는 방식', left: '설명부터 이해하기', right: '직접 해 보며 이해하기', reflection: '설명이 먼저 필요한 때와 직접 해 보고 싶은 때는 어떻게 달랐어?', practice: '풀이 예시 하나와 직접 푸는 문제 하나를 번갈아 경험해 봐.' },
  { id: 'structure', name: '배움의 길을 정하는 방식', left: '정해진 순서 따라가기', right: '스스로 경로 탐색하기', reflection: '안내가 든든했던 때와 자유롭게 선택해서 즐거웠던 때를 떠올려 봐.', practice: '작은 목표 하나는 정하고, 시작할 주제나 순서는 직접 골라 봐.' },
];

// Original preference questions, not a validated learning-style instrument.
export const learningTypeItems: SelfItem[] = [
  { id: 'lc1', dimension: 'company', text: '새 내용을 배울 때 친구와 생각을 주고받으며 시작하는 것이 편하다.' },
  { id: 'la1', dimension: 'approach', text: '새로운 방법은 작은 예제를 직접 해 보며 알아가는 것이 좋다.' },
  { id: 'ls1', dimension: 'structure', text: '공부할 순서를 내가 정할 수 있을 때 더 편안하다.' },
  { id: 'lc2', dimension: 'company', text: '누군가와 이야기하기 전에 혼자 충분히 생각을 정리하는 것이 좋다.', reverse: true },
  { id: 'la2', dimension: 'approach', text: '직접 시도하기 전에 원리와 설명을 먼저 살펴보고 싶다.', reverse: true },
  { id: 'ls2', dimension: 'structure', text: '무엇부터 할지 안내된 순서가 있을 때 마음이 놓인다.', reverse: true },
  { id: 'lc3', dimension: 'company', text: '혼자 정리하기보다 서로 질문하며 배운 내용을 정리하고 싶다.' },
  { id: 'la3', dimension: 'approach', text: '새 내용을 접하면 먼저 조작하거나 적용해 볼 기회를 찾는다.' },
  { id: 'ls3', dimension: 'structure', text: '정해진 진도 안에서도 궁금한 주제로 옮겨 가며 배워 보고 싶다.' },
  { id: 'lc4', dimension: 'company', text: '함께 공부할 수 있어도 내 속도로 혼자 배울 시간을 먼저 고르는 편이다.', reverse: true },
  { id: 'la4', dimension: 'approach', text: '활동을 시작하기 전에 개념이 어떻게 연결되는지 설명을 듣거나 읽고 싶다.', reverse: true },
  { id: 'ls4', dimension: 'structure', text: '자유롭게 경로를 고르기보다 단계별 안내를 따라 배우는 것이 편하다.', reverse: true },
];

const preferences = [
  { id: 'company', left: { name: '고요한 사색가', method: '혼자 핵심을 세 줄로 적은 다음, 자료를 덮고 설명해 봐. 막힌 한 가지는 다른 사람과 나눠 봐.' }, right: { name: '대화의 연결자', method: '친구와 서로 질문하고 설명해 봐. 대화 뒤에는 혼자 핵심을 떠올려 내가 이해한 부분을 확인해 봐.' } },
  { id: 'approach', left: { name: '원리의 해석가', method: '개념과 풀이 예시를 살펴본 뒤 비슷한 문제를 직접 풀어 봐. 설명이 실제로 적용되는지 확인해 봐.' }, right: { name: '경험의 모험가', method: '작은 예제를 직접 해 본 뒤, 왜 그런 결과가 나왔는지 개념으로 설명해 봐. 다음 날에도 기억나는지 확인해 봐.' } },
  { id: 'structure', left: { name: '차근차근 설계자', method: '짧은 단계별 계획으로 시작하고 끝날 때 자료 없이 확인해 봐. 어려웠던 단계에는 다음 복습 시간을 남겨 둬.' }, right: { name: '자유로운 탐색가', method: '궁금한 질문 하나를 골라 탐색하되 오늘 확인할 작은 목표를 정해 봐. 마지막에는 알게 된 점과 남은 질문을 적어 봐.' } },
] as const;

export function learningTypeProfile(scores: Record<string, number>) {
  const axes = preferences.map(p => {
    const score = scores[p.id];
    if (!Number.isFinite(score) || score < 1 || score > 5) throw Error('학습 유형 결과를 다시 확인해 주세요.');
    const strength = Math.abs(score - 3);
    return { id: p.id, score, strength, preference: strength < 0.75 ? null : score < 3 ? p.left : p.right };
  });
  const ranked = axes.filter(a => a.preference !== null).sort((a, b) => b.strength - a.strength);
  const main = ranked.filter(a => a.strength === ranked[0]?.strength).map(a => a.preference!);
  return {
    name: main.length === 0 ? '균형 탐색형' : main.length === 1 ? main[0].name : '함께 빛나는 혼합형',
    main: main.map(p => p.name),
    mixed: ranked.filter(a => a.strength < ranked[0].strength).map(a => a.preference!.name),
    balanced: axes.filter(a => !a.preference).map(a => learningTypeDimensions.find(d => d.id === a.id)!.name),
    methods: ranked.length ? ranked.map(a => a.preference!.method) : ['같은 내용을 혼자 정리한 뒤 대화해 보고, 설명을 읽은 뒤 직접 적용해 봐. 어느 과정이 편했고 무엇이 기억나는지 비교해 봐.'],
  };
}
