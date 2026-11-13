/**
 * 과목 선택 확인표(출력용) — 순수 로직
 *
 * 한 차수의 제출을 "학생 1명 = 칸 1개"로 만들고, A4 한 장에 여러 칸을 격자로 담아
 * 점선을 따라 잘라 나눠 줄 수 있는 HTML 을 만든다. 예전 리로스쿨 설문 출력
 * (toolbox/RiroSurveyPreview — 학생 1명 = A4 1장, 설문 → 질문 → 고른 항목)과
 * 같은 내용 구조를 쓴다: 수강 학년 → 선택군·학기 → 과목.
 *
 * ⚠️ 분석 화면의 Student.semester1/semester2 를 쓰지 말 것. 스냅샷이 선택군을 지우고
 *    학기로만 평탄화한 값이라, 1학년 4차면 한 학생의 "1학기" 칸에 2학년 1학기·3학년 1학기·
 *    외국어·예술이 섞여 들어간다. 출력물은 선택군(course_selection_group) 구조를 그대로 쓴다.
 *
 * React·Supabase 비의존 — 회귀(scripts/course-selection-slips-test)가 이 파일을 그대로 부른다.
 */

// ── 입력 (DB 행을 옮긴 모양) ─────────────────────────────────
export interface SlipGroupRow {
  id: string;
  name: string;
  /** 수강 학년 — 1학년 신청이면 2 또는 3 */
  targetGrade: number | null;
  displayOrder: number;
}
export interface SlipSlotRow {
  id: string;
  groupId: string;
  /** null = 1·2학기 묶음 선택지(외국어·예술) */
  semester: number | null;
  displayOrder: number;
  /** 고르는 과목 수. 선택군 합이 2 이하면 한 행으로 접는다(교양 1학기·2학기 → 한 행) */
  pickCount?: number | null;
}
export interface SlipSlotSubjectRow {
  slotId: string;
  selectableSubjectId: string | null;
  semester: number | null;
  displayOrder: number;
}
export interface SlipSubmissionRow {
  id: string;
  studentName: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  lastModifiedAt: string | null;
}
export interface SlipItemRow {
  submissionId: string;
  slotId: string | null;
  selectableSubjectId: string | null;
  subjectName: string;
  semester: number;
}
export interface SelectionSlipSource {
  roundTitle: string;
  groups: SlipGroupRow[];
  slots: SlipSlotRow[];
  slotSubjects: SlipSlotSubjectRow[];
  submissions: SlipSubmissionRow[];
  items: SlipItemRow[];
}

// ── 출력 모델 ────────────────────────────────────────────────
export interface SlipRow {
  label: string;
  /** 표시 문자열. 묶음 선택지는 "1학기 중국어" 처럼 학기를 붙인다 */
  subjects: string[];
}
export interface SlipSection {
  title: string;
  rows: SlipRow[];
}
export interface StudentSlip {
  submissionId: string;
  name: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  sections: SlipSection[];
  lastModifiedAt: string | null;
}

/** "2학년 일반,진로 선택과목" → "일반·진로", "3학년 교양" → "교양" */
export function shortGroupName(name: string): string {
  const s = name
    .trim()
    .replace(/^\d\s*학년\s*/, '')
    .replace(/\s*선택\s*과목$/, '')
    .replace(/\s*,\s*/g, '·')
    .trim();
  return s || name.trim();
}

const byOrder = <T extends { displayOrder: number }>(a: T, b: T) => a.displayOrder - b.displayOrder;

/**
 * 한 차수의 원자료 → 학생별 확인표. 반·번호 순.
 * 선택군은 수강 학년별로 한 구획에 모은다(1학년 = 2학년 수강 / 3학년 수강 두 구획).
 */
