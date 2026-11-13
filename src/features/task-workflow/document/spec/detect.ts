// detect: 문서에서 스펙 초안을 "제안"한다. 확정은 사람(confirm)의 몫.
// 일반화 원칙: 특정 양식의 문자열·구조 지식 금지. 아래 CONVENTIONS는
// 한국 공문 일반 관습(체크박스·연번·합계·예시 표기)이며 호출측이 교체 가능하다.

import type { ChoiceOption, Locator, Target, WorkSpec } from './types';
import { type CellNode, type HwpxIndex, parseHwpxSection, type TableNode } from './hwpxIndex';

export interface DetectConventions {
  marks: string[];
  exampleTokens: string[];
  totalLabels: string[];
  /** 더미 전화 패턴(그룹 전체가 같은 숫자 반복이면 자리표시자로 간주) */
  phoneRe: RegExp;
  parenBlankRe: RegExp;
  underscoreRe: RegExp;
  bracketTokenRe: RegExp;
  maxLabelLen: number;
}

export const DEFAULT_CONVENTIONS: DetectConventions = {
  marks: ['□', '■', '☑', '☐'],
  exampleTokens: ['예시)', '(예시)', '<예시>', '＜예시＞'],
  totalLabels: ['합계', '총계', '소계'],
  phoneRe: /0\d{1,2}-(\d{3,4})-(\d{4})/g,
  parenBlankRe: /\(\s{2,}\)/,
  underscoreRe: /_{3,}/,
  bracketTokenRe: /\[([가-힣A-Za-z0-9 ]{1,12})\]/,
  maxLabelLen: 24,
};

export interface DetectResult {
  draft: WorkSpec;
  /** MEMO 필드 등에서 추출한 작성 지침 */
  instructions: string[];
  stats: Record<string, number>;
}

let seq = 0;
const nid = (p: string) => `${p}-${++seq}`;

/** 체크된/비어 있는 마크 후보(관습). conv.marks에 포함된 것만 쓴다. */
const CHECKED_MARKS = ['☑', '■'];
const UNCHECKED_MARKS = ['□', '☐'];

/**
 * 체크박스 그룹에서 선택지·마크쌍을 유도한다(2026-07-27 공용화).
 *
 * `options`가 비면 엔진이 선택지를 찾지 못해 `skipped: no selection`으로 건너뛰고
 * 문서에 아무 표시가 남지 않는다(실측). 탐지 경로와 **사람이 유형을 택일로 바꾸는
 * 경로**가 같은 규칙을 쓰도록 여기 한 곳에 둔다.
 *
 * 마크쌍은 문서에서 관찰한다 — 양식이 □/☑를 쓰는지 □/■를 쓰는지는 문서마다 다르고,
 * 틀리면 체크 표시만 이질적으로 남는다. 지정 구역에 이미 쓰인 마크가 1순위, 없으면
 * 문서 전체에서 가장 많이 쓰인 마크, 그것도 없으면 엔진 기본값(□/■).
 */
