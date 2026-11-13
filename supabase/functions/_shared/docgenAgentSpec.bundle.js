// 자동 생성 파일 — 고치지 말 것. 원본 = src/features/document-generation/mcp/ (+ 웹 문서 엔진)
// 다시 만들기: npx tsx scripts/mcp-docgen/build-bundle.mts
// src/features/task-workflow/document/spec/hwpxIndex.ts
var TAG_RE = /<(\/?)(hp:tbl|hp:tr|hp:tc|hp:p|hp:run|hp:t|hp:cellAddr|hp:cellSpan|hp:fieldBegin|hp:fieldEnd)(?![\w.:-])((?:"[^"]*"|[^>])*?)(\/?)>/g;
function decodeEntities(s) {
  return s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function attr(attrs, name) {
  const m = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : "";
}
function parseHwpxSection(xml) {
  const tables = [];
  const topParagraphs = [];
  const allParagraphs = [];
  const fields = [];
  const orphanRows = [];
  const tblStack = [];
  const rowStack = [];
  const cellStack = [];
  const paraStack = [];
  const runStack = [];
  let tableCounter = 0;
  let openField = null;
  TAG_RE.lastIndex = 0;
  let m;
  while (m = TAG_RE.exec(xml)) {
    const [full, close, tag, attrs, self] = m;
    const at = m.index;
    const after = at + full.length;
    if (tag === "hp:t") {
      if (close) continue;
      const run = runStack[runStack.length - 1];
      if (self) {
        if (run) run.tParts.push({ start: after, end: after, text: "" });
        continue;
      }
      const closeIdx = xml.indexOf("</hp:t>", after);
      if (closeIdx < 0) continue;
      const inner = xml.slice(after, closeIdx);
      const decoded = decodeEntities(inner);
      if (run) {
        run.tParts.push({ start: after, end: closeIdx, text: decoded });
        run.text += decoded;
      }
      if (openField) openField.texts.push(decoded);
      TAG_RE.lastIndex = closeIdx + "</hp:t>".length;
      continue;
    }
    if (tag === "hp:fieldBegin" && !close) {
      openField = { start: at, type: attr(attrs, "type"), fieldId: attr(attrs, "fieldid"), texts: [] };
      continue;
    }
    if (tag === "hp:fieldEnd" && openField) {
      fields.push({
        start: openField.start,
        type: openField.type,
        fieldId: attr(attrs, "beginIDRef") ? openField.fieldId : openField.fieldId,
        innerText: openField.texts.join("")
      });
      openField = null;
      continue;
    }
    if (tag === "hp:cellAddr" && cellStack.length) {
      const c = cellStack[cellStack.length - 1];
      c.addr = { row: Number(attr(attrs, "rowAddr")), col: Number(attr(attrs, "colAddr")) };
      continue;
    }
    if (tag === "hp:cellSpan" && cellStack.length) {
      const c = cellStack[cellStack.length - 1];
      c.span = { rows: Number(attr(attrs, "rowSpan")), cols: Number(attr(attrs, "colSpan")) };
      continue;
    }
    if (tag === "hp:tbl") {
      if (!close) {
        const t = {
          start: at,
          end: -1,
          index: tableCounter++,
          id: attr(attrs, "id"),
          rowCnt: Number(attr(attrs, "rowCnt") || 0),
          colCnt: Number(attr(attrs, "colCnt") || 0),
          rows: [],
          headerFingerprint: ""
        };
        tblStack.push(t);
        tables.push(t);
        if (cellStack.length) cellStack[cellStack.length - 1].tables.push(t);
      } else {
        const t = tblStack.pop();
        if (t) {
          t.end = after;
          t.headerFingerprint = t.rows[0] ? t.rows[0].cells.map((c) => c.text).join("|") : "";
        }
      }
      continue;
    }
    if (tag === "hp:tr") {
      if (!close) rowStack.push({ start: at, end: -1, cells: [] });
      else {
        const r = rowStack.pop();
        if (r) {
          r.end = after;
          const t = tblStack[tblStack.length - 1];
          if (t) t.rows.push(r);
          else orphanRows.push(r);
        }
      }
      continue;
    }
    if (tag === "hp:tc") {
      if (!close) {
        cellStack.push({ start: at, end: -1, addr: { row: -1, col: -1 }, span: { rows: 1, cols: 1 }, paragraphs: [], tables: [], text: "" });
      } else {
        const c = cellStack.pop();
        if (c) {
          c.end = after;
          c.text = c.paragraphs.map((p) => p.text).join("\n");
          const r = rowStack[rowStack.length - 1];
          if (r) r.cells.push(c);
        }
      }
      continue;
    }
    if (tag === "hp:p") {
      const commit = (p) => {
        p.text = p.runs.map((r) => r.text).join("");
        allParagraphs.push(p);
        if (cellStack.length) cellStack[cellStack.length - 1].paragraphs.push(p);
        else if (!tblStack.length) topParagraphs.push(p);
      };
      if (!close) {
        if (self) commit({ start: at, end: after, runs: [], text: "" });
        else paraStack.push({ start: at, end: -1, runs: [], text: "" });
      } else {
        const p = paraStack.pop();
        if (p) {
          p.end = after;
          commit(p);
        }
      }
      continue;
    }
    if (tag === "hp:run") {
      if (!close) {
        const r = { start: at, end: -1, charPr: attr(attrs, "charPrIDRef"), selfClosing: !!self, tParts: [], closeTagStart: null, text: "" };
        if (self) {
          r.end = after;
          const p = paraStack[paraStack.length - 1];
          if (p) p.runs.push(r);
        } else runStack.push(r);
      } else {
        const r = runStack.pop();
        if (r) {
          r.closeTagStart = at;
          r.end = after;
          const p = paraStack[paraStack.length - 1];
          if (p) p.runs.push(r);
        }
      }
      continue;
    }
  }
  allParagraphs.sort((a, b) => a.start - b.start);
  const fullText = allParagraphs.map((p) => p.text).join("\n");
  return { xml, tables, topParagraphs, allParagraphs, fields, fullText, orphanRows };
}
function applyEdits(xml, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].end > sorted[i - 1].start) throw new Error(`overlapping edits at ${sorted[i].start}`);
  }
  let out = xml;
  for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}
function encodeRunText(text) {
  return escapeXml(text).replace(/\r?\n/g, "<hp:lineBreak/>");
}
function editsSetRunText(run, text) {
  const esc = encodeRunText(text);
  if (run.tParts.length) {
    const out = [{ start: run.tParts[0].start, end: run.tParts[0].end, text: esc }];
    for (let i = 1; i < run.tParts.length; i++) {
      const p = run.tParts[i];
      if (p.end > p.start) out.push({ start: p.start, end: p.end, text: "" });
    }
    return out;
  }
  if (run.selfClosing) {
    return [{ start: run.end - 2, end: run.end, text: `><hp:t>${esc}</hp:t></hp:run>` }];
  }
  const at = run.closeTagStart ?? run.end;
  return [{ start: at, end: at, text: `<hp:t>${esc}</hp:t>` }];
}
function editsClearLineSeg(xml, para) {
  const seg = xml.slice(para.start, para.end);
  const closeIdx = seg.lastIndexOf("</hp:p>");
  const scope = closeIdx >= 0 ? seg.slice(0, closeIdx) : seg;
  const openIdx = scope.lastIndexOf("<hp:linesegarray>");
  if (openIdx < 0) return [];
  const closeTag = scope.indexOf("</hp:linesegarray>", openIdx);
  if (closeTag < 0) return [];
  const end = closeTag + "</hp:linesegarray>".length;
  return [{ start: para.start + openIdx, end: para.start + end, text: "" }];
}
function editsSetCellText(cell, text) {
  const edits = [];
  let placed = false;
  for (const p of cell.paragraphs) {
    for (const r of p.runs) {
      if (!placed) {
        edits.push(...editsSetRunText(r, text));
        placed = true;
      } else {
        for (const tp of r.tParts) {
          if (tp.end > tp.start) edits.push({ start: tp.start, end: tp.end, text: "" });
        }
      }
    }
  }
  if (!placed && cell.paragraphs.length) {
    throw new Error("cell has no run to write into");
  }
  return edits;
}
function editsSetCellSingleValue(xml, cell, text) {
  const target = cell.paragraphs.find((p) => p.runs.length > 0);
  if (!target) throw new Error("cell has no run to write into");
  if (cell.tables.length > 0) return editsSetCellText(cell, text);
  const edits = [...editsSetRunText(target.runs[0], text)];
  for (let r = 1; r < target.runs.length; r++) {
    for (const tp of target.runs[r].tParts) {
      if (tp.end > tp.start) edits.push({ start: tp.start, end: tp.end, text: "" });
    }
  }
  for (const p of cell.paragraphs) {
    if (p !== target) edits.push({ start: p.start, end: p.end, text: "" });
  }
  edits.push(...editsClearLineSeg(xml, target));
  return edits;
}
function findInParagraphs(xml, paras, needle, occurrence = 1) {
  const segs = [];
  for (const p of paras) {
    for (const r of p.runs) {
      for (const tp of r.tParts) {
        if (tp.text) segs.push({ runT: { start: tp.start, end: tp.end }, text: tp.text });
      }
    }
  }
  const joined = segs.map((s) => s.text).join("");
  let from = 0;
  let idx = -1;
  for (let n = 0; n < occurrence; n++) {
    idx = joined.indexOf(needle, from);
    if (idx < 0) return null;
    from = idx + 1;
  }
  const hits = { segments: [], runIdxs: [] };
  let cursor = 0;
  let remainStart = idx;
  let remainLen = needle.length;
  for (let si = 0; si < segs.length && remainLen > 0; si++) {
    const s = segs[si];
    const segLen = s.text.length;
    if (cursor + segLen <= remainStart) {
      cursor += segLen;
      continue;
    }
    const localStart = Math.max(0, remainStart - cursor);
    const take = Math.min(segLen - localStart, remainLen);
    const rawInner = xml.slice(s.runT.start, s.runT.end);
    const decTarget = s.text.slice(localStart, localStart + take);
    const rawTarget = escapeXml(decTarget);
    let priorCount = 0;
    for (let k = s.text.indexOf(decTarget); k >= 0 && k < localStart; k = s.text.indexOf(decTarget, k + 1)) priorCount++;
    let rawIdx = -1;
    for (let k = 0, from2 = 0; k <= priorCount; k++) {
      rawIdx = rawInner.indexOf(rawTarget, from2);
      if (rawIdx < 0) break;
      from2 = rawIdx + 1;
    }
    if (rawIdx < 0) return null;
    hits.segments.push({ start: s.runT.start + rawIdx, end: s.runT.start + rawIdx + rawTarget.length });
    hits.runIdxs.push(si);
    remainStart += take;
    remainLen -= take;
    cursor += segLen;
  }
  return remainLen === 0 ? hits : null;
}
function renumberRowXml(rowXml, newRow) {
  const cells = parseHwpxSection(rowXml).orphanRows[0]?.cells ?? [];
  return applyEdits(rowXml, cells.map((cell) => editCellAttribute(rowXml, cell, "cellAddr", "rowAddr", newRow)));
}
function editCellAttribute(xml, cell, tag, attribute, value) {
  const re = new RegExp(`<hp:${tag}\\b[^>]*\\b${attribute}="(\\d+)"`, "g");
  re.lastIndex = cell.start;
  let match;
  while ((match = re.exec(xml)) && match.index < cell.end) {
    if (cell.tables.some((table) => table.start <= match.index && match.index < table.end)) continue;
    const start = match.index + match[0].lastIndexOf('"') - match[1].length;
    return { start, end: start + match[1].length, text: String(value) };
  }
  throw new Error(`셀 속성 누락: ${tag}.${attribute}`);
}
function editSetRowCnt(xml, table, rowCnt) {
  const openEnd = xml.indexOf(">", table.start);
  const openTag = xml.slice(table.start, openEnd);
  const m = /rowCnt="(\d+)"/.exec(openTag);
  if (!m) return null;
  const at = table.start + m.index;
  return { start: at, end: at + m[0].length, text: `rowCnt="${rowCnt}"` };
}