export function buildStudentSlips(src: SelectionSlipSource): StudentSlip[] {
  const groups = [...src.groups].sort(byOrder);
  const groupIndex = new Map(groups.map((g, i) => [g.id, i]));
  const slots = [...src.slots].sort((a, b) => {
    const ga = groupIndex.get(a.groupId) ?? 999;
    const gb = groupIndex.get(b.groupId) ?? 999;
    return ga - gb || a.displayOrder - b.displayOrder;
  });
  const groupById = new Map(groups.map((g) => [g.id, g]));

  // 선택지 순서 = 설문에 나온 순서. 묶음은 (선택지 순번, 학기) 로 정렬한다.
  const optionOrder = new Map<string, number>();
  for (const ss of src.slotSubjects) {
    if (!ss.selectableSubjectId) continue;
    optionOrder.set(`${ss.slotId}|${ss.selectableSubjectId}|${ss.semester ?? ''}`, ss.displayOrder);
  }
  const orderOf = (it: SlipItemRow) =>
    optionOrder.get(`${it.slotId}|${it.selectableSubjectId}|${it.semester}`) ??
    optionOrder.get(`${it.slotId}|${it.selectableSubjectId}|`) ??
    Number.MAX_SAFE_INTEGER;

  const itemsBySub = new Map<string, SlipItemRow[]>();
  for (const it of src.items) {
    const arr = itemsBySub.get(it.submissionId) ?? [];
    arr.push(it);
    itemsBySub.set(it.submissionId, arr);
  }

  // 수강 학년별 구획 틀 (학생마다 같다). 틀의 한 행 = 슬롯 1개, 또는 접힌 선택군 1개.
  // 접는 기준은 학생과 무관한 구조(pickCount)여야 한다 — 학생마다 행 구성이 달라지면 안 된다.
  type FrameRow = { label: string; slots: SlipSlotRow[]; tagSemester: boolean };
  type Frame = { key: string; title: string; rows: FrameRow[] };
  const frames: Frame[] = [];
  const slotsByGroup = new Map<string, SlipSlotRow[]>();
  for (const slot of slots) {
    const arr = slotsByGroup.get(slot.groupId) ?? [];
    arr.push(slot);
    slotsByGroup.set(slot.groupId, arr);
  }
  for (const g of groups) {
    const gSlots = slotsByGroup.get(g.id);
    if (!gSlots?.length) continue;
    const key = g.targetGrade != null ? `grade:${g.targetGrade}` : `group:${g.id}`;
    let f = frames.find((x) => x.key === key);
    if (!f) {
      f = { key, title: g.targetGrade != null ? `${g.targetGrade}학년 수강 과목` : g.name, rows: [] };
      frames.push(f);
    }
    const short = shortGroupName(g.name);
    const totalPick = gSlots.reduce((n, s) => n + (s.pickCount ?? Number.POSITIVE_INFINITY), 0);
    if (gSlots.length > 1 && totalPick <= 2) {
      f.rows.push({ label: short, slots: gSlots, tagSemester: true });
    } else {
      for (const slot of gSlots) {
        f.rows.push({
          label: slot.semester != null ? `${slot.semester}학기 ${short}` : short,
          slots: [slot],
          tagSemester: slot.semester == null,
        });
      }
    }
  }
  const knownSlots = new Set(slots.map((s) => s.id));

  const slips = src.submissions.map((sub): StudentSlip => {
    const mine = itemsBySub.get(sub.id) ?? [];
    const sections: SlipSection[] = frames.map((f) => ({
      title: f.title,
      rows: f.rows.map((row) => {
        const ids = new Set(row.slots.map((s) => s.id));
        const slotRank = new Map(row.slots.map((s, i) => [s.id, i]));
        const picked = mine
          .filter((it) => it.slotId != null && ids.has(it.slotId))
          .sort(
            (a, b) =>
              (slotRank.get(a.slotId!) ?? 0) - (slotRank.get(b.slotId!) ?? 0) ||
              orderOf(a) - orderOf(b) ||
              a.semester - b.semester ||
              a.subjectName.localeCompare(b.subjectName, 'ko'),
          );
        return {
          label: row.label,
          subjects: picked.map((it) => (row.tagSemester ? `${it.semester}학기 ${it.subjectName}` : it.subjectName)),
        };
      }),
    }));

    // 슬롯에 연결되지 않은 항목(레거시·슬롯 삭제)은 조용히 버리지 않고 '기타'로 남긴다
    const orphans = mine.filter((it) => !it.slotId || !knownSlots.has(it.slotId));
    if (orphans.length) {
      sections.push({
        title: '기타',
        rows: [1, 2]
          .map((sem) => ({
            label: `${sem}학기`,
            subjects: orphans.filter((it) => it.semester === sem).map((it) => it.subjectName),
          }))
          .filter((r) => r.subjects.length > 0),
      });
    }

    return {
      submissionId: sub.id,
      name: sub.studentName,
      grade: sub.grade,
      classNo: sub.classNo,
      number: sub.number,
      sections,
      lastModifiedAt: sub.lastModifiedAt,
    };
  });

  return slips.sort(
    (a, b) => (a.classNo ?? 999) - (b.classNo ?? 999) || (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name, 'ko'),
  );
}