export function deriveChoiceOptions(
  regionText: string,
  docText = '',
  conv: DetectConventions = DEFAULT_CONVENTIONS,
): { options: ChoiceOption[]; mark: { unchecked: string; checked: string } } | null {
  const marks = conv.marks;
  if ([...regionText].filter((ch) => marks.includes(ch)).length < 2) return null;
  const re = new RegExp(`[${marks.join('')}]\\s*([^${marks.join('')}\\n]{1,30})`, 'g');
  const options: ChoiceOption[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(regionText))) {
    const label = m[1].trim();
    if (label) options.push({ label });
  }
  if (options.length < 2) return null;

  const count = (s: string, ch: string) => s.split(ch).length - 1;
  const pick = (cands: string[], fallback: string) =>
    cands
      .filter((c) => marks.includes(c))
      // 지역(지정 구역) 관습이 문서 전체 관습을 이긴다
      .map((c) => ({ c, n: count(regionText, c) * 1e6 + count(docText, c) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)[0]?.c ?? fallback;
  return { options, mark: { unchecked: pick(UNCHECKED_MARKS, '□'), checked: pick(CHECKED_MARKS, '■') } };
}

export function detectSpecDraft(
  sections: string[],
  documentType: string,
  conv: DetectConventions = DEFAULT_CONVENTIONS,
): DetectResult {
  seq = 0;
  const indexes = sections.map(parseHwpxSection);
  const targets: Target[] = [];
  const instructions: string[] = [];
  const stats: Record<string, number> = {};
  const bump = (k: string) => { stats[k] = (stats[k] ?? 0) + 1; };
  const claimed = new Set<CellNode>();

  const isMark = (ch: string) => conv.marks.includes(ch);
  const fp = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 48);

  indexes.forEach((idx, si) => {
    // 누름틀 내부 텍스트: 같은 문자열을 텍스트 앵커로 이중 제안하면
    // fill에서 두 타깃이 같은 구간을 써 overlapping edits로 실패한다 — 앵커 제안 억제용
    const clickTexts: string[] = [];
    const inClickField = (s: string) => !!s && clickTexts.some((c) => c.includes(s));

    // MEMO/CLICK_HERE 필드
    for (const f of idx.fields) {
      if (f.type === 'MEMO' && f.innerText.trim()) {
        instructions.push(f.innerText.trim());
        bump('memo');
      }
      if (f.type === 'CLICK_HERE') {
        targets.push({
          id: nid('field'), kind: 'scalar', required: true, detector: 'clickhere',
          locator: { kind: 'clickhere', section: si, fieldId: f.fieldId },
          label: f.innerText.slice(0, 20) || undefined,
          evidence: `누름틀(${f.innerText.slice(0, 20)})`,
        });
        if (f.innerText.trim()) clickTexts.push(f.innerText);
        bump('clickhere');
      }
    }

    for (const table of idx.tables) {
      const cellLoc = (cell: CellNode, tbl: TableNode): Locator => ({
        kind: 'cell', section: si,
        table: { index: tbl.index, fingerprint: fp(tbl.headerFingerprint) },
        addr: cell.addr, fingerprint: cell.text ? fp(cell.text) : undefined,
      });

      // 연번 열 기반 rowGroup + 합계/산식 셀.
      // 연번만으로는 부족 — "1..N 항목 나열형 표"(각 행이 서로 다른 라벨-값)를
      // 반복 데이터 그룹으로 오인하지 않도록 행 구조 균질성(셀 수 동형)을 요구한다.
      const numbered: number[] = [];
      table.rows.forEach((r, ri) => {
        const c0 = r.cells.find((c) => c.addr.col === 0);
        if (c0 && /^\d{1,3}$/.test(c0.text.trim()) && Number(c0.text.trim()) === numbered.length + 1) numbered.push(ri);
        else if (numbered.length && Number(c0?.text.trim()) !== numbered.length + 1 && numbered.length < 2) numbered.length = 0;
      });
      const homogeneous = (() => {
        if (numbered.length < 2) return false;
        const counts = numbered.map((ri) => table.rows[ri].cells.length);
        const mode = counts.sort((x, y) => counts.filter((v) => v === x).length - counts.filter((v) => v === y).length).pop()!;
        return counts.filter((c) => c === mode).length / counts.length >= 0.8 && mode >= 2;
      })();
      if (numbered.length >= 2 && homogeneous) {
        const rowsRange: [number, number] = [numbered[0], numbered[numbered.length - 1]];
        const rgId = nid('rows');
        // 열 자동 시드: 데이터 첫 행의 실제 열들로 rowSchema 생성 — 연번 열(0)은 자동
        // 번호, 나머지는 row.c<col>. 열 지침은 직접 입력·AI 보완 전까지 비워 두고 편집기가 빈 채로
        // 열리지 않게 하고, rowSource도 식별자-안전 키로.
        const headerRowIdx = rowsRange[0] > 0 ? rowsRange[0] - 1 : undefined;
        const dataCols = [...new Set(table.rows[rowsRange[0]].cells.map((c) => c.addr.col))].sort((x, y) => x - y);
        const seededSchema = dataCols.map((col) => {
          if (col === 0) return { col, kind: 'scalar' as const, source: 'row.__index1' };
          return { col, kind: 'scalar' as const, source: `row.c${col}` };
        });
        targets.push({
          id: rgId, kind: 'rowGroup', repeatUnit: 'row', confirmRequired: true, detector: 'rowGroup',
          rowSource: `plan.${rgId.replace(/[^A-Za-z0-9_]/g, '')}Rows`, rowSchema: seededSchema,
          locator: {
            kind: 'rowGroup', section: si,
            table: { index: table.index, fingerprint: fp(table.headerFingerprint) },
            rows: rowsRange, cols: dataCols,
            headerRow: headerRowIdx,
          },
          evidence: `연번 열 1..${numbered.length}`,
        } as Target);
        bump('rowGroup');
        for (const ri of numbered) for (const c of table.rows[ri].cells) claimed.add(c);
      }
      for (const r of table.rows) {
        const hasTotal = r.cells.some((c) => conv.totalLabels.some((t) => c.text.trim().startsWith(t)));
        if (hasTotal) {
          for (const c of r.cells) {
            if (!c.text.trim() && !claimed.has(c)) {
              // 합계는 단답으로 제안 — computed는 수식·참조 지정 부담이 커서 기본 경로에서
              // 제외(plan LLM이 행 데이터와 함께 파생 값을 계산, 사람이 계획 검토에서 확인)
              targets.push({
                id: nid('total'), kind: 'scalar', valueType: 'number', required: true,
                confirmRequired: true, detector: 'computed',
                locator: cellLoc(c, table), evidence: '합계 행의 빈 셀',
                instruction: '위 행들의 합계 금액(행 데이터와 일치하게 계산)',
              } as Target);
              claimed.add(c);
              bump('computed');
            }
          }
        }
      }

      const cells = table.rows.flatMap((r) => r.cells);
      for (const cell of cells) {
        if (claimed.has(cell)) continue;
        const text = cell.text.trim();

        // 체크박스 그룹
        const markCount = [...text].filter(isMark).length;
        if (markCount >= 2) {
          const derived = deriveChoiceOptions(text, idx.fullText, conv);
          if (derived) {
            targets.push({
              id: nid('choice'), kind: 'choice', options: derived.options, mark: derived.mark,
              exclusive: true, required: true, detector: 'choice',
              locator: cellLoc(cell, table),
              evidence: `마크 ${markCount}개: ${derived.options.map((o) => o.label).join('/')}`,
            } as Target);
            claimed.add(cell);
            bump('choice');
            continue;
          }
        }

        // 괄호/밑줄 자리표시자
        if (conv.parenBlankRe.test(text) || conv.underscoreRe.test(text)) {
          const anchorM = conv.parenBlankRe.exec(text) ?? conv.underscoreRe.exec(text);
          if (inClickField(anchorM![0])) continue;
          targets.push({
            id: nid('blank'), kind: 'scalar', required: true, detector: 'placeholder',
            locator: { kind: 'text', section: si, anchor: anchorM![0], occurrence: occurrenceOf(idx.fullText, anchorM![0], text) },
            template: text.includes('(') ? undefined : undefined,
            label: text.slice(0, conv.maxLabelLen),
            evidence: `자리표시자: ${text.slice(0, 30)}`,
          } as Target);
          bump('placeholder');
          continue;
        }

        // 더미 전화
        conv.phoneRe.lastIndex = 0;
        const pm = conv.phoneRe.exec(text);
        if (pm && !inClickField(pm[0]) && isRepeatedDigits(pm[1]) && isRepeatedDigits(pm[2])) {
          targets.push({
            id: nid('phone'), kind: 'scalar', valueType: 'phone', required: true, detector: 'dummyPhone',
            locator: { kind: 'text', section: si, anchor: pm[0] },
            evidence: `더미 전화: ${pm[0]}`,
          } as Target);
          bump('dummyPhone');
          continue;
        }

        // 예시 토큰
        // 중첩 표를 담은 컨테이너 셀은 셀-전체 쓰기 제안 금지: 내부 표 타깃과
        // 편집 범위가 겹쳐 fill이 실패한다(체크박스 마크 교체 등 문자 단위는 무관)
        const hasNestedTable = cell.tables.length > 0;

        if (!hasNestedTable && conv.exampleTokens.some((tk) => text.includes(tk))) {
          targets.push({
            id: nid('example'), kind: 'prose', confirmRequired: true, detector: 'example',
            locator: cellLoc(cell, table),
            instruction: '예시 내용을 실제 내용으로 대체',
            evidence: `예시 표기: ${text.slice(0, 40)}`,
          } as Target);
          bump('example');
          continue;
        }

        // 라벨-값 기하: 빈 셀 — 이웃/행·열 헤더에서 라벨 후보를 찾되,
        // 데이터성 텍스트("9월 3주" 등)는 라벨로 쓰지 않고 비워 AI 보완 대상으로 둔다
        if (!text && !hasNestedTable) {
          const cand = headerLabel(table, cell, conv.maxLabelLen);
          if (cand.found) {
            targets.push({
              id: nid('value'), kind: 'scalar', required: true, detector: 'emptyValue',
              locator: cellLoc(cell, table),
              label: cand.label || undefined,
              confirmRequired: !cand.label,
              evidence: cand.label
                ? `헤더 "${cand.label}" 기준 빈 셀`
                : `빈 셀(이웃 "${cand.raw.slice(0, 16)}"는 데이터성 — 라벨 미지정)`,
            } as Target);
            bump('emptyValue');
          }
        }
      }
    }

    // 표 밖 문단: 괄호 공백·밑줄·브래킷 토큰
    for (const p of idx.topParagraphs) {
      const text = p.text;
      const pb = conv.parenBlankRe.exec(text);
      if (pb && !inClickField(pb[0])) {
        targets.push({
          id: nid('blank'), kind: 'scalar', required: true, detector: 'placeholder',
          locator: { kind: 'text', section: si, anchor: pb[0] },
          label: text.slice(0, conv.maxLabelLen),
          evidence: `본문 자리표시자: ${text.slice(0, 30)}`,
        } as Target);
        bump('placeholder');
      }
      const bt = conv.bracketTokenRe.exec(text);
      if (bt && !inClickField(bt[1])) {
        targets.push({
          id: nid('token'), kind: 'scalar', confirmRequired: true, detector: 'bracketToken',
          locator: { kind: 'text', section: si, anchor: bt[1], position: 'replace' },
          label: bt[1],
          evidence: `브래킷 토큰 [${bt[1]}]`,
        } as Target);
        bump('bracketToken');
      }
      const wide = /:\s{4,}/.exec(text);
      if (wide && !pb && !inClickField(wide[0])) {
        targets.push({
          id: nid('blank'), kind: 'scalar', confirmRequired: true, detector: 'labelBlank',
          locator: { kind: 'text', section: si, anchor: wide[0], position: 'after' },
          label: text.slice(0, conv.maxLabelLen),
          evidence: `라벨 뒤 공백란: ${text.slice(0, 30)}`,
        } as Target);
        bump('labelBlank');
      }
    }
  });

  const draft: WorkSpec = {
    specVersion: 1,
    documentType,
    // 탐지 라벨은 전부 휴리스틱 추정 — autoLabel로 표시해 AI 보완이 교체할 수 있게 한다(사람 수정 시 해제)
    targets: targets.map((t) => (t.label ? ({ ...t, autoLabel: true } as Target) : t)),
    // `residualPatterns` 는 더 이상 시드하지 않는다(2026-09-03) — 잔여물 검사 폐지.
    // 자동 추측이라 실제 양식에서 문서의 정상 내용을 패턴으로 잡았고, 지울 화면도 없었다.
    constraints: [{ kind: 'all-required-filled' }],
  };
  return { draft, instructions, stats };
}

