// ========================================
// 업무 명단 출력 — 급식지도·자습 감독 (2026-10-11)
//
// 한 달 명단을 A4 가로 달력 한 장으로 — 칸마다 그날 담당.
// (선생님별 횟수·날짜 표는 2026-10-11 사용자 결정으로 뺐다 — 달력만 있으면 된다)
// 쉬는 날은 빈칸이 아니라 이유를 적는다(빈칸이면 «아직 안 정했다»로 읽힌다).
//
// 출력 방식 = 새 창 + document.write(과목 선택 확인표와 같다 — `openPrintDocument`).
// ⚠ React·Supabase 를 모른다. 회귀 = `scripts/duty-roster-print-test/run.mts`.
// ========================================

export interface RosterEntry {
  /** `YYYY-MM-DD` */
  date: string;
  /** 같은 날 여러 칸일 때의 이름(`아침`·`저녁`). 한 칸뿐이면 생략 */
  slot?: string | null;
  names: string[];
}

export interface RosterOffDay {
  date: string;
  reason: string;
}

export interface RosterDocument {
  /** `2026년 11월 급식지도 명단` */
  title: string;
  /** 제목 아래 한 줄(시간·장소) */
  subtitle?: string;
  year: number;
  /** 1~12 */
  month: number;
  /** 달력에 그릴 요일(월=1 … 토=6). 급식지도 = 월~금, 자습 감독 = 토요 자습이 있으면 월~토 */
  weekdays: number[];
  entries: RosterEntry[];
  offDays: RosterOffDay[];
  /** 칸 순서(`아침`·`저녁`·`토요일`) — 같은 날 안에서 이 순서로 */
  slotOrder?: string[];
  /** 맨 아래 작은 글씨 */
  footnote?: string;
}

const WEEKDAY_LABEL = ['', '월', '화', '수', '목', '금', '토', '일'];

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dowOf(year: number, month: number, day: number): number {
  const js = new Date(year, month - 1, day).getDay();
  return js === 0 ? 7 : js;
}

export interface CalendarCell {
  date: string;
  day: number;
  items: { slot: string | null; names: string[] }[];
  off: string | null;
}

/**
 * 달력 격자 — 주마다 `weekdays` 칸. 그 달이 아닌 칸은 null.
 * 그리는 요일에 그 달 날짜가 하나도 없는 주(1일이 일요일인 첫 주 등)는 만들지 않는다.
 */
export function buildRosterCalendar(doc: Pick<RosterDocument, 'year' | 'month' | 'weekdays' | 'entries' | 'offDays' | 'slotOrder'>): (CalendarCell | null)[][] {
  const { year, month, weekdays } = doc;
  const order = doc.slotOrder ?? [];
  const rank = (slot: string | null) => {
    const i = slot ? order.indexOf(slot) : -1;
    return i < 0 ? order.length : i;
  };
  const byDate = new Map<string, CalendarCell['items']>();
  for (const e of doc.entries) {
    const list = byDate.get(e.date) ?? [];
    const slot = e.slot ?? null;
    const same = list.find((x) => x.slot === slot);
    if (same) same.names = [...new Set([...same.names, ...e.names])];
    else list.push({ slot, names: [...e.names] });
    byDate.set(e.date, list);
  }
  for (const list of byDate.values()) list.sort((a, b) => rank(a.slot) - rank(b.slot));
  const off = new Map(doc.offDays.map((o) => [o.date, o.reason]));

  const last = new Date(year, month, 0).getDate();
  const weeks: (CalendarCell | null)[][] = [];
  let week: (CalendarCell | null)[] | null = null;
  for (let day = 1; day <= last; day++) {
    const dow = dowOf(year, month, day);
    if (dow === 1 || week === null) {
      if (week && week.some(Boolean)) weeks.push(week);
      week = weekdays.map(() => null);
    }
    const col = weekdays.indexOf(dow);
    if (col < 0) continue;
    const date = `${year}-${pad(month)}-${pad(day)}`;
    week[col] = { date, day, items: byDate.get(date) ?? [], off: off.get(date) ?? null };
  }
  if (week && week.some(Boolean)) weeks.push(week);
  return weeks;
}

