// 자동 생성 파일 — 고치지 말 것. 원본 = src/lib/mcpSchoolOps.ts (+ timetableSwapUtils · swapBurden · mealDuty · selfStudySupervision · schoolDay · surveyAggregate)
// 다시 만들기: npx tsx scripts/mcp-docgen/build-bundle.mts
// src/utils/timetableSwapUtils.ts
function lessonKey(resourceId, weekday, period) {
  return `${resourceId ?? ""}|${weekday}|${period}`;
}
function rosterStatusOf(fit) {
  if (!fit || fit.myCount === 0 || fit.theirCount === 0) return "unknown";
  if (fit.theirConflictCount + fit.myConflictCount > 0) return "conflict";
  if (fit.sharedCount === fit.myCount && fit.sharedCount === fit.theirCount) return "same";
  return "compatible";
}
var CLUB_SUBJECT_NAMES = ["동아리활동", "동아리"];
var NON_SWAPPABLE_ACTIVITY_TYPES = /* @__PURE__ */ new Set(["club"]);
function isSwappableLesson(entry) {
  if (entry.activity_type) return !NON_SWAPPABLE_ACTIVITY_TYPES.has(entry.activity_type);
  const name = (entry.subject ?? entry.section_name ?? "").replace(/\s+/g, "");
  if (!name) return true;
  return !CLUB_SUBJECT_NAMES.some((activity) => name.startsWith(activity.replace(/\s+/g, "")));
}
function sameClassroom(a, b) {
  const norm = (value) => value === null || value === void 0 ? "" : String(value).trim();
  return norm(a.grade) === norm(b.grade) && norm(a.class_number) === norm(b.class_number);
}
function findSwappableClasses(targetEntry, allEntries, rosterFit = null) {
  if (targetEntry.type !== "pattern") {
    return [];
  }
  if (!isSwappableLesson(targetEntry)) {
    return [];
  }
  const targetGrade = targetEntry.grade;
  const targetClass = targetEntry.class_number;
  if (!targetGrade || !targetClass) {
    return [];
  }
  const fitOf = (entry) => rosterFit?.get(lessonKey(entry.resource_id, entry.weekday, entry.period));
  const candidateEntries = [];
  for (const entry of allEntries) {
    if (entry.type !== "pattern") continue;
    if (!isSwappableLesson(entry)) continue;
    if (entry.resource_id === targetEntry.resource_id) continue;
    if (entry.id === targetEntry.id) continue;
    if (sameClassroom(entry, targetEntry)) {
      candidateEntries.push({ entry, matchedBy: "classroom" });
      continue;
    }
    const fit = fitOf(entry);
    const status = rosterStatusOf(fit);
    if (fit && fit.sharedCount > 0 && (status === "same" || status === "compatible")) {
      candidateEntries.push({ entry, matchedBy: "roster" });
    }
  }
  const candidates = candidateEntries.map(({ entry: candidateEntry, matchedBy }) => {
    let conflicts = 0;
    let teacherConflict = false;
    const targetTeacherConflict = allEntries.some(
      (e) => e.resource_id === targetEntry.resource_id && e.weekday_time === candidateEntry.weekday_time && e.id !== targetEntry.id
    );
    if (targetTeacherConflict) {
      conflicts++;
      teacherConflict = true;
    }
    const candidateTeacherConflict = allEntries.some(
      (e) => e.resource_id === candidateEntry.resource_id && e.weekday_time === targetEntry.weekday_time && e.id !== candidateEntry.id
    );
    if (candidateTeacherConflict) {
      conflicts++;
      teacherConflict = true;
    }
    const fit = fitOf(candidateEntry);
    const rosterStatus = rosterStatusOf(fit);
    const studentConflicts = rosterStatus === "conflict" && fit ? fit.theirConflictCount + fit.myConflictCount : 0;
    if (studentConflicts > 0) conflicts++;
    return {
      entry: candidateEntry,
      conflicts,
      canSwap: !teacherConflict && studentConflicts === 0,
      teacherConflict,
      studentConflicts,
      rosterStatus,
      rosterFit: fit,
      matchedBy
    };
  });
  return candidates.sort((a, b) => {
    if (a.canSwap && !b.canSwap) return -1;
    if (!a.canSwap && b.canSwap) return 1;
    if (a.conflicts !== b.conflicts) return a.conflicts - b.conflicts;
    if (a.entry.weekday !== b.entry.weekday) {
      return a.entry.weekday - b.entry.weekday;
    }
    return a.entry.period - b.entry.period;
  });
}
function getSwapConflictReason(targetEntry, candidateEntry, allEntries) {
  const reasons = [];
  const targetTeacherConflict = allEntries.find(
    (e) => e.resource_id === targetEntry.resource_id && e.weekday_time === candidateEntry.weekday_time && e.id !== targetEntry.id
  );
  if (targetTeacherConflict) {
    reasons.push(
      `${targetEntry.teacher_name} 선생님이 해당 시간(${formatWeekday(candidateEntry.weekday)} ${candidateEntry.period}교시)에 다른 수업이 있습니다: ${targetTeacherConflict.subject}`
    );
  }
  const candidateTeacherConflict = allEntries.find(
    (e) => e.resource_id === candidateEntry.resource_id && e.weekday_time === targetEntry.weekday_time && e.id !== candidateEntry.id
  );
  if (candidateTeacherConflict) {
    reasons.push(
      `${candidateEntry.teacher_name} 선생님이 해당 시간(${formatWeekday(targetEntry.weekday)} ${targetEntry.period}교시)에 다른 수업이 있습니다: ${candidateTeacherConflict.subject}`
    );
  }
  return reasons;
}
function formatWeekday(weekday) {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return days[weekday === 7 ? 0 : weekday] + "요일";
}

