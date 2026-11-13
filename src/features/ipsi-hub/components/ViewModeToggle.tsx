import { Button } from '@/components/ui/button';
import { LayoutGrid, List } from 'lucide-react';

export type ViewMode = 'card' | 'list';

type Props = {
  active: ViewMode;
  onChange: (mode: ViewMode) => void;
};

const OPTIONS: { value: ViewMode; label: string; Icon: typeof LayoutGrid }[] = [
  { value: 'list', label: '리스트', Icon: List },
  { value: 'card', label: '카드', Icon: LayoutGrid },
];

export function ViewModeToggle({ active, onChange }: Props) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white/50 p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <Button
          key={value}
          variant="ghost"
          size="sm"
          onClick={() => onChange(value)}
          className={`h-7 gap-1.5 rounded-md px-2.5 text-xs ${
            active === value
              ? 'bg-blue-600 text-white hover:bg-blue-700 hover:text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          title={label}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      ))}
    </div>
  );
}
