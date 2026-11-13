// 오버레이 hit(셀/다중 셀/텍스트) → 스펙 타깃 변환 — SpecStudio(양식 만들기)와
// 러너의 시각 검수 단계가 공유하는 순수 헬퍼.
// 자동 부여 라벨은 autoLabel=true(AI 보완이 교체 가능, 사람 수정 시 해제).
import { type Target, type WorkSpec } from '../document/spec';
import type { HwpxIndex, TableNode } from '../document/spec/hwpxIndex';
import type { HitResult } from '../document/spec/overlayMap';
import { repeatReplacementRange } from '../document/spec/repeatRegion';

/**
 * 복제 원본 행 선택: 지정 열이 모두 있으면서 **문단 수가 가장 적은** 행.
 * 문단이 많은 행을 원본으로 쓰면 구조가 복잡해 예기치 않은 서식이 따라온다
 * (빈 줄 자체는 채움 단계의 editsSetCellSingleValue가 제거한다).
 */
function pickRowTemplate(
  table: TableNode | undefined, r0: number, r1: number, cols: number[],
): number | undefined {
  if (!table) return undefined;
  let best = -1;
  let bestParas = Infinity;
  for (let r = r0; r <= r1 && r < table.rows.length; r++) {
    const cells = table.rows[r]?.cells ?? [];
    if (!cols.every((c) => cells.some((x) => x.addr.col === c))) continue;
    const n = cells.reduce((s, c) => s + c.paragraphs.length, 0);
    if (n < bestParas) { bestParas = n; best = r; }
  }
  return best < 0 ? undefined : best - r0;
}

export interface DesignateResult {
  targets: Target[];
  nextSeq: number;
  selectId: string;
}

/**
 * 다음 pick 번호를 현재 스펙에서 유도 — 카운터를 컴포넌트 상태로 두면
 * 모달 재마운트 시 리셋되어 기존 pick-N과 id가 충돌한다(중복 key 버그의 원인).
 */