// src/lib/swapBurden.ts
var TEACHER_LOAD_LIMITS = {
  /** 하루 최대 수업 수 */
  maxPerDay: 4,
  /** 연속 최대 교시 수 (3연강부터 위반) */
  maxConsecutive: 2,
  /** 마지막 교시로 취급할 교시 */
  lastPeriod: 7,
  /** 마지막 교시 주간 최대 횟수 */
  maxLastPeriodPerWeek: 3
};
var WEIGHTS = {
  consecutive: 3,
  dailyOver: 2,
  emptyDayLost: 2,
  lastPeriodOver: 1
};
var slotKey = (slot) => `${slot.weekday}-${slot.period}`;
function penaltyOf(slots) {
  const byDay = /* @__PURE__ */ new Map();
  let lastPeriodCount = 0;
  for (const key of slots) {
    const [weekdayText, periodText] = key.split("-");
    const weekday = Number(weekdayText);
    const period = Number(periodText);
    if (!Number.isFinite(weekday) || !Number.isFinite(period)) continue;
    const periods = byDay.get(weekday) ?? [];
    periods.push(period);
    byDay.set(weekday, periods);
    if (period >= TEACHER_LOAD_LIMITS.lastPeriod) lastPeriodCount += 1;
  }
  let consecutiveExcess = 0;
  let dailyExcess = 0;
  let emptyDays = 0;
  let maxDailyCount = 0;
  for (let weekday = 1; weekday <= 5; weekday += 1) {
    const periods = (byDay.get(weekday) ?? []).slice().sort((a, b) => a - b);
    if (periods.length === 0) {
      emptyDays += 1;
      continue;
    }
    maxDailyCount = Math.max(maxDailyCount, periods.length);
    dailyExcess += Math.max(0, periods.length - TEACHER_LOAD_LIMITS.maxPerDay);
    let runLength = 1;
    for (let i = 1; i <= periods.length; i += 1) {
      const continues = i < periods.length && periods[i] === periods[i - 1] + 1;
      if (continues) {
        runLength += 1;
        continue;
      }
      consecutiveExcess += Math.max(0, runLength - TEACHER_LOAD_LIMITS.maxConsecutive);
      runLength = 1;
    }
  }
  const lastPeriodExcess = Math.max(
    0,
    lastPeriodCount - TEACHER_LOAD_LIMITS.maxLastPeriodPerWeek
  );
  const score = consecutiveExcess * WEIGHTS.consecutive + dailyExcess * WEIGHTS.dailyOver + lastPeriodExcess * WEIGHTS.lastPeriodOver - // 여유로운 날은 감점(=점수를 낮춘다). 그 날에 수업이 생기면 자연히 delta 가 오른다.
  emptyDays * WEIGHTS.emptyDayLost;
  return { score, consecutiveExcess, dailyExcess, emptyDays, lastPeriodExcess, maxDailyCount };
}
function evaluateSwapBurden(params) {
  const { teacherSlots, add, remove } = params;
  const before = new Set(teacherSlots.map(slotKey));
  const after = new Set(before);
  if (remove) after.delete(slotKey(remove));
  after.add(slotKey(add));
  const beforePenalty = penaltyOf(before);
  const afterPenalty = penaltyOf(after);
  const delta = afterPenalty.score - beforePenalty.score;
  const reasons = [];
  if (afterPenalty.consecutiveExcess > beforePenalty.consecutiveExcess) {
    reasons.push(`연속 ${TEACHER_LOAD_LIMITS.maxConsecutive + 1}교시 이상 수업이 생깁니다`);
  }
  if (afterPenalty.dailyExcess > beforePenalty.dailyExcess) {
    reasons.push(`그날 수업이 ${afterPenalty.maxDailyCount}개가 됩니다`);
  }
  if (afterPenalty.emptyDays < beforePenalty.emptyDays) {
    reasons.push("수업이 없던 날에 수업이 생깁니다");
  }
  if (afterPenalty.lastPeriodExcess > beforePenalty.lastPeriodExcess) {
    reasons.push(`마지막 교시 수업이 주 ${TEACHER_LOAD_LIMITS.maxLastPeriodPerWeek}회를 넘습니다`);
  }
  return {
    delta,
    totalAfter: after.size,
    level: delta <= 0 ? "low" : delta <= 2 ? "medium" : "high",
    reasons
  };
}
var BURDEN_LEVEL_LABEL = {
  low: "부담 적음",
  medium: "보통",
  high: "부담 큼"
};
function compareBurden(a, b) {
  if (a.burden.delta !== b.burden.delta) return a.burden.delta - b.burden.delta;
  if (a.burden.totalAfter !== b.burden.totalAfter) return a.burden.totalAfter - b.burden.totalAfter;
  if ((a.weekday ?? 0) !== (b.weekday ?? 0)) return (a.weekday ?? 0) - (b.weekday ?? 0);
  return (a.period ?? 0) - (b.period ?? 0);
}

// src/lib/schoolDay.ts
var CLOSED_DAY_KINDS = /* @__PURE__ */ new Set(["휴업일", "공휴일"]);
var SATURDAY_OFF_TITLE = "토요휴업일";
var EXAM_TITLE_RE = /^\s*\d\s*차\s*고사\s*$/;
function isClosingEntry(entry) {
  return Boolean(entry.dayKind && CLOSED_DAY_KINDS.has(entry.dayKind)) && entry.title.trim() !== SATURDAY_OFF_TITLE;
}
function entryAppliesToGrade(entry, grade) {
  const grades = entry.grades ?? [];
  if (grades.length === 0) return true;
  return grade != null && grades.includes(grade);
}
function gradesLabel(grades) {
  return `${[...grades].sort((a, b) => a - b).join("·")}학년`;
}
function isVacationTitle(title) {
  return /방학/.test(title) && !/방학식/.test(title);
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function isoDow(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const js = new Date(y, m - 1, d).getDay();
  return js === 0 ? 7 : js;
}
function kstDateKey(ms) {
  return new Date(ms + 9 * 36e5).toISOString().slice(0, 10);
}
function expandScheduleRows(rows) {
  const out = [];
  for (const row of rows) {
    const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
    const title = typeof meta.title === "string" ? meta.title.trim() : "";
    if (!title) continue;
    const dayKind = typeof meta.sbtr_dd_sc_nm === "string" ? meta.sbtr_dd_sc_nm : null;
    const grades = parseNoClassGrades(meta.no_class_grades);
    const startKey = kstDateKey(Date.parse(row.starts_at));
    const endMs = Date.parse(row.ends_at);
    const endKey = kstDateKey(Number.isFinite(endMs) ? endMs - 1 : Date.parse(row.starts_at));
    let cursor = startKey;
    for (let guard = 0; cursor <= endKey && guard < 400; guard++) {
      out.push({ date: cursor, title, dayKind, ...grades.length > 0 ? { grades } : {} });
      const [y, m, d] = cursor.split("-").map(Number);
      cursor = toDateKey(new Date(y, m - 1, d + 1));
    }
  }
  return out;
}
function indexCalendar(entries) {
  const map = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const list = map.get(entry.date) ?? [];
    list.push(entry);
    map.set(entry.date, list);
  }
  return map;
}
function classifySchoolDay(date, entriesOfDay, term, grade) {
  const dow = isoDow(date);
  const closingAll = entriesOfDay.filter(isClosingEntry);
  const closing = closingAll.filter((e) => entryAppliesToGrade(e, grade));
  const partial = closingAll.filter((e) => (e.grades ?? []).length > 0);
  const closedGrades = [...new Set(partial.flatMap((e) => e.grades ?? []))].sort((a, b) => a - b);
  const partialLabel = partial.length > 0 ? partial.map((e) => `${e.title.trim()}(${gradesLabel(e.grades ?? [])})`).join(" · ") : null;
  const others = entriesOfDay.filter((e) => !isClosingEntry(e) && e.title.trim() !== SATURDAY_OFF_TITLE);
  const exams = [...new Set(others.filter((e) => EXAM_TITLE_RE.test(e.title)).map((e) => e.title.replace(/\s+/g, "")))].sort();
  const notes = [.../* @__PURE__ */ new Set([
    ...others.filter((e) => !EXAM_TITLE_RE.test(e.title)).map((e) => e.title.trim()),
    // 내 학년에 걸리지 않는 일부 학년 휴업은 메모로
    ...partial.filter((e) => !closing.includes(e)).map((e) => `${e.title.trim()}(${gradesLabel(e.grades ?? [])} 수업 없음)`)
  ])];
  const base = { date, dow, notes, exams, allGradeExam: exams.length >= 2, closedGrades, partialLabel };
  if (closing.length > 0) {
    const vacation = closing.find((e) => isVacationTitle(e.title));
    const first = vacation ?? closing[0];
    return { ...base, kind: vacation ? "vacation" : "holiday", isClosed: true, label: first.title.trim() };
  }
  if (term && (date < term.start || date > term.end)) {
    return { ...base, kind: "vacation", isClosed: true, label: "방학" };
  }
  if (dow >= 6) {
    return { ...base, kind: "weekend", isClosed: true, label: null };
  }
  if (exams.length > 0) {
    return { ...base, kind: "exam", isClosed: false, label: exams.join("·") };
  }
  return { ...base, kind: "school", isClosed: false, label: null };
}
function parseNoClassGrades(value) {
  if (!Array.isArray(value)) return [];
  const grades = [...new Set(value.map(Number).filter((g) => Number.isInteger(g) && g >= 1 && g <= 3))].sort((a, b) => a - b);
  return grades.length >= 3 ? [] : grades;
}

