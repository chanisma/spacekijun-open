// 스펙 타깃 ↔ rhwp 엔진 페이지 레이아웃 매핑(순수 함수 — React·엔진 비의존).
// 입력은 엔진의 getPageControlLayout/getPageTextLayout JSON. 근거 실측:
// scripts/rhwp-spec-research/ (form1 12/12, form2 19p·분할 표 병합 검증 하니스).

import type { Locator, Target, WorkSpec } from './types';

export interface EngineCellLayout {
  x: number; y: number; w: number; h: number;
  row: number; col: number; rowSpan: number; colSpan: number; cellIdx: number;
}
export interface EngineTableLayout {
  type: string;
  x: number; y: number; w: number; h: number;
  rowCount: number; colCount: number;
  secIdx?: number; paraIdx?: number; controlIdx?: number;
  cells?: EngineCellLayout[];
}
export interface EngineTextRun {
  text: string; x: number; y: number; w: number; h: number;
  charX: number[]; secIdx: number | string; paraIdx: number; charStart: number;
  /** 셀 내부 런 식별(paraIdx는 셀-내부 문단 번호라 이들 없이 그룹핑하면 오염됨) */
  parentParaIdx?: number; controlIdx?: number; cellIdx?: number; cellParaIdx?: number;
}
export interface PageLayouts {
  controls: EngineTableLayout[];
  runs: EngineTextRun[];
}
export interface FieldLocation {
  fieldId: number;
  name?: string;
  location?: {
    sectionIndex: number;
    paraIndex: number;
    path?: { type: string; controlIndex?: number; cellIndex?: number }[];
  };
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface PageRect extends Rect { pageIndex: number }

interface TableEntry {
  key: string;
  docOrder: [number, number, number, number]; // sec, para, ctrl, 등장순(anon 정렬용)
  appearances: { pageIndex: number; table: EngineTableLayout }[];
}

export interface LayoutModel {
  pageCount: number;
  tables: TableEntry[]; // 문서 순서
  pages: PageLayouts[];
}

/** 페이지별 레이아웃 → 분할 표 병합 + 문서 순서 정렬 모델 */
export function buildLayoutModel(pages: PageLayouts[]): LayoutModel {
  const map = new Map<string, TableEntry>();
  let anonSeq = 0;
  pages.forEach((page, pageIndex) => {
    for (const t of page.controls ?? []) {
      if (t.type !== 'table') continue;
      const hasId = t.paraIdx != null && t.secIdx != null;
      const key = hasId ? `${t.secIdx}:${t.paraIdx}:${t.controlIdx ?? 0}` : `anon:${anonSeq}`;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          docOrder: hasId
            ? [Number(t.secIdx), Number(t.paraIdx), Number(t.controlIdx ?? 0), 0]
            : // 중첩 표(식별자 없음): 같은 페이지의 직전 식별 표 뒤에 등장순으로
              [Number.MAX_SAFE_INTEGER, 0, 0, anonSeq],
          appearances: [],
        };
        if (!hasId) anonSeq++;
        map.set(key, entry);
      }
      entry.appearances.push({ pageIndex, table: t });
    }
  });
  // 문서 순서 결정(form2 실측 반영): 화면 나열순은 같은 문단의 표들을 역전시킬 수
  // 있으므로(예: 19:1이 19:0보다 먼저 나열) **식별 표는 (sec,para,ctrl) 사전순이 정본**.
  // anon(중첩 표)만 "등장 직전의 식별 표 뒤"로 보간한다(form1 실측 일치).
  const identified = [...map.values()].filter((t) => !t.key.startsWith('anon:'));
  identified.sort((a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a.docOrder[i] !== b.docOrder[i]) return a.docOrder[i] - b.docOrder[i];
    }
    return 0;
  });
  const anons = [...map.values()].filter((t) => t.key.startsWith('anon:'));
  const tables = [...identified];
  for (const anon of anons) {
    // 등장 순서에서 anon 직전에 나온 식별 표를 찾는다
    let predecessor: TableEntry | null = null;
    outer: for (const page of pages) {
      for (const t of page.controls ?? []) {
        if (t.type !== 'table') continue;
        if (anon.appearances.some((a) => a.table === t)) break outer;
        const hasId = t.paraIdx != null && t.secIdx != null;
        if (hasId) {
          const key = `${t.secIdx}:${t.paraIdx}:${t.controlIdx ?? 0}`;
          predecessor = map.get(key) ?? predecessor;
        }
      }
    }
    const at = predecessor ? tables.indexOf(predecessor) + 1 : tables.length;
    tables.splice(at, 0, anon);
  }
  return { pageCount: pages.length, tables, pages };
}

/** (표 문서순 index, row, col) → 페이지 사각형. 분할 표는 해당 row가 있는 페이지에서. */
export function cellRect(model: LayoutModel, tableIndex: number, row: number, col: number): PageRect | null {
  const entry = model.tables[tableIndex];
  if (!entry) return null;
  for (const a of entry.appearances) {
    const c = (a.table.cells ?? []).find((c) => c.row === row && c.col === col);
    if (c) return { pageIndex: a.pageIndex, x: c.x, y: c.y, w: c.w, h: c.h };
  }
  return null;
}

