import type { TrainingCategory } from '../types';

export const CATEGORY_META: Record<TrainingCategory, { label: string; tone: string }> = {
  annual: { label: '매년', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  multi:  { label: '다년', tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  special:{ label: '특수', tone: 'bg-orange-50 text-orange-700 border-orange-200' },
};

export function formatFileSize(bytes?: number | null) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export function percent(done: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}