// src/lib/mealDuty.ts
var MEAL_DUTY_TITLE = "급식지도";
var MEAL_DUTY_DEFAULT_TIME = { start: "11:50", end: "12:20" };
var MEAL_DUTY_PER_DAY = 2;
var MEAL_DUTY_EXCLUDED_TAGS = ["학교관리자"];
var MEAL_DUTY_EXCLUSION_LABEL = {
  staff: "행정실·직원",
  inactive: "재직 아님",
  school_admin: "교장·교감",
  no_role: "수업·분장 없음"
};
function mealDutyExclusion(input) {
  if ((input.status ?? "active") !== "active") return "inactive";
  if (input.type !== "teacher") return "staff";
  if (input.tags.some((tag) => MEAL_DUTY_EXCLUDED_TAGS.includes(tag))) return "school_admin";
  if (input.weeklyPeriods <= 0 && !input.hasDutySeat) return "no_role";
  return null;
}
function toDateKey2(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function isoDayOfWeek(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const js = new Date(y, m - 1, d).getDay();
  return js === 0 ? 7 : js;
}
var REDUCED_DAY_RE = /수학여행|현장체험학습/;
var EXAM_RE = EXAM_TITLE_RE;
function mealDutyDayDefaults(notes) {
  const exams = new Set(notes.filter((n) => EXAM_RE.test(n)).map((n) => n.replace(/\s+/g, "")));
  return {
    ...notes.some((n) => REDUCED_DAY_RE.test(n)) ? { headcount: 1 } : {},
    ...exams.size >= 2 ? { defaultSkip: `전 학년 시험(${[...exams].sort().join("·")})` } : {}
  };
}
function listMealDutyDays(year, month, calendar) {
  const closedReason = /* @__PURE__ */ new Map();
  const notes = /* @__PURE__ */ new Map();
  for (const entry of calendar) {
    const title = entry.title.trim();
    if (!title) continue;
    if (entry.dayKind && CLOSED_DAY_KINDS.has(entry.dayKind)) {
      if (!closedReason.has(entry.date)) closedReason.set(entry.date, title);
      continue;
    }
    if (title === "토요휴업일") continue;
    const list = notes.get(entry.date) ?? [];
    if (!list.includes(title)) list.push(title);
    notes.set(entry.date, list);
  }
  const days = [];
  const closed = [];
  const last = new Date(year, month, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const key = toDateKey2(new Date(year, month - 1, d));
    const dow = isoDayOfWeek(key);
    if (dow > 5) continue;
    const reason = closedReason.get(key);
    if (reason) {
      closed.push({ date: key, reason });
      continue;
    }
    const dayNotes = notes.get(key) ?? [];
    days.push({ date: key, dow, notes: dayNotes, ...mealDutyDayDefaults(dayNotes) });
  }
  return { days, closed };
}
function busyKey(name, dow) {
  return `${name}|${dow}`;
}
function mealDutyRotationOrder(pool, lastAssigned) {
  return [...new Set(pool)].sort((a, b) => {
    const la = lastAssigned.get(a) ?? "";
    const lb = lastAssigned.get(b) ?? "";
    if (la !== lb) return la < lb ? -1 : 1;
    return a.localeCompare(b, "ko");
  });
}
function planMealDuty(input) {
  const perDay = input.perDay ?? MEAL_DUTY_PER_DAY;
  const queue = mealDutyRotationOrder(input.pool, input.lastAssigned);
  return input.days.map((day) => {
    const need = day.headcount ?? perDay;
    const picked = [];
    for (const name of queue) {
      if (picked.length >= need) break;
      if (input.busy.has(busyKey(name, day.dow))) continue;
      picked.push(name);
    }
    for (const name of picked) {
      queue.splice(queue.indexOf(name), 1);
      queue.push(name);
    }
    return { ...day, assignees: picked, shortage: need - picked.length };
  });
}
function lastAssignedByName(rows, before) {
  const map = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (row.date >= before) continue;
    for (const name of row.names) {
      const prev = map.get(name);
      if (!prev || prev < row.date) map.set(name, row.date);
    }
  }
  return map;
}
function mealDutyTitle(names) {
  return names.length > 0 ? `${MEAL_DUTY_TITLE} - ${names.join(", ")}` : MEAL_DUTY_TITLE;
}
function absenceKey(date, name) {
  return `${date}|${name}`;
}
function slotIssues(day, index, ctx) {
  const name = day.slots[index];
  if (!name) return [{ kind: "empty", label: "빈칸" }];
  const issues = [];
  if (ctx.busy.has(busyKey(name, day.dow))) issues.push({ kind: "busy", label: "3교시 수업" });
  for (const a of ctx.absences.get(absenceKey(day.date, name)) ?? []) {
    issues.push({ kind: "absent", label: `${a.kind === "training" ? "연수" : "출장"}${a.title ? ` · ${a.title}` : ""}` });
  }
  if (day.slots.indexOf(name) !== index) issues.push({ kind: "duplicate", label: "같은 날 중복" });
  return issues;
}