/** 행 범위 → 페이지별 union 사각형(분할 표는 여러 페이지 조각). cols 지정 시 그 열들만 */
export function rowsRects(
  model: LayoutModel, tableIndex: number, r0: number, r1: number, cols?: number[],
): PageRect[] {
  const entry = model.tables[tableIndex];
  if (!entry) return [];
  const out: PageRect[] = [];
  for (const a of entry.appearances) {
    const cs = (a.table.cells ?? []).filter(
      (c) => c.row >= r0 && c.row <= r1 && (!cols || cols.includes(c.col)),
    );
    if (!cs.length) continue;
    const x0 = Math.min(...cs.map((c) => c.x));
    const y0 = Math.min(...cs.map((c) => c.y));
    const x1 = Math.max(...cs.map((c) => c.x + c.w));
    const y1 = Math.max(...cs.map((c) => c.y + c.h));
    out.push({ pageIndex: a.pageIndex, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return out;
}

/** 앵커 매치의 런별 글자 구간(from~to는 런 내 글자 인덱스, to는 exclusive) */
interface AnchorSegment { run: EngineTextRun; from: number; to: number }

/** 앵커 텍스트를 (섹션 필터, n번째 매치)로 찾아 런별 글자 구간으로 반환 — rect 계산의 단일 출처 */
function findAnchorSegments(
  model: LayoutModel,
  anchor: string,
  opts: { section?: number; occurrence?: number } = {},
): { pageIndex: number; segments: AnchorSegment[] } | null {
  const occurrence = opts.occurrence ?? 1;
  let found = 0;
  for (let p = 0; p < model.pages.length; p++) {
    const byPara = new Map<string, EngineTextRun[]>();
    for (const r of model.pages[p].runs ?? []) {
      if (opts.section != null && Number(r.secIdx) !== opts.section) continue;
      // 본문 문단과 셀 문단을 구분하는 완전 키(셀 런의 paraIdx는 셀-내부 번호)
      const key = `${r.secIdx}:${r.parentParaIdx ?? '-'}:${r.controlIdx ?? '-'}:${r.cellIdx ?? '-'}:${r.paraIdx}`;
      if (!byPara.has(key)) byPara.set(key, []);
      byPara.get(key)!.push(r);
    }
    for (const runs of byPara.values()) {
      runs.sort((a, b) => a.charStart - b.charStart);
      const joined = runs.map((r) => r.text).join('');
      let from = 0;
      let idx = joined.indexOf(anchor, from);
      while (idx >= 0) {
        found++;
        if (found === occurrence) {
          const segments: AnchorSegment[] = [];
          let pos = 0;
          for (const r of runs) {
            const s = pos, e = pos + r.text.length;
            const os = Math.max(idx, s), oe = Math.min(idx + anchor.length, e);
            if (os < oe) segments.push({ run: r, from: os - s, to: oe - s });
            pos = e;
          }
          if (segments.length) return { pageIndex: p, segments };
        }
        from = idx + 1;
        idx = joined.indexOf(anchor, from);
      }
    }
  }
  return null;
}

/** 텍스트 앵커 → 글자 단위 bbox(섹션 필터, n번째 매치) — 클릭 판정 등 단일 사각이 필요한 곳용 */
export function anchorRect(
  model: LayoutModel,
  anchor: string,
  opts: { section?: number; occurrence?: number } = {},
): PageRect | null {
  const m = findAnchorSegments(model, anchor, opts);
  if (!m) return null;
  let x0: number | null = null, x1 = 0, y0 = 0, y1 = 0;
  for (const { run: r, from, to } of m.segments) {
    const rx0 = r.x + (r.charX[from] ?? 0);
    const rx1 = r.x + (r.charX[to] ?? r.w);
    if (x0 == null) { x0 = rx0; x1 = rx1; y0 = r.y; y1 = r.y + r.h; }
    else { x0 = Math.min(x0, rx0); x1 = Math.max(x1, rx1); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y + r.h); }
  }
  return x0 == null ? null : { pageIndex: m.pageIndex, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * 텍스트 앵커 → **줄 단위·글자 클리핑** 사각 목록(2026-07-27) — 여러 줄로 감싸진 문장은
 * bbox(단일 사각)가 줄 전체 폭을 덮어 "긁은 글자만" 표시되지 않던 결함의 교정.
 */
export function anchorCharRects(
  model: LayoutModel,
  anchor: string,
  opts: { section?: number; occurrence?: number } = {},
): PageRect[] {
  const m = findAnchorSegments(model, anchor, opts);
  if (!m) return [];
  const rects: PageRect[] = m.segments.map(({ run: r, from, to }) => {
    const rx0 = r.x + (r.charX[from] ?? 0);
    const rx1 = r.x + (r.charX[to] ?? r.w);
    return { pageIndex: m.pageIndex, x: rx0, y: r.y, w: Math.max(rx1 - rx0, 1), h: r.h };
  });
  return mergeLineRects(rects);
}

/** 앵커 매치의 시작/끝 글자 좌표(글자 안쪽 0.5px) — 시작~끝 구간 선형 사각 계산용 */
export function anchorEdges(
  model: LayoutModel,
  anchor: string,
  opts: { section?: number; occurrence?: number } = {},
): { start: { pageIndex: number; x: number; y: number }; end: { pageIndex: number; x: number; y: number } } | null {
  const m = findAnchorSegments(model, anchor, opts);
  if (!m) return null;
  const first = m.segments[0];
  const last = m.segments[m.segments.length - 1];
  return {
    start: {
      pageIndex: m.pageIndex,
      x: first.run.x + (first.run.charX[first.from] ?? 0) + 0.5,
      y: first.run.y + first.run.h / 2,
    },
    end: {
      pageIndex: m.pageIndex,
      x: last.run.x + (last.run.charX[last.to] ?? last.run.w) - 0.5,
      y: last.run.y + last.run.h / 2,
    },
  };
}

/** 누름틀 필드 → 소속 셀 전체 사각형(사용자 결정: 셀 단위 하이라이트) */
export function fieldCellRect(model: LayoutModel, field: FieldLocation): PageRect | null {
  const loc = field.location;
  const step = loc?.path?.find((s) => s.type === 'cell');
  if (!loc || !step) return null;
  const entry = model.tables.find((t) => {
    const [sec, para, ctrl] = t.key.split(':').map(Number);
    return sec === loc.sectionIndex && para === loc.paraIndex && ctrl === (step.controlIndex ?? 0);
  });
  for (const a of entry?.appearances ?? []) {
    const c = (a.table.cells ?? []).find((c) => c.cellIdx === step.cellIndex);
    if (c) return { pageIndex: a.pageIndex, x: c.x, y: c.y, w: c.w, h: c.h };
  }
  return null;
}

export interface TargetPlacement {
  targetId: string;
  kind: Target['kind'];
  label: string;
  rects: PageRect[];
  missing: boolean;
}

/** 스펙 전체 → 페이지 배치. fields는 clickhere 셀 조인용(없으면 텍스트 앵커 폴백). */
export function mapSpecTargets(
  spec: WorkSpec,
  model: LayoutModel,
  fields: FieldLocation[] = [],
): TargetPlacement[] {
  return spec.targets.map((t) => {
    const rects = locatorRects(t.locator, model, fields);
    return {
      targetId: t.id,
      kind: t.kind,
      label: t.label ?? t.id,
      rects,
      missing: rects.length === 0,
    };
  });
}

/**
 * locator의 table.index 해석: `section`이 지정되면 **그 섹션 안에서의 순번**
 * (detect/hwpxIndex는 섹션 파일별로 0부터 셈), 없으면 문서 전역 순번.
 * 전역 모델 인덱스로 변환해 반환한다. anon(중첩) 표는 직전 식별 표의 섹션을 상속.
 */
function resolveTableIndex(model: LayoutModel, loc: Locator): number {
  if (loc.table == null) return -1;
  if (loc.section == null) return loc.table.index;
  let n = -1;
  let lastSec = -1;
  for (let i = 0; i < model.tables.length; i++) {
    const secPart = model.tables[i].key.split(':')[0];
    const sec = secPart === 'anon' ? lastSec : Number(secPart);
    lastSec = sec;
    if (sec === loc.section) {
      n++;
      if (n === loc.table.index) return i;
    }
  }
  return -1;
}

function locatorRects(loc: Locator, model: LayoutModel, fields: FieldLocation[]): PageRect[] {
  if (loc.kind === 'cell') {
    const addr = loc.cellPath?.[loc.cellPath.length - 1] ?? loc.addr;
    if (!loc.table || !addr) return [];
    const r = cellRect(model, resolveTableIndex(model, loc), addr.row, addr.col);
    return r ? [r] : [];
  }
  if (loc.kind === 'rowGroup' || loc.kind === 'cellRange') {
    if (!loc.table || !loc.rows) return [];
    return rowsRects(model, resolveTableIndex(model, loc), loc.rows[0], loc.rows[1], loc.cols);
  }
  if (loc.kind === 'table') {
    // 표 묶음(tableGroup): 표 전체를 하이라이트 — 행 수를 모르므로 넉넉한 상한을 준다
    if (!loc.table) return [];
    return rowsRects(model, resolveTableIndex(model, loc), 0, Number.MAX_SAFE_INTEGER);
  }
  if (loc.kind === 'text') {
    if (!loc.anchor) return [];
    if (loc.endAnchor) {
      // 블록(시작~끝 앵커): anchor 매치의 시작 글자 → endAnchor 매치의 끝 글자 사이를
      // 줄 단위·글자 클리핑 선형 사각으로 — 드래그 중 하이라이트와 동일(2026-07-27).
      const sEdge = anchorEdges(model, loc.anchor, { section: loc.section, occurrence: loc.occurrence });
      const eEdge = anchorEdges(model, loc.endAnchor, { section: loc.section });
      if (sEdge && eEdge && sEdge.start.pageIndex <= eEdge.end.pageIndex) {
        const rects = linearSelectionRects(
          model,
          sEdge.start.pageIndex, sEdge.start.x, sEdge.start.y,
          eEdge.end.pageIndex, eEdge.end.x, eEdge.end.y,
        );
        if (rects.length > 0) return rects;
      }
      // 폴백: 양 끝 앵커의 글자 사각
      const rs = anchorCharRects(model, loc.anchor, { section: loc.section, occurrence: loc.occurrence });
      const re = loc.endAnchor ? anchorCharRects(model, loc.endAnchor, { section: loc.section }) : [];
      if (rs.length || re.length) return [...rs, ...re];
      const r = anchorRect(model, loc.anchor, { section: loc.section, occurrence: loc.occurrence });
      return r ? [r] : [];
    }
    // 단일 앵커: 여러 줄로 감싸진 문장도 "그 글자들"만 줄 단위로 표시
    const rects = anchorCharRects(model, loc.anchor, { section: loc.section, occurrence: loc.occurrence });
    if (rects.length > 0) return rects;
    const r = anchorRect(model, loc.anchor, { section: loc.section, occurrence: loc.occurrence });
    return r ? [r] : [];
  }
  if (loc.kind === 'clickhere') {
    const f = fields.find((f) => loc.fieldId == null || String(f.fieldId) === String(loc.fieldId)) ?? fields[0];
    if (f) {
      const r = fieldCellRect(model, f);
      if (r) return [r];
      const byName = f.name ? anchorRect(model, f.name) : null;
      return byName ? [byName] : [];
    }
    return [];
  }
  return [];
}

/** 모델 전역 표 index → fill 엔진 locator 규약(섹션 + 섹션 내 순번). anon은 직전 식별 표의 섹션 상속 */
export function sectionRefOfTable(model: LayoutModel, tableIndex: number): { section: number; indexInSection: number } {
  let lastSec = 0;
  const counts = new Map<number, number>();
  let out = { section: 0, indexInSection: 0 };
  for (let i = 0; i <= tableIndex && i < model.tables.length; i++) {
    const secPart = model.tables[i].key.split(':')[0];
    const sec = secPart === 'anon' ? lastSec : Number(secPart);
    lastSec = sec;
    const n = counts.get(sec) ?? 0;
    counts.set(sec, n + 1);
    if (i === tableIndex) out = { section: sec, indexInSection: n };
  }
  return out;
}

export type HitResult =
  | {
      kind: 'cell'; tableIndex: number; row: number; col: number; rect: PageRect;
      /** fill 엔진 locator 규약(section + 섹션 내 표 순번) — 원터치 지정용 */
      section: number; sectionTableIndex: number;
    }
  | { kind: 'text'; anchor: string; endAnchor?: string; paragraphs?: number; section: number; rect: PageRect }
  | {
      /** 드래그 다중 셀 선택: 한 표 안의 교차 셀 집합 */
      kind: 'cells'; section: number; sectionTableIndex: number;
      rows: [number, number]; cells: { row: number; col: number }[]; rect: PageRect;
      /** 선택 모드 힌트(2026-07-27): 셀 모드=다행이어도 셀별 scalar로 지정 */
      preferScalars?: boolean;
      /** 선택 모드 힌트: 반복 행 모드=단일 행이어도 rowGroup으로 지정 */
      preferRowGroup?: boolean;
    }
  | null;

/** 드래그 사각형과 교차하는 셀들(최상위 표 우선, 한 표로 한정) */
export function cellsInRect(
  model: LayoutModel, pageIndex: number,
  x0: number, y0: number, x1: number, y1: number,
): Extract<HitResult, { kind: 'cells' }> | null {
  const [rx0, rx1] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [ry0, ry1] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let ti = model.tables.length - 1; ti >= 0; ti--) {
    for (const a of model.tables[ti].appearances) {
      if (a.pageIndex !== pageIndex) continue;
      const hit = (a.table.cells ?? []).filter(
        (c) => c.x < rx1 && c.x + c.w > rx0 && c.y < ry1 && c.y + c.h > ry0,
      );
      if (!hit.length) continue;
      const ref = sectionRefOfTable(model, ti);
      const rows = hit.map((c) => c.row);
      const bx0 = Math.min(...hit.map((c) => c.x));
      const by0 = Math.min(...hit.map((c) => c.y));
      return {
        kind: 'cells', section: ref.section, sectionTableIndex: ref.indexInSection,
        rows: [Math.min(...rows), Math.max(...rows)],
        cells: hit.map((c) => ({ row: c.row, col: c.col })),
        rect: {
          pageIndex, x: bx0, y: by0,
          w: Math.max(...hit.map((c) => c.x + c.w)) - bx0,
          h: Math.max(...hit.map((c) => c.y + c.h)) - by0,
        },
      };
    }
  }
  return null;
}

/**
 * 페이지 경계를 넘는 셀 드래그(2026-07-27): 표가 페이지로 나뉘어도 같은 표(section+표 순번)의
 * appearance가 페이지별로 존재하므로, 페이지별 부분 사각으로 cellsInRect를 돌려 병합한다.
 * 시작 페이지=시작점 아래 전체, 중간 페이지=전체, 끝 페이지=끝점 위 전체. x범위는 두 점의 범위.
 */
export function cellsInRectAcrossPages(
  model: LayoutModel,
  startPage: number, x0: number, y0: number,
  endPage: number, x1: number, y1: number,
): Extract<HitResult, { kind: 'cells' }> | null {
  const BIG = 1e9;
  const rx0 = Math.min(x0, x1);
  const rx1 = Math.max(x0, x1);
  let merged: Extract<HitResult, { kind: 'cells' }> | null = null;
  for (let p = startPage; p <= endPage; p++) {
    const yA = p === startPage ? y0 : -BIG;
    const yB = p === endPage ? y1 : BIG;
    const hit = cellsInRect(model, p, rx0, yA, rx1, yB);
    if (!hit) continue;
    if (!merged) {
      merged = hit;
      continue;
    }
    // 같은 표만 병합(페이지 분할 표) — 다른 표가 걸리면 첫 표 기준 유지
    if (hit.section !== merged.section || hit.sectionTableIndex !== merged.sectionTableIndex) continue;
    const seen = new Set(merged.cells.map((c) => `${c.row}:${c.col}`));
    for (const c of hit.cells) {
      if (!seen.has(`${c.row}:${c.col}`)) merged.cells.push(c);
    }
    const rows = merged.cells.map((c) => c.row);
    merged.rows = [Math.min(...rows), Math.max(...rows)];
  }
  return merged;
}

/**
 * 페이지 경계 드래그의 지정 판정(2026-07-27, SpecOverlayView·회귀 공유):
 * 크로스 페이지 스캔 y범위는 "시작점 아래 전체+끝점 위 전체"로 넓어서 셀 병합을 무조건
 * 먼저 시도하면 본문 텍스트 드래그가 경로 밖의 표에 가로채인다 — 시작·끝점이 실제로
 * 같은 표의 셀 위일 때만 셀 병합 우선, 아니면 텍스트 합성 우선(셀은 최후 폴백).
 * 입력은 문서 순서로 정렬되어 있어야 한다(startPage <= endPage).
 */
export function resolveCrossPageDrag(
  model: LayoutModel,
  startPage: number, x0: number, y0: number,
  endPage: number, x1: number, y1: number,
): HitResult {
  const startHit = hitTest(model, startPage, x0, y0);
  const endHit = hitTest(model, endPage, x1, y1);
  const bothOnSameTable =
    startHit?.kind === 'cell' && endHit?.kind === 'cell' &&
    startHit.section === endHit.section &&
    startHit.sectionTableIndex === endHit.sectionTableIndex;
  if (bothOnSameTable) {
    const cells = cellsInRectAcrossPages(model, startPage, x0, y0, endPage, x1, y1);
    if (cells && cells.cells.length > 1) return cells;
  }
  const range = textRangeAnchorAcrossPages(model, startPage, x0, y0, endPage, x1, y1);
  if (range) {
    return {
      kind: 'text', anchor: range.anchor, endAnchor: range.endAnchor,
      paragraphs: range.paragraphs, section: range.section, rect: range.rect,
    };
  }
  const cells = cellsInRectAcrossPages(model, startPage, x0, y0, endPage, x1, y1);
  return cells && cells.cells.length > 1 ? cells : null;
}

/** 런의 문단 식별 키 — textRangeAnchor·크로스 페이지 문단 집계가 공유 */
function runParaKey(r: EngineTextRun): string {
  return `${r.secIdx}:${r.parentParaIdx ?? '-'}:${r.controlIdx ?? '-'}:${r.cellIdx ?? '-'}:${r.paraIdx}`;
}

/** (x,y) 최근접 런 스냅 — textRangeAnchor와 동일 규칙(세로 이탈 가중, 60px 이내) */
function nearestRun(
  runs: EngineTextRun[], x: number, y: number,
): { r: EngineTextRun; i: number } | null {
  let best: { r: EngineTextRun; i: number; d: number } | null = null;
  runs.forEach((r, i) => {
    const dx = x < r.x ? r.x - x : x > r.x + r.w ? x - (r.x + r.w) : 0;
    const dy = y < r.y ? r.y - y : y > r.y + r.h ? y - (r.y + r.h) : 0;
    const d = dx + dy * 3;
    if (!best || d < best.d) best = { r, i, d };
  });
  return best && best.d < 60 ? best : null;
}

/**
 * 페이지 경계를 넘는 텍스트 드래그(2026-07-27): anchor=시작점이 속한 문단의 "시작점→문단 끝",
 * endAnchor=끝점이 속한 문단의 "문단 처음→끝점"으로 합성한다.
 * 페이지의 첫/마지막 런을 쓰면 짧은 표 셀 런("Ⅱ" 등 2자 미만)에 걸려 합성이 통째로
 * 실패하던 실측 결함이 있어, 드래그 지점의 문단 기준으로 계산하고 선택분이 너무 짧으면
 * 그 문단 전체 텍스트로 폴백한다. 중간 문단 수는 표시용 합산.
 */
export function textRangeAnchorAcrossPages(
  model: LayoutModel,
  startPage: number, x0: number, y0: number,
  endPage: number, x1: number, y1: number,
): { anchor: string; endAnchor?: string; section: number; rect: PageRect; paragraphs: number } | null {
  const pageRuns = (p: number) => (model.pages[p]?.runs ?? []).filter((r) => r.text.trim());
  const runsA = pageRuns(startPage);
  const runsB = pageRuns(endPage);
  if (!runsA.length || !runsB.length) return null;
  const s = nearestRun(runsA, x0, y0);
  const e = nearestRun(runsB, x1, y1);
  if (!s || !e) return null;
  const sKey = runParaKey(s.r);
  const eKey = runParaKey(e.r);
  const sortByChar = (a: EngineTextRun, b: EngineTextRun) => a.charStart - b.charStart;
  const sGroup = runsA.filter((r) => runParaKey(r) === sKey).sort(sortByChar);
  const eGroup = runsB.filter((r) => runParaKey(r) === eKey).sort(sortByChar);
  const paraText = (group: EngineTextRun[]) => group.map((r) => r.text).join('').trim();

  // 시작 문단: 시작점 → (그 문단의 페이지 내) 마지막 런 끝 — 같은 문단 선형 선택
  const sLast = sGroup[sGroup.length - 1];
  const a = textRangeAnchor(
    model, startPage, x0, y0,
    sLast.x + Math.max(sLast.w - 1, 1), sLast.y + sLast.h / 2,
  );
  let anchor = a?.anchor ?? '';
  if (anchor.length < 2) anchor = paraText(sGroup);

  // 끝 문단: (그 문단의 페이지 내) 첫 런 시작 → 끝점
  const eFirst = eGroup[0];
  const b = textRangeAnchor(
    model, endPage, eFirst.x + 1, eFirst.y + eFirst.h / 2, x1, y1,
  );
  let endAnchor = b ? (b.endAnchor ?? b.anchor) : '';
  if (endAnchor.length < 2) endAnchor = paraText(eGroup);

  if (anchor.length < 2 || endAnchor.length < 2) return null;

  // 문단 수: 시작 런 이후(시작 페이지) + 중간 페이지 전체 + 끝 런까지(끝 페이지)
  let paragraphs =
    new Set(runsA.slice(s.i).map(runParaKey)).size +
    new Set(runsB.slice(0, e.i + 1).map(runParaKey)).size;
  for (let p = startPage + 1; p < endPage; p++) {
    paragraphs += new Set(pageRuns(p).map(runParaKey)).size;
  }

  const spanned = runsA.slice(s.i);
  const bx0 = Math.min(...spanned.map((r) => r.x));
  const by0 = Math.min(...spanned.map((r) => r.y));
  const rect: PageRect = {
    pageIndex: startPage, x: bx0, y: by0,
    w: Math.max(...spanned.map((r) => r.x + r.w)) - bx0,
    h: Math.max(...spanned.map((r) => r.y + r.h)) - by0,
  };
  return { anchor, endAnchor, section: Number(s.r.secIdx) || 0, rect, paragraphs };
}

/**
 * 본문 텍스트 드래그 → **선형 선택**(문서 뷰어에서 글 긁듯 시작점~끝점 사이 전부).
 * 문단을 넘으면 anchor(시작 문단의 선택분)+endAnchor(끝 문단의 선택분) 쌍으로 반환.
 * 시작/끝점이 글자 위가 아니면 가까운 런으로 스냅(영역-드래그 느낌 보정).
 */
export function textRangeAnchor(
  model: LayoutModel, pageIndex: number,
  x0: number, y0: number, x1: number, y1: number,
): { anchor: string; endAnchor?: string; section: number; rect: PageRect; paragraphs: number } | null {
  const runs = (model.pages[pageIndex]?.runs ?? []).filter((r) => r.text.trim());
  if (!runs.length) return null;
  const keyOf = (r: EngineTextRun) => `${r.secIdx}:${r.parentParaIdx ?? '-'}:${r.controlIdx ?? '-'}:${r.cellIdx ?? '-'}:${r.paraIdx}`;
  const nearest = (x: number, y: number) => {
    let best: { r: EngineTextRun; i: number; d: number } | null = null;
    runs.forEach((r, i) => {
      const dx = x < r.x ? r.x - x : x > r.x + r.w ? x - (r.x + r.w) : 0;
      const dy = y < r.y ? r.y - y : y > r.y + r.h ? y - (r.y + r.h) : 0;
      const d = dx + dy * 3; // 세로 이탈에 더 민감(줄 스냅)
      if (!best || d < best.d) best = { r, i, d };
    });
    return best && best.d < 60 ? best : null;
  };
  // 드래그 방향과 무관하게 문서 순서(runs 배열 순)로 정렬 — 각 런에 대응하는 원래
  // 드래그 점의 x를 함께 추적한다(구 구현은 "왼쪽 점=시작 런" 휴리스틱이라 아래로
  // 내려가며 왼쪽으로 끝나는 드래그에서 시작/끝 글자가 어긋났다: 문자 중심 선택 결함)
  let s = nearest(x0, y0);
  let e = nearest(x1, y1);
  if (!s || !e) return null;
  let sX = x0;
  let eX = x1;
  if (s.i > e.i || (s.i === e.i && x0 > x1)) {
    [s, e] = [e, s];
    [sX, eX] = [eX, sX];
  }
  const charAt = (r: EngineTextRun, x: number, endSide: boolean) => {
    let i = 0;
    while (i < r.text.length - 1 && r.x + (r.charX[i + 1] ?? r.w) < x) i++;
    return endSide ? i : i;
  };
  const paraSlice = (key: string, fromRunIdx: number | null, fromChar: number, toRunIdx: number | null, toChar: number) => {
    const group = runs.filter((r) => keyOf(r) === key).sort((a, b) => a.charStart - b.charStart);
    let out = '';
    for (const r of group) {
      const gi = runs.indexOf(r);
      let t = r.text;
      if (toRunIdx != null && gi === toRunIdx) t = t.slice(0, toChar + 1);
      if (fromRunIdx != null && gi === fromRunIdx) t = t.slice(fromChar);
      if (fromRunIdx != null && gi < fromRunIdx) t = '';
      if (toRunIdx != null && gi > toRunIdx) t = '';
      out += t;
    }
    return out.trim();
  };
  const sKey = keyOf(s.r);
  const eKey = keyOf(e.r);
  const sChar = charAt(s.r, sX, false);
  const eChar = charAt(e.r, eX, true);
  const paraKeys = new Set<string>();
  for (let i = s.i; i <= e.i; i++) paraKeys.add(keyOf(runs[i]));
  const spanned = runs.slice(s.i, e.i + 1);
  const bx0 = Math.min(...spanned.map((r) => r.x));
  const by0 = Math.min(...spanned.map((r) => r.y));
  const rect: PageRect = {
    pageIndex, x: bx0, y: by0,
    w: Math.max(...spanned.map((r) => r.x + r.w)) - bx0,
    h: Math.max(...spanned.map((r) => r.y + r.h)) - by0,
  };
  if (sKey === eKey) {
    const anchor = paraSlice(sKey, s.i, sChar, e.i, eChar);
    if (anchor.length < 2) return null;
    return { anchor, section: Number(s.r.secIdx) || 0, rect, paragraphs: 1 };
  }
  const anchor = paraSlice(sKey, s.i, sChar, null, 0);
  const endAnchor = paraSlice(eKey, null, 0, e.i, eChar);
  if (anchor.length < 2 || endAnchor.length < 2) return null;
  return { anchor, endAnchor, section: Number(s.r.secIdx) || 0, rect, paragraphs: paraKeys.size };
}

/** 클릭 좌표 → 지정 제안(셀 우선, 없으면 텍스트 런). 원터치 타깃 지정의 기반. */
export function hitTest(model: LayoutModel, pageIndex: number, x: number, y: number): HitResult {
  // 셀: 나중에 그려진(중첩) 표가 우선하도록 역순 검사
  for (let ti = model.tables.length - 1; ti >= 0; ti--) {
    const entry = model.tables[ti];
    for (const a of entry.appearances) {
      if (a.pageIndex !== pageIndex) continue;
      for (const c of a.table.cells ?? []) {
        if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
          const ref = sectionRefOfTable(model, ti);
          return {
            kind: 'cell', tableIndex: ti, row: c.row, col: c.col,
            rect: { pageIndex, x: c.x, y: c.y, w: c.w, h: c.h },
            section: ref.section, sectionTableIndex: ref.indexInSection,
          };
        }
      }
    }
  }
  for (const r of model.pages[pageIndex]?.runs ?? []) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h && r.text.trim()) {
      return {
        kind: 'text', anchor: r.text, section: Number(r.secIdx) || 0,
        rect: { pageIndex, x: r.x, y: r.y, w: r.w, h: r.h },
      };
    }
  }
  return null;
}