// src/features/task-workflow/document/spec/locator.ts
var FP_LEN = 48;
function fp(s) {
  return s.replace(/\s+/g, " ").trim().slice(0, FP_LEN);
}
function fingerprintMatches(expected, actual) {
  if (!expected) return true;
  return fp(actual).startsWith(fp(expected)) || fp(expected).startsWith(fp(actual));
}
function findTable(indexes, loc) {
  const wantIdx = loc.table?.index;
  const wantFp = loc.table?.fingerprint;
  const sections = loc.section != null ? [loc.section] : indexes.map((_, i) => i);
  if (wantIdx != null) {
    let counter = 0;
    for (const si of sections) {
      for (const t of indexes[si].tables) {
        if (counter === wantIdx) {
          if (fingerprintMatches(wantFp, t.headerFingerprint)) return { table: t, section: si };
          counter++;
          continue;
        }
        counter++;
      }
    }
  }
  if (wantFp) {
    for (const si of sections) {
      for (const t of indexes[si].tables) {
        if (fingerprintMatches(wantFp, t.headerFingerprint)) return { table: t, section: si };
      }
    }
  }
  return null;
}
function cellByPath(table, path) {
  let cur = table;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const cell = cur.rows.flatMap((r) => r.cells).find((c) => c.addr.row === a.row && c.addr.col === a.col);
    if (!cell) return null;
    if (i === path.length - 1) return cell;
    if (!cell.tables.length) return null;
    cur = cell.tables[0];
  }
  return null;
}
function resolveLocator(indexes, loc) {
  const sections = loc.section != null ? [loc.section] : indexes.map((_, i) => i);
  if (loc.kind === "clickhere") {
    for (const si of sections) {
      const f = indexes[si].fields.find((f2) => f2.type === "CLICK_HERE" && (!loc.fieldId || f2.fieldId === loc.fieldId));
      if (f) {
        return { kind: "text", section: si, paras: indexes[si].allParagraphs, anchor: f.innerText, occurrence: 1, position: "replace" };
      }
    }
    return { kind: "stale", reason: `clickhere field not found (${loc.fieldId ?? "any"})` };
  }
  if (loc.kind === "text") {
    if (!loc.anchor) return { kind: "stale", reason: "text locator without anchor" };
    for (const si of sections) {
      if (indexes[si].fullText.includes(loc.anchor)) {
        if (loc.endAnchor && !indexes[si].fullText.includes(loc.endAnchor)) {
          return { kind: "stale", reason: `end anchor not found: ${loc.endAnchor.slice(0, 30)}` };
        }
        return {
          kind: "text",
          section: si,
          paras: indexes[si].allParagraphs,
          anchor: loc.anchor,
          occurrence: loc.occurrence ?? 1,
          position: loc.position ?? "replace",
          endAnchor: loc.endAnchor
        };
      }
    }
    return { kind: "stale", reason: `text anchor not found: ${loc.anchor.slice(0, 30)}` };
  }
  const found = findTable(indexes, loc);
  if (!found) return { kind: "stale", reason: `table not found (index=${loc.table?.index}, fp=${loc.table?.fingerprint?.slice(0, 20)})` };
  const { table, section } = found;
  if (loc.kind === "cell") {
    const path = loc.cellPath ?? (loc.addr ? [loc.addr] : null);
    if (!path) return { kind: "stale", reason: "cell locator without addr/cellPath" };
    let cell = cellByPath(table, path);
    if (cell && !fingerprintMatches(loc.fingerprint, cell.text)) cell = null;
    if (!cell && loc.fingerprint) {
      cell = table.rows.flatMap((r) => r.cells).find((c) => fingerprintMatches(loc.fingerprint, c.text)) ?? null;
    }
    if (!cell) return { kind: "stale", reason: `cell not resolved (fp=${loc.fingerprint?.slice(0, 20) ?? "none"})` };
    return { kind: "cell", section, cell, table };
  }
  if (loc.kind === "table") return { kind: "table", section, table };
  if (loc.kind === "rowGroup" || loc.kind === "cellRange") {
    if (!loc.rows) return { kind: "stale", reason: `${loc.kind} without rows` };
    const [a, b] = loc.rows;
    if (a < 0 || b >= table.rows.length || a > b) {
      return { kind: "stale", reason: `row range [${a},${b}] out of table rows ${table.rows.length}` };
    }
    return { kind: "rows", section, table, dataRows: [a, b], keepRows: loc.keepRows ?? [] };
  }
  return { kind: "stale", reason: `unknown locator kind` };
}
function resolvedRegionText(res, indexes) {
  if (res.kind === "cell") return res.cell.text;
  if (res.kind === "table") {
    return res.table.rows.map((r) => r.cells.map((c) => c.text).join("|")).join("\n");
  }
  if (res.kind === "rows") {
    return res.table.rows.slice(res.dataRows[0], res.dataRows[1] + 1).map((r) => r.cells.map((c) => c.text).join("|")).join("\n");
  }
  if (res.kind === "text") {
    const i = indexes[res.section].fullText.indexOf(res.anchor);
    return i >= 0 ? indexes[res.section].fullText.slice(i, i + 200) : "";
  }
  return "";
}

// src/features/task-workflow/document/spec/types.ts
function isPersonKind(kind) {
  return kind === "personTeacher" || kind === "personStudent";
}
function personRoleOf(kind) {
  return kind === "personTeacher" ? "teacher" : "student";
}
var PERSON_NAME_SEPARATOR = ", ";
function splitPersonNames(value) {
  if (typeof value !== "string") return [];
  return value.split(/[,·、]/).map((s) => s.trim()).filter(Boolean);
}
function joinPersonNames(names, separator = PERSON_NAME_SEPARATOR) {
  return names.join(separator);
}

// src/features/task-workflow/document/spec/tableRows.ts
function cellHeight(xml, cell) {
  const own = applyEdits(xml.slice(cell.start, cell.end), cell.tables.filter((t) => !cell.tables.some((parent) => parent !== t && parent.start < t.start && t.end < parent.end)).map((t) => ({ start: t.start - cell.start, end: t.end - cell.start, text: "" })));
  const match = /<hp:cellSz\b[^>]*\bheight="(\d+)"/.exec(own);
  return match ? Number(match[1]) : void 0;
}
function validateTableGrid(table) {
  if (!Number.isInteger(table.colCnt) || table.colCnt < 1 || table.rowCnt !== table.rows.length) {
    throw new Error("표의 행·열 개수가 실제 구조와 일치하지 않습니다.");
  }
  const occupied = /* @__PURE__ */ new Set();
  table.rows.forEach((row, index) => row.cells.forEach((cell) => {
    const { row: r, col: c } = cell.addr;
    const { rows, cols } = cell.span;
    if (![r, c, rows, cols].every(Number.isInteger) || r !== index || c < 0 || rows < 1 || cols < 1 || r + rows > table.rowCnt || c + cols > table.colCnt) {
      throw new Error(`표 셀 주소 또는 병합 범위 오류: (${r}, ${c})`);
    }
    for (let y = r; y < r + rows; y++) for (let x = c; x < c + cols; x++) {
      const key = `${y},${x}`;
      if (occupied.has(key)) throw new Error(`표의 병합 셀이 겹칩니다: (${y}, ${x})`);
      occupied.add(key);
    }
  }));
  if (occupied.size !== table.rowCnt * table.colCnt) throw new Error("표에 셀이 덮지 않는 빈 영역이 있습니다.");
}
function replaceTableRows(xml, table, range, keepRows, templateOffset, count, writableColumns, fill, repeatUnit = "block", selectedRange) {
  validateTableGrid(table);
  const [a, b] = range;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b >= table.rows.length || a > b) {
    throw new Error("기존 예시 대체 구간이 표 범위를 벗어났습니다.");
  }
  const kept = [...new Set(keepRows)].filter((r) => r >= a && r <= b).sort((x, y) => x - y);
  const templateRange = selectedRange ?? range;
  if (templateRange[0] < a || templateRange[1] > b || templateRange[0] > templateRange[1]) {
    throw new Error("반복 원본은 기존 예시 대체 구간 안에 있어야 합니다.");
  }
  const template = templateRange[0] + templateOffset;
  if (!Number.isInteger(template) || template < a || template > b || kept.includes(template)) {
    throw new Error("반복 원본 행은 보존 행을 제외한 반복 구간 안에 있어야 합니다.");
  }
  const dataOrigins = table.rows.map((_, i) => i).filter((i) => i >= a && i <= b && !kept.includes(i));
  const templateOrigins = dataOrigins.filter((i) => i >= templateRange[0] && i <= templateRange[1]);
  const inputCount = count;
  const blockSize = repeatUnit === "row" || kept.length ? 1 : templateOrigins.length;
  count = Math.ceil(count / blockSize) * blockSize;
  const fixedShape = count === dataOrigins.length && kept.length === 0 && templateOrigins.length === dataOrigins.length;
  const shared = [];
  const grouped = [];
  for (const cell of table.rows.flatMap((r) => r.cells)) {
    const start = cell.addr.row;
    const end = start + cell.span.rows - 1;
    if (cell.span.rows === 1 || end < a || start > b) continue;
    if (start <= a && end >= b && (start < templateRange[0] || end > templateRange[1] || kept.length > 0)) {
      shared.push(cell);
    } else {
      if (!fixedShape && (start < a || end > b)) {
        throw new Error("반복 구간이 병합 영역의 일부만 포함합니다. 병합 영역 전체를 지정해 주세요.");
      }
      if (!fixedShape && kept.some((r) => start <= r && r <= end)) {
        throw new Error("병합 묶음 안의 일부 행을 보존 행으로 이동할 수 없습니다.");
      }
      grouped.push(cell);
    }
  }
  const usePattern = blockSize > 1 || grouped.length > 0;
  const origins = [
    ...table.rows.slice(0, a).map((_, i) => i),
    ...Array.from({ length: count }, (_, i) => fixedShape ? dataOrigins[i] : usePattern ? templateOrigins[i % templateOrigins.length] : template),
    ...kept,
    ...table.rows.slice(b + 1).map((_, i) => b + 1 + i)
  ];
  const heights = table.rows.map((r) => {
    const values = r.cells.filter((c) => c.span.rows === 1).map((c) => cellHeight(xml, c));
    return values.length && values.every((h) => h !== void 0) ? Math.max(...values) : void 0;
  });
  const oldHeights = dataOrigins.map((r) => heights[r]);
  const newHeights = origins.slice(a, a + count).map((r) => heights[r]);
  const heightDelta = [...oldHeights, ...newHeights].every((h) => h !== void 0) ? newHeights.reduce((s, h) => s + h, 0) - oldHeights.reduce((s, h) => s + h, 0) : void 0;
  const sharedCells = /* @__PURE__ */ new Set([...shared, ...grouped]);
  const projections = [];
  for (const cell of sharedCells) {
    const isShared = shared.includes(cell);
    let covered = [];
    for (let dest = 0; dest < origins.length; dest++) {
      const source = origins[dest];
      const generated = dest >= a && dest < a + count;
      const owns = isShared && generated || source >= cell.addr.row && source < cell.addr.row + cell.span.rows;
      const previous = covered[covered.length - 1];
      if (covered.length && (!owns || !isShared && source !== origins[previous] + 1)) {
        projections.push({ cell, covered });
        covered = [];
      }
      if (owns) covered.push(dest);
    }
    if (covered.length) projections.push({ cell, covered });
  }
  const output = origins.map((origin, destination) => {
    const row = table.rows[origin];
    const localEdits = row.cells.filter((cell) => sharedCells.has(cell)).map((cell) => ({
      start: cell.start - row.start,
      end: cell.end - row.start,
      text: ""
    }));
    let fragment = applyEdits(xml.slice(row.start, row.end), localEdits);
    if (destination >= a && destination < a + count) fragment = fill(fragment, destination - a);
    const insertions = [];
    for (const { cell, covered } of projections) {
      if (covered[0] !== destination) continue;
      const cellXml = xml.slice(cell.start, cell.end);
      const relative = {
        ...cell,
        start: 0,
        end: cellXml.length,
        tables: cell.tables.map((t) => ({ ...t, start: t.start - cell.start, end: t.end - cell.start }))
      };
      const metadataEdits = [
        editCellAttribute(cellXml, relative, "cellSpan", "rowSpan", covered.length)
      ];
      const height = cellHeight(xml, cell);
      const oldCellHeights = heights.slice(cell.addr.row, cell.addr.row + cell.span.rows);
      const newCellHeights = covered.map((dest) => heights[origins[dest]]);
      if (height !== void 0 && [...oldCellHeights, ...newCellHeights].every((h) => h !== void 0)) {
        const delta = newCellHeights.reduce((sum, h) => sum + h, 0) - oldCellHeights.reduce((sum, h) => sum + h, 0);
        if (delta) metadataEdits.push(editCellAttribute(cellXml, relative, "cellSz", "height", Math.max(1, height + delta)));
      }
      let rebuiltCell = applyEdits(cellXml, metadataEdits);
      const dataIndexes = covered.filter((dest) => dest >= a && dest < a + inputCount).map((dest) => dest - a);
      if (covered.some((dest) => dest >= a && dest < a + count) && writableColumns.includes(cell.addr.col)) {
        const filled = fill(`<hp:tr>${rebuiltCell}</hp:tr>`, dataIndexes[0] ?? inputCount, dataIndexes);
        const filledCell = parseHwpxSection(filled).orphanRows[0]?.cells[0];
        if (!filledCell) throw new Error("병합 셀의 생성 내용을 해석하지 못했습니다.");
        rebuiltCell = filled.slice(filledCell.start, filledCell.end);
      }
      insertions.push({ col: cell.addr.col, xml: rebuiltCell });
    }
    for (const insertion of insertions.sort((x, y) => y.col - x.col)) {
      const cells = parseHwpxSection(fragment).orphanRows[0]?.cells ?? [];
      const at = cells.find((c) => c.addr.col > insertion.col)?.start ?? fragment.lastIndexOf("</hp:tr>");
      fragment = fragment.slice(0, at) + insertion.xml + fragment.slice(at);
    }
    return renumberRowXml(fragment, destination);
  });
  const edits = [{ start: table.rows[0].start, end: table.rows[table.rows.length - 1].end, text: output.join("") }];
  const countEdit = editSetRowCnt(xml, table, output.length);
  if (countEdit) edits.push(countEdit);
  const prefix = xml.slice(table.start, table.rows[0].start);
  const size = /<hp:sz\b[^>]*\bheight="(\d+)"/.exec(prefix);
  if (size && heightDelta !== void 0 && heightDelta !== 0) {
    const start = table.start + size.index + size[0].lastIndexOf('"') - size[1].length;
    edits.push({ start, end: start + size[1].length, text: String(Math.max(1, Number(size[1]) + heightDelta)) });
  }
  const zones = /<hp:cellZone\b[^>]*>/g;
  let zone;
  while (zone = zones.exec(prefix)) {
    const startMatch = /\bstartRowAddr="(\d+)"/.exec(zone[0]);
    const endMatch = /\bendRowAddr="(\d+)"/.exec(zone[0]);
    if (!startMatch || !endMatch) continue;
    const startRow = Number(startMatch[1]);
    const endRow = Number(endMatch[1]);
    if (!fixedShape && startRow <= b && endRow >= a && (startRow > a || endRow < b)) {
      throw new Error("반복 구간이 셀 영역 서식의 일부에 걸쳐 있습니다. 영역 전체를 지정해 주세요.");
    }
    const covered = origins.flatMap((source, dest) => source >= startRow && source <= endRow ? [dest] : []);
    if (!covered.length) throw new Error("셀 영역 서식 전체를 삭제하는 반복 변경은 지원하지 않습니다.");
    for (const [match, value] of [[startMatch, covered[0]], [endMatch, covered[covered.length - 1]]]) {
      const start = table.start + zone.index + match.index;
      edits.push({ start, end: start + match[0].length, text: match[0].replace(/"\d+"/, `"${value}"`) });
    }
  }
  const result2 = applyEdits(xml, edits);
  const updated = parseHwpxSection(result2).tables.find((t) => t.start === table.start);
  if (!updated) throw new Error("변경된 표를 해석하지 못했습니다.");
  validateTableGrid(updated);
  return result2;
}

