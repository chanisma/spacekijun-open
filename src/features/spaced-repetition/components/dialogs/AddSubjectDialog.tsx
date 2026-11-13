/**
 * Add New Subject Dialog (Screen 7)
 * Form for creating a new study subject.
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateSubject } from '../../hooks/useSrsSubjects';
import { useToast } from '@/hooks/use-toast';
import type { SubjectStatus } from '../../types/srs.types';

interface AddSubjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const INTERVAL_OPTIONS = [
  { label: '1 Day', value: 1 },
  { label: '2 Days', value: 2 },
  { label: '4 Days', value: 4 },
  { label: '7 Days', value: 7 },
  { label: '14 Days', value: 14 },
];

export function AddSubjectDialog({ open, onOpenChange }: AddSubjectDialogProps) {
  const { toast } = useToast();
  const createSubject = useCreateSubject();

  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [intervalDays, setIntervalDays] = useState(4);
  const [status] = useState<SubjectStatus>('active');

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: '과목명을 입력해주세요', variant: 'destructive' });
      return;
    }

    try {
      await createSubject.mutateAsync({
        name: name.trim(),
        topic: topic.trim() || undefined,
        review_interval_days: intervalDays,
        status,
      });

      toast({ title: `"${name}" 과목이 생성되었습니다` });
      setName('');
      setTopic('');
      setIntervalDays(4);
      onOpenChange(false);
    } catch (error) {
      toast({ title: '과목 생성 실패', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-0 overflow-hidden border-0"
        style={{ backgroundColor: 'var(--srs-dark, #2d3a2e)' }}
      >
        <div className="p-6" style={{ backgroundColor: 'var(--srs-cream, #f5f0e1)' }}>
          <DialogHeader className="mb-6">
            <DialogTitle className="font-black text-2xl">
              Add New<br />Subject
            </DialogTitle>
          </DialogHeader>

          {/* Subject Name */}
          <div className="mb-4" style={{ borderBottom: '1px solid #d4d0c4' }}>
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b9b8a' }}>
              SUBJECT NAME
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cognitive Psychology"
              className="w-full py-2 bg-transparent text-base outline-none"
              style={{ color: '#1a1a1a' }}
              autoFocus
            />
          </div>

          {/* Topic */}
          <div className="mb-4" style={{ borderBottom: '1px solid #d4d0c4' }}>
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b9b8a' }}>
              TOPIC
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Memory Retrieval"
              className="w-full py-2 bg-transparent text-base outline-none"
              style={{ color: '#1a1a1a' }}
            />
          </div>

          {/* Card Count + Review Interval */}
          <div className="grid grid-cols-2 gap-4 mb-4" style={{ borderBottom: '1px solid #d4d0c4' }}>
            <div className="py-2">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b9b8a' }}>
                CARD COUNT
              </label>
              <div className="text-base mt-1" style={{ color: '#8a8a7a' }}>0</div>
            </div>
            <div className="py-2">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b9b8a' }}>
                REVIEW INTERVAL
              </label>
              <select
                value={intervalDays}
                onChange={(e) => setIntervalDays(Number(e.target.value))}
                className="w-full bg-transparent text-base outline-none cursor-pointer mt-1"
                style={{ color: '#1a1a1a' }}
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 flex items-center justify-between" style={{ backgroundColor: 'var(--srs-sage-dark, #6b7d5e)' }}>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b9b8a' }}>
              STATUS
            </div>
            <div className="text-sm font-bold" style={{ color: 'var(--srs-cream, #f5f0e1)' }}>
              Drafting Queue
            </div>
          </div>
          <button
            className="srs-btn-accent"
            style={{ width: 72, height: 72 }}
            onClick={handleCreate}
            disabled={createSubject.isPending}
          >
            {createSubject.isPending ? '...' : 'Create'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
