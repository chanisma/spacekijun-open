/**
 * Empty State / Onboarding View (Screen 6)
 * Shown when user has no subjects yet.
 */

import React, { useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { SrsLayout } from '../layout/SrsLayout';
import { AddSubjectDialog } from '../dialogs/AddSubjectDialog';

export function EmptyState() {
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <>
      <SrsLayout
        left={
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="srs-section-title" style={{ fontSize: '1.5rem' }}>
                Active<br />Subjects
              </h2>
              <ChevronDown size={20} style={{ color: 'var(--srs-cream)' }} />
            </div>
            <div
              className="border border-dashed rounded-lg p-6 text-center"
              style={{ borderColor: 'rgba(255,255,255,0.2)' }}
            >
              <p className="text-sm" style={{ color: 'var(--srs-sage-muted)' }}>
                No subjects yet.<br />
                Your library will appear here.
              </p>
            </div>
          </div>
        }
        center={
          <div className="flex flex-col items-center justify-center h-full">
            <div className="flex items-center gap-2 mb-8">
              <h2 className="srs-section-title text-center">
                Build Your<br />Knowledge<br />System
              </h2>
              <ChevronDown size={20} style={{ color: 'var(--srs-text)' }} />
            </div>

            <button
              className="srs-btn-dark mb-6"
              style={{ width: 120, height: 120, fontSize: '0.75rem', flexDirection: 'column', display: 'flex', gap: 8 }}
              onClick={() => setShowAddDialog(true)}
            >
              <Plus size={24} />
              <span>ADD FIRST<br />SUBJECT</span>
            </button>

            <p className="text-sm text-center" style={{ color: 'var(--srs-text-muted)', maxWidth: 280 }}>
              Enter a topic to begin tracking your retention and mastery.
            </p>

            {/* Bottom cards */}
            <div className="grid grid-cols-2 gap-4 mt-8 w-full max-w-sm">
              <div className="srs-card p-4">
                <div className="srs-section-title-sm">Daily Goal</div>
                <div className="flex justify-center mt-3">
                  <div
                    className="w-16 h-16 rounded-full border-2"
                    style={{ borderColor: 'var(--srs-border)' }}
                  />
                </div>
              </div>
              <div className="srs-card p-4">
                <div className="srs-section-title-sm">Quick Import</div>
                <div className="flex justify-center mt-3">
                  <span className="text-2xl" style={{ color: 'var(--srs-text-muted)' }}>···</span>
                </div>
              </div>
            </div>
          </div>
        }
        right={
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="srs-section-title" style={{ fontSize: '1.5rem' }}>
                Learning<br />Insights
              </h2>
              <ChevronDown size={20} style={{ color: 'var(--srs-text-muted)' }} />
            </div>

            {/* Locked analytics */}
            <div
              className="border rounded-lg p-8 text-center mb-4"
              style={{ borderColor: 'var(--srs-border)' }}
            >
              <div
                className="w-24 h-24 rounded-full border-2 mx-auto mb-4"
                style={{ borderColor: 'var(--srs-border)' }}
              />
              <p className="text-xs" style={{ color: 'var(--srs-text-light)' }}>
                Charts Lock
              </p>
            </div>

            <p className="text-xs text-center mb-6" style={{ color: 'var(--srs-text-light)' }}>
              Analytics will activate once you've completed your first session.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="srs-card p-3 text-center">
                <div className="srs-section-title-sm">Retention</div>
                <div className="text-lg font-bold mt-1" style={{ color: 'var(--srs-text-light)' }}>— —</div>
              </div>
              <div className="srs-card p-3 text-center">
                <div className="srs-section-title-sm">Efficiency</div>
                <div className="text-lg font-bold mt-1" style={{ color: 'var(--srs-text-light)' }}>— —</div>
              </div>
            </div>
          </div>
        }
      />

      <AddSubjectDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
      />
    </>
  );
}