// src/features/task-workflow/document/spec/repeatRegion.ts
function repeatReplacementRange(xml, table, selected, columns) {
  const [first, last] = selected;
  if (first !== last) return selected;
  const cells = table.rows.flatMap((r) => r.cells);
  const owners = (r) => cells.filter((c) => c.addr.row <= r && r < c.addr.row + c.span.rows);
  const containers = owners(first).filter((c) => c.span.rows > 1);
  const low = Math.max(0, ...containers.map((c) => c.addr.row));
  const high = Math.min(table.rows.length - 1, ...containers.map((c) => c.addr.row + c.span.rows - 1));
  const shape = (r) => owners(r).map(
    (c) => `${c.addr.col}:${c.span.cols}:${c.span.rows > 1 ? `${c.start}` : "cell"}`
  ).sort().join("|");
  const signature = shape(first);
  const isBoundary = (r) => table.rows[r].cells.some((c) => {
    const open = xml.slice(c.start, xml.indexOf(">", c.start) + 1);
    return /\bheader="1"/.test(open) || /^(합계|총계|소계|총액|계)(?:\s|[:：]|$)/.test(c.text.trim());
  }) || r === 0 && table.rows[r].cells.some((c) => /^(월|주|차시|활동|내용|시기|순|순번|연번|번호|일시|기간|구분|비고|항목|품목|단원|수량|금액)$/.test(c.text.trim()));
  const compatible = (r) => !isBoundary(r) && shape(r) === signature && columns.every((col) => owners(r).some((c) => c.addr.col <= col && col < c.addr.col + c.span.cols));
  let a = first;
  let b = last;
  while (a > low && compatible(a - 1)) a--;
  while (b < high && compatible(b + 1)) b++;
  return [a, b];
}

