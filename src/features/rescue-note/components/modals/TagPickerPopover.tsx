import { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTagDefinitions } from '../../hooks/useTagDefinitions';
import { useStudentTags, useToggleRescueTag } from '../../hooks/useRescueTags';
import { toast } from '@/components/ui/use-toast';

interface Props {
  studentCode: string;
  children: ReactNode;
}

export function TagPickerPopover({ studentCode, children }: Props) {
  const defsQ = useTagDefinitions();
  const tagsQ = useStudentTags(studentCode);
  const toggle = useToggleRescueTag(studentCode);

  const has = (key: string) => (tagsQ.data ?? []).some((t) => t.tagKey === key);

  const onToggle = async (key: string, checked: boolean) => {
    try {
      await toggle.mutateAsync({ tagKey: key, action: checked ? 'add' : 'remove' });
    } catch (e: any) {
      toast({ title: '태그 변경 실패', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 bg-white/90 backdrop-blur-md border border-white/40 shadow-lg rounded-xl p-3">
        <div className="text-xs font-bold text-slate-800 mb-2.5 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
          위기 태그
        </div>
        <div className="space-y-1.5">
          {(defsQ.data ?? []).map((d) => (
            <div key={d.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-all">
              <Checkbox
                id={`tag-${d.key}`}
                checked={has(d.key)}
                onCheckedChange={(c) => onToggle(d.key, !!c)}
              />
              <span className={`w-2 h-2 rounded-full shrink-0 ${d.color}`} aria-hidden />
              <Label htmlFor={`tag-${d.key}`} className="font-normal text-xs text-slate-700 flex-1 cursor-pointer">{d.label}</Label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