/**
 * 텍스트 전용 클릭 히트(2026-07-27, 텍스트 선택 모드): 표 셀 우선 규칙 없이 텍스트 런만.
 * 정확히 글자 위가 아니어도 가까운 런으로 스냅(nearestRun과 동일 규칙).
 */
export function textHitAt(
  model: LayoutModel, pageIndex: number, x: number, y: number,
): Extract<HitResult, { kind: 'text' }> | null {
  const runs = (model.pages[pageIndex]?.runs ?? []).filter((r) => r.text.trim());
  const hit = nearestRun(runs, x, y);
  if (!hit) return null;
  const r = hit.r;
  return {
    kind: 'text', anchor: r.text, section: Number(r.secIdx) || 0,
    rect: { pageIndex, x: r.x, y: r.y, w: r.w, h: r.h },
  };
}

/** 런 안에서 x가 가리키는 글자 경계의 픽셀 오프셋(런 x 기준) — 시작=글자 앞, 끝=글자 뒤 */
function charOffsetAt(r: EngineTextRun, x: number, endSide: boolean): number {
  let i = 0;
  while (i < r.text.length - 1 && r.x + (r.charX[i + 1] ?? r.w) < x) i++;
  if (endSide) return r.charX[i + 1] ?? r.w;
  // 시작 측: 점이 글자 중앙을 넘었으면 다음 글자부터(브라우저 캐럿 스냅 느낌)
  return r.charX[i] ?? 0;
}

