import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { PanelWidthMode } from './panelWidth';

interface PanelColumnsProps {
  widthMode: PanelWidthMode;
  primary: ReactNode;
  secondary: ReactNode;
  primaryLabel: string;
  secondaryLabel: string;
  variant?: 'editor' | 'review';
  className?: string;
}

/** Keep both regions mounted when resizing, so inputs and local drafts survive. */
export function PanelColumns({ widthMode, primary, secondary, primaryLabel, secondaryLabel, variant = 'editor', className }: PanelColumnsProps) {
  return (
    <div className={cn('inquiry-workspace', widthMode === 'wide' && 'inquiry-workspace-wide', `inquiry-workspace-${variant}`, className)}>
      <div className="inquiry-workspace-columns">
        <section aria-label={primaryLabel} tabIndex={0} className="inquiry-workspace-pane inquiry-workspace-primary">
          <h2 className="inquiry-workspace-heading">{primaryLabel}</h2>
          <div className="space-y-4">{primary}</div>
        </section>
        <section aria-label={secondaryLabel} tabIndex={0} className="inquiry-workspace-pane inquiry-workspace-secondary">
          <h2 className="inquiry-workspace-heading">{secondaryLabel}</h2>
          <div className="space-y-4">{secondary}</div>
        </section>
      </div>
    </div>
  );
}
