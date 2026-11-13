import { User } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { TagBadge } from './TagBadge';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { RescueTagDefinition } from '../../types/rescueTag';
import type { RescueRosterRow } from '../../services/rescueRoster';

interface Props {
  row: RescueRosterRow;
  tagDefinitions: RescueTagDefinition[];
  picture?: string | null;
  onClick: () => void;
  selected?: boolean;
}

export function StudentCard({ row, tagDefinitions, picture, onClick, selected }: Props) {
  const defByKey = new Map(tagDefinitions.map((d) => [d.key, d]));
  // 모든 태그를 축약 키워드 뱃지로 표시 (개수 제한·+N 오버플로 없음)
  const tags = row.tagKeys.map((k) => defByKey.get(k)).filter(Boolean) as RescueTagDefinition[];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      className={`p-3 cursor-pointer rounded-xl border transition-all bg-white/60 backdrop-blur-sm ${
        selected
          ? 'border-brand-200 shadow-md ring-1 ring-brand-300 bg-brand-50/60 scale-[1.02]'
          : 'border-white/40 shadow-sm hover:shadow-md hover:bg-white/80'
      }`}
      aria-label={`학생 ${row.name}, ${row.grade}학년 ${row.classNum}반 ${row.numberInClass}번`}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          {picture ? (
            <img
              src={picture}
              alt={row.name}
              className="w-12 h-12 rounded-full object-cover border border-slate-200 shadow-sm"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-400">
              <User size={20} aria-hidden />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-800 tracking-tight truncate">{row.name}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                {row.grade}-{row.classNum} <span className="text-slate-400">#{row.numberInClass}</span>
                {row.gender && <span className="font-sans text-slate-400"> · {row.gender}</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 justify-end max-w-[60%] shrink-0">
              {tags.map((d) => (
                <TagBadge key={d.key} definition={d} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2.5 pl-[60px]">
        <StatusBadge status={row.status} />
        <div className="text-[11px] text-slate-400">
          상담 <span className="font-medium text-slate-500">{row.noteCount}</span>건
          {row.lastNoteAt && (
            <span className="ml-1 text-slate-300">· {format(new Date(row.lastNoteAt), 'M/d', { locale: ko })}</span>
          )}
        </div>
      </div>
    </div>
  );
}