/**
 * 텍스트 커서식 선형 선택 하이라이트(2026-07-27): 시작점~현재점 사이의 런들을
 * (페이지, 줄) 단위로 병합한 사각 목록으로 반환. **문자 중심** — 첫 줄은 드래그 시작
 * 글자부터, 끝 줄은 끝 글자까지만 칠한다(브라우저 텍스트 선택과 동일, charX 기반).
 * 입력은 문서 순서(startPage <= endPage) 정렬 전제(같은 페이지 역방향은 내부 정규화).
 */
export function linearSelectionRects(
  model: LayoutModel,
  startPage: number, x0: number, y0: number,
  endPage: number, x1: number, y1: number,
): PageRect[] {
  const pageRuns = (p: number) => (model.pages[p]?.runs ?? []).filter((r) => r.text.trim());
  const runsA = pageRuns(startPage);
  const runsB = pageRuns(endPage);
  const s = nearestRun(runsA, x0, y0);
  const e = nearestRun(runsB, x1, y1);
  if (!s || !e) return [];

  // 문서 순 정렬 + 각 끝점의 원래 x 추적(문자 클리핑용)
  let sIdx = s.i;
  let eIdx = e.i;
  let sPx = x0;
  let ePx = x1;
  if (startPage === endPage && (sIdx > eIdx || (sIdx === eIdx && x0 > x1))) {
    [sIdx, eIdx] = [eIdx, sIdx];
    [sPx, ePx] = [ePx, sPx];
  }

  const flat: Array<{ pageIndex: number; r: EngineTextRun }> = [];
  if (startPage === endPage) {
    runsA.slice(sIdx, eIdx + 1).forEach((r) => flat.push({ pageIndex: startPage, r }));
  } else {
    runsA.slice(sIdx).forEach((r) => flat.push({ pageIndex: startPage, r }));
    for (let p = startPage + 1; p < endPage; p++) {
      pageRuns(p).forEach((r) => flat.push({ pageIndex: p, r }));
    }
    runsB.slice(0, eIdx + 1).forEach((r) => flat.push({ pageIndex: endPage, r }));
  }
  if (flat.length === 0) return [];

  // 런 → 사각(첫/끝 런은 글자 오프셋으로 클리핑)
  const runRects: PageRect[] = flat.map((item, idx) => {
    const r = item.r;
    let x = r.x;
    let right = r.x + r.w;
    if (idx === 0) x = r.x + charOffsetAt(r, sPx, false);
    if (idx === flat.length - 1) right = r.x + charOffsetAt(r, ePx, true);
    return {
      pageIndex: item.pageIndex,
      x, y: r.y, w: Math.max(right - x, 1), h: r.h,
    };
  });

  return mergeLineRects(runRects);
}