function isRepeatedDigits(s: string): boolean {
  return /^(\d)\1+$/.test(s);
}

function occurrenceOf(fullText: string, needle: string, containing: string): number {
  // fullText에서 containing 블록 이전에 등장한 needle 수 + 1
  const at = fullText.indexOf(containing);
  if (at < 0) return 1;
  let n = 0;
  let i = fullText.indexOf(needle);
  while (i >= 0 && i < at) { n++; i = fullText.indexOf(needle, i + 1); }
  return n + 1;
}

/** 데이터성 텍스트 판정 — 라벨로 부적합(숫자·날짜·주차·괄호묶음 등) */
function isNoisyLabel(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^[\d\s.,~\-–()/]+$/.test(t)) return true;
  if (/\d+\s*월|\d+\s*주|^\(.+\)$|학기$|^\d+[.)]/.test(t)) return true;
  return false;
}

/** 빈 셀의 라벨 후보: 왼쪽·위 이웃 → 열 헤더(0행) → 행 헤더(0열) 순. 노이즈면 라벨 비움 */
function headerLabel(table: TableNode, cell: CellNode, maxLen: number): { found: boolean; label: string; raw: string } {
  const at = cell.addr;
  const all = table.rows.flatMap((r) => r.cells);
  const left = all.find((c) => c.addr.row === at.row && c.addr.col + c.span.cols === at.col);
  const up = all.find((c) => c.addr.col === at.col && c.addr.row + c.span.rows === at.row);
  const colHeader = all.find((c) => c.addr.col === at.col && c.addr.row === 0 && c !== cell);
  const rowHeader = all.find((c) => c.addr.row === at.row && c.addr.col === 0 && c !== cell);
  const cands = [left, up, colHeader, rowHeader]
    .filter((c): c is CellNode => !!c)
    .map((c) => c.text.trim())
    .filter(Boolean);
  if (!cands.length) return { found: false, label: '', raw: '' };
  const good = cands.find((t) => t.length <= maxLen && !isNoisyLabel(t));
  return { found: true, label: good ?? '', raw: cands[0] };
}
