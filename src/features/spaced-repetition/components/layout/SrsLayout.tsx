/**
 * SRS 3-Column Layout Component
 * Matches the mockup's distinctive grid layout.
 */

import React from 'react';

interface SrsLayoutProps {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
}

export function SrsLayout({ left, center, right }: SrsLayoutProps) {
  return (
    <div className="srs-grid">
      <div className="srs-panel-left">
        {left}
      </div>
      <div className="srs-panel-center">
        {center}
      </div>
      <div className="srs-panel-right">
        {right}
      </div>
    </div>
  );
}