// src/features/task-workflow/document/spec/formula.ts
function tokenize(src) {
  const toks = [];
  let i = 0;
  const ops = ["==", "!=", "<=", ">=", "+", "-", "*", "/", "<", ">"];
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "(") {
      toks.push({ t: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      toks.push({ t: "rp" });
      i++;
      continue;
    }
    if (c === ",") {
      toks.push({ t: "comma" });
      i++;
      continue;
    }
    const op = ops.find((o) => src.startsWith(o, i));
    if (op) {
      toks.push({ t: "op", v: op });
      i += op.length;
      continue;
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0) throw new Error("unterminated string");
      toks.push({ t: "str", v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const m = /^[0-9][0-9_,]*(\.[0-9]+)?/.exec(src.slice(i));
      toks.push({ t: "num", v: Number(m[0].replace(/[,_]/g, "")) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z가-힣_]/.test(c)) {
      const m = /^[A-Za-z가-힣_][A-Za-z0-9가-힣_.[\]]*/.exec(src.slice(i));
      toks.push({ t: "ref", v: m[0] });
      i += m[0].length;
      continue;
    }
    throw new Error(`formula: unexpected char '${c}'`);
  }
  return toks;
}
var FUNCS = /* @__PURE__ */ new Set(["sum", "count", "round", "min", "max"]);
function evaluateFormula(src, resolve) {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  function primary() {
    const t = next();
    if (!t) throw new Error("formula: unexpected end");
    if (t.t === "num") return t.v;
    if (t.t === "str") return t.v;
    if (t.t === "lp") {
      const v = comparison();
      if (next()?.t !== "rp") throw new Error("formula: expected )");
      return v;
    }
    if (t.t === "ref") {
      if (FUNCS.has(t.v) && peek()?.t === "lp") {
        next();
        const args = [comparison()];
        while (peek()?.t === "comma") {
          next();
          args.push(comparison());
        }
        if (next()?.t !== "rp") throw new Error("formula: expected )");
        return callFunc(t.v, args);
      }
      return resolve(t.v);
    }
    if (t.t === "op" && t.v === "-") return -toNum(primary());
    throw new Error(`formula: unexpected token`);
  }
  function callFunc(name, args) {
    const arr = (v) => Array.isArray(v) ? v : [v];
    switch (name) {
      case "sum":
        return arr(args[0]).reduce((a, x) => a + toNum(x), 0);
      case "count":
        return arr(args[0]).length;
      case "round": {
        const n = args.length > 1 ? toNum(args[1]) : 0;
        const f = 10 ** n;
        return Math.round(toNum(args[0]) * f) / f;
      }
      case "min":
        return Math.min(...arr(args[0]).map(toNum));
      case "max":
        return Math.max(...arr(args[0]).map(toNum));
      default:
        throw new Error(`formula: unknown fn ${name}`);
    }
  }
  function mul() {
    let v = primary();
    while (peek()?.t === "op" && ["*", "/"].includes(peek().v)) {
      const op = next().v;
      const r = primary();
      v = op === "*" ? toNum(v) * toNum(r) : toNum(v) / toNum(r);
    }
    return v;
  }
  function add() {
    let v = mul();
    while (peek()?.t === "op" && ["+", "-"].includes(peek().v)) {
      const op = next().v;
      const r = mul();
      v = op === "+" ? toNum(v) + toNum(r) : toNum(v) - toNum(r);
    }
    return v;
  }
  function comparison() {
    const l = add();
    if (peek()?.t === "op" && ["==", "!=", "<=", ">=", "<", ">"].includes(peek().v)) {
      const op = next().v;
      const r = add();
      switch (op) {
        case "==":
          return looseEq(l, r);
        case "!=":
          return !looseEq(l, r);
        case "<=":
          return toNum(l) <= toNum(r);
        case ">=":
          return toNum(l) >= toNum(r);
        case "<":
          return toNum(l) < toNum(r);
        case ">":
          return toNum(l) > toNum(r);
      }
    }
    return l;
  }
  const out = comparison();
  if (pos !== toks.length) throw new Error("formula: trailing tokens");
  return out;
}
function toNum(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,\s원%]/g, ""));
    if (!Number.isNaN(n)) return n;
  }
  if (v == null) return 0;
  throw new Error(`formula: not a number: ${String(v)}`);
}
function looseEq(a, b) {
  if (typeof a === "number" || typeof b === "number") {
    try {
      return toNum(a) === toNum(b);
    } catch {
    }
  }
  return String(a) === String(b);
}
function makeResolver(ctx) {
  return (path) => {
    const parts = path.split(".");
    const rows = ctx.rows;
    if (rows && parts.length === 2 && rows[parts[0]]) {
      return rows[parts[0]].map((r) => r[parts[1]]);
    }
    let cur = ctx;
    for (const p of parts) {
      if (cur == null) return void 0;
      const m = /^([^[]+)\[(\d+)\]$/.exec(p);
      if (m) {
        cur = cur[m[1]];
        cur = Array.isArray(cur) ? cur[Number(m[2])] : void 0;
      } else if (Array.isArray(cur)) {
        cur = cur.map((item) => item && typeof item === "object" ? item[p] : void 0);
      } else {
        cur = cur[p];
      }
    }
    return cur;
  };
}

// src/features/task-workflow/document/spec/engine.ts
function clearLineSegEdits(xml, paras, seen) {
  const out = [];
  for (const p of paras) {
    if (seen.has(p.start)) continue;
    seen.add(p.start);
    out.push(...editsClearLineSeg(xml, p));
  }
  return out;
}
function writtenParagraphOf(cell) {
  return cell.paragraphs.find((p) => p.runs.length > 0) ?? null;
}
function paraAtOffset(paras, offset) {
  return paras.find((p) => offset >= p.start && offset < p.end) ?? null;
}
function formatValue(v, t) {
  if (t.format === "currency" || t.valueType === "number") {
    try {
      return toNum(v).toLocaleString("ko-KR");
    } catch {
    }
  }
  return String(v ?? "");
}
async function fillDocument(sections, input) {
  const { spec, plan, prose } = input;
  const knowledge = input.knowledge ?? {};
  const report = [];
  const keepSnapshots = {};
  const values = {};
  const rows = {};
  let current = [...sections];
  let indexes = current.map(parseHwpxSection);
  const ctx = () => ({ plan, knowledge, target: values, rows, ...values });
  const resolver = () => makeResolver(ctx());
  for (const t of spec.targets) {
    if (t.kind !== "keep") continue;
    const res = resolveLocator(indexes, t.locator);
    if (res.kind === "stale") {
      report.push({ targetId: t.id, status: "stale", detail: res.reason });
      continue;
    }
    keepSnapshots[t.id] = resolvedRegionText(res, indexes);
    report.push({ targetId: t.id, status: "kept" });
  }
  for (const t of spec.targets) {
    if (t.kind === "tableGroup") {
      const tg = t;
      const src2 = resolver()(tg.rowSource);
      if (!Array.isArray(src2)) {
        report.push({ targetId: t.id, status: "error", detail: `rowSource not array: ${tg.rowSource}` });
        rows[t.id] = [];
        continue;
      }
      rows[t.id] = src2.slice(0, tg.maxItems ?? src2.length).map((item, i) => ({
        __index0: i,
        __index1: i + 1,
        ...item
      }));
      continue;
    }
    if (t.kind !== "rowGroup") continue;
    const rg = t;
    const src = resolver()(rg.rowSource);
    if (!Array.isArray(src)) {
      report.push({ targetId: t.id, status: "error", detail: `rowSource not array: ${rg.rowSource}` });
      rows[t.id] = [];
      continue;
    }
    const bounded = src.slice(0, rg.maxRows ?? src.length);
    rows[t.id] = bounded.map((row, i) => {
      const out = { __index0: i, __index1: i + 1, ...row };
      for (const col of rg.rowSchema) {
        try {
          if (col.kind === "computed" && col.formula) {
            out[`col${col.col}`] = evaluateFormula(col.formula, makeResolver({ ...ctx(), row: out }));
          } else if (col.source) {
            out[`col${col.col}`] = makeResolver({ ...ctx(), row: out })(col.source);
          }
        } catch (e) {
          out[`col${col.col}`] = void 0;
          report.push({
            targetId: t.id,
            status: "error",
            detail: `row ${i} col ${col.col}: ${e instanceof Error ? e.message : String(e)}`
          });
        }
      }
      return out;
    });
  }
  for (const t of spec.targets) {
    try {
      if (t.kind === "scalar" || isPersonKind(t.kind)) {
        const s = t;
        values[t.id] = s.source ? resolver()(s.source) : plan[t.id];
      } else if (t.kind === "choice") {
        const c = t;
        const sel = c.select ? resolver()(c.select) : plan[t.id];
        const opt = (c.options ?? []).find((o) => o.value === sel || o.label === sel || String(o.value) === String(sel));
        values[t.id] = opt ? { label: opt.label, value: opt.value ?? opt.label, selectedValue: opt.value ?? opt.label } : void 0;
      } else if (t.kind === "computed") {
        values[t.id] = evaluateFormula(t.formula, resolver());
      }
    } catch (e) {
      values[t.id] = void 0;
      report.push({ targetId: t.id, status: "error", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  const editsBySection = current.map(() => []);
  const clearedSegs = current.map(() => /* @__PURE__ */ new Set());
  for (const t of spec.targets) {
    if (t.kind === "keep" || t.kind === "rowGroup" || t.kind === "tableGroup") continue;
    try {
      const res = resolveLocator(indexes, t.locator);
      if (res.kind === "stale") {
        report.push({ targetId: t.id, status: "stale", detail: res.reason });
        continue;
      }
      if (t.kind === "scalar" || t.kind === "computed" || isPersonKind(t.kind)) {
        const v = values[t.id];
        if (v == null || v === "") {
          report.push({ targetId: t.id, status: "skipped", detail: "no value" });
          continue;
        }
        const base = isPersonKind(t.kind) ? joinPersonNames(splitPersonNames(v), t.separator) : formatValue(v, t);
        const tpl = t.kind === "computed" ? void 0 : t.template;
        const text = tpl ? tpl.replace("{}", base) : base;
        if (res.kind === "cell") {
          editsBySection[res.section].push(...editsSetCellText(res.cell, text));
          const wrote = writtenParagraphOf(res.cell);
          if (wrote) editsBySection[res.section].push(...clearLineSegEdits(indexes[res.section].xml, [wrote], clearedSegs[res.section]));
        } else if (res.kind === "text") {
          const hit = findInParagraphs(indexes[res.section].xml, res.paras, res.anchor, res.occurrence);
          if (!hit) {
            report.push({ targetId: t.id, status: "stale", detail: "anchor hit failed" });
            continue;
          }
          if (res.position === "after") {
            const last = hit.segments[hit.segments.length - 1];
            editsBySection[res.section].push({ start: last.end, end: last.end, text: escapeInline(text) });
          } else {
            hit.segments.forEach((seg, i) => {
              editsBySection[res.section].push({ start: seg.start, end: seg.end, text: i === 0 ? escapeInline(text) : "" });
            });
          }
          const touched = hit.segments.map((seg) => paraAtOffset(res.paras, seg.start)).filter((p) => p != null);
          editsBySection[res.section].push(...clearLineSegEdits(indexes[res.section].xml, touched, clearedSegs[res.section]));
        }
        report.push({ targetId: t.id, status: "filled" });
        continue;
      }
      if (t.kind === "choice") {
        const c = t;
        const chosen = values[t.id];
        if (!chosen) {
          report.push({ targetId: t.id, status: "skipped", detail: "no selection" });
          continue;
        }
        const mark = c.mark ?? { unchecked: "□", checked: "■" };
        if (res.kind !== "cell" && res.kind !== "text") {
          report.push({ targetId: t.id, status: "stale", detail: "choice needs cell/text" });
          continue;
        }
        const paras = res.kind === "cell" ? res.cell.paragraphs : res.paras;
        const xml = indexes[res.section].xml;
        const joined = paras.map((p) => p.text).join("\n");
        let flipped = 0;
        for (const opt of c.options ?? []) {
          const isChosen = opt.label === chosen.label;
          if (!isChosen && c.exclusive === false) continue;
          const li = joined.indexOf(opt.label);
          if (li < 0) {
            report.push({ targetId: t.id, status: "stale", detail: `option not found: ${opt.label}` });
            continue;
          }
          let mi = -1;
          let mc = "";
          for (let k = li - 1; k >= 0; k--) {
            const ch = joined[k];
            if (ch === mark.checked || ch === mark.unchecked || ch === "☑" || ch === "□" || ch === "■" || ch === "☐") {
              mi = k;
              mc = ch;
              break;
            }
            if (ch === "\n") break;
          }
          if (mi < 0) continue;
          const want = isChosen ? mark.checked : mark.unchecked;
          if (mc === want) continue;
          const occ = countChar(joined.slice(0, mi + 1), mc);
          const hit = findInParagraphs(xml, paras, mc, occ);
          if (!hit || hit.segments.length !== 1) continue;
          editsBySection[res.section].push({ start: hit.segments[0].start, end: hit.segments[0].end, text: escapeInline(want) });
          flipped++;
        }
        report.push({ targetId: t.id, status: "filled", detail: `marks changed: ${flipped}` });
        continue;
      }
      if (t.kind === "prose") {
        const p = t;
        if (res.kind !== "cell" && res.kind !== "text") {
          report.push({ targetId: t.id, status: "stale", detail: "prose needs cell/text" });
          continue;
        }
        const preset = input.presetValues?.[t.id];
        let paragraphs;
        if (typeof preset === "string" && preset.length > 0) {
          paragraphs = preset.split("\n");
        } else {
          if (!prose) {
            report.push({ targetId: t.id, status: "skipped", detail: "no prose generator" });
            continue;
          }
          const planExcerpt = {};
          for (const key of p.sources ?? []) planExcerpt[key] = resolver()(key);
          const guide = plan[t.id];
          if (guide != null && guide !== "") planExcerpt[`plan.${t.id}`] = guide;
          const currentText = res.kind === "cell" ? res.cell.text : resolvedRegionText(res, indexes);
          const gen = await prose.generate({
            documentType: spec.documentType,
            instruction: [spec.instruction, p.instruction].filter(Boolean).join("\n"),
            scaffold: p.scaffold,
            planExcerpt,
            siblingValues: { ...values },
            currentText
          });
          paragraphs = gen.paragraphs;
        }
        values[t.id] = paragraphs.join("\n");
        if (res.kind === "cell") {
          writeParagraphsToCell(editsBySection[res.section], res.cell.paragraphs, paragraphs);
          editsBySection[res.section].push(...clearLineSegEdits(indexes[res.section].xml, res.cell.paragraphs, clearedSegs[res.section]));
        } else if (res.endAnchor) {
          const range = editsReplaceTextBlock(
            editsBySection[res.section],
            indexes[res.section].xml,
            res.paras,
            res.anchor,
            res.occurrence,
            res.endAnchor,
            paragraphs
          );
          if (!range) {
            report.push({ targetId: t.id, status: "stale", detail: "block anchors not resolved" });
            continue;
          }
          editsBySection[res.section].push(...clearLineSegEdits(
            indexes[res.section].xml,
            res.paras.slice(range.si, range.ei + 1),
            clearedSegs[res.section]
          ));
        } else {
          const hit = findInParagraphs(indexes[res.section].xml, res.paras, res.anchor, res.occurrence);
          if (hit) {
            const text = paragraphs.join("\n");
            hit.segments.forEach((seg, i) => editsBySection[res.section].push({ start: seg.start, end: seg.end, text: i === 0 ? escapeInline(text) : "" }));
            const touched = hit.segments.map((seg) => paraAtOffset(res.paras, seg.start)).filter((p2) => p2 != null);
            editsBySection[res.section].push(...clearLineSegEdits(indexes[res.section].xml, touched, clearedSegs[res.section]));
          }
        }
        report.push({ targetId: t.id, status: "filled" });
        continue;
      }
    } catch (e) {
      report.push({ targetId: t.id, status: "error", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  current = current.map((xml, i) => applyEdits(xml, editsBySection[i]));
  indexes = current.map(parseHwpxSection);
  for (const t of spec.targets) {
    if (t.kind !== "rowGroup") continue;
    const rg = t;
    try {
      const res = resolveLocator(indexes, t.locator);
      if (res.kind !== "rows") {
        report.push({ targetId: t.id, status: "stale", detail: res.kind === "stale" ? res.reason : "rowGroup needs rows locator" });
        continue;
      }
      const data = rows[t.id] ?? [];
      if ((rg.minRows ?? 1) > data.length) {
        report.push({ targetId: t.id, status: "error", detail: `rows ${data.length} < min ${rg.minRows ?? 1}` });
        continue;
      }
      const { table } = res;
      const [a, b] = res.dataRows;
      const xml = indexes[res.section].xml;
      const replaceRange = rg.replaceRows ?? (rg.repeatUnit === "row" || rg.detector === "rowGroup" || res.keepRows.length ? [a, b] : repeatReplacementRange(xml, table, [a, b], rg.rowSchema.map((c) => c.col)));
      current[res.section] = replaceTableRows(
        xml,
        table,
        replaceRange,
        res.keepRows ?? [],
        rg.rowTemplate ?? 0,
        data.length,
        rg.rowSchema.filter((col) => col.kind !== "keep").map((col) => col.col),
        (fragment, index, mergedIndexes) => fillRowFragment(fragment, rg, data[index] ?? {}, mergedIndexes?.map((i) => data[i])),
        rg.repeatUnit ?? (rg.detector === "rowGroup" ? "row" : "block"),
        [a, b]
      );
      indexes[res.section] = parseHwpxSection(current[res.section]);
      report.push({ targetId: t.id, status: "filled", detail: `${data.length} rows` });
    } catch (e) {
      report.push({ targetId: t.id, status: "error", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  for (const t of spec.targets) {
    if (t.kind !== "tableGroup") continue;
    const tg = t;
    try {
      const res = resolveLocator(indexes, t.locator);
      if (res.kind !== "table") {
        report.push({
          targetId: t.id,
          status: "stale",
          detail: res.kind === "stale" ? res.reason : "tableGroup needs table locator"
        });
        continue;
      }
      const items = rows[t.id] ?? [];
      if (items.length < (tg.minItems ?? 1)) {
        report.push({ targetId: t.id, status: "error", detail: `items ${items.length} < min ${tg.minItems ?? 1}` });
        continue;
      }
      const xml = indexes[res.section].xml;
      const host = hostParagraphRange(xml, res.table);
      if (!host) {
        report.push({ targetId: t.id, status: "stale", detail: "host paragraph of table not found" });
        continue;
      }
      const hostXml = xml.slice(host.start, host.end);
      const built = items.map((item) => fillTableGroupFragment(hostXml, tg, item));
      current[res.section] = applyEdits(current[res.section], [
        { start: host.start, end: host.end, text: built.join("") }
      ]);
      indexes[res.section] = parseHwpxSection(current[res.section]);
      report.push({ targetId: t.id, status: "filled", detail: `${items.length} tables` });
    } catch (e) {
      report.push({ targetId: t.id, status: "error", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return { sections: current, report, keepSnapshots, values, rows };
}
function hostParagraphRange(xml, table) {
  const start = xml.lastIndexOf("<hp:p ", table.start);
  const closeAt = xml.indexOf("</hp:p>", table.end);
  if (start < 0 || closeAt < 0) return null;
  const end = closeAt + "</hp:p>".length;
  return start < table.start && table.end <= end ? { start, end } : null;
}
function cellByAddr(table, row, col) {
  return table.rows.flatMap((r) => r.cells).find((c) => c.addr.row === row && c.addr.col === col) ?? null;
}
function fillTableGroupFragment(hostXml, tg, item) {
  const frag = parseHwpxSection(hostXml);
  const table = frag.tables[0];
  if (!table) throw new Error("host paragraph has no table");
  const resolve = makeResolver({ row: item });
  const edits = [];
  const cleared = /* @__PURE__ */ new Set();
  if (tg.caption?.anchor && tg.caption.source) {
    const hostPara = frag.topParagraphs[0];
    const v = resolve(tg.caption.source);
    const text = v == null ? "" : String(v);
    if (hostPara && text) {
      const hit = findInParagraphs(hostXml, [hostPara], tg.caption.anchor, 1);
      if (hit) {
        hit.segments.forEach((seg, i) => {
          edits.push({ start: seg.start, end: seg.end, text: i === 0 ? escapeInline(text) : "" });
        });
        edits.push(...clearLineSegEdits(hostXml, [hostPara], cleared));
      }
    }
  }
  for (const c of tg.cellSchema ?? []) {
    const cell = cellByAddr(table, c.addr.row, c.addr.col);
    if (!cell) continue;
    const v = c.source ? resolve(c.source) : void 0;
    if (v == null || v === "") continue;
    const text = typeof v === "number" ? v.toLocaleString("ko-KR") : String(v);
    try {
      edits.push(...editsSetCellSingleValue(hostXml, cell, text));
    } catch {
    }
  }
  return applyEdits(hostXml, edits);
}
function fillRowFragment(rowXml, rg, row, mergedRows) {
  const frag = parseHwpxSection(rowXml);
  const cells = frag.orphanRows[0]?.cells ?? [];
  const edits = [];
  for (const col of rg.rowSchema) {
    const cell = cells.find((c) => c.addr.col === col.col);
    if (!cell || col.kind === "keep") continue;
    const texts = (mergedRows ?? [row]).map((item) => {
      let v;
      if (col.kind === "computed") v = item[`col${col.col}`];
      else if (col.source) v = makeResolver({ row: item })(col.source);
      else v = item[`col${col.col}`];
      return typeof v === "number" ? v.toLocaleString("ko-KR") : String(v ?? "");
    });
    const unique = [...new Set(texts.filter((value) => value.trim()))];
    if (mergedRows && unique.length > 1) {
      throw new Error(`${col.col}열의 같은 병합 구역에 서로 다른 값이 있습니다. 상위 항목별로 반복 묶음을 나눠 주세요.`);
    }
    const text = unique[0] ?? "";
    try {
      edits.push(...editsSetCellSingleValue(rowXml, cell, text));
    } catch {
    }
  }
  return applyEdits(rowXml, edits);
}
function editsReplaceTextBlock(edits, xml, paras, anchor, occurrence, endAnchor, lines) {
  const startHit = findInParagraphs(xml, paras, anchor, occurrence);
  if (!startHit || !startHit.segments.length) return null;
  const startPos = startHit.segments[0].start;
  const startEnd = startHit.segments[startHit.segments.length - 1].end;
  let endHit = null;
  for (let occ = 1; occ <= 50; occ++) {
    const h = findInParagraphs(xml, paras, endAnchor, occ);
    if (!h) break;
    if (h.segments[0].start >= startPos) {
      endHit = h;
      break;
    }
  }
  if (!endHit || !endHit.segments.length) return null;
  const endStart = endHit.segments[0].start;
  const endEnd = endHit.segments[endHit.segments.length - 1].end;
  const paraOf = (pos) => paras.findIndex((p) => p.start <= pos && pos < p.end);
  const si = paraOf(startPos);
  const ei = paraOf(endEnd - 1);
  if (si < 0 || ei < 0 || ei < si) return null;
  if (si === ei) return null;
  const middles = paras.slice(si + 1, ei);
  const rest = lines.slice(1);
  const firstLine = middles.length === 0 && rest.length ? lines.join("\n") : lines[0] ?? "";
  edits.push({ start: startHit.segments[0].start, end: startHit.segments[0].end, text: escapeInline(firstLine) });
  for (let i = 1; i < startHit.segments.length; i++) {
    edits.push({ start: startHit.segments[i].start, end: startHit.segments[i].end, text: "" });
  }
  for (const r of paras[si].runs) {
    for (const tp of r.tParts) {
      if (tp.start >= startEnd && tp.end > tp.start) edits.push({ start: tp.start, end: tp.end, text: "" });
      else if (tp.start < startEnd && tp.end > startEnd) edits.push({ start: startEnd, end: tp.end, text: "" });
    }
  }
  if (middles.length) writeParagraphsToCell(edits, middles, rest);
  for (const seg of endHit.segments) edits.push({ start: seg.start, end: seg.end, text: "" });
  for (const r of paras[ei].runs) {
    for (const tp of r.tParts) {
      if (tp.end <= endStart && tp.end > tp.start) edits.push({ start: tp.start, end: tp.end, text: "" });
      else if (tp.start < endStart && tp.end > endStart && tp.start < tp.end) edits.push({ start: tp.start, end: endStart, text: "" });
    }
  }
  return { si, ei };
}
function writeParagraphsToCell(edits, paras, lines) {
  if (!paras.length) return;
  const n = paras.length;
  for (let i = 0; i < n; i++) {
    let text = "";
    if (i < lines.length) text = i === n - 1 ? lines.slice(i).join("\n") : lines[i];
    const runs = paras[i].runs;
    if (!runs.length) continue;
    edits.push(...editsSetRunText(runs[0], text));
    for (let r = 1; r < runs.length; r++) {
      for (const tp of runs[r].tParts) {
        if (tp.end > tp.start) edits.push({ start: tp.start, end: tp.end, text: "" });
      }
    }
  }
}
function countChar(s, ch) {
  let c = 0;
  for (const x of s) if (x === ch) c++;
  return c;
}
function escapeInline(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, "<hp:lineBreak/>");
}

// src/features/task-workflow/document/spec/planSchema.ts
var PLAN_REF = /(?:^|[^A-Za-z0-9_])plan\.([A-Za-z0-9_.[\]]+)/g;
function normalizeSpecPlanKeys(spec) {
  let changed = false;
  const targets = spec.targets.map((t) => {
    if (t.kind !== "rowGroup" && t.kind !== "tableGroup" || typeof t.rowSource !== "string") return t;
    const m = /^plan\.(.+)$/.exec(t.rowSource);
    if (!m) return t;
    const clean = m[1].replace(/[^A-Za-z0-9_]/g, "");
    if (!clean || clean === m[1]) return t;
    changed = true;
    return { ...t, rowSource: `plan.${clean}` };
  });
  return changed ? { ...spec, targets } : spec;
}
function collectPlanRefs(s, out) {
  if (!s) return;
  PLAN_REF.lastIndex = 0;
  let m;
  while (m = PLAN_REF.exec(s)) out.add(m[1].split(".")[0].replace(/\[\d+\]/, ""));
}
function derivePlanSchema(spec, sections) {
  const indexes = sections?.map(parseHwpxSection);
  const fields = /* @__PURE__ */ new Map();
  const add = (key, type, targetId, note, label, optional, prose, person) => {
    const f = fields.get(key) ?? { key, type, requiredBy: [], note, label, optional, prose, person };
    if (f.type === "unknown") f.type = type;
    if (!f.requiredBy.includes(targetId)) f.requiredBy.push(targetId);
    if (note && !f.note) f.note = note;
    if (label && !f.label) f.label = label;
    if (!optional) f.optional = false;
    if (prose) f.prose = true;
    if (person && !f.person) f.person = person;
    if (f.person) f.optional = true;
    fields.set(key, f);
  };
  for (const t of spec.targets) {
    const refs = /* @__PURE__ */ new Set();
    if (t.kind === "scalar") {
      collectPlanRefs(t.source, refs);
      for (const r of refs) add(r, t.valueType === "number" ? "number" : "string", t.id, t.instruction, t.label);
      if (!refs.size && !t.source) add(t.id, "string", t.id, t.instruction, t.label);
      continue;
    }
    if (isPersonKind(t.kind)) {
      const p = t;
      const role = personRoleOf(t.kind);
      const who = role === "teacher" ? "교사" : "학생";
      const note = `${who} 이름 — 계획 검토에서 명단으로 선택(AI가 채우지 않음)`;
      collectPlanRefs(p.source, refs);
      for (const r of refs) add(r, "string", t.id, note, t.label, true, false, role);
      if (!refs.size && !p.source) add(t.id, "string", t.id, note, t.label, true, false, role);
      continue;
    }
    if (t.kind === "choice") {
      const c = t;
      collectPlanRefs(c.select, refs);
      const options = Array.isArray(c.options) ? c.options : [];
      const note = options.length > 0 ? `택1: ${options.map((o) => o.value ?? o.label).join(" | ")}` : "택1(선택지 미정의 — 스펙 검수에서 options를 채우세요)";
      for (const r of refs) add(r, "string", t.id, note, t.label);
      if (!refs.size && !c.select) add(t.id, "string", t.id, note, t.label);
      continue;
    }
    if (t.kind === "rowGroup" || t.kind === "tableGroup") {
      const g = t;
      collectPlanRefs(g.rowSource, refs);
      const itemFields = [];
      const seen = /* @__PURE__ */ new Set();
      const addItemField = (src, numeric, note, prose) => {
        if (!src) return;
        const re = /(?:^|[^A-Za-z0-9_])row\.([A-Za-z0-9_]+)/g;
        let m;
        while (m = re.exec(src)) {
          if (seen.has(m[1])) continue;
          seen.add(m[1]);
          itemFields.push({ key: m[1], type: numeric ? "number" : "unknown", note, prose: prose || void 0 });
        }
      };
      if (t.kind === "rowGroup") {
        for (const col of g.rowSchema ?? []) {
          const numeric = col.kind === "computed" || !!col.formula;
          addItemField(col.source, numeric, col.instruction, col.kind === "prose");
          addItemField(col.formula, numeric, col.instruction, col.kind === "prose");
        }
      } else {
        const tg = g;
        addItemField(tg.caption?.source, false, "표 소제목");
        for (const c of tg.cellSchema ?? []) {
          addItemField(c.source, false, c.instruction, c.kind === "prose");
        }
      }
      const min = t.kind === "rowGroup" ? g.minRows : g.minItems;
      const max = t.kind === "rowGroup" ? g.maxRows : g.maxItems;
      for (const r of refs) {
        add(r, "array", t.id, g.instruction, t.label);
        const f = fields.get(r);
        f.itemFields = mergeItemFields(f.itemFields, itemFields);
        if (t.kind === "rowGroup" && indexes && (t.repeatUnit ?? (t.detector === "rowGroup" ? "row" : "block")) === "block") {
          const resolved = resolveLocator(indexes, t.locator);
          if (resolved.kind === "rows" && !resolved.keepRows.length) {
            const [a, b] = resolved.dataRows;
            const replacement = t.replaceRows ?? repeatReplacementRange(indexes[resolved.section].xml, resolved.table, [a, b], t.rowSchema.map((c) => c.col));
            const containers = resolved.table.rows.flatMap((row) => row.cells).filter((c) => c.span.rows > 1 && c.addr.row <= a && c.addr.row + c.span.rows - 1 >= b && (c.addr.row < a || c.addr.row + c.span.rows - 1 > b));
            const context = `반복 원본은 ${a}~${b}행, 기존 예시 대체 구간은 ${replacement[0]}~${replacement[1]}행이다. 대체 구간의 옛 예시 행은 결과에 남기지 않는다.` + (containers.length ? ` 상위 병합 구역(${containers.map((c) => `${c.addr.col}열: ${c.text.trim()}`).join(", ")}) 안에서 하위 항목을 생성한다. 늘어난 하위 행도 이 상위 병합에 포함된다.` : "");
            f.note = [f.note, context].filter(Boolean).join("\n");
            const cells = resolved.table.rows.flatMap((row) => row.cells).filter((cell) => cell.addr.row >= a && cell.addr.row + cell.span.rows <= b + 1);
            f.repeatBlock = { rows: b - a + 1, cells: [] };
            for (const cell of cells) {
              const col = t.rowSchema.find((c) => c.col === cell.addr.col && c.kind !== "keep");
              const key = col?.source?.match(/^row\.([A-Za-z0-9_]+)$/)?.[1];
              if (!key) continue;
              const parent = cells.filter((p) => p.addr.col < cell.addr.col && p.span.rows > cell.span.rows && p.addr.row <= cell.addr.row && cell.addr.row + cell.span.rows <= p.addr.row + p.span.rows).sort((x, y) => y.addr.col - x.addr.col)[0];
              const parentCol = parent && t.rowSchema.find((c) => c.col === parent.addr.col);
              const header = resolved.table.rows.flatMap((row) => row.cells).filter((c) => c.addr.row < a && c.addr.col <= cell.addr.col && cell.addr.col < c.addr.col + c.span.cols).at(-1)?.text;
              f.repeatBlock.cells.push({
                key,
                row: cell.addr.row - a,
                span: cell.span.rows,
                label: col.instruction || header || `${cell.addr.col}열`,
                parent: parentCol?.source?.match(/^row\.([A-Za-z0-9_]+)$/)?.[1]
              });
            }
          }
        }
        if (min != null) f.minItems = Math.max(f.minItems ?? 0, min);
        if (max != null) f.maxItems = Math.min(f.maxItems ?? max, max);
      }
      continue;
    }
    if (t.kind === "prose") {
      const p = t;
      for (const s of p.sources ?? []) collectPlanRefs(s, refs);
      for (const r of refs) add(r, "unknown", t.id, t.instruction, t.label);
      add(
        t.id,
        "string",
        t.id,
        `서술 본문(비우면 AI가 작성)${t.instruction ? ` — ${t.instruction}` : ""}`,
        t.label,
        true,
        true
      );
      continue;
    }
    if (t.kind === "computed") {
      collectPlanRefs(t.formula, refs);
      for (const r of refs) add(r, "number", t.id);
    }
  }
  for (const c of spec.constraints ?? []) {
    const refs = /* @__PURE__ */ new Set();
    for (const v of Object.values(c)) if (typeof v === "string") collectPlanRefs(v, refs);
    for (const r of refs) add(r, "unknown", `constraint:${c.kind}`);
  }
  return [...fields.values()];
}
function mergeItemFields(a, b) {
  const out = [...a ?? []];
  for (const f of b ?? []) {
    const exist = out.find((x) => x.key === f.key);
    if (!exist) out.push(f);
    else if (f.prose && !exist.prose) exist.prose = true;
  }
  return out;
}
function unwrapPrimitive(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v;
    for (const k of ["value", "label", "text"]) {
      const inner = o[k];
      if (typeof inner === "string" || typeof inner === "number" || typeof inner === "boolean") return inner;
    }
  }
  return v;
}
function normalizePlan(schema, plan) {
  const out = { ...plan };
  for (const f of schema) {
    const v = out[f.key];
    if (v == null) continue;
    if (f.type === "array") {
      if (Array.isArray(v)) {
        const itemKeys = (f.itemFields ?? []).map((i) => i.key);
        out[f.key] = v.map((row) => {
          if (Array.isArray(row) && itemKeys.length > 0) {
            const r = {};
            itemKeys.forEach((k, i) => {
              r[k] = unwrapPrimitive(row[i] ?? "");
            });
            return r;
          }
          if (row && typeof row === "object" && !Array.isArray(row)) {
            const r = { ...row };
            for (const k of Object.keys(r)) r[k] = unwrapPrimitive(r[k]);
            if (itemKeys.length > 0 && !itemKeys.some((k) => k in r)) {
              const vals = Object.values(r);
              if (vals.length >= itemKeys.length) {
                const remapped = {};
                itemKeys.forEach((k, i) => {
                  remapped[k] = vals[i] ?? "";
                });
                return remapped;
              }
            }
            return r;
          }
          if (itemKeys.length > 0 && (typeof row === "string" || typeof row === "number")) {
            const r = {};
            itemKeys.forEach((k, i) => {
              r[k] = i === 0 ? row : "";
            });
            return r;
          }
          return row;
        });
      }
    } else {
      out[f.key] = unwrapPrimitive(v);
    }
  }
  return out;
}
function validatePlan(schema, plan) {
  const errors = [];
  for (const f of schema) {
    const v = plan[f.key];
    if (v == null) {
      if (!f.optional) errors.push(`plan.${f.key} 누락`);
      continue;
    }
    if (f.type === "array" && !Array.isArray(v)) errors.push(`plan.${f.key}는 배열이어야 함`);
    if (f.type === "number" && typeof v !== "number" && Number.isNaN(Number(v))) errors.push(`plan.${f.key}는 숫자여야 함`);
    if (f.type !== "array" && typeof v === "object" && !Array.isArray(v)) {
      errors.push(`plan.${f.key}는 원시값(문자열/숫자)이어야 함 — 객체 금지`);
    }
    if (f.type === "array" && Array.isArray(v)) {
      if (f.repeatBlock) {
        const block = f.repeatBlock;
        if (v.length % block.rows !== 0) errors.push(`plan.${f.key}: 선택 영역 ${block.rows}행 단위로 완전한 반복 묶음을 생성해야 함`);
        for (let start = 0; start < v.length; start += block.rows) {
          for (const cell of block.cells.filter((c) => c.span > 1)) {
            const values = v.slice(start + cell.row, start + cell.row + cell.span).map((row) => row && typeof row === "object" ? row[cell.key] : void 0).filter((value) => value != null && String(value).trim()).map(String);
            if (new Set(values).size > 1) errors.push(`plan.${f.key}: ${start / block.rows + 1}번째 묶음의 ${cell.key}(${cell.label}) 상위 값이 병합 구역 안에서 달라짐`);
          }
        }
      }
      if (v.length === 0 && !f.optional) {
        errors.push(`plan.${f.key}가 빈 배열 — 최소 1행 이상 생성할 것`);
      }
      const itemKeys = (f.itemFields ?? []).map((i) => i.key);
      const badShape = v.some((row) => !row || typeof row !== "object" || Array.isArray(row));
      if (badShape) {
        errors.push(
          `plan.${f.key}의 행은 배열이 아니라 키 있는 객체여야 함` + (itemKeys.length ? ` — 예: {${itemKeys.map((k) => `"${k}": "값"`).join(", ")}}` : "")
        );
      }
      if (!badShape && itemKeys.length > 0) {
        const missingKeys = v.some((row) => !itemKeys.some((k) => k in row));
        if (missingKeys) {
          errors.push(`plan.${f.key}의 행 키가 스키마와 다름 — 항목 필드 키(${itemKeys.join(", ")})를 그대로 사용할 것`);
        }
      }
      const badCell = v.some((row) => row && typeof row === "object" && !Array.isArray(row) && Object.values(row).some((c) => c !== null && typeof c === "object"));
      if (badCell) errors.push(`plan.${f.key}의 행 값에 객체가 있음 — 각 셀은 원시값이어야 함`);
    }
  }
  return errors;
}
function missingPlanInputs(schema, plan) {
  const out = [];
  const blank = (v) => v == null || typeof v === "string" && v.trim() === "";
  for (const f of schema) {
    const required = !f.optional || !!f.person;
    if (!required) continue;
    const label = f.label ?? f.key;
    const v = plan[f.key];
    if (f.type === "array") {
      const rows = Array.isArray(v) ? v : [];
      if (rows.length === 0 || f.minItems != null && rows.length < f.minItems) {
        out.push({ key: f.key, label, reason: "rows" });
        continue;
      }
      const cols = f.itemFields ?? [];
      if (cols.length && rows.some((r) => cols.some((c) => blank(r?.[c.key])))) {
        out.push({ key: f.key, label, reason: "cells" });
      }
      continue;
    }
    if (blank(v)) out.push({ key: f.key, label, reason: "empty" });
  }
  return out;
}

// src/features/document-generation/mcp/agentSpec.ts
var FP_LEN2 = 48;
var fp2 = (s) => s.replace(/\s+/g, " ").trim().slice(0, FP_LEN2);
var clip = (s, n) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
};
var exact = (s, n) => s.length > n ? `${JSON.stringify(s.slice(0, n))}…` : JSON.stringify(s);
function globalTables(indexes) {
  const out = [];
  const byNode = /* @__PURE__ */ new Map();
  let g = 0;
  indexes.forEach((idx, section) => {
    for (const table of idx.tables) {
      byNode.set(table, g);
      out.push({ g, section, table });
      g++;
    }
  });
  for (const entry of out) {
    for (const row of entry.table.rows) {
      for (const cell of row.cells) {
        for (const inner of cell.tables) {
          const ig = byNode.get(inner);
          const child = ig != null ? out[ig] : void 0;
          if (child) child.parent = { g: entry.g, cell };
        }
      }
    }
  }
  return out;
}
function describeTemplate(sections, opts = {}) {
  const indexes = sections.map(parseHwpxSection);
  const tables = globalTables(indexes);
  const maxChars = opts.maxChars ?? 6e4;
  const render = (cellLimit, collapseRows) => {
    const lines = [];
    const fieldCount = indexes.reduce((n, idx) => n + idx.fields.filter((f) => f.type === "CLICK_HERE").length, 0);
    lines.push(`섹션 ${sections.length}개 · 표 ${tables.length}개 · 누름틀 ${fieldCount}개`);
    const tableLines = (entry, limit, collapse) => {
      const t = entry.table;
      const where = entry.parent ? ` · T${entry.parent.g} 의 r${entry.parent.cell.addr.row}c${entry.parent.cell.addr.col} 안에 든 표` : "";
      const out = [`[T${entry.g}] ${t.rows.length}행 × ${t.colCnt}열${where}`];
      const rows = collapse != null && t.rows.length > collapse ? [...t.rows.slice(0, collapse)] : t.rows;
      rows.forEach((row, ri) => {
        const cells = row.cells.map((c) => {
          const span = c.span.rows > 1 || c.span.cols > 1 ? `(${c.span.rows}×${c.span.cols})` : "";
          const inner = c.tables.length ? ` ⟨표 ${c.tables.map((it) => `T${tables.find((x) => x.table === it)?.g}`).join(",")}⟩` : "";
          return `c${c.addr.col}${span} ${limit > 0 ? exact(c.text, limit) : "…"}${inner}`;
        });
        out.push(`  r${row.cells[0]?.addr.row ?? ri}: ${cells.join(" | ")}`);
      });
      if (rows.length < t.rows.length) out.push(`  … ${t.rows.length - rows.length}행 더 — table: ${entry.g} 로 다시 부르면 전부 보인다`);
      return out;
    };
    indexes.forEach((idx, si) => {
      if (opts.section != null && opts.section !== si) return;
      if (opts.table != null) return;
      lines.push("", `== 섹션 ${si} ==`);
      for (const f of idx.fields) {
        if (f.type === "MEMO" && f.innerText.trim()) lines.push(`[메모 — 양식이 적어 둔 작성 안내] ${clip(f.innerText, 300)}`);
        if (f.type === "CLICK_HERE") lines.push(`[누름틀] fieldId=${f.fieldId} 글자 ${exact(f.innerText, 60)}`);
      }
      const tops = tables.filter((t) => t.section === si && !t.parent);
      const items = [
        ...idx.topParagraphs.filter((p) => p.text.trim()).map((p) => ({ start: p.start, render: () => [`¶ ${exact(p.text, Math.max(cellLimit, 200))}`] })),
        ...tops.map((t) => ({
          start: t.table.start,
          render: () => {
            const out = tableLines(t, cellLimit, collapseRows);
            const nested = (parent) => tables.filter((x) => x.parent?.g === parent).flatMap((x) => [...tableLines(x, cellLimit, collapseRows), ...nested(x.g)]);
            return [...out, ...nested(t.g)];
          }
        }))
      ];
      items.sort((a, b) => a.start - b.start);
      for (const it of items) {
        lines.push(...it.render());
      }
    });
    if (opts.table != null) {
      const entry = tables.find((t) => t.g === opts.table);
      if (!entry) lines.push(`표 T${opts.table} 가 없습니다 (T0 ~ T${tables.length - 1}).`);
      else lines.push("", `== 섹션 ${entry.section} ==`, ...tableLines(entry, 400, null));
    }
    return lines.join("\n");
  };
  let text = render(80, null);
  if (text.length > maxChars) text = render(40, 6);
  if (text.length > maxChars) text = render(0, 3);
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}
… (잘림 — section 또는 table 을 지정해 나눠 읽을 것)`;
  }
  return text;
}
var AGENT_SPEC_GUIDE = [
  "■ 채울 자리(targets) 쓰는 법 — 위 지도를 보고 자리마다 하나씩. 값은 문서를 만들 때 사람이 계획 검토에서 넣거나 AI 가 채운다.",
  "공통: id(영문·숫자·_ — 계획의 칸 이름이 된다) · kind · locator · label(사람이 볼 칸 이름, 한국어) · instruction(무엇을 어떻게 적을지) · required(기본 true)",
  "locator 종류:",
  '  셀 = {"kind":"cell","table":{"index":T번호},"addr":{"row":r,"col":c}} — 그 셀 글자 전체를 바꾼다. 표 안에 든 표도 자기 T번호로 바로 가리킨다.',
  '  글자 = {"kind":"text","anchor":"원문 그대로","occurrence":n(같은 글자가 여러 번이면 몇 번째),"position":"replace"|"after"} — anchor 를 바꾸거나(replace) 그 뒤에 덧붙인다(after).',
  "         지도의 글자는 JSON 문자열이다 — 공백 개수까지 그대로 옮긴다(따옴표 밖 … 는 잘렸다는 뜻이니 그 부분은 앵커로 쓰지 않는다). 앵커는 한 문단 안의 글자여야 한다.",
  '         여러 문단 구역은 "endAnchor":"끝 글자" 를 함께 준다(prose 에 쓴다).',
  '  누름틀 = {"kind":"clickhere","fieldId":"…"}',
  '  행 묶음 = {"kind":"rowGroup","table":{"index":T},"rows":[시작행,끝행]} — 예시 행을 지우고 항목 수만큼 행을 복제한다.',
  '  표 통째 = {"kind":"table","table":{"index":T}} — tableGroup 에 쓴다.',
  "kind 종류:",
  '  scalar — 짧은 값. valueType: text|number|date|phone. template:"({})학급" 처럼 {} 자리에 값.',
  "  personTeacher · personStudent — 사람 이름(계획 검토에서 명단으로 고른다, AI 가 지어내지 않는다).",
  '  choice — □/■ 체크. options:[{"label":"문서에 적힌 선택지 글자"}…] 2개 이상, exclusive(기본 true). locator 는 선택지가 든 셀이나 글자.',
  '  prose — 긴 서술(AI 가 쓴다). scaffold:["유지할 골격 줄"], length:"3~5문장" 같은 분량.',
  '  rowGroup — 반복 행. rowSource:"plan.items", rowSchema:[{"col":0,"kind":"computed","formula":"row.__index1"},{"col":1,"kind":"scalar","source":"row.name","instruction":"…"},{"col":2,"kind":"prose","source":"row.detail"}], minRows·maxRows.',
  '  tableGroup — 같은 서식의 표를 항목마다 복제. rowSource:"plan.blocks", cellSchema:[{"addr":{"row":1,"col":1},"source":"row.title"}], caption:{"anchor":"표 위 소제목 원문","source":"row.caption"}.',
  '  computed — 계산. formula:"plan.a + plan.b" 또는 "sum(rows.표id.col3)", format: number|currency|text.',
  "  keep — 바꾸면 안 되는 구역(검사용).",
  "주의:",
  '  - 칸 이름표 셀(예: "성명")이 아니라 **값이 들어갈 빈 셀**을 가리킨다. 이름표와 값이 한 셀이면 text 앵커 + template.',
  "  - 한 셀·한 글자를 두 자리가 함께 가리키지 않는다(겹치면 거부된다).",
  "  - 날짜·학교명처럼 문서마다 같은 값은 scalar 로 두고 instruction 에 적는다. 원문의 예시 내용(다른 해의 날짜·사업명)을 instruction 에 옮기지 않는다.",
  "  - create_document_generation 은 저장 전에 견본 값으로 실제 채움을 해 본다. check_only:true 로 먼저 검사만 할 수 있다."
].join("\n");
var TARGET_KINDS = /* @__PURE__ */ new Set(["scalar", "choice", "prose", "rowGroup", "tableGroup", "computed", "keep", "personTeacher", "personStudent"]);
var LOCATOR_KINDS = /* @__PURE__ */ new Set(["clickhere", "text", "cell", "cellRange", "rowGroup", "table"]);
var ID_RE = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;
var MAX_AGENT_TARGETS = 200;
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var isAddr = (v) => isObj(v) && Number.isInteger(v.row) && Number.isInteger(v.col) && v.row >= 0 && v.col >= 0;
function buildAgentSpec(input, sections) {
  const problems = [];
  const raw = input.targets;
  if (!Array.isArray(raw) || raw.length === 0) return { spec: null, problems: ["targets 는 자리 1개 이상의 배열입니다."] };
  if (raw.length > MAX_AGENT_TARGETS) return { spec: null, problems: [`자리는 ${MAX_AGENT_TARGETS}개까지입니다.`] };
  const indexes = sections.map(parseHwpxSection);
  const tables = globalTables(indexes);
  const ids = /* @__PURE__ */ new Set();
  const targets = [];
  raw.forEach((t, i) => {
    const at = `${i + 1}번째 자리`;
    if (!isObj(t)) {
      problems.push(`${at}: 객체가 아닙니다.`);
      return;
    }
    const id = typeof t.id === "string" ? t.id.trim() : "";
    const name = id ? `${at}(${id})` : at;
    if (!ID_RE.test(id)) {
      problems.push(`${name}: id 는 영문으로 시작하는 영문·숫자·_ 48자까지입니다.`);
      return;
    }
    if (ids.has(id)) {
      problems.push(`${name}: id 가 겹칩니다.`);
      return;
    }
    ids.add(id);
    if (typeof t.kind !== "string" || !TARGET_KINDS.has(t.kind)) {
      problems.push(`${name}: kind 는 ${[...TARGET_KINDS].join(" · ")} 중 하나입니다.`);
      return;
    }
    const loc = t.locator;
    if (!isObj(loc) || typeof loc.kind !== "string" || !LOCATOR_KINDS.has(loc.kind)) {
      problems.push(`${name}: locator.kind 는 ${[...LOCATOR_KINDS].join(" · ")} 중 하나입니다.`);
      return;
    }
    const locator = { ...loc };
    delete locator.section;
    if ((loc.kind === "text" || loc.kind === "clickhere") && loc.section != null) {
      if (!(Number.isInteger(loc.section) && loc.section >= 0 && loc.section < sections.length)) {
        problems.push(`${name}: section 은 0 ~ ${sections.length - 1} 입니다.`);
        return;
      }
      locator.section = loc.section;
    }
    if (loc.kind === "text") {
      if (typeof loc.anchor !== "string" || !loc.anchor) {
        problems.push(`${name}: text 자리에는 anchor(원문 글자)가 필요합니다.`);
        return;
      }
      if (loc.occurrence != null && !(Number.isInteger(loc.occurrence) && loc.occurrence >= 1)) {
        problems.push(`${name}: occurrence 는 1 이상의 정수입니다.`);
        return;
      }
      if (loc.position != null && loc.position !== "replace" && loc.position !== "after") {
        problems.push(`${name}: position 은 replace · after 입니다.`);
        return;
      }
    }
    if (loc.kind === "clickhere" && (typeof loc.fieldId !== "string" || !loc.fieldId)) {
      const ids2 = indexes.flatMap((idx) => idx.fields.filter((f) => f.type === "CLICK_HERE").map((f) => f.fieldId));
      if (ids2.length !== 1) {
        problems.push(`${name}: 누름틀이 ${ids2.length}개라 fieldId 가 필요합니다.`);
        return;
      }
    }
    if (loc.kind === "cell" || loc.kind === "rowGroup" || loc.kind === "cellRange" || loc.kind === "table") {
      const ti = isObj(loc.table) ? loc.table.index : void 0;
      const entry = Number.isInteger(ti) ? tables.find((x) => x.g === ti) : void 0;
      if (!entry) {
        problems.push(`${name}: table.index 가 없는 표입니다 (T0 ~ T${tables.length - 1}).`);
        return;
      }
      locator.table = { index: entry.table.index, fingerprint: fp2(entry.table.headerFingerprint) };
      locator.section = entry.section;
      if (loc.kind === "cell") {
        const path = Array.isArray(loc.cellPath) ? loc.cellPath : loc.addr ? [loc.addr] : null;
        if (!path || path.length === 0 || !path.every(isAddr)) {
          problems.push(`${name}: cell 자리에는 addr {row, col} 또는 cellPath 가 필요합니다.`);
          return;
        }
        if (Array.isArray(loc.cellPath)) {
          locator.cellPath = loc.cellPath;
          delete locator.addr;
        } else locator.addr = loc.addr;
        delete locator.fingerprint;
      }
      if (loc.kind === "rowGroup" || loc.kind === "cellRange") {
        const rows = loc.rows;
        if (!Array.isArray(rows) || rows.length !== 2 || !rows.every((n) => Number.isInteger(n) && n >= 0)) {
          problems.push(`${name}: rows 는 [시작행, 끝행] 입니다.`);
          return;
        }
      }
    }
    const target = { ...t, id, locator };
    delete target.confirmRequired;
    delete target.detector;
    delete target.autoLabel;
    delete target.evidence;
    target.required = t.required === false ? false : true;
    for (const key of ["label", "instruction"]) {
      if (target[key] != null && typeof target[key] !== "string") {
        problems.push(`${name}: ${key} 는 글자입니다.`);
        return;
      }
      if (typeof target[key] === "string") target[key] = target[key].trim().slice(0, key === "label" ? 60 : 1e3) || void 0;
    }
    if (t.kind === "choice") {
      const options = t.options;
      if (!Array.isArray(options) || options.length < 2 || !options.every((o) => isObj(o) && typeof o.label === "string" && o.label)) {
        problems.push(`${name}: choice 에는 options [{label}] 가 2개 이상 필요합니다.`);
        return;
      }
    }
    if ((t.kind === "rowGroup" || t.kind === "tableGroup") && (typeof t.rowSource !== "string" || !/^plan\.[A-Za-z0-9_]+$/.test(t.rowSource))) {
      problems.push(`${name}: rowSource 는 "plan.영문키" 입니다.`);
      return;
    }
    if (t.kind === "rowGroup" && (!Array.isArray(t.rowSchema) || t.rowSchema.length === 0)) {
      problems.push(`${name}: rowGroup 에는 rowSchema(열 정의)가 필요합니다.`);
      return;
    }
    if (t.kind === "rowGroup" && loc.kind !== "rowGroup") {
      problems.push(`${name}: rowGroup 의 locator.kind 는 rowGroup 입니다.`);
      return;
    }
    if (t.kind === "tableGroup") {
      if (loc.kind !== "table") {
        problems.push(`${name}: tableGroup 의 locator.kind 는 table 입니다.`);
        return;
      }
      if (!Array.isArray(t.cellSchema) || t.cellSchema.length === 0) {
        problems.push(`${name}: tableGroup 에는 cellSchema 가 필요합니다.`);
        return;
      }
    }
    if (t.kind === "computed" && (typeof t.formula !== "string" || !t.formula)) {
      problems.push(`${name}: computed 에는 formula 가 필요합니다.`);
      return;
    }
    targets.push(target);
  });
  if (problems.length) return { spec: null, problems };
  const documentType = input.documentType.trim().slice(0, 120);
  const spec = normalizeSpecPlanKeys({
    specVersion: 1,
    documentType,
    targets,
    ...input.instruction?.trim() ? { instruction: input.instruction.trim().slice(0, 4e3) } : {},
    ...input.contextExample?.trim() ? { contextExample: input.contextExample.trim().slice(0, 2e3) } : {}
  });
  return { spec, problems };
}
function samplePlan(spec, schema) {
  const plan = {};
  for (const f of schema) {
    if (f.type === "number") plan[f.key] = 1;
    else if (f.type === "boolean") plan[f.key] = true;
    else if (f.type === "array") {
      const row = Object.fromEntries((f.itemFields ?? []).map((i) => [i.key, i.type === "number" ? 1 : "1"]));
      const n = Math.max(f.minItems ?? 0, Math.min(2, f.maxItems ?? 2));
      plan[f.key] = Array.from({ length: n }, () => ({ ...row }));
    } else if (f.person) plan[f.key] = "홍길동";
    else if (f.prose) plan[f.key] = "견본 문장입니다.";
    else if (f.type === "unknown") plan[f.key] = "1";
    else plan[f.key] = "견본";
  }
  for (const t of spec.targets) {
    if (t.kind !== "choice") continue;
    const key = t.select?.match(/^plan\.([A-Za-z0-9_]+)$/)?.[1] ?? (t.select ? null : t.id);
    if (key && t.options?.[0]) plan[key] = t.options[0].value ?? t.options[0].label;
  }
  return plan;
}
function regionKey(indexes, loc) {
  const res = resolveLocator(indexes, loc);
  if (res.kind === "cell") return `s${res.section}:cell:${res.cell.start}`;
  if (res.kind === "rows") return `s${res.section}:rows:${res.table.start}:${res.dataRows.join("-")}`;
  if (res.kind === "table") return `s${res.section}:table:${res.table.start}`;
  if (res.kind === "text") return `s${res.section}:text:${res.anchor}#${res.occurrence}`;
  return null;
}
async function checkAgentSpec(spec, sections) {
  const problems = [];
  const warnings = [];
  const indexes = sections.map(parseHwpxSection);
  const label = (t) => t.label ? `${t.id}(${t.label})` : t.id;
  const seen = /* @__PURE__ */ new Map();
  for (const t of spec.targets) {
    const res = resolveLocator(indexes, t.locator);
    if (res.kind === "stale") {
      problems.push(`${label(t)}: 문서에서 자리를 찾지 못했습니다 — ${res.reason}`);
      continue;
    }
    if (t.locator.kind === "text" && t.locator.anchor) {
      const count = indexes[res.kind === "text" ? res.section : 0].fullText.split(t.locator.anchor).length - 1;
      const occ = t.locator.occurrence ?? 1;
      if (occ > count) problems.push(`${label(t)}: "${clip(t.locator.anchor, 30)}" 는 ${count}번만 나옵니다 (occurrence ${occ}).`);
      else if (count > 1 && t.locator.occurrence == null) warnings.push(`${label(t)}: "${clip(t.locator.anchor, 30)}" 가 ${count}번 나옵니다 — 첫 번째에 씁니다. 다른 곳이면 occurrence 를 주세요.`);
    }
    if (t.kind === "keep") continue;
    const key = regionKey(indexes, t.locator);
    if (key && seen.has(key)) problems.push(`${label(t)}: ${seen.get(key)} 와 같은 자리를 가리킵니다.`);
    else if (key) seen.set(key, label(t));
    if (res.kind === "cell" && t.kind !== "choice" && /[□■☑☐]/.test(res.cell.text)) {
      warnings.push(`${label(t)}: 체크 표시(□)가 있는 셀입니다 — 선택지라면 kind:"choice" 가 맞습니다.`);
    }
  }
  const schema = derivePlanSchema(spec, sections);
  const planFields = schema.map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    ...f.optional ? { optional: true } : {},
    ...f.person ? { person: f.person } : {},
    ...f.prose ? { prose: true } : {},
    ...f.itemFields?.length ? { items: f.itemFields.map((i) => i.key) } : {}
  }));
  if (!problems.length) {
    const plan = samplePlan(spec, schema);
    const presetValues = Object.fromEntries(spec.targets.filter((t) => t.kind === "prose").map((t) => [t.id, "견본 문장입니다."]));
    try {
      const out = await fillDocument(sections, {
        spec,
        plan,
        presetValues,
        prose: { generate: async () => ({ paragraphs: ["견본 문장입니다."] }) }
      });
      for (const r of out.report) {
        const t = spec.targets.find((x) => x.id === r.targetId);
        const name = t ? label(t) : r.targetId;
        if (r.status === "stale" || r.status === "error") problems.push(`${name}: 시험 채움 실패 — ${r.detail ?? r.status}`);
        else if (r.status === "skipped") warnings.push(`${name}: 시험 채움에서 건너뜀 — ${r.detail ?? ""}`);
        else if (t?.kind === "choice" && r.detail === "marks changed: 0") warnings.push(`${name}: 체크 표시를 하나도 바꾸지 못했습니다 — 선택지 글자 앞에 □ 가 있는지 확인하세요.`);
      }
      out.sections.forEach((xml) => parseHwpxSection(xml));
    } catch (e) {
      problems.push(`시험 채움이 실패했습니다 — ${e instanceof Error ? e.message : String(e)} (자리 둘이 겹치면 이렇게 됩니다)`);
    }
  }
  return { ok: problems.length === 0, problems, warnings, planFields };
}

// src/features/task-workflow/document/spec/verify.ts
function verifyDocument(input) {
  const { spec, filled, plan } = input;
  const knowledge = input.knowledge ?? {};
  const checks = [];
  const indexes = filled.sections.map(parseHwpxSection);
  const ctx = { plan, knowledge, target: filled.values, rows: filled.rows, ...filled.values };
  const resolve = makeResolver(ctx);
  for (const r of filled.report) {
    if (r.status === "stale" || r.status === "error") {
      checks.push({ key: `fill:${r.targetId}`, status: "fail", message: `${r.status}: ${r.detail ?? ""}` });
    }
  }
  for (const t of spec.targets) {
    if (!t.required) continue;
    const rep = filled.report.find((r) => r.targetId === t.id);
    if (!rep || rep.status !== "filled") {
      if (t.kind !== "keep") checks.push({ key: `required:${t.id}`, status: "fail", message: `필수 타깃 미채움(${rep?.status ?? "missing"})` });
    }
  }
  for (const t of spec.targets) {
    if (t.kind !== "keep") continue;
    const before = filled.keepSnapshots[t.id];
    if (before == null) continue;
    const res = resolveLocator(indexes, t.locator);
    const after = res.kind === "stale" ? null : resolvedRegionText(res, indexes);
    if (after == null || normalize(after) !== normalize(before)) {
      checks.push({ key: `keep:${t.id}`, status: "fail", message: "유지 구역이 변경됨" });
    } else {
      checks.push({ key: `keep:${t.id}`, status: "pass", message: "유지 구역 불변" });
    }
  }
  for (const c of spec.constraints ?? []) {
    try {
      switch (c.kind) {
        case "equals": {
          const ok = looseEquals(resolve(c.a), resolve(c.b));
          checks.push(result(`equals:${c.a}`, ok, c.message ?? `${c.a} == ${c.b}`));
          break;
        }
        case "sum-equals": {
          const arr = asArray(resolve(c.of)).map(toNum);
          const sum = arr.reduce((a, b) => a + b, 0);
          const ok = looseEquals(sum, resolve(c.equals));
          checks.push(result(`sum-equals:${c.of}`, ok, c.message ?? `Σ${c.of}=${sum} vs ${String(resolve(c.equals))}`));
          break;
        }
        case "percent-sum": {
          const arr = asArray(resolve(c.of)).map(toNum);
          const sum = arr.reduce((a, b) => a + b, 0);
          checks.push(result(`percent-sum:${c.of}`, sum === c.equals, c.message ?? `Σ=${sum} (기대 ${c.equals})`));
          break;
        }
        case "subset": {
          const sub = asArray(resolve(c.of)).map(String);
          const sup = new Set(asArray(resolve(c.in)).map(String));
          const missing = sub.filter((x) => !sup.has(x));
          checks.push(result(`subset:${c.of}`, missing.length === 0, c.message ?? (missing.length ? `미포함: ${missing.slice(0, 5).join(", ")}` : "부분집합 충족")));
          break;
        }
        case "exactly-one": {
          const v = filled.values[c.target];
          checks.push(result(`exactly-one:${c.target}`, v != null, c.message ?? `선택값 ${v != null ? "있음" : "없음"}`));
          break;
        }
        case "no-residual":
        case "all-required-filled":
          break;
      }
    } catch (e) {
      checks.push({ key: `constraint:${c.kind}`, status: "fail", message: `평가 오류: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  const seen = /* @__PURE__ */ new Map();
  return checks.map((c) => {
    const n = (seen.get(c.key) ?? 0) + 1;
    seen.set(c.key, n);
    return n === 1 ? c : { ...c, key: `${c.key}#${n}` };
  });
}
function result(key, ok, message) {
  return { key, status: ok ? "pass" : "fail", message };
}
function asArray(v) {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}
function looseEquals(a, b) {
  try {
    return toNum(a) === toNum(b);
  } catch {
    return String(a) === String(b);
  }
}
function normalize(s) {
  return s.replace(/\s+/g, " ").trim();
}

// src/features/task-workflow/document/spec/knowledge.ts
async function resolveKnowledge(spec, adapters) {
  const values = {};
  const missing = [];
  for (const k of spec.knowledge ?? []) {
    const v = await resolveOne(k, adapters);
    if (v === void 0) {
      if (k.required) missing.push(k.key);
      continue;
    }
    values[k.key] = v;
  }
  return { values, missing };
}
async function resolveOne(k, adapters) {
  const s = k.source;
  if (s.type === "static") return s.value;
  if (s.type === "user-input") return adapters.userInputs?.[k.key];
  if (s.type === "db") {
    if (!adapters.db) return void 0;
    try {
      return await adapters.db({ table: s.table, select: s.select, params: s.params });
    } catch {
      return void 0;
    }
  }
  return void 0;
}

// src/features/document-generation/mcp/agentFill.ts
function agentSchema(spec, sections) {
  return derivePlanSchema(spec, sections).map((f) => f.itemFields ? { ...f, itemFields: f.itemFields.filter((i) => !i.key.startsWith("__")) } : f);
}
function agentNote(f) {
  if (f.person) return `${f.person === "teacher" ? "재직 교직원" : "재학생"} 이름 — 명단의 이름 그대로, 여러 명이면 «이름, 이름» (없는 이름·동명이인은 거부된다)`;
  if (f.prose && f.note) return f.note.replace(/^서술 본문\(비우면 AI가 작성\)/, "서술 본문 — 문서에 그대로 들어갈 글을 직접 쓴다");
  return f.note;
}
var fieldOf = (f) => ({
  key: f.key,
  ...f.label ? { label: f.label } : {},
  type: f.type,
  ...agentNote(f) ? { note: agentNote(f) } : {},
  ...f.optional ? { optional: true } : {},
  ...f.person ? { person: f.person } : {},
  ...f.prose ? { prose: true } : {},
  ...f.itemFields?.length ? { items: f.itemFields.map((i) => ({ key: i.key, type: i.type, ...i.note ? { note: i.note } : {}, ...i.prose ? { prose: true } : {} })) } : {},
  ...f.minItems != null ? { minItems: f.minItems } : {},
  ...f.maxItems != null ? { maxItems: f.maxItems } : {},
  ...f.repeatBlock ? { rowsPerItem: f.repeatBlock.rows } : {}
});
function planSkeleton(schema) {
  const out = {};
  for (const f of schema) {
    if (f.type === "array") {
      out[f.key] = [Object.fromEntries((f.itemFields ?? []).map((i) => [i.key, i.type === "number" ? 0 : `<${i.note ?? i.key}>`]))];
    } else if (f.type === "number") out[f.key] = 0;
    else out[f.key] = `<${f.label ?? f.key}>`;
  }
  return out;
}
function describeForFill(rawSpec, sections) {
  const spec = normalizeSpecPlanKeys(rawSpec);
  const schema = agentSchema(spec, sections);
  return {
    documentType: spec.documentType,
    ...spec.instruction ? { instruction: spec.instruction } : {},
    ...spec.contextExample ? { contextExample: spec.contextExample } : {},
    fields: schema.map(fieldOf),
    planExample: planSkeleton(schema)
  };
}
function prepareAgentPlan(rawSpec, sections, rawPlan) {
  const spec = normalizeSpecPlanKeys(rawSpec);
  const schema = agentSchema(spec, sections);
  const problems = [];
  if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) {
    return { spec, plan: {}, problems: ["plan 은 {칸 키: 값} 객체입니다 (get_document_generation 의 fields·plan_example 대로)."], people: { teacher: [], student: [] } };
  }
  const keys = new Set(schema.map((f) => f.key));
  const unknown = Object.keys(rawPlan).filter((k) => !keys.has(k));
  if (unknown.length) problems.push(`모르는 칸입니다: ${unknown.join(", ")} — 칸 키는 ${[...keys].join(", ")}`);
  const picked = Object.fromEntries(Object.entries(rawPlan).filter(([k]) => keys.has(k)));
  const plan = normalizePlan(schema, picked);
  for (const f of schema) {
    const v = plan[f.key];
    if (f.type === "array" && Array.isArray(v)) {
      plan[f.key] = v.map((row) => row && typeof row === "object" && !Array.isArray(row) ? Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith("__"))) : row);
    }
  }
  for (const m of missingPlanInputs(schema, plan)) {
    const f = schema.find((x) => x.key === m.key);
    problems.push(`${m.label}(${m.key}): ${m.reason === "empty" ? "비었습니다" : m.reason === "rows" ? "행이 없습니다" : "행 안에 빈 칸이 있습니다"}${f?.person ? " — 사람 이름 칸" : ""}`);
  }
  for (const t of spec.targets) {
    if (t.kind !== "prose" || t.required === false) continue;
    const v = plan[t.id];
    if (typeof v !== "string" || !v.trim()) problems.push(`${t.label ?? t.id}(${t.id}): 서술 본문이 비었습니다 — 문서에 들어갈 글을 직접 쓰세요`);
  }
  for (const e of validatePlan(schema, plan)) {
    if (!problems.some((p) => e.includes(p))) problems.push(e);
  }
  for (const f of schema) {
    const v = plan[f.key];
    if (f.type === "array" && Array.isArray(v)) {
      if (f.minItems != null && v.length < f.minItems) problems.push(`${f.label ?? f.key}(${f.key}): ${f.minItems}행 이상이어야 합니다 (지금 ${v.length})`);
      if (f.maxItems != null && v.length > f.maxItems) problems.push(`${f.label ?? f.key}(${f.key}): ${f.maxItems}행까지입니다 (지금 ${v.length}) — 넘는 행은 문서에 안 들어간다`);
    }
  }
  const people = { teacher: [], student: [] };
  for (const f of schema) {
    if (!f.person) continue;
    const names = splitPersonNames(plan[f.key]);
    people[f.person].push(...names);
  }
  people.teacher = [...new Set(people.teacher)];
  people.student = [...new Set(people.student)];
  return { spec, plan, problems: [...new Set(problems)], people };
}
async function fillAgentPlan(spec, sections, plan) {
  const { values: knowledge, missing } = await resolveKnowledge(spec, {
    db: async () => {
      throw new Error("db knowledge unavailable");
    },
    userInputs: {}
  });
  const presetValues = {};
  for (const t of spec.targets) {
    if (t.kind !== "prose") continue;
    const v = plan[t.id];
    if (typeof v === "string" && v.trim()) presetValues[t.id] = v;
  }
  const filled = await fillDocument(sections, {
    spec,
    plan,
    knowledge,
    presetValues,
    // 계획에 본문이 없는 서술 칸만 여기로 온다 — 빈 채로 둔다(지어내지 않는다)
    prose: { generate: async () => ({ paragraphs: [] }) }
  });
  const checks = verifyDocument({ spec, filled, plan, knowledge });
  return { filled, checks, failed: checks.filter((c) => c.status === "fail"), knowledge, knowledgeMissing: missing };
}
function runChecksOf(checks) {
  const keyCount = /* @__PURE__ */ new Map();
  return checks.slice(0, 40).map((c) => {
    const base = c.key.slice(0, 90);
    const n = (keyCount.get(base) ?? 0) + 1;
    keyCount.set(base, n);
    return { key: n === 1 ? base : `${base}#${n}`, label: c.key.split(":")[0], status: c.status, message: c.message.slice(0, 500) };
  });
}
export {
  AGENT_SPEC_GUIDE,
  MAX_AGENT_TARGETS,
  buildAgentSpec,
  checkAgentSpec,
  describeForFill,
  describeTemplate,
  fillAgentPlan,
  prepareAgentPlan,
  runChecksOf
};