/** 같은 페이지에서 y가 비슷한(같은 줄) 사각들을 한 사각으로 병합 — 선형 선택 표시 공용 */
function mergeLineRects(rects: PageRect[]): PageRect[] {
  const out: PageRect[] = [];
  let line: PageRect | null = null;
  for (const r of rects) {
    if (line && line.pageIndex === r.pageIndex && Math.abs(r.y - line.y) < Math.max(line.h, r.h) * 0.6) {
      const x2 = Math.max(line.x + line.w, r.x + r.w);
      line.x = Math.min(line.x, r.x);
      line.w = x2 - line.x;
      line.y = Math.min(line.y, r.y);
      line.h = Math.max(line.h, r.h);
    } else {
      if (line) out.push(line);
      line = { ...r };
    }
  }
  if (line) out.push(line);
  return out;
}

/**
 * 페이지 SVG의 id 네임스페이스화. renderPageSvg는 모든 페이지에 같은 id 체계
 * (body-clip-3, cell-clip-N …)를 쓰므로, 여러 페이지를 한 DOM에 인라인하면
 * clip-path url(#id)가 다른 페이지의 클립 사각형을 참조해 텍스트가 잘려 사라진다
 * (실측: 단독 렌더 p17 완전 ↔ 다페이지 인라인 시 소실). 반드시 페이지별 접두를 붙인다.
 */
export function namespaceSvgIds(svg: string, prefix: string): string {
  return svg
    .replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${prefix}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${prefix}-${id})`)
    .replace(/(xlink:href|href)="#([^"]+)"/g, (_m, attr: string, id: string) => `${attr}="#${prefix}-${id}"`);
}

export const KIND_COLORS: Record<Target['kind'], string> = {
  scalar: '#2563eb', choice: '#d97706', prose: '#7c3aed',
  rowGroup: '#0d9488', tableGroup: '#0891b2', computed: '#dc2626', keep: '#64748b',
  personTeacher: '#059669', personStudent: '#db2777',
};
