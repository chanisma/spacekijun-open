/**
 * Concept Breakdown Table
 * Shows per-concept recall %, retention curve, and due date.
 */

import React from 'react';
import { formatDueDate } from '../../utils/srsFormatters';
import type { ConceptBreakdown } from '../../types/srs.types';

interface ConceptTableProps {
  concepts: ConceptBreakdown[];
  activeItems: number;
}

export function ConceptTable({ concepts, activeItems }: ConceptTableProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4 px-4">
        <div className="srs-section-title-sm font-bold">INDIVIDUAL CONCEPT BREAKDOWN</div>
        <div className="srs-section-title-sm">{activeItems} ACTIVE ITEMS</div>
      </div>

      {/* Table header */}
      <div
        className="grid items-center px-4 py-2 text-xs font-bold uppercase tracking-wider"
        style={{
          gridTemplateColumns: '2fr 1fr 2fr 1fr',
          color: 'var(--srs-text-muted)',
          borderBottom: '1px solid rgba(0,0,0,0.1)',
        }}
      >
        <span>Concept</span>
        <span>Recall</span>
        <span>Retention Curve</span>
        <span>Due</span>
      </div>

      {/* Table rows */}
      {concepts.map((concept, i) => {
        const dueLabel = formatDueDate(concept.next_due);
        const isOverdue = dueLabel === 'NOW';

        return (
          <div
            key={concept.concept}
            className="grid items-center px-4 py-4"
            style={{
              gridTemplateColumns: '2fr 1fr 2fr 1fr',
              borderBottom: i < concepts.length - 1 ? '1px solid rgba(0,0,0,0.08)' : undefined,
            }}
          >
            {/* Concept name */}
            <div>
              <div className="text-sm font-bold uppercase">{concept.concept}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--srs-text-muted)' }}>
                {concept.card_count} cards
              </div>
            </div>

            {/* Recall percentage */}
            <div className="srs-metric-md">{concept.avg_recall}</div>

            {/* Retention curve mini-chart */}
            <div className="srs-retention-bar">
              {concept.retention_history.map((val, j) => (
                <div
                  key={j}
                  className={`srs-retention-bar-segment ${val < 50 ? 'low' : ''}`}
                  style={{ height: `${Math.max(4, (val / 100) * 24)}px` }}
                />
              ))}
              {/* Fill empty slots with dashed placeholder */}
              {Array.from({ length: Math.max(0, 5 - concept.retention_history.length) }).map((_, j) => (
                <div
                  key={`empty-${j}`}
                  className="srs-retention-bar-segment"
                  style={{
                    height: 4,
                    backgroundColor: 'var(--srs-accent)',
                    opacity: 0.2,
                    borderTop: '1px dashed var(--srs-accent)',
                  }}
                />
              ))}
            </div>

            {/* Due date */}
            <div
              className="text-sm font-bold"
              style={{ color: isOverdue ? 'var(--srs-accent)' : 'var(--srs-text)' }}
            >
              {dueLabel}
            </div>
          </div>
        );
      })}

      {concepts.length === 0 && (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--srs-text-muted)' }}>
          아직 개념별 데이터가 없습니다. 학습을 시작하면 여기에 표시됩니다.
        </div>
      )}
    </div>
  );
}
