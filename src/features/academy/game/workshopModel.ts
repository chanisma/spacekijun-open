/** 기본값 — 관리자 코인 설정(`academy.workshop_*`)이 그 자리에서 바꾼다(game/economySync) */
export const workshopEconomy = { orderCost: 100, salePrice: 35, commission: 10 };
export type WorkshopSlot = 'ria' | 'luon' | 'professor' | 'librarian' | 'postmaster' | 'serin' | 'room';
export type WorkshopStatus = 'submitted' | 'crafting' | 'delivered' | 'received' | 'declined' | 'cancelled';
export const workshopSlots: Record<WorkshopSlot, string> = { ria: '리아 의상 · 헤어', luon: '루온 의상 · 헤어', professor: '카시안 의상 · 헤어', librarian: '엘리안 의상 · 헤어', postmaster: '노엘 의상 · 헤어', serin: '세린 의상 · 헤어', room: '기숙사 방' };
export const workshopStatuses: Record<WorkshopStatus, string> = { submitted: '공방에 접수됨', crafting: '장인이 제작 중', delivered: '선물 상자 도착', received: '옷장에 보관됨', declined: '공방의 답장', cancelled: '주문 취소' };
export const workshopReference: Record<WorkshopSlot, string> = { ria: 'ria-player', luon: 'luon', professor: 'professor', librarian: 'librarian-male', postmaster: 'postmaster', serin: 'serin', room: 'dorm' };
export function workshopPrompt(slot: WorkshopSlot, prompt: string) {
  const common = '별빛 아카데미의 로맨스 판타지 게임에 사용할 완성 PNG 원화를 제작해 주세요. 참고 원화의 화풍과 금빛·보랏빛 세계관을 유지해 주세요. 이미지에 글자, 로고, 워터마크를 넣지 마세요.';
  const details = slot === 'room'
    ? '기숙사 원화의 구도와 가구 위치를 유지하고 장식과 색감을 바꾸세요. 책상은 왼쪽, 침대는 뒤 중앙, 옷장은 오른쪽이며 아래쪽 바닥은 비워 둡니다. 인물 없이 1536×1024 가로 배경으로 제작하세요.'
    : `${slot === 'ria' ? '갈색 머리·보라색 눈의 여성 주인공 리아' : slot === 'luon' ? '은발·푸른 눈의 남성 캐릭터 루온' : workshopSlots[slot].replace(' 의상 · 헤어', '')}의 얼굴·눈·체형·포즈와 인물의 정체성을 참고 원화 그대로 유지하세요. 학생의 요청에 따라 의상과 헤어스타일을 바꿀 수 있습니다. 머리 길이, 앞머리, 묶거나 땋는 방식도 변경할 수 있으며, 변경 요청이 없는 부분은 참고 원화를 유지하세요. 머리부터 발끝까지 전신, 발 위치와 여백을 유지한 1024×1536 세로 PNG로 제작하세요. 배경은 실제 알파 투명이어야 하며 체크무늬를 그려 넣지 마세요.`;
  return `${common}\n\n${details}\n\n학생이 원하는 디자인:\n${prompt}`;
}
export function validWorkshopDraft(title: string, prompt: string) { return title.trim().length >= 2 && title.trim().length <= 100 && prompt.trim().length >= 20 && prompt.trim().length <= 2000; }