// src/lib/selfStudySupervision.ts
var SUPERVISION_SLOTS = ["morning", "evening", "saturday"];
var SLOT_LABEL = {
  morning: "아침",
  evening: "저녁",
  saturday: "토요일"
};
var SUPERVISION_TITLE_PREFIX = "자습감독";
var SCHOOL_GRADE = 0;
function gradeLabel(grade) {
  return grade === SCHOOL_GRADE ? "전 학년" : `${grade}학년`;
}
var DEFAULT_SLOT_TIMES = {
  morning: { start: "07:40", end: "08:20" },
  evening: { start: "18:40", end: "21:40" },
  saturday: { start: "09:00", end: "17:00" }
};
function supervisionTitle(grade, slot, name, withMorning = false) {
  const label = slot === "evening" && withMorning ? "아침·저녁" : SLOT_LABEL[slot];
  return `${SUPERVISION_TITLE_PREFIX} · ${gradeLabel(grade)} ${label} · ${name}`;
}
var HHMM = /^\d{2}:\d{2}$/;
function spanOf(rooms, fallback) {
  const starts = [];
  const ends = [];
  for (const room of rooms) {
    for (const p of room.operating_periods ?? []) {
      if (p.start_time && HHMM.test(p.start_time)) starts.push(p.start_time);
      if (p.end_time && HHMM.test(p.end_time)) ends.push(p.end_time);
    }
  }
  if (starts.length === 0 || ends.length === 0) return fallback;
  return { start: starts.sort()[0], end: ends.sort()[ends.length - 1] };
}
function gradeSlotConfig(rooms, grade) {
  const mine = rooms.filter((r) => (r.grades ?? []).includes(grade));
  const isMorning = (r) => r.name.includes("아침");
  const days = (r) => r.operating_days ?? [];
  const morning = mine.filter(isMorning);
  const saturday = mine.filter((r) => !isMorning(r) && days(r).includes(6) && !days(r).some((d) => d >= 1 && d <= 5));
  const evening = mine.filter((r) => !isMorning(r) && days(r).some((d) => d >= 1 && d <= 5));
  return {
    available: { morning: morning.length > 0, evening: evening.length > 0, saturday: saturday.length > 0 },
    times: {
      morning: spanOf(morning, DEFAULT_SLOT_TIMES.morning),
      evening: spanOf(evening, DEFAULT_SLOT_TIMES.evening),
      saturday: spanOf(saturday, DEFAULT_SLOT_TIMES.saturday)
    },
    rooms: {
      morning: morning.map((r) => r.name),
      evening: evening.map((r) => r.name),
      saturday: saturday.map((r) => r.name)
    }
  };
}
function schoolMorningConfig(rooms) {
  const morning = rooms.filter((r) => r.name.includes("아침"));
  return {
    available: { morning: morning.length > 0, evening: false, saturday: false },
    times: {
      morning: spanOf(morning, DEFAULT_SLOT_TIMES.morning),
      evening: DEFAULT_SLOT_TIMES.evening,
      saturday: DEFAULT_SLOT_TIMES.saturday
    },
    rooms: { morning: morning.map((r) => r.name), evening: [], saturday: [] }
  };
}
function findCsatDate(entries) {
  const hits = entries.filter((e) => /대학수학능력시험/.test(e.title) || e.title.trim() === "수능").map((e) => e.date).sort();
  return hits[0] ?? null;
}
var DOW_NAME = ["", "월", "화", "수", "목", "금", "토", "일"];
function cellSlots(cell) {
  return cell.withMorning ? [cell.slot, "morning"] : [cell.slot];
}
function unavailabilityReason(rules, name, cell) {
  const slots = cellSlots(cell);
  for (const rule of rules) {
    if (rule.name !== name) continue;
    if (!rule.slots.some((s) => slots.includes(s))) continue;
    if (rule.date) {
      if (rule.date !== cell.date) continue;
    } else {
      if (rule.weekday != null && rule.weekday !== cell.dow) continue;
      if (rule.from && cell.date < rule.from) continue;
      if (rule.until && cell.date > rule.until) continue;
    }
    return rule.note?.trim() || describeRule(rule);
  }
  return null;
}
function shortDate(date) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}
function describeRule(rule) {
  const slots = SUPERVISION_SLOTS.filter((s) => rule.slots.includes(s)).map((s) => SLOT_LABEL[s]).join("·");
  if (rule.date) return `${shortDate(rule.date)} ${slots}`;
  const period = rule.from && rule.until ? ` (${shortDate(rule.from)}~${shortDate(rule.until)})` : rule.from ? ` (${shortDate(rule.from)}부터)` : rule.until ? ` (${shortDate(rule.until)}까지)` : "";
  if (rule.weekday != null) return `매주 ${DOW_NAME[rule.weekday]}요일 ${slots}${period}`;
  return `${slots}${period}`.trim();
}
function seniorExclusionRules(names, from) {
  return names.map((name) => ({
    name,
    weekday: null,
    date: null,
    from,
    until: null,
    slots: ["morning"],
    note: `${shortDate(from)}부터 3학년 제외(수능 이후)`,
    auto: true
  }));
}
function listSupervisionCells(input) {
  const { days, config, enabled, morningMode, from } = input;
  const on = (slot) => enabled[slot] && config.available[slot];
  const togetherMorning = morningMode === "with_evening" && on("morning");
  const cells = [];
  for (const day of [...days.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.date < from) continue;
    const notes = [...day.exams, ...day.notes];
    if (day.kind === "school" || day.kind === "exam") {
      if (on("morning") && morningMode === "separate") cells.push({ date: day.date, dow: day.dow, slot: "morning", notes });
      if (on("evening")) cells.push({ date: day.date, dow: day.dow, slot: "evening", notes, ...togetherMorning ? { withMorning: true } : {} });
    } else if (day.kind === "weekend" && day.dow === 6 && on("saturday")) {
      cells.push({ date: day.date, dow: day.dow, slot: "saturday", notes });
    }
  }
  return cells;
}
function cellKey(cell) {
  return `${cell.date}|${cell.slot}`;
}
function emptyLoad() {
  return { bySlot: { morning: 0, evening: 0, saturday: 0 }, total: 0, byDow: [0, 0, 0, 0, 0, 0, 0], last: null };
}
function dowOf(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const js = new Date(y, m - 1, d).getDay();
  return js === 0 ? 7 : js;
}
function addLoad(load, date, slot) {
  load.bySlot[slot] += 1;
  load.total += 1;
  const dow = dowOf(date);
  if (dow <= 6) load.byDow[dow] += 1;
  if (!load.last || date > load.last) load.last = date;
}
function loadsFromHistory(pool, history) {
  const loads = new Map(pool.map((name) => [name, emptyLoad()]));
  for (const row of history) {
    for (const name of row.names) {
      const load = loads.get(name);
      if (load) addLoad(load, row.date, row.slot);
    }
  }
  return loads;
}
function tieRank(seed, name) {
  let h = 2166136261;
  for (const ch of `${seed}|${name}`) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function daysBetween(a, b) {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5;
}
function rankCandidates(names, loads, cell, seed) {
  const key = (name) => {
    const load = loads.get(name) ?? emptyLoad();
    const recent = load.last && daysBetween(load.last, cell.date) <= 1 ? 1 : 0;
    return [load.bySlot[cell.slot], load.total, load.byDow[cell.dow] ?? 0, recent, load.last ?? "", tieRank(seed, name)];
  };
  return [...names].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
}
function planSupervision(input) {
  const { cells, pool, history, absent, seed, unavailable = [] } = input;
  const loads = loadsFromHistory(pool, history);
  const byDate = /* @__PURE__ */ new Map();
  const out = [];
  const sorted = [...cells].sort((a, b) => a.date.localeCompare(b.date) || SUPERVISION_SLOTS.indexOf(a.slot) - SUPERVISION_SLOTS.indexOf(b.slot));
  for (const cell of sorted) {
    const taken = byDate.get(cell.date) ?? /* @__PURE__ */ new Set();
    const free = pool.filter((name) => !taken.has(name));
    const present = free.filter((name) => !absent.has(`${cell.date}|${name}`) && !unavailabilityReason(unavailable, name, cell));
    const ranked = rankCandidates(present.length > 0 ? present : [], loads, cell, seed);
    const assignee = ranked[0] ?? null;
    if (assignee) {
      taken.add(assignee);
      byDate.set(cell.date, taken);
      const load = loads.get(assignee);
      if (load) addLoad(load, cell.date, cell.slot);
    }
    out.push({ ...cell, assignee });
  }
  return out;
}
var CELL_ISSUE_LABEL = {
  empty: "감독 없음",
  absent: "출장·연수",
  unavailable: "못 하는 날",
  duplicate: "같은 날 두 칸",
  consecutive: "이틀 연속"
};
function cellIssues(cells, index, absent, unavailable = []) {
  const cell = cells[index];
  if (!cell.assignee) return ["empty"];
  const issues = [];
  if (absent.has(`${cell.date}|${cell.assignee}`)) issues.push("absent");
  if (unavailabilityReason(unavailable, cell.assignee, cell)) issues.push("unavailable");
  if (cells.some((c, i) => i !== index && c.date === cell.date && c.assignee === cell.assignee)) issues.push("duplicate");
  if (cells.some((c) => c.assignee === cell.assignee && c.date !== cell.date && daysBetween(c.date, cell.date) === 1)) {
    issues.push("consecutive");
  }
  return issues;
}
function loadsWithPlan(pool, history, plan) {
  const loads = loadsFromHistory(pool, history);
  for (const cell of plan) {
    if (!cell.assignee) continue;
    const load = loads.get(cell.assignee);
    if (load) addLoad(load, cell.date, cell.slot);
  }
  return loads;
}

// src/features/schedule-survey/utils/surveyAggregate.ts
function isDateKey(value) {
  if (typeof value !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return date.getFullYear() === Number(y) && date.getMonth() === Number(mo) - 1 && date.getDate() === Number(d);
}
function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  const byDate = /* @__PURE__ */ new Map();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw;
    if (!isDateKey(item.date)) continue;
    const activity = typeof item.activity === "string" ? item.activity.trim() : "";
    byDate.set(item.date, {
      date: item.date,
      available: item.available === true,
      ...activity ? { activity } : {}
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
var RESPONDENT_FALLBACK = "(이름 없음)";
function aggregateSurvey(survey, responses, order = "availability") {
  const candidates = new Set(
    (survey.candidate_dates ?? []).filter(isDateKey)
  );
  const tallies = /* @__PURE__ */ new Map();
  const ensure = (date) => {
    let tally = tallies.get(date);
    if (!tally) {
      tally = {
        date,
        isCandidate: candidates.has(date),
        availableNames: [],
        unavailableNames: [],
        activities: [],
        availableCount: 0,
        answeredCount: 0
      };
      tallies.set(date, tally);
    }
    return tally;
  };
  for (const date of candidates) ensure(date);
  const respondedIds = /* @__PURE__ */ new Set();
  for (const response of responses) {
    respondedIds.add(response.respondent_resource_id);
    const name = response.respondent_name?.trim() || RESPONDENT_FALLBACK;
    for (const item of normalizeItems(response.items)) {
      const tally = ensure(item.date);
      tally.answeredCount += 1;
      if (item.available) {
        tally.availableCount += 1;
        tally.availableNames.push(name);
      } else {
        tally.unavailableNames.push(name);
      }
      if (item.activity) {
        tally.activities.push({ name, activity: item.activity });
      }
    }
  }
  const targets = survey.target_resource_ids ?? [];
  const dates = [...tallies.values()].sort((a, b) => {
    if (order === "availability" && b.availableCount !== a.availableCount) {
      return b.availableCount - a.availableCount;
    }
    return a.date.localeCompare(b.date);
  });
  return {
    dates,
    respondedCount: targets.filter((id) => respondedIds.has(id)).length,
    targetCount: targets.length,
    pendingTargetIds: targets.filter((id) => !respondedIds.has(id))
  };
}
function suggestTitleForDate(tally) {
  const counts = /* @__PURE__ */ new Map();
  for (const { activity } of tally.activities) {
    const key = activity.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [activity, count] of counts) {
    if (count > bestCount) {
      best = activity;
      bestCount = count;
    }
  }
  return best;
}

// src/lib/mcpSchoolOps.ts
var DOW = ["", "월", "화", "수", "목", "금", "토", "일"];
var dayLabel = (date, dow) => {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}(${DOW[dow] ?? ""})`;
};
var isoDow2 = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  const js = new Date(y, m - 1, d).getDay();
  return js === 0 ? 7 : js;
};
var toEntry = (row) => ({
  id: row.id,
  period: row.period,
  weekday: row.weekday,
  subject: row.subject,
  section_name: row.section_name,
  teacher_name: row.teacher_name,
  grade: row.grade ?? void 0,
  class_number: row.class_number != null ? String(row.class_number) : void 0,
  resource_id: row.resource_id,
  section_id: row.section_id,
  weekday_time: row.weekday_time,
  type: "pattern",
  activity_type: row.activity_type ?? void 0
});
var ROSTER_LABEL = {
  same: "수강생 같음",
  compatible: "겹치는 학생 없음",
  unknown: "명단 미확인(학년-반 표기로만 판정)",
  conflict: "수강생이 달라 불가"
};
function burdenOut(b) {
  return { level: BURDEN_LEVEL_LABEL[b.level], delta: b.delta, lessons_after: b.totalAfter, ...b.reasons.length ? { reasons: b.reasons } : {} };
}
function swapCandidateReport(src, mode, limit = 15) {
  const all = src.entries.map(toEntry);
  const mine = all.find((e) => e.resource_id === src.me.resource_id && e.weekday === src.weekday && e.period === src.period);
  if (!mine) {
    return { found: false, note: `${DOW[src.weekday]}요일 ${src.period}교시에 내 수업이 없습니다(지금 학기 시간표 기준).` };
  }
  const excluded = new Set(src.excluded_ids);
  const slotsOf = /* @__PURE__ */ new Map();
  for (const e of all) {
    if (!e.resource_id) continue;
    const list = slotsOf.get(e.resource_id) ?? [];
    list.push({ weekday: e.weekday, period: e.period });
    slotsOf.set(e.resource_id, list);
  }
  const target = { weekday: mine.weekday, period: mine.period };
  const lesson = { subject: mine.subject, weekday: DOW[mine.weekday], period: mine.period, club: !isSwappableLesson(mine) };
  const out = { found: true, my_lesson: lesson };
  if (mode !== "substitute") {
    let fit = null;
    if (src.roster_fit) {
      fit = /* @__PURE__ */ new Map();
      for (const r of src.roster_fit) {
        fit.set(lessonKey(r.teacher_resource_id, r.day_of_week, r.period), {
          myCount: r.my_count,
          theirCount: r.their_count,
          sharedCount: r.shared_count,
          theirConflictCount: r.their_conflict_count,
          theirConflictNames: [],
          myConflictCount: r.my_conflict_count,
          myConflictNames: []
        });
      }
    }
    const candidates = findSwappableClasses(mine, all, fit).filter((c) => !excluded.has(c.entry.resource_id ?? ""));
    const available = candidates.filter((c) => c.canSwap).map((c) => ({
      c,
      weekday: c.entry.weekday,
      period: c.entry.period,
      burden: evaluateSwapBurden({
        teacherSlots: slotsOf.get(c.entry.resource_id ?? "") ?? [],
        add: target,
        remove: { weekday: c.entry.weekday, period: c.entry.period }
      })
    })).sort(compareBurden);
    out.swap = {
      roster_checked: !!src.roster_fit,
      available_count: available.length,
      available: available.slice(0, limit).map(({ c, burden }) => ({
        teacher: c.entry.teacher_name,
        subject: c.entry.subject,
        weekday: c.entry.weekday,
        day: DOW[c.entry.weekday],
        period: c.entry.period,
        students: ROSTER_LABEL[c.rosterStatus],
        partner_burden: burdenOut(burden)
      })),
      blocked_by_students: candidates.filter((c) => !c.canSwap && c.studentConflicts > 0).slice(0, limit).map((c) => ({
        teacher: c.entry.teacher_name,
        subject: c.entry.subject,
        day: DOW[c.entry.weekday],
        period: c.entry.period,
        reason: `맞바꾸면 그 시간에 다른 수업과 겹치는 학생 ${c.studentConflicts}명` + (c.rosterFit ? ` (같은 학생 ${c.rosterFit.sharedCount}명 / 내 수업 ${c.rosterFit.myCount}명 · 상대 ${c.rosterFit.theirCount}명)` : "")
      })),
      blocked_by_teacher_time: candidates.filter((c) => !c.canSwap && c.studentConflicts === 0).slice(0, limit).map((c) => ({
        teacher: c.entry.teacher_name,
        subject: c.entry.subject,
        day: DOW[c.entry.weekday],
        period: c.entry.period,
        reasons: getSwapConflictReason(mine, c.entry, all)
      })),
      ...lesson.club ? { note: "동아리활동은 교체할 수 없습니다 — 대체(substitute)로 다른 선생님께 맡길 수는 있습니다." } : {},
      ...src.roster_fit ? {} : { warning: "수강생 명단을 확인하지 못해 학년-반 표기로만 골랐습니다 — 표기가 같아도 학생이 다를 수 있습니다." }
    };
  }
  if (mode !== "swap") {
    const busy = new Set(all.filter((e) => e.weekday === mine.weekday && e.period === mine.period).map((e) => String(e.resource_id)));
    const eligible = src.teachers.filter((t) => t.id !== src.me.resource_id && !excluded.has(t.id));
    const free = eligible.filter((t) => !busy.has(t.id)).map((t) => ({ t, burden: evaluateSwapBurden({ teacherSlots: slotsOf.get(t.id) ?? [], add: target }) })).sort(compareBurden);
    out.substitute = {
      free_count: free.length,
      busy_count: eligible.filter((t) => busy.has(t.id)).length,
      free: free.slice(0, limit).map(({ t, burden }) => ({ teacher: t.name, burden: burdenOut(burden) })),
      note: "대체 = 그날 내 수업을 그 선생님이 대신 맡는다(같은 날·같은 교시). 수업이 하나도 없는 계정도 «비어 있음»으로 잡힌다."
    };
  }
  return out;
}
function mealDutyDraft(src, opts = {}) {
  const excluded = new Set(opts.exclude ?? []);
  const toggled = new Set(opts.toggle_skip ?? []);
  const monthKey = `${src.year}-${String(src.month).padStart(2, "0")}`;
  const nextMonthStart = toDateKey(new Date(src.year, src.month, 1));
  const people = src.candidates.map((c) => ({
    name: c.name,
    exclusion: mealDutyExclusion({
      name: c.name,
      type: c.type,
      status: c.status,
      tags: c.school_admin ? [...MEAL_DUTY_EXCLUDED_TAGS] : [],
      weeklyPeriods: c.weekly_periods,
      hasDutySeat: c.has_duty_seat
    })
  }));
  const known = new Set(people.map((p) => p.name));
  const pool = people.filter((p) => !p.exclusion && !excluded.has(p.name)).map((p) => p.name).sort((a, b) => a.localeCompare(b, "ko"));
  const busy = new Set(src.busy.map((b) => busyKey(b.name, b.dow)));
  const absences = /* @__PURE__ */ new Map();
  for (const a of src.absences) {
    const key = `${a.date}|${a.name}`;
    absences.set(key, [...absences.get(key) ?? [], { kind: a.kind, title: a.title }]);
  }
  const existing = new Map(src.history.filter((r) => r.date.startsWith(monthKey)).map((r) => [r.date, r.names]));
  const { days, closed } = listMealDutyDays(src.year, src.month, src.calendar);
  const isSkipped = (d) => !!d.defaultSkip !== toggled.has(d.date);
  const openDays = days.filter((d) => d.date >= src.today && !isSkipped(d) && !existing.has(d.date)).map((d) => ({ ...d, headcount: opts.headcounts?.[d.date] ?? d.headcount ?? MEAL_DUTY_PER_DAY }));
  const plan = planMealDuty({ days: openDays, pool, busy, lastAssigned: lastAssignedByName(src.history, nextMonthStart) });
  const ctx = { busy, absences };
  const unknownOverride = [];
  const finalPlan = plan.map((day) => {
    const o = opts.overrides?.[day.date];
    const n = day.headcount ?? MEAL_DUTY_PER_DAY;
    const slots = Array.from({ length: o ? Math.max(o.length, 1) : n }, (_, i) => o ? o[i] ?? null : day.assignees[i] ?? null);
    for (const s of slots) if (s && !known.has(s)) unknownOverride.push(s);
    const withSlots = { ...day, slots };
    return { ...withSlots, issues: slots.map((_, i) => slotIssues(withSlots, i, ctx)) };
  });
  const issueCount = { empty: 0, busy: 0, absent: 0, duplicate: 0 };
  for (const d of finalPlan) for (const list of d.issues) for (const i of list) issueCount[i.kind]++;
  return {
    month: monthKey,
    time: MEAL_DUTY_DEFAULT_TIME,
    pool_size: pool.length,
    pool,
    not_in_pool: people.filter((p) => p.exclusion).map((p) => ({ name: p.name, reason: MEAL_DUTY_EXCLUSION_LABEL[p.exclusion] })),
    excluded_by_request: [...excluded].filter((n) => known.has(n)),
    closed_days: closed.map((c) => ({ date: c.date, reason: c.reason })),
    already_made: [...existing].map(([date, names]) => ({ date, names })),
    skipped_days: days.filter((d) => d.date >= src.today && !existing.has(d.date) && isSkipped(d)).map((d) => ({ date: d.date, reason: d.defaultSkip ?? "쉬기로 함(toggle_skip)" })),
    days: finalPlan.map((d) => ({
      date: d.date,
      day: dayLabel(d.date, d.dow),
      ...d.notes.length ? { notes: d.notes } : {},
      names: d.slots,
      title: mealDutyTitle(d.slots.filter(Boolean)),
      ...d.issues.some((l) => l.length) ? { issues: d.issues.flatMap((l, i) => l.map((x) => `${i + 1}번째 칸: ${x.label}`)) } : {}
    })),
    issue_count: issueCount,
    ...unknownOverride.length ? { unknown_names: [...new Set(unknownOverride)] } : {},
    note: "초안이다 — 아직 아무것도 만들지 않았다. 규칙: 그 요일 3교시가 빈 교사만 · 지난 명단에서 이어지는 순환 · 하루 2명(수학여행·현장체험학습 1명) · 전 학년 시험일은 기본으로 쉼. 출장·연수(issues)는 시스템이 아는 것만이고 개인 사정은 모른다 — 사용자와 확인한 뒤 create_meal_duty_schedules 로 만든다."
  };
}
var SLOTS = ["morning", "evening", "saturday"];
function supervisionDraft(src, opts = {}) {
  const isSchool = src.grade === SCHOOL_GRADE;
  const config = isSchool ? schoolMorningConfig(src.rooms) : gradeSlotConfig(src.rooms, src.grade);
  const enabled = isSchool ? { morning: true, evening: false, saturday: false } : { morning: true, evening: true, saturday: true, ...opts.slots ?? {} };
  const morningMode = isSchool ? "separate" : opts.morning_mode ?? (src.school_morning_in_year ? "school" : "separate");
  const monthKey = `${src.year}-${String(src.month).padStart(2, "0")}`;
  const seed = `${monthKey}|${src.grade}`;
  const index = indexCalendar(expandScheduleRows(src.calendar_rows));
  const days = /* @__PURE__ */ new Map();
  const last = new Date(src.year, src.month, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const key = toDateKey(new Date(src.year, src.month - 1, d));
    days.set(key, classifySchoolDay(key, index.get(key) ?? [], null, isSchool ? null : src.grade));
  }
  const excluded = new Set(opts.exclude ?? []);
  const known = new Set(src.pool.map((p) => p.name));
  const pool = src.pool.map((p) => p.name).filter((n) => !excluded.has(n));
  const csat = findCsatDate(expandScheduleRows(src.csat_rows));
  const cutoff = opts.senior_cutoff === "off" ? null : opts.senior_cutoff ?? csat;
  const seniors = src.pool.filter((p) => p.grades.includes(3)).map((p) => p.name);
  const autoRules = isSchool && cutoff ? seniorExclusionRules(seniors, cutoff) : [];
  const stored = src.unavailability.map((r) => ({
    name: r.name,
    weekday: r.weekday,
    date: r.date,
    from: r.from,
    until: r.until,
    slots: r.slots.filter((s) => SLOTS.includes(s)),
    note: r.note
  }));
  const rules = [...autoRules, ...stored];
  const history = src.history.filter((r) => SLOTS.includes(r.slot)).map((r) => ({ date: r.date, slot: r.slot, names: r.names, withMorning: r.with_morning }));
  const existing = /* @__PURE__ */ new Map();
  for (const row of history) {
    if (!row.date.startsWith(monthKey)) continue;
    existing.set(cellKey(row), row.names);
    if (row.slot === "evening" && row.withMorning) existing.set(cellKey({ date: row.date, slot: "morning" }), row.names);
  }
  const schoolMorning = new Set(src.school_morning_dates);
  const absent = new Set(src.absences.map((a) => `${a.date}|${a.name}`));
  const absentTitles = /* @__PURE__ */ new Map();
  for (const a of src.absences) absentTitles.set(`${a.date}|${a.name}`, [...absentTitles.get(`${a.date}|${a.name}`) ?? [], a.title]);
  const skipped = new Set(opts.skip ?? []);
  const allCells = listSupervisionCells({ days, config, enabled, morningMode, from: src.today }).filter((c) => isSchool || c.slot !== "morning" || !schoolMorning.has(c.date));
  const openCells = allCells.filter((c) => !existing.has(cellKey(c)) && !skipped.has(cellKey(c)));
  const draft = planSupervision({ cells: openCells, pool, history, absent, unavailable: rules, seed });
  const unknownOverride = [];
  const plan = draft.map((c) => {
    const key = cellKey(c);
    if (opts.overrides && key in opts.overrides) {
      const name = opts.overrides[key];
      if (name && !known.has(name)) unknownOverride.push(name);
      return { ...c, assignee: name };
    }
    return c;
  });
  const issues = plan.map((_, i) => cellIssues(plan, i, absent, rules));
  const loads = loadsWithPlan(pool, history, plan);
  return {
    grade: src.grade,
    grade_label: gradeLabel(src.grade),
    month: monthKey,
    academic_year: src.academic_year,
    morning_mode: morningMode,
    slots: SLOTS.filter((s) => config.available[s]).map((s) => ({
      slot: s,
      label: SLOT_LABEL[s],
      on: enabled[s],
      time: config.times[s],
      rooms: config.rooms[s]
    })),
    ...isSchool ? { senior_cutoff: cutoff, csat_date: csat } : {},
    pool,
    already_made: [...existing].map(([key, names]) => ({ cell: key, names })),
    cells: plan.map((c, i) => ({
      cell: cellKey(c),
      date: c.date,
      day: dayLabel(c.date, c.dow),
      slot: c.slot,
      label: c.slot === "evening" && c.withMorning ? "아침·저녁" : SLOT_LABEL[c.slot],
      ...c.withMorning ? { with_morning: true } : {},
      name: c.assignee,
      ...c.notes.length ? { notes: c.notes } : {},
      ...issues[i].length ? {
        issues: issues[i].map((x) => x === "absent" && c.assignee ? `${CELL_ISSUE_LABEL[x]} · ${(absentTitles.get(`${c.date}|${c.assignee}`) ?? []).join(", ")}` : x === "unavailable" && c.assignee ? `${CELL_ISSUE_LABEL[x]} · ${unavailabilityReason(rules, c.assignee, c) ?? ""}` : CELL_ISSUE_LABEL[x])
      } : {},
      title: c.assignee ? supervisionTitle(src.grade, c.slot, c.assignee, !!c.withMorning) : null
    })),
    loads: pool.map((name) => {
      const l = loads.get(name);
      return { name, total: l?.total ?? 0, morning: l?.bySlot.morning ?? 0, evening: l?.bySlot.evening ?? 0, saturday: l?.bySlot.saturday ?? 0 };
    }),
    ...unknownOverride.length ? { unknown_names: [...new Set(unknownOverride)] } : {},
    note: "초안이다 — 아직 아무것도 만들지 않았다. 학년도 누적 횟수(시간대별) 균등 + 요일 분산, 같은 날 두 칸 금지, 출장·연수·못 하는 날은 피한다. 빈칸(name=null)은 후보가 없는 칸이다. 사용자와 확인한 뒤 create_supervision_schedules 로 만든다(cells 의 cell·name 을 그대로 넘긴다)."
  };
}
function supervisionCreatePayload(src, opts, picks) {
  const isSchool = src.grade === SCHOOL_GRADE;
  const config = isSchool ? schoolMorningConfig(src.rooms) : gradeSlotConfig(src.rooms, src.grade);
  const draft = supervisionDraft(src, opts);
  const byCell = new Map(draft.cells.map((c) => [c.cell, c]));
  const missing = [];
  const rows = picks.map((p) => {
    const cell = byCell.get(p.cell);
    if (!cell) {
      missing.push(p.cell);
      return null;
    }
    const slot = cell.slot;
    const rooms = config.rooms[slot];
    const range = config.times[slot];
    return {
      date: cell.date,
      slot,
      with_morning: !!cell.with_morning,
      name: p.name,
      start: range.start,
      end: range.end,
      description: [
        rooms.length > 0 ? `열람실: ${rooms.join(", ")}` : null,
        cell.with_morning ? `아침 자습도 함께 감독합니다(${config.times.morning.start}~${config.times.morning.end}).` : null,
        "교체는 스케줄 › 부가 기능 › 자습 감독 배정 › 내 감독·교체에서 신청할 수 있습니다."
      ].filter(Boolean).join("\n")
    };
  });
  return { rows: rows.filter(Boolean), missing };
}
function academicYearOfMonth(year, month) {
  return month >= 3 ? year : year - 1;
}
function surveyResult(src, order = "availability") {
  const agg = aggregateSurvey(src.survey, src.responses, order);
  return {
    survey_id: src.survey.id,
    title: src.survey.title,
    status: src.survey.status,
    order: order === "availability" ? "가능 인원 많은 순" : "날짜순",
    responded: `${agg.respondedCount}/${agg.targetCount}`,
    pending: agg.pendingTargetIds.map((id) => src.target_names[id] ?? "(이름 없음)"),
    dates: agg.dates.map((t) => ({
      date: t.date,
      day: dayLabel(t.date, isoDow2(t.date)),
      candidate: t.isCandidate,
      available: t.availableCount,
      available_names: t.availableNames,
      unavailable_names: t.unavailableNames,
      ...t.activities.length ? { activities: t.activities } : {},
      ...suggestTitleForDate(t) ? { suggested_title: suggestTitleForDate(t) } : {}
    })),
    comments: src.responses.filter((r) => r.comment?.trim()).map((r) => ({ name: r.respondent_name, comment: r.comment }))
  };
}
export {
  academicYearOfMonth,
  mealDutyDraft,
  supervisionCreatePayload,
  supervisionDraft,
  surveyResult,
  swapCandidateReport
};
