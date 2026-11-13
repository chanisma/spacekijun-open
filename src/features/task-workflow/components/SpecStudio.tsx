// 스펙 편집 작업대(공용): hwpx-editor "양식 만들기"(SpecWorkspace)가 사용하는
// 좌 오버레이 + 우 편집 컬럼(SpecEditColumn) 조립체. 러너는 같은 부품을 직접 조립해
// 단계별 레이아웃(리사이즈 스플리터 등)을 구성한다. 호스트별 액션(양식 이름·저장 등)은
// headerLeft/headerRight/infoSlot으로 주입한다.
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from '@/lib/toast';
import { SpecOverlayView } from '@/components/rhwp/SpecOverlayView';
import { SpecEditColumn, DETECTORS } from './SpecEditColumn';
import { designateFromHit, reassignTargetLocator } from './specDesignate';
import { parseHwpxSection, type WorkSpec } from '../document/spec';
import type { HitResult } from '../document/spec/overlayMap';

export { DETECTORS };

export interface SpecStudioProps {
  loadSource: () => Promise<Blob | ArrayBuffer | Uint8Array>;
  /** 파싱·detect·맥락 생성용 섹션 XML(문서 순서) — loadSource와 같은 바이트여야 함 */
  sections: string[];
  spec: WorkSpec;
  onChange: (spec: WorkSpec) => void;
  /** 우측 헤더 왼쪽 슬롯(예: 양식 이름 입력) */
  headerLeft?: ReactNode;
  /** 우측 헤더 오른쪽 슬롯(예: 저장 버튼) */
  headerRight?: ReactNode;
  /** 칩 아래 정보 줄 슬롯(예: 문서 내 지침·저장됨 안내) */
  infoSlot?: ReactNode;
  /** 전체 그리드 클래스(높이 제어는 paneClassName) */
  className?: string;
  /** 좌 오버레이·우 컬럼의 공통 높이 클래스 */
  paneClassName?: string;
}

export function SpecStudio({
  loadSource, sections, spec, onChange,
  headerLeft, headerRight, infoSlot, className, paneClassName,
}: SpecStudioProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 영역 재지정 모드: 이 타깃 id가 설정되면 다음 지정이 새 타깃 생성 대신 위치 교체가 된다
  const [reassignId, setReassignId] = useState<string | null>(null);
  const indexes = useMemo(() => sections.map(parseHwpxSection), [sections]);

  // 원터치 지정(specDesignate 공유 헬퍼) — 번호는 현재 스펙에서 유도(재마운트 안전)
  const handleDesignate = (hit: NonNullable<HitResult>) => {
    if (reassignId) {
      const target = spec.targets.find((t) => t.id === reassignId);
      if (target) {
        const r = reassignTargetLocator(target, hit, indexes);
        if (r.error) { toast.error(r.error); return; }
        onChange({ ...spec, targets: spec.targets.map((t) => (t.id === reassignId ? r.target! : t)) });
        setSelectedId(reassignId);
        toast.success(`"${target.label || target.id}" 영역을 재지정했습니다(라벨·지침 유지).`);
      }
      setReassignId(null);
      return;
    }
    const r = designateFromHit(hit, spec, indexes);
    onChange({ ...spec, targets: [...spec.targets, ...r.targets] });
    setSelectedId(r.selectId);
  };

  const reassignTarget = reassignId ? spec.targets.find((t) => t.id === reassignId) : null;

  const pane = paneClassName ?? 'h-[calc(100vh-245px)] min-h-[620px]';
  return (
    <div className={className ?? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_460px]'}>
      <SpecOverlayView
        className={`${pane} rounded-2xl border border-slate-300 shadow-sm`}
        loadSource={loadSource}
        spec={spec}
        selectedTargetId={selectedId}
        onSelectTarget={setSelectedId}
        onDesignate={handleDesignate}
      />
      <SpecEditColumn
        className={`${pane} flex flex-col gap-2`}
        sections={sections}
        indexes={indexes}
        spec={spec}
        onChange={onChange}
        selectedId={selectedId}
        onSelect={setSelectedId}
        headerLeft={headerLeft}
        headerRight={headerRight}
        onReassignTarget={setReassignId}
        infoSlot={
          <>
            {reassignTarget && (
              <p className="flex items-center justify-between gap-2 rounded bg-blue-50 px-2 py-1 text-[11px] text-blue-700">
                <span>"{reassignTarget.label || reassignTarget.id}" 영역 재지정 — 문서에서 새 위치를 클릭/드래그하세요.</span>
                <button type="button" className="shrink-0 underline" onClick={() => setReassignId(null)}>취소</button>
              </p>
            )}
            {infoSlot}
          </>
        }
      />
    </div>
  );
}
