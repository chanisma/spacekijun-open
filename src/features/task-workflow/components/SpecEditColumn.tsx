// 스펙 편집 우측 컬럼(공용): 탐지 기준 칩(자동 제안 토글) + AI 라벨 보완 + 타깃 패널.
// SpecStudio(hwpx-editor 양식 만들기)와 스펙 러너의 시각/스펙 검수 단계가 공유한다.
// 좌측 문서 뷰(오버레이)는 호스트 몫 — 선택 상태는 제어형(selectedId/onSelect)으로
// 받아 좌측 하이라이트와 동기화한다.
import { useMemo, useState, type ReactNode } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { defaultSpecChat } from '../services/specFillService';
import { SpecTargetPanel } from './SpecTargetPanel';
import {
  type ChatFn, detectSpecDraft, parseHwpxSection, suggestContextExample, suggestTargetMeta,
  type Target, type WorkSpec,
} from '../document/spec';
import type { HwpxIndex } from '../document/spec/hwpxIndex';

// 탐지 기준 카테고리 — 정밀도 높은 기준만 기본 ON(빈 값 셀 등 노이즈성은 선택)
export const DETECTORS: { key: string; label: string; on: boolean }[] = [
  { key: 'clickhere', label: '누름틀', on: true },
  { key: 'choice', label: '체크박스', on: true },
  { key: 'placeholder', label: '자리표시자', on: true },
  { key: 'dummyPhone', label: '더미 전화', on: true },
  { key: 'bracketToken', label: '[토큰]', on: true },
  { key: 'emptyValue', label: '빈 값 셀', on: false },
  { key: 'example', label: '예시 표기', on: false },
  { key: 'rowGroup', label: '반복 행', on: false },
  { key: 'computed', label: '합계 셀', on: false },
  { key: 'labelBlank', label: '본문 공백', on: false },
];

/** 타깃의 국소 맥락(AI 라벨 보완용) — 셀=행+헤더, 반복 행=헤더+첫 행 샘플, 텍스트=앵커 */
export function targetContext(t: Target, indexes: HwpxIndex[]): string | undefined {
  const loc = t.locator;
  if (loc.kind === 'text') return loc.anchor;
  // 반복 행: 헤더+첫 행 샘플+행 수 — 사용자가 직접 지정한 반복 구간이라 규격형 가정이 안전
  if (loc.kind === 'rowGroup' && loc.section != null && loc.table && loc.rows) {
    const table = indexes[loc.section]?.tables.find((tb) => tb.index === loc.table!.index);
    if (!table) return undefined;
    const [r0, r1] = loc.rows;
    const cols = loc.cols;
    const rowText = (rowIdx: number) =>
      (table.rows[rowIdx]?.cells ?? [])
        .filter((c) => !cols || cols.includes(c.addr.col))
        .map((c) => c.text.trim())
        .filter(Boolean)
        .join(' | ');
    const headerIdx = r0 > 0 ? r0 - 1 : (loc.headerRow ?? 0);
    return `반복 행 ${r1 - r0 + 1}개 / 열 헤더: [${rowText(headerIdx)}] / 첫 행 예: [${rowText(r0)}]`;
  }
  if (loc.kind !== 'cell' || loc.section == null || !loc.table || !loc.addr) return undefined;
  const table = indexes[loc.section]?.tables.find((tb) => tb.index === loc.table!.index);
  if (!table) return undefined;
  const rowTexts = table.rows
    .flatMap((r) => r.cells)
    .filter((c) => c.addr.row === loc.addr!.row)
    .map((c) => c.text.trim())
    .filter(Boolean);
  const headTexts = table.rows[0]?.cells.map((c) => c.text.trim()).filter(Boolean) ?? [];
  return `행: [${rowTexts.join(' | ')}] / 헤더: [${headTexts.join(' | ')}] / 위치 (${loc.addr.row},${loc.addr.col})`;
}

/**
 * AI 라벨 보완(공유 헬퍼): 빈 라벨/지시·반복 열 지침 + **설명 예시**를 채우는 제안.
 * 자동 라벨은 confidence 게이트로 교체. 반환 = 갱신된 spec과 제안 수(0이면 spec 그대로).
 * 토스트는 호출부 몫.
 *
 * **두 제안은 호출을 따로 낸다**(2026-09-02). 라벨 제안은 "빈 라벨만" 골라 보내므로
 * 라벨이 다 차 있으면 호출 자체가 없는데, 설명 예시를 거기 얹으면 **스펙이 잘 정리된
 * 양식에서만 예시가 안 생기는** 뒤집힌 동작이 된다. 두 호출은 병렬이고 서로 독립이라
 * 한쪽이 실패해도 다른 쪽 결과는 반영된다.
 *
 * 둘 다 **빈 칸만 채운다** — 사람이 적어 둔 예시를 AI가 덮어쓰지 않는다.
 */
