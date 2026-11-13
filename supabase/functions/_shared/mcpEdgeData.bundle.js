// 자동 생성 파일 — 고치지 말 것. 원본 = src/lib/mcpEdgeData.ts (+ src/data/extensionDirectory.ts)
// 다시 만들기: npx tsx scripts/mcp-docgen/build-bundle.mts
// src/data/extensionDirectory.ts
var extensionData = [
  {
    id: "admin",
    title: "운영실",
    category: "admin",
    description: "교장실·교무실",
    entries: [
      { id: "admin-principal", name: "교장실", extension: "301", phone: "000-0000", isLead: true },
      { id: "admin-office-1", name: "교무실 1", extension: "306", phone: "000-0000" },
      { id: "admin-office-2", name: "교무실 2", extension: "305" }
    ]
  },
  {
    id: "grade-1",
    title: "1학년 교무실",
    category: "grade",
    description: "부장 및 담임 직통",
    entries: [
      { id: "grade-1-lead", name: "1학년 부장", extension: "311", isLead: true },
      { id: "grade-1-1", name: "1학년 1반", extension: "312" },
      { id: "grade-1-2", name: "1학년 2반", extension: "313" }
    ]
  },
  {
    id: "staff",
    title: "업무 담당",
    category: "staff",
    entries: [
      { id: "staff-1", name: "홍길동", extension: "320", duty: "정보 업무" }
    ]
  },
  {
    id: "facility",
    title: "부속실",
    category: "facility",
    entries: [
      { id: "facility-health", name: "보건실", extension: "330", phone: "000-0000" },
      { id: "facility-library", name: "도서관", extension: "331" }
    ]
  },
  {
    id: "office",
    title: "행정실",
    category: "office",
    entries: [
      { id: "office-main", name: "행정실", extension: "340", phone: "000-0000" },
      { id: "office-fax", name: "행정실 팩스", phone: "000-0000", isFax: true }
    ]
  }
];
var quickDialContacts = [
  { label: "교무실 1", phone: "000-0000" },
  { label: "행정실", phone: "000-0000" },
  { label: "보건실", phone: "000-0000" }
];

// src/lib/callsDirectory.ts
var normalizeText = (value) => value.toLowerCase().replace(/[\s.\-()]/g, "");

// src/lib/mcpEdgeData.ts
function extensionRows() {
  const rows = [];
  for (const q of quickDialContacts) rows.push({ group: "대표 번호", name: q.label, phone: q.phone });
  for (const g of extensionData) {
    for (const e of g.entries) {
      rows.push({
        group: g.title,
        name: e.name,
        ...e.duty ? { duty: e.duty } : {},
        ...e.extension ? { extension: e.extension } : {},
        ...e.phone ? { phone: e.phone } : {},
        ...e.note || e.isFax ? { note: [e.isFax ? "팩스" : "", e.note ?? ""].filter(Boolean).join(" · ") } : {}
      });
    }
  }
  return rows;
}
function searchExtensions(query, limit) {
  const all = extensionRows();
  const q = normalizeText(String(query ?? "").trim());
  const rows = q ? all.filter((r) => [r.group, r.name, r.duty, r.extension, r.phone, r.note].some((v) => v && normalizeText(v).includes(q))) : all;
  return { count: rows.length, rows: rows.slice(0, limit), ...rows.length > limit ? { truncated: true } : {} };
}
function parseNeisMeals(json) {
  const root = json?.mealServiceDietInfo;
  if (!Array.isArray(root)) return [];
  const rows = root[1]?.row ?? [];
  return rows.map((r) => ({
    date: `${r.MLSV_YMD.slice(0, 4)}-${r.MLSV_YMD.slice(4, 6)}-${r.MLSV_YMD.slice(6, 8)}`,
    meal: r.MMEAL_SC_NM,
    menu: String(r.DDISH_NM ?? "").split(/<br\s*\/?>/i).map((item) => item.replace(/\(\s*[\d.,\s]+\)/g, "").replace(/\d+\./g, "").replace(/\(\s*\)/g, "").trim()).filter(Boolean),
    ...r.CAL_INFO ? { calories: r.CAL_INFO } : {}
  })).sort((a, b) => a.date.localeCompare(b.date) || mealOrder(a.meal) - mealOrder(b.meal));
}
var mealOrder = (m) => m === "조식" ? 0 : m === "중식" ? 1 : m === "석식" ? 2 : 3;
function mealRange(filter, today) {
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const pick = (v, name) => {
    if (v === void 0 || v === null || v === "") return null;
    if (typeof v !== "string" || !DATE.test(v)) throw new Error(`조건 ${name} 는 YYYY-MM-DD 입니다.`);
    return v;
  };
  const date = pick(filter.date, "date");
  const from = pick(filter.from, "from") ?? date ?? today;
  const to = pick(filter.to, "to") ?? date ?? from;
  if (to < from) throw new Error("to 가 from 보다 앞입니다.");
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > 31) throw new Error("기간은 31일까지입니다.");
  return { from, to };
}
export {
  extensionRows,
  mealRange,
  parseNeisMeals,
  searchExtensions
};