export function buildDutyRosterDocument(doc: RosterDocument): string {
  const weeks = buildRosterCalendar(doc);
  const filled = doc.entries.filter((e) => e.names.length > 0).length;

  const cellHtml = (cell: CalendarCell | null) => {
    if (!cell) return '<td class="empty"></td>';
    const body = cell.off
      ? `<div class="off">${escapeHtml(cell.off)}</div>`
      : cell.items.length === 0
        ? ''
        : cell.items.map((it) => `<div class="item">${it.slot ? `<span class="slot">${escapeHtml(it.slot)}</span>` : ''}<span class="names">${it.names.length > 0 ? it.names.map(escapeHtml).join(', ') : '<span class="blank">—</span>'}</span></div>`).join('');
    return `<td class="${cell.off ? 'is-off' : ''}"><div class="day">${cell.day}</div>${body}</td>`;
  };

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(doc.title)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif;
    color: #0f172a; background: #e2e8f0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .toolbar {
    position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
    padding: 10px 16px; background: #0f172a; color: #e2e8f0; font-size: 13px;
  }
  .toolbar .meta, .toolbar .hint { color: #94a3b8; }
  .toolbar button {
    margin-left: auto; padding: 8px 18px; border: 0; border-radius: 6px;
    background: #2563eb; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
  }
  .sheet { width: 277mm; margin: 16px auto; padding: 0; background: #fff; box-shadow: 0 0 0 10mm #fff, 0 2px 16px 10mm rgba(15,23,42,.12); }
  h1 { margin: 0; font-size: 18pt; font-weight: 700; letter-spacing: .02em; }
  .sub { margin: 1.5mm 0 4mm; font-size: 9.5pt; color: #475569; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  .cal th { padding: 1.6mm; background: #f1f5f9; border: .25mm solid #94a3b8; font-size: 10pt; font-weight: 600; color: #334155; }
  .cal td { height: 27mm; vertical-align: top; padding: 1.4mm 1.8mm; border: .25mm solid #94a3b8; font-size: 10pt; }
  .cal td.empty { background: #f8fafc; }
  .cal td.is-off { background: #f8fafc; }
  .day { font-size: 9pt; font-weight: 700; color: #475569; margin-bottom: .8mm; }
  .item { line-height: 1.35; word-break: keep-all; overflow-wrap: anywhere; }
  .slot { display: inline-block; margin-right: 1.2mm; padding: 0 1mm; border: .2mm solid #cbd5e1; border-radius: .8mm; font-size: 7.5pt; color: #475569; }
  .names { font-weight: 600; }
  .off { margin-top: 2mm; font-size: 9pt; color: #94a3b8; }
  .blank { color: #cbd5e1; }
  .foot { margin-top: 3mm; font-size: 8pt; color: #94a3b8; text-align: right; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none !important; }
    .sheet { margin: 0; box-shadow: none; width: auto; }
    .cal tr { break-inside: avoid; page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <strong>${escapeHtml(doc.title)}</strong>
    <span class="meta">담당 ${filled}칸</span>
    <span class="hint">인쇄 설정: 용지 A4 가로 · 배율 100%</span>
    <button type="button" onclick="window.print()">인쇄</button>
  </div>
  <div class="sheet">
    <h1>${escapeHtml(doc.title)}</h1>
    ${doc.subtitle ? `<p class="sub">${escapeHtml(doc.subtitle)}</p>` : '<p class="sub"></p>'}
    <table class="cal">
      <thead><tr>${doc.weekdays.map((d) => `<th>${WEEKDAY_LABEL[d]}</th>`).join('')}</tr></thead>
      <tbody>${weeks.map((w) => `<tr>${w.map(cellHtml).join('')}</tr>`).join('')}</tbody>
    </table>
    ${doc.footnote ? `<p class="foot">${escapeHtml(doc.footnote)}</p>` : ''}
  </div>
</body>
</html>`;
}

/**
 * 새 창에 문서를 연다 — **클릭과 같은 동기 흐름에서** 부를 것(비동기 뒤에 열면 팝업 차단).
 * 차단되면 false.
 */
export function openPrintDocument(html: string): boolean {
  const win = window.open('', '_blank', 'width=1100,height=860');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  return true;
}
