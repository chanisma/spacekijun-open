// 날짜/금액 포맷 공용 유틸 — ManagerView·RequesterView가 각자 갖고 있던 중복 제거.

export const fmtDateTime = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
    2,
    '0',
  )}`;
};

export const fmtKRW = (n: number): string => `₩${n.toLocaleString('ko-KR')}`;