// ── 배치 ────────────────────────────────────────────────────
/**
 * 한 장 학생 수 후보 — **촘촘한 것부터**. 출력 창이 차례로 배치해 보고 아무도 칸을 넘치지
 * 않는 첫 값을 쓴다(사람이 고르지 않는다). 항상 2열: 1열이면 칸이 너무 넓고 3열이면 과목명이 접힌다.
 */
export const SLIPS_PER_PAGE_CANDIDATES = [8, 6, 4, 2] as const;
/**
 * 같은 학생 수에서 보통 글자로 넘치면 **작은 글자로 한 번 더** 배치해 본다(2026-10-08 사용자 결정 —
 * 서명란이 들어가며 1학년이 한 장 6 → 4명으로 성겨진 것을 되찾는다). 순서는 (8 보통, 8 작게,
 * 6 보통, 6 작게, …) — 보통 글자로 맞는 배치에는 절대 작은 글자를 쓰지 않는다. 문서 전체에 한 번에
 * 적용한다(카드마다 글자 크기가 다르면 한 반 안에서 들쭉날쭉해진다).
 */
export const SLIP_TEXT_SIZES = ['normal', 'compact'] as const;

/**
 * 인쇄 여백 — 프린터가 어차피 남기는 종이 가장자리의 흰 공간. 대부분의 프린터가 인쇄하지
 * 못하는 가장자리(3~5mm)보다 넉넉하게 잡는다.
 */
export const PAGE_MARGIN_MM = 6;
/**
 * 카드 사이 간격 = 인쇄 여백 × 2. 간격 **한가운데**를 자르면 안쪽 변에도 여백 1배가 남으므로,
 * 종이 가장자리 쪽 카드든 가운데 카드든 네 변 모두 같은 흰 여백을 두른 카드가 된다.
 * 종이 바깥쪽은 자를 필요가 없고, 카드 테두리를 자르는 일도 없다. ⚠️ 두 값을 따로 고치지 말 것.
 */
export const CARD_GUTTER_MM = PAGE_MARGIN_MM * 2;

