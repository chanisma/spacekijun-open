import { useMemo, useState } from 'react';
import { InquiryGraphCanvas } from '@/features/inquiry-design/components/InquiryGraphCanvas';
import type { InquiryAnalysisResult, InquiryWorkspace } from '@/features/inquiry-design/types';
import { buildConstellationDetail, type ConstellationFocus } from './constellationDetail';
import styles from './game.module.css';

interface Props { workspace: InquiryWorkspace; preview?: InquiryAnalysisResult | null; draftId?: string | null; selected: string[]; onSelect: (ids: string[]) => void; version: string | null; onVersion: (id: string | null) => void; /** 제1장 안내가 가리키는 별 — 검색 적중처럼 비추고 카메라를 보낸다. */ highlightNodeId?: string | null }
export function Constellation({ workspace, preview, draftId, selected, onSelect, version, onVersion, highlightNodeId }: Props) {
  const [edges, setEdges] = useState<Set<string>>(new Set());
  // 마지막으로 누른 별 또는 길 하나. 선택(분석 재료)과는 다른 상태다 — 선택을 풀어도 기록은 남는다.
  const [focus, setFocus] = useState<ConstellationFocus | null>(null);
  const selectedNodes = useMemo(() => new Set(selected), [selected]);
  // The active draft is already drawn by the live preview; do not draw it twice after autosave.
  const designs = useMemo(() => workspace.savedDesigns.filter(d => !preview || d.id !== draftId), [workspace.savedDesigns, preview, draftId]);
  const detail = useMemo(() => focus ? buildConstellationDetail(workspace, focus, { preview, savedDesigns: designs }) : null, [workspace, focus, preview, designs]);
  return <div className={styles.fullConstellation} aria-label="나의 지식 별자리">
    <InquiryGraphCanvas constellation workspace={workspace} savedDesigns={designs} preview={preview} selectedNodeIds={selectedNodes} selectedEdgeIds={edges}
      onToggleNode={id => { setFocus({ kind: 'node', id }); onSelect(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]); }}
      onToggleEdge={id => { setFocus({ kind: 'edge', id }); setEdges(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }}
      kgVersionId={version} onKgVersionChange={id => { setFocus(null); setEdges(new Set()); onSelect([]); onVersion(id); }} highlightNodeId={highlightNodeId} />
    {/* 오른쪽 아래 — 왼쪽 아래는 범례의 자리다(2026-10-02). 제목·내용 두 칸, 접기 없이 닫기만. */}
    {detail && <aside className={styles.graphDetail} aria-label={detail.heading} data-kind={detail.kind}>
      <header>
        <span className={styles.kicker}>{detail.heading} · {detail.kicker}</span>
        <h3>{detail.title}</h3>
        <button type="button" aria-label="기록 닫기" title="닫기" onClick={() => setFocus(null)}>×</button>
      </header>
      <div className={styles.graphDetailBody}>
        {detail.body.map((line, i) => <p key={i}>{line}</p>)}
        {detail.note && <p className={styles.graphDetailNote}>메모 · {detail.note}</p>}
      </div>
    </aside>}
  </div>;
}