export async function suggestSpecMeta(
  spec: WorkSpec, indexes: HwpxIndex[],
  /** 호출부가 모델을 갈아끼울 수 있게(문서 생성 경로) — 생략 시 앱 기본 */
  chat: ChatFn = defaultSpecChat,
): Promise<{ spec: WorkSpec; count: number }> {
  const items = spec.targets
    .filter((t) => !t.label || !t.instruction || (t.kind === 'rowGroup'
      && t.rowSchema.some((c) => c.kind !== 'keep' && !c.instruction?.trim())))
    .slice(0, 30)
    .map((t) => ({
      id: t.id, kind: t.kind, label: t.label, autoLabel: t.autoLabel, instruction: t.instruction, evidence: t.evidence,
      context: targetContext(t, indexes),
      rowSchema: t.kind === 'rowGroup' ? t.rowSchema.map((c) => {
        const loc = t.locator;
        const table = indexes[loc.section ?? 0]?.tables.find((tb) => tb.index === loc.table?.index);
        const cells = table?.rows.flatMap((r) => r.cells) ?? [];
        const r0 = loc.rows?.[0] ?? 0;
        const r1 = loc.rows?.[1] ?? r0;
        const headerRow = loc.headerRow ?? Math.max(0, r0 - 1);
        const coversCol = (cell: typeof cells[number]) => cell.addr.col <= c.col && c.col < cell.addr.col + cell.span.cols;
        const header = cells.filter((cell) => coversCol(cell) && cell.addr.row <= headerRow
          && headerRow < cell.addr.row + cell.span.rows).map((cell) => cell.text.trim()).filter(Boolean);
        const samples = cells.filter((cell) => coversCol(cell) && cell.addr.row <= r1
          && cell.addr.row + cell.span.rows > r0).slice(0, 3).map((cell) => cell.text.trim()).filter(Boolean);
        return { col: c.col, kind: c.kind, instruction: c.instruction,
          context: `헤더: ${header.join(' / ').slice(0, 150)} / 예시: ${samples.join(' / ').slice(0, 300)}` };
      }) : undefined,
    }));
  const wantExample = !spec.contextExample?.trim();

  const [suggestions, example] = await Promise.all([
    items.length ? suggestTargetMeta(chat, spec.documentType, items) : Promise.resolve([]),
    // 라벨을 맥락으로 준다 — 이 문서가 무엇을 받는지 알아야 예문이 그 항목들을 언급한다.
    // 라벨 제안 결과를 기다리지 않는 이유는 병렬성이고, 빈 라벨은 어차피 예문의 재료가 못 된다.
    wantExample
      ? suggestContextExample(
        chat, spec.documentType,
        spec.targets.map((t) => t.label).filter((l): l is string => !!l),
      )
      : Promise.resolve(''),
  ]);

  const byId = new Map(suggestions.map((s) => [s.id, s]));
  const nextExample = example.trim();
  let count = nextExample ? 1 : 0;
  const requestedIds = new Set(items.map((t) => t.id));
  const targets = spec.targets.map((t) => {
    const s = byId.get(t.id);
    if (!s || !requestedIds.has(t.id)) return t;
    const replaceLabel = (!t.label || (t.autoLabel && s.confidence >= 0.6)) && !!s.label;
    const instruction = t.instruction || s.instruction || t.instruction;
    if (replaceLabel || instruction !== t.instruction) count++;
    const columns = new Map(s.rowSchema?.map((c) => [c.col, c.instruction]) ?? []);
    const rowSchema = t.kind === 'rowGroup' ? t.rowSchema.map((c) => {
      const proposed = columns.get(c.col);
      if (c.kind === 'keep' || c.instruction?.trim() || !proposed) return c;
      count++;
      return { ...c, instruction: proposed };
    }) : undefined;
    return {
      ...t,
      label: replaceLabel ? s.label : t.label,
      autoLabel: replaceLabel ? false : t.autoLabel,
      instruction,
      ...(rowSchema ? { rowSchema } : {}),
    } as Target;
  });
  if (!count) return { spec, count: 0 };
  return {
    count,
    spec: {
      ...spec,
      ...(nextExample ? { contextExample: nextExample } : {}),
      targets,
    },
  };
}