// ── HTML ────────────────────────────────────────────────────
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "2026-09-28T15:49:02+09:00" → "2026-09-28 15:49" (KST). 못 읽으면 빈 문자열 */
export function formatSlipTime(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/**
 * 확인 서명란 — 학생·학부모가 고른 과목을 확인했다는 서명. 카드 맨 아래(내용 길이와 무관하게
 * 바닥에 붙는다). 칸 안에 있으므로 넘침 판정(scrollHeight)에 함께 잡혀, 서명란 때문에 칸이
 * 모자라면 배치가 한 단계 성겨진다 — 서명란이 잘려 인쇄되는 일은 없다.
 */
export const SIGN_ROLES = ['학생', '학부모'] as const;
const SIGN_HTML = `<div class="sign">${SIGN_ROLES.map(
  (r) => `<div class="sig"><span class="sig-role">${r}</span><span class="sig-line"></span><span class="sig-mark">(서명)</span></div>`,
).join('')}</div>`;

function slipHtml(s: StudentSlip, roundTitle: string): string {
  const who = [s.grade, s.classNo, s.number].every((v) => v != null)
    ? `${s.grade}학년 ${s.classNo}반 ${s.number}번`
    : '';
  const sections = s.sections
    .map(
      (sec) => `
        <div class="sec">
          <div class="sec-title">${escapeHtml(sec.title)}</div>
          <table>${sec.rows
            .map(
              (r) =>
                `<tr><th>${escapeHtml(r.label)}</th><td>${
                  r.subjects.length
                    ? r.subjects.map(escapeHtml).join('<span class="dot"> · </span>')
                    : '<span class="none">미선택</span>'
                }</td></tr>`,
            )
            .join('')}</table>
        </div>`,
    )
    .join('');
  const time = formatSlipTime(s.lastModifiedAt);
  return `
    <div class="slip" data-class="${s.classNo ?? ''}"><div class="mat">
      <div class="head">
        <div class="who"><span class="hb">${escapeHtml(who)}</span><strong class="name">${escapeHtml(s.name)}</strong></div>
        <div class="round">${escapeHtml(roundTitle)}</div>
      </div>
      ${sections}
      ${SIGN_HTML}
      ${time ? `<div class="foot">최종 제출 ${escapeHtml(time)}</div>` : ''}
    </div></div>`;
}

/** 출력 창 상단 도구줄·경고 띠 — 두 출력 형식이 같은 모양을 쓴다(인쇄에서는 숨김) */
const TOOLBAR_CSS = `
  .toolbar {
    position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px;
    padding: 10px 16px; background: #fff; border-bottom: 1px solid #cbd5e1; font-size: 13px;
  }
  .toolbar strong { font-size: 14px; }
  .toolbar .meta { color: #64748b; }
  .toolbar .hint { color: #94a3b8; font-size: 12px; }
  .toolbar button {
    margin-left: auto; padding: 6px 16px; font-size: 13px; font-weight: 600; color: #fff;
    background: #2563eb; border: 0; border-radius: 6px; cursor: pointer;
  }
  .toolbar button:hover { background: #1d4ed8; }
  .toolbar button:disabled { background: #94a3b8; cursor: default; }
  .warn { padding: 8px 16px; font-size: 13px; color: #9f1239; background: #fff1f2; border-bottom: 1px solid #fecdd3; }
`;

export interface SlipsDocumentOptions {
  roundTitle: string;
  /** 창 제목·툴바에 적는 범위 설명 (예: "1반·3반") */
  scopeLabel: string;
}

/**
 * A4 세로 문서. 학생 1명 = 테두리 카드 1장(`.slip`, 내용은 `.mat`).
 *
 * 카드 사이를 CARD_GUTTER_MM(= 인쇄 여백 × 2) 만큼 띄우고, 그 한가운데에 옅은 절취 안내선을
 * 긋는다(장 위에 — 카드 안이 아니다). 안내선을 따라 자르면 모든 카드가 사방에 인쇄 여백만큼의
 * 흰 테를 두른 모양이 된다(액자). 빈 자리(마지막 장의 남는 칸)는 그리지 않는다.
 *
 * **반마다 새 장에서 시작한다** — 한 장에 두 반이 섞이지 않는다(반을 몇 개 고르든 같다).
 * 한 반의 마지막 장이 덜 차도 다음 반을 끌어오지 않는다.
 *
 * 한 장 학생 수는 창 안의 스크립트가 정한다: 칸들을 `#pool` 에 한 번만 그려 두고
 * SLIPS_PER_PAGE_CANDIDATES 순서로 장에 옮겨 담아 보며, **실제로 그려진 높이**가 칸을
 * 넘지 않는 가장 촘촘한 배치를 고른다. 줄 수로 추정하면 과목명 길이·줄바꿈 때문에 빗나간다.
 * 학생 수마다 보통 글자 → 작은 글자(SLIP_TEXT_SIZES) 순으로 시도한다.
 * ⚠️ 칸 밖으로 삐져나오는 장식(가위 표식 등)을 칸 안에 두지 말 것 — 그 칸의 scrollHeight 를
 *    키워 멀쩡한 칸을 넘침으로 오판하고, 배치가 조용히 한 단계 성겨진다(2026-09-28 실측).
 */
export function buildSlipsDocument(slips: StudentSlip[], opts: SlipsDocumentOptions): string {
  const title = `${opts.roundTitle} 과목 선택 확인표 (${opts.scopeLabel})`;
  const cells = slips.map((s) => slipHtml(s, opts.roundTitle)).join('');
  const M = PAGE_MARGIN_MM;
  const G = CARD_GUTTER_MM;
  // 장 = A4(210×297) − 여백. 높이는 1mm 를 남겨 둔다(반올림으로 넘기면 브라우저가
  // 마지막 줄을 다음 장으로 밀어 빈 장이 끼어든다).
  const sheetW = 210 - 2 * M;
  const sheetH = 297 - 2 * M - 1;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 portrait; margin: ${M}mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif;
    color: #0f172a; background: #e2e8f0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
${TOOLBAR_CSS}  .sheet {
    position: relative; width: ${sheetW}mm; height: ${sheetH}mm; margin: 16mm auto; background: #fff;
    /* 화면에서도 종이 여백까지 흰색으로 보여 준다(자른 뒤 모양 그대로) */
    box-shadow: 0 0 0 ${M}mm #fff, 0 2px 16px ${M}mm rgba(15, 23, 42, 0.12);
    display: grid; gap: ${G}mm;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(var(--rows, 3), minmax(0, 1fr));
  }
  /* 절취선 = 카드 사이 간격의 한가운데. 얇게(0.15mm) 두되 인쇄에서 사라지지 않을 만큼 진하게(표면 대비 4.8:1).
     장에 달아 카드 높이 측정에 끼어들지 않게 한다 */
  .guide { position: absolute; pointer-events: none; }
  .guide.v { top: 0; bottom: 0; left: 50%; border-left: 0.15mm dashed #64748b; }
  .guide.h { left: 0; right: 0; border-top: 0.15mm dashed #64748b; }
  .slip {
    min-width: 0; min-height: 0; overflow: hidden;
    border: 0.4mm solid #475569; border-radius: 2mm; background: #fff;
  }
  .mat {
    height: 100%; overflow: hidden;
    padding: 2.6mm 3.2mm; display: flex; flex-direction: column; gap: 1.1mm;
    font-size: 8.5pt; line-height: 1.33;
  }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 2mm;
    padding-bottom: 1mm; border-bottom: 0.35mm solid #0f172a; }
  .who { display: flex; align-items: baseline; gap: 2mm; min-width: 0; }
  .hb { font-size: 8.5pt; color: #334155; white-space: nowrap; }
  .name { font-size: 11.5pt; white-space: nowrap; }
  .round { font-size: 7pt; color: #64748b; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sec-title { font-size: 8pt; font-weight: 700; margin-bottom: 0.8mm; padding-left: 1.5mm; border-left: 0.8mm solid #334155; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 0.2mm solid #cbd5e1; padding: 0.55mm 1.4mm; vertical-align: top; text-align: left; }
  th { width: 22.5mm; font-size: 7.5pt; font-weight: 600; color: #334155; background: #f1f5f9; white-space: nowrap; }
  td { word-break: keep-all; overflow-wrap: anywhere; }
  .dot { color: #94a3b8; }
  .none { color: #94a3b8; }
  /* 서명란 — 바닥에 붙는다. 서명할 자리(선 위)는 6.5mm */
  .sign { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; padding-top: 0.6mm; }
  .sig { display: flex; align-items: flex-end; gap: 1.2mm; height: 6.5mm; font-size: 7.5pt; color: #334155; }
  .sig-role { font-weight: 600; white-space: nowrap; }
  .sig-line { flex: 1; min-width: 0; height: 100%; border-bottom: 0.25mm solid #475569; }
  .sig-mark { font-size: 6.5pt; color: #64748b; white-space: nowrap; }
  .foot { font-size: 6.5pt; color: #94a3b8; text-align: right; }
  /* 작은 글자 — 같은 학생 수로 넘칠 때만(SLIP_TEXT_SIZES). 서명 자리 높이는 줄이지 않는다 */
  body.compact .mat { padding: 2.4mm 3mm; gap: 0.9mm; font-size: 8pt; line-height: 1.3; }
  body.compact .head { padding-bottom: 0.9mm; }
  body.compact .name { font-size: 11pt; }
  body.compact .sec-title { font-size: 7.6pt; margin-bottom: 0.6mm; }
  body.compact th, body.compact td { padding: 0.4mm 1.3mm; }
  body.compact th { width: 21.5mm; font-size: 7.2pt; }
  body.compact .foot { font-size: 6pt; }
  @media print {
    body { background: #fff; }
    .toolbar, .warn { display: none !important; }
    .sheet { margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
    .sheet:last-of-type { break-after: auto; page-break-after: auto; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <strong>${escapeHtml(opts.roundTitle)}</strong>
    <span class="meta" id="layout-meta">${escapeHtml(opts.scopeLabel)} · 학생 ${slips.length}명 · 배치 계산 중…</span>
    <span class="hint">인쇄 설정: 여백 ‘기본값’ · 배율 100% · 점선 가운데를 자르세요</span>
    <button type="button" id="print-btn" onclick="window.print()" disabled>인쇄</button>
  </div>
  <div class="warn" id="overflow-warn" hidden></div>
  <div id="pool">${cells}</div>
  <script>
    (function () {
      var CANDIDATES = ${JSON.stringify(SLIPS_PER_PAGE_CANDIDATES)};
      var SIZES = ${JSON.stringify(SLIP_TEXT_SIZES)};
      var SCOPE = ${JSON.stringify(opts.scopeLabel).replace(/</g, '\\u003c')};
      var pool = document.getElementById('pool');
      var slips = Array.prototype.slice.call(pool.children);
      var GUTTER = ${G};
      // 행 간격 k 의 한가운데 = k·(H + G)/R − G/2  (H = 장 높이, R = 행 수)
      function addGuides(sheet, rows) {
        var v = document.createElement('i');
        v.className = 'guide v';
        sheet.appendChild(v);
        for (var k = 1; k < rows; k++) {
          var h = document.createElement('i');
          h.className = 'guide h';
          h.style.top = 'calc(' + k + ' * (100% + ' + GUTTER + 'mm) / ' + rows + ' - ' + GUTTER / 2 + 'mm)';
          sheet.appendChild(h);
        }
      }
      // 반별로 끊는다 — 한 장에 두 반이 섞이면 담임에게 나눠 줄 수 없다. 칸은 이미 반·번호 순이다.
      var classRuns = [];
      slips.forEach(function (s) {
        var c = s.getAttribute('data-class') || '';
        var last = classRuns[classRuns.length - 1];
        if (last && last.cls === c) last.items.push(s);
        else classRuns.push({ cls: c, items: [s] });
      });
      function layout(per) {
        Array.prototype.forEach.call(document.querySelectorAll('.sheet'), function (s) { s.remove(); });
        var anchor = pool, pages = 0;
        classRuns.forEach(function (run) {
          for (var i = 0; i < run.items.length; i += per) {
            var sheet = document.createElement('section');
            sheet.className = 'sheet';
            if (run.cls) sheet.setAttribute('data-class', run.cls);
            sheet.style.setProperty('--rows', String(per / 2));
            for (var j = i; j < Math.min(i + per, run.items.length); j++) sheet.appendChild(run.items[j]);
            addGuides(sheet, per / 2);
            anchor.parentNode.insertBefore(sheet, anchor.nextSibling);
            anchor = sheet;
            pages++;
          }
        });
        return pages;
      }
      function overflowing() {
        return slips.filter(function (s) {
          var m = s.firstElementChild;
          return m.scrollHeight > m.clientHeight + 1;
        }).length;
      }
      function run() {
        var chosen = CANDIDATES[CANDIDATES.length - 1], size = SIZES[SIZES.length - 1], pages = 0, over = 0;
        search: for (var k = 0; k < CANDIDATES.length; k++) {
          chosen = CANDIDATES[k];
          pages = layout(chosen);
          for (var z = 0; z < SIZES.length; z++) {
            size = SIZES[z];
            document.body.classList.toggle('compact', size === 'compact');
            over = overflowing();
            if (!over) break search;
          }
        }
        document.getElementById('layout-meta').textContent =
          SCOPE + ' · 학생 ' + slips.length + '명 · A4 ' + pages + '장 (반별로 나눔 · 한 장 최대 ' + chosen + '명' +
          (size === 'compact' ? ' · 글자 작게' : '') + ')';
        document.body.setAttribute('data-per-page', String(chosen));
        document.body.setAttribute('data-text-size', size);
        if (over) {
          var w = document.getElementById('overflow-warn');
          w.textContent = '한 장에 2명·작은 글자로 줄여도 학생 ' + over + '명의 내용이 칸에 다 들어가지 않습니다. 선택 과목이 비정상적으로 많은지 확인하세요.';
          w.hidden = false;
        }
        document.getElementById('print-btn').disabled = false;
      }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(run); else setTimeout(run, 300);
    })();
  </script>
</body>
</html>`;
}

// ── 한 사람당 한 장 (확인서) ─────────────────────────────────
/** 한 장 확인서의 종이 여백 — 자르지 않으므로 카드 출력(PAGE_MARGIN_MM)보다 넉넉하게 */
export const SHEET_PAGE_MARGIN_MM = 15;

/** (2, 1, 3) → "20103". 하나라도 없으면 빈 문자열 */
export function formatStudentNumber(grade: number | null, classNo: number | null, number: number | null): string {
  if (grade == null || classNo == null || number == null) return '';
  return `${grade}${String(classNo).padStart(2, '0')}${String(number).padStart(2, '0')}`;
}

function confirmSheetHtml(s: StudentSlip, roundTitle: string, year: number): string {
  const sections = s.sections
    .map(
      (sec) => `
      <section class="cs-sec">
        <h2>${escapeHtml(sec.title)}</h2>
        <table>${sec.rows
          .map(
            (r) =>
              `<tr><th>${escapeHtml(r.label)}</th><td>${
                r.subjects.length
                  ? r.subjects.map(escapeHtml).join('<span class="dot"> · </span>')
                  : '<span class="none">미선택</span>'
              }</td></tr>`,
          )
          .join('')}</table>
      </section>`,
    )
    .join('');
  const time = formatSlipTime(s.lastModifiedAt);
  return `
  <article class="cs-page" data-class="${s.classNo ?? ''}">
    <div class="cs-top">
      <div class="cs-round">${escapeHtml(roundTitle)}</div>
      <table class="cs-id"><tr>
        <th>학번</th><td>${escapeHtml(formatStudentNumber(s.grade, s.classNo, s.number))}</td>
        <th>이름</th><td class="cs-name">${escapeHtml(s.name)}</td>
      </tr></table>
    </div>
    <h1>과목 선택 확인서</h1>
    ${sections}
    <p class="cs-statement">위 과목을 수강 신청하였음을 확인합니다.</p>
    <p class="cs-date">${year}년<span class="blank"></span>월<span class="blank"></span>일</p>
    <table class="cs-sign">
      <tr>${SIGN_ROLES.map((r) => `<th>${r} 서명</th>`).join('')}</tr>
      <tr>${SIGN_ROLES.map(() => '<td></td>').join('')}</tr>
    </table>
    ${time ? `<div class="cs-foot">최종 제출 ${escapeHtml(time)}</div>` : ''}
  </article>`;
}

export interface ConfirmSheetsDocumentOptions extends SlipsDocumentOptions {
  /** 날짜 줄의 연도. 없으면 출력하는 날의 연도(KST) */
  year?: number;
}

/**
 * 한 사람당 A4 한 장 — 학생·학부모에게 그대로 나눠 주는 확인서(2026-10-08 사용자 요청).
 * 카드 출력과 같은 학생별 자료(buildStudentSlips)를 쓰므로 두 출력이 다른 과목을 말할 일이 없다.
 * 배치 계산이 필요 없다(한 장 = 한 사람). 내용이 아주 길면 브라우저가 다음 장으로 이어 쓴다.
 */
export function buildConfirmSheetsDocument(slips: StudentSlip[], opts: ConfirmSheetsDocumentOptions): string {
  const title = `${opts.roundTitle} 과목 선택 확인서 (${opts.scopeLabel})`;
  const year = opts.year ?? new Date(Date.now() + 9 * 3600_000).getUTCFullYear();
  const M = SHEET_PAGE_MARGIN_MM;
  const pageW = 210 - 2 * M;
  const pageH = 297 - 2 * M - 1;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 portrait; margin: ${M}mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif;
    color: #0f172a; background: #e2e8f0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
${TOOLBAR_CSS}
  .cs-page {
    width: ${pageW}mm; min-height: ${pageH}mm; margin: 16mm auto; background: #fff;
    box-shadow: 0 0 0 ${M}mm #fff, 0 2px 16px ${M}mm rgba(15, 23, 42, 0.12);
    display: flex; flex-direction: column; font-size: 10.5pt; line-height: 1.5;
  }
  .cs-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm; }
  .cs-round { font-size: 9pt; color: #64748b; min-width: 0; }
  table { border-collapse: collapse; }
  .cs-id th, .cs-id td { border: 0.3mm solid #334155; padding: 1.6mm 3mm; font-size: 10.5pt; white-space: nowrap; }
  .cs-id th { background: #f1f5f9; font-weight: 600; color: #334155; }
  .cs-id td { min-width: 22mm; text-align: center; }
  .cs-id .cs-name { min-width: 30mm; font-weight: 700; }
  h1 { margin: 12mm 0 9mm; text-align: center; font-size: 20pt; font-weight: 700; letter-spacing: 0.2em; padding-left: 0.2em; }
  .cs-sec { margin-bottom: 7mm; }
  .cs-sec h2 {
    margin: 0 0 2mm; padding-left: 2.2mm; font-size: 11pt; font-weight: 700;
    border-left: 1.2mm solid #334155; line-height: 1.3;
  }
  .cs-sec table { width: 100%; table-layout: fixed; }
  .cs-sec th, .cs-sec td { border: 0.25mm solid #94a3b8; padding: 2.4mm 3.2mm; vertical-align: middle; text-align: left; }
  .cs-sec th { width: 34mm; background: #f1f5f9; font-size: 9.5pt; font-weight: 600; color: #334155; }
  .cs-sec td { font-size: 11pt; word-break: keep-all; overflow-wrap: anywhere; }
  .dot { color: #94a3b8; }
  .none { color: #94a3b8; }
  .cs-statement { margin: 6mm 0 0; text-align: center; font-size: 12pt; }
  .cs-date { margin: 5mm 0 0; text-align: center; font-size: 11.5pt; }
  .cs-date .blank { display: inline-block; width: 14mm; }
  .cs-sign { margin: 9mm auto 0; width: 128mm; table-layout: fixed; }
  .cs-sign th, .cs-sign td { border: 0.3mm solid #334155; text-align: center; }
  .cs-sign th { padding: 2mm; background: #f1f5f9; font-size: 10.5pt; font-weight: 600; color: #334155; }
  .cs-sign td { height: 24mm; }
  .cs-foot { margin-top: auto; padding-top: 6mm; font-size: 8pt; color: #94a3b8; text-align: right; }
  @media print {
    body { background: #fff; }
    .toolbar, .warn { display: none !important; }
    .cs-page { margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
    .cs-page:last-of-type { break-after: auto; page-break-after: auto; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <strong>${escapeHtml(opts.roundTitle)}</strong>
    <span class="meta">${escapeHtml(opts.scopeLabel)} · 학생 ${slips.length}명 · A4 ${slips.length}장 (한 사람당 한 장)</span>
    <span class="hint">인쇄 설정: 여백 ‘기본값’ · 배율 100%</span>
    <button type="button" onclick="window.print()">인쇄</button>
  </div>
  ${slips.map((s) => confirmSheetHtml(s, opts.roundTitle, year)).join('')}
</body>
</html>`;
}
