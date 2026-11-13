import {
  Building2,
  BookOpen,
  ChefHat,
  GraduationCap,
  Home,
  Landmark,
  LucideIcon,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CallCategory, ExtensionGroup } from '@/types/calls';
import { ContactRow } from './ContactRow';

/** 카테고리별 아이콘/색상 — 데이터가 아니라 표현이므로 UI 계층에 둔다 */
const CATEGORY_STYLE: Record<CallCategory, { icon: LucideIcon; accent: string; tint: string }> = {
  admin: { icon: Landmark, accent: 'text-indigo-600', tint: 'bg-indigo-50' },
  grade: { icon: GraduationCap, accent: 'text-blue-600', tint: 'bg-blue-50' },
  staff: { icon: Users, accent: 'text-violet-600', tint: 'bg-violet-50' },
  facility: { icon: BookOpen, accent: 'text-teal-600', tint: 'bg-teal-50' },
  office: { icon: Building2, accent: 'text-amber-600', tint: 'bg-amber-50' },
  dorm: { icon: Home, accent: 'text-rose-600', tint: 'bg-rose-50' },
  cafeteria: { icon: ChefHat, accent: 'text-emerald-600', tint: 'bg-emerald-50' },
};

interface DirectorySectionProps {
  group: ExtensionGroup;
  className?: string;
  children?: React.ReactNode;
}

/** 그룹 하나를 담는 카드. children이 있으면 기본 목록 대신 그것을 렌더링한다. */
export const DirectorySection = ({ group, className, children }: DirectorySectionProps) => {
  const { icon: Icon, accent, tint } = CATEGORY_STYLE[group.category];

  return (
    <section
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm',
        'transition-shadow duration-300 hover:shadow-md',
        className
      )}
    >
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <div className={cn('rounded-xl p-2', tint)}>
          <Icon className={cn('h-4 w-4', accent)} strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold tracking-tight text-slate-900">
            {group.title}
          </h2>
          {group.description && (
            <p className="truncate text-xs text-slate-500">{group.description}</p>
          )}
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          {group.entries.length}
        </span>
      </header>

      <div className="flex-1 p-1.5">
        {children ?? (
          <div className="divide-y divide-slate-100">
            {group.entries.map((entry) => (
              <ContactRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
