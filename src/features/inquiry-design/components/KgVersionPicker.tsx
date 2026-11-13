import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { KgVersionSummary } from '@/services/studentKgService';
import { cn } from '@/lib/utils';

/**
 * KG 버전 선택기.
 *
 * 추출 파이프라인이 바뀔 때마다 **새 버전 행**으로 들어온다(`student_kg_versions` 는 append-only).
 * 구 버전이 그대로 남아 있고 이 선택기가 그 사이를 오간다 — 새 방식을 적용하면서도
 * 기존 것을 언제든 되돌아볼 수 있게 하는 지점이다.
 *
 * **버전 번호와 만든 날짜만 보여 준다** (2026-09-12 사용자 결정). 한때 신·구 파이프라인을
 * 아이콘과 배지로 갈라 표시했고, 그다음엔 노드 수와 '최신' 표시를 달았다. 둘 다 걷어냈다 —
 * 파이프라인 종류는 **만드는 쪽의 사정**이고, 노드 수로는 어느 것을 고를지 판단할 수 없으며,
 * '최신'은 목록이 내림차순이라 **맨 위가 이미 말하고 있다**.
 * 버전을 고를 때 실제로 쓰는 단서는 "언제 만든 것인가" 하나다.
 */

/** `26.09.12`. 연도까지 넣는 이유는 버전이 해를 넘겨 쌓이기 때문이다(월·일만이면 순서가 뒤집혀 보인다). */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getFullYear() % 100)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}
interface Props {
  versions: KgVersionSummary[];
  /** 현재 보고 있는 버전. null이면 최신(목록 첫 항목) */
  currentId: string | null;
  onChange: (versionId: string | null) => void;
  /**
   * 캔버스가 색을 정한다 — 트리거는 캔버스 안이라 `--kg-*` 변수를 물려받지만,
   * 목록은 body 포털이라 변수가 닿지 않아 **색을 직접** 받아야 한다(아카데미 자주·황금).
   */
  triggerClassName?: string;
  contentClassName?: string;
}

const KgVersionPicker: React.FC<Props> = ({ versions, currentId, onChange, triggerClassName, contentClassName }) => {
  if (versions.length <= 1) return null;   // 고를 것이 없으면 UI를 두지 않는다

  const latest = versions[0];
  const effectiveId = currentId ?? latest?.id ?? '';

  return (
    <Select
      value={effectiveId}
      // 최신을 고르면 상태를 null로 되돌린다 — 새 버전이 생겼을 때 자동으로 따라가게 하려면
      // "최신"이 고정 id가 아니라 상태 없음이어야 한다.
      onValueChange={(v) => onChange(v === latest?.id ? null : v)}
    >
      <SelectTrigger className={cn('h-8 w-[132px] rounded-md border-slate-700 bg-slate-900/90 text-xs text-slate-200 shadow-sm transition-colors duration-200 hover:border-brand-400 hover:bg-slate-800', triggerClassName)}>
        <SelectValue placeholder="버전" />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {versions.map((v) => (
          <SelectItem key={v.id} value={v.id} className="text-xs">
            <span className="flex items-center gap-1.5">
              v{v.version}
              <span className="text-slate-400">{shortDate(v.created_at)}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default KgVersionPicker;