export function nextPickSeq(targets: Target[], min = 1000): number {
  let max = min - 1;
  for (const t of targets) {
    // 구형(pick-N)·신형(pickN) 둘 다 인식 — 신형은 수식 언어 식별자 제약 준수를 위해 하이픈 제거
    const m = /^pick-?(\d+)$/.exec(t.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export interface DesignateContext {
  /** 지정 대상 표 — 복제 원본 행 선택에 쓰인다 */
  table?: TableNode;
  xml?: string;
}

/**
 * 지정 통합 헬퍼: 번호를 현재 스펙에서 유도하고(재마운트 안전), 다행 드래그면
 * 파싱 인덱스로 반복 원본과 기존 예시 대체 구간을 구한다. 열 지침은 빈칸으로 둔다.
 */
export function designateFromHit(
  hit: NonNullable<HitResult>, spec: WorkSpec, indexes: HwpxIndex[],
): DesignateResult {
  let table: TableNode | undefined;
  if (hit.kind === 'cells' && (hit.rows[1] > hit.rows[0] || hit.preferRowGroup)) {
    table = indexes[hit.section]?.tables.find((tb) => tb.index === hit.sectionTableIndex);
  }
  return targetsFromHit(hit, nextPickSeq(spec.targets), { table, xml: indexes[hit.section]?.xml });
}

/**
 * 영역 재지정: 기존 타깃의 id·라벨·작성 지침·유형은 유지하고 locator만 새 hit로 교체.
 * - rowGroup 타깃 ← 셀 드래그(다행/단일행): rows·cols 교체 + rowSchema는 같은 열 번호의
 *   지침을 보존하고 새 열의 지침은 비워 둔다(사라진 열은 제거). rowSource는 유지.
 * - 그 외 타깃 ← 단일 셀 또는 텍스트: locator만 교체(다중 셀 드래그는 오지정 방지 위해 거부).
 */
export function reassignTargetLocator(
  target: Target, hit: NonNullable<HitResult>, indexes: HwpxIndex[],
): { target: Target; error?: undefined } | { target?: undefined; error: string } {
  if (target.kind === 'rowGroup') {
    if (hit.kind !== 'cells') {
      return { error: '반복 행 타깃은 표에서 행 범위를 드래그해 재지정하세요.' };
    }
    const [r0, r1] = hit.rows;
    const cols = [...new Set(hit.cells.map((c) => c.col))].sort((a, b) => a - b);
    const table = indexes[hit.section]?.tables.find((tb) => tb.index === hit.sectionTableIndex);
    const [d0, d1] = [r0, r1];
    const prevSchema = (target as Target & { rowSchema?: Array<{ col: number; instruction?: string; kind: string; source?: string; formula?: string }> }).rowSchema ?? [];
    const prevByCol = new Map(prevSchema.map((c) => [c.col, c]));
    const rowSchema = cols.map((col) => {
      const prev = prevByCol.get(col);
      if (prev) return prev;
      return { col, kind: 'scalar' as const, source: `row.c${col}` };
    });
    return {
      target: {
        ...target,
        repeatUnit: 'block',
        replaceRows: table ? repeatReplacementRange(indexes[hit.section].xml, table, [r0, r1], cols) : undefined,
        rowSchema,
        rowTemplate: pickRowTemplate(table, d0, d1, cols),
        locator: {
          kind: 'rowGroup', section: hit.section,
          table: { index: hit.sectionTableIndex }, rows: [d0, d1], cols,
        },
      } as Target,
    };
  }

  if (hit.kind === 'cells') {
    if (hit.cells.length === 1) {
      const c = hit.cells[0];
      return {
        target: {
          ...target,
          locator: {
            kind: 'cell', section: hit.section,
            table: { index: hit.sectionTableIndex }, addr: { row: c.row, col: c.col },
          },
        } as Target,
      };
    }
    return { error: '이 타깃은 셀 하나 또는 텍스트로 재지정하세요(여러 셀 드래그는 반복 행 전용).' };
  }
  if (hit.kind === 'cell') {
    return {
      target: {
        ...target,
        locator: {
          kind: 'cell', section: hit.section,
          table: { index: hit.sectionTableIndex }, addr: { row: hit.row, col: hit.col },
        },
      } as Target,
    };
  }
  return {
    target: {
      ...target,
      locator: { kind: 'text', section: hit.section, anchor: hit.anchor, endAnchor: hit.endAnchor },
    } as Target,
  };
}

/**
 * 원터치 지정: 셀 드래그 다행=반복 행 그룹 1개 / 한 행=셀별 scalar / 텍스트=단답·서술 블록.
 * 선택 모드 힌트(2026-07-27): `preferScalars`=다행 드래그도 셀별 scalar(셀 선택 모드),
 * `preferRowGroup`=단일 행도 rowGroup(반복 행 선택 모드).
 */
export function targetsFromHit(
  hit: NonNullable<HitResult>, seq: number, ctx?: DesignateContext,
): DesignateResult {
  if (hit.kind === 'cells') {
    const [r0, r1] = hit.rows;
    if (hit.preferRowGroup || (r1 > r0 && !hit.preferScalars)) {
      const id = `pick${seq}`;
      const [d0, d1] = [r0, r1];
      // 드래그가 가진 열 정보를 보존: locator.cols(정확한 하이라이트) +
      // rowSchema 자동 시드(plan 스키마·fill·AI 맥락의 재료). 필드 키는 수식 언어
      // 식별자 제약(한글 불가)으로 c<col>을 쓰고, 의미는 instruction(헤더 라벨)이 담당.
      const cols = [...new Set(hit.cells.map((c) => c.col))].sort((a, b) => a - b);
      // plan 키는 식별자 문자만 허용(plan 참조 정규식·수식 언어가 하이픈을 못 읽음 —
      // 'plan.pick-1000Rows'는 'pick'으로 오파싱되어 rowSource 해석이 깨진다)
      const planKey = `${id.replace(/[^A-Za-z0-9_]/g, '')}Rows`;
      return {
        nextSeq: seq + 1,
        selectId: id,
        targets: [{
          id, kind: 'rowGroup', repeatUnit: 'block', required: true, confirmRequired: true,
          replaceRows: ctx?.table && ctx.xml ? repeatReplacementRange(ctx.xml, ctx.table, [r0, r1], cols) : undefined,
          label: `행 ${d0}–${d1}`, autoLabel: true,
          evidence: `드래그 다중 셀(${hit.cells.length}개, ${cols.length}열) · 선택 영역 전체 반복`,
          rowSource: `plan.${planKey}`,
          rowTemplate: pickRowTemplate(ctx?.table, d0, d1, cols),
          rowSchema: cols.map((col) => ({
            col, kind: 'scalar' as const, source: `row.c${col}`,
          })),
          locator: {
            kind: 'rowGroup', section: hit.section,
            table: { index: hit.sectionTableIndex }, rows: [d0, d1], cols,
          },
        } as Target],
      };
    }
    const targets: Target[] = hit.cells.map((c, i) => ({
      id: `pick${seq + i}`, kind: 'scalar', required: true,
      label: `셀(${c.row},${c.col})`, autoLabel: true, evidence: '드래그 셀 묶음',
      locator: {
        kind: 'cell', section: hit.section,
        table: { index: hit.sectionTableIndex }, addr: { row: c.row, col: c.col },
      },
    } as Target));
    return { targets, nextSeq: seq + targets.length, selectId: targets[targets.length - 1].id };
  }

  const id = `pick${seq}`;
  const target: Target =
    hit.kind === 'cell'
      ? ({
          id, kind: 'scalar', required: true,
          label: `셀(${hit.row},${hit.col})`, autoLabel: true, evidence: '화면에서 셀 지정',
          locator: {
            kind: 'cell', section: hit.section,
            table: { index: hit.sectionTableIndex },
            addr: { row: hit.row, col: hit.col },
          },
        } as Target)
      : ({
          id,
          // 여러 문단 블록 선택 = 서술 구역, 한 문단 = 단답
          kind: hit.endAnchor ? 'prose' : 'scalar',
          required: true,
          label: hit.anchor.trim().slice(0, 16) + (hit.endAnchor ? ` 외 ${hit.paragraphs ?? 2}문단` : ''),
          autoLabel: true,
          evidence: hit.endAnchor ? '드래그 텍스트 블록' : '화면에서 텍스트 지정',
          locator: { kind: 'text', section: hit.section, anchor: hit.anchor, endAnchor: hit.endAnchor },
        } as Target);
  return { targets: [target], nextSeq: seq + 1, selectId: id };
}