export interface SpecEditColumnProps {
  /** 파싱·detect·맥락 생성용 섹션 XML(문서 순서) */
  sections: string[];
  spec: WorkSpec;
  onChange: (spec: WorkSpec) => void;
  /** 좌측 문서 뷰와 공유하는 선택 상태(제어형) */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** 호스트가 이미 계산한 파싱 인덱스(선택) — 없으면 내부에서 계산 */
  indexes?: HwpxIndex[];
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  /** 칩 아래 정보 줄 슬롯(예: 문서 내 지침·저장됨 안내) */
  infoSlot?: ReactNode;
  /** 헤더의 AI 라벨 보완 버튼 표시(기본 true) — 호스트가 자체 위치에 두면 false */
  showSuggestButton?: boolean;
  /** 영역 재지정 시작 — 오버레이 호스트가 다음 지정을 해당 타깃 위치 교체로 처리 */
  onReassignTarget?: (id: string) => void;
  className?: string;
}

export function SpecEditColumn({
  sections, spec, onChange, selectedId, onSelect,
  indexes: indexesProp, headerLeft, headerRight, infoSlot, className,
  showSuggestButton = true,
  onReassignTarget,
}: SpecEditColumnProps) {
  const [suggesting, setSuggesting] = useState(false);
  // 칩 초기 상태 = 현재 스펙에 실재하는 탐지 기준(사용자가 정리한 결과 존중)
  const [activeCats, setActiveCats] = useState<Set<string>>(
    () => new Set(spec.targets.flatMap((t) => (t.detector ? [t.detector] : []))),
  );

  const ownIndexes = useMemo(
    () => (indexesProp ? null : sections.map(parseHwpxSection)),
    [indexesProp, sections],
  );
  const indexes = indexesProp ?? ownIndexes!;
  const draft = useMemo(
    () => (sections.length ? detectSpecDraft(sections, spec.documentType).draft : null),
    // documentType은 draft 라벨에 영향 없음 — 섹션이 바뀔 때만 재탐지
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections],
  );

  const unconfirmed = useMemo(
    () => spec.targets.filter((t) => t.confirmRequired).length,
    [spec],
  );

  // 탐지 기준 토글: 켜면 해당 기준의 제안 추가(기존 편집본 유지), 끄면 그 기준의 자동 제안 제거
  const toggleCat = (key: string) => {
    if (!draft) return;
    const next = new Set(activeCats);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setActiveCats(next);
    const userTargets = spec.targets.filter((t) => !t.detector);
    const current = new Map(spec.targets.map((t) => [t.id, t]));
    const autoTargets = draft.targets
      .filter((t) => t.detector && next.has(t.detector))
      .map((t) => current.get(t.id) ?? t);
    onChange({ ...spec, targets: [...autoTargets, ...userTargets] });
  };

  // AI 라벨 보완(헤더 버튼) — 로직은 suggestSpecMeta 공유 헬퍼
  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const r = await suggestSpecMeta(spec, indexes);
      if (r.count === 0) {
        toast.info('보완할 제안이 없습니다.');
        return;
      }
      onChange(r.spec);
      toast.success(`라벨·지시·열별 지침·설명 예시 제안 ${r.count}건을 채웠습니다(빈 칸만). 검토 후 수정하세요.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 보완에 실패했습니다.');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className={className ?? 'flex h-full min-h-0 flex-col gap-2'}>
      {(headerLeft || headerRight || showSuggestButton) && (
        <div className="flex items-center gap-2">
          {headerLeft}
          {showSuggestButton && (
            <Button size="sm" variant="outline" disabled={suggesting} onClick={() => void handleSuggest()}>
              {suggesting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              AI 라벨 보완
            </Button>
          )}
          {headerRight}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {DETECTORS.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => toggleCat(d.key)}
            className={`rounded-full border px-2 py-0.5 text-[10px] ${
              activeCats.has(d.key)
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-400'
            }`}
          >
            {d.label}
            {draft ? ` ${draft.targets.filter((t) => t.detector === d.key).length}` : ''}
          </button>
        ))}
      </div>
      {unconfirmed > 0 && (
        <p className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
          확정 필요 {unconfirmed}건 — 목록의 [확인]을 누르거나 삭제해야 저장할 수 있습니다.
        </p>
      )}
      {infoSlot}
      <SpecTargetPanel
        className="min-h-0 flex-1"
        spec={spec}
        onChange={onChange}
        selectedTargetId={selectedId}
        onSelectTarget={onSelect}
        onReassignTarget={onReassignTarget}
        indexes={indexes}
      />
    </div>
  );
}
