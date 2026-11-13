import type { RescueTagDefinition } from '../../types/rescueTag';

interface Props {
  definition: RescueTagDefinition;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function TagChip({ definition, size = 'md', showLabel = true }: Props) {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border border-slate-200 bg-white/60 text-slate-700"
      aria-label={`위기 태그: ${definition.label}`}
      title={definition.label}
    >
      <span className={`${dotSize} rounded-full shrink-0 ${definition.color}`} aria-hidden />
      {showLabel && <span>{definition.label}</span>}
    </span>
  );
}
