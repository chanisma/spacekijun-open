// ========================================
// 입력 받기 — 칸 하나의 입력기
// 예/아니오·고르기·날짜는 누르는 즉시, 글·숫자는 칸을 떠날 때(또는 Enter) 저장한다.
// ========================================

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { CollectField } from '@/lib/collectInput';

const CLEAR = '__clear__';

interface Props {
  field: CollectField;
  value: string | undefined;
  disabled?: boolean;
  onCommit: (value: string) => void;
}

export function CollectFieldInput({ field, value, disabled, onCommit }: Props) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);

  const commitDraft = () => {
    if ((value ?? '') !== draft.trim()) onCommit(draft.trim());
  };

  if (field.type === 'yesno') {
    return (
      <div className="inline-flex w-fit overflow-hidden rounded-md border border-slate-200" role="group" aria-label={field.label}>
        {(['yes', 'no'] as const).map((v) => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            aria-pressed={value === v}
            // 같은 답을 다시 누르면 지운다 — 잘못 누른 답을 되돌릴 방법
            onClick={() => onCommit(value === v ? '' : v)}
            className={cn(
              'h-11 min-w-[44px] whitespace-nowrap px-2.5 text-xs transition-colors disabled:opacity-50 sm:h-8',
              v === 'no' && 'border-l border-slate-200',
              value === v
                ? v === 'yes' ? 'bg-emerald-600 text-white' : 'bg-slate-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {v === 'yes' ? '예' : '아니오'}
          </button>
        ))}
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <Select
        value={value || undefined}
        disabled={disabled}
        onValueChange={(v) => onCommit(v === CLEAR ? '' : v)}
      >
        <SelectTrigger className="h-11 min-w-[120px] text-xs sm:h-8" aria-label={field.label}>
          <SelectValue placeholder="고르기" />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
          {value && <SelectItem value={CLEAR} className="text-slate-400">비우기</SelectItem>}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === 'date') {
    return (
      <Input
        type="date"
        aria-label={field.label}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onCommit(e.target.value)}
        className="h-11 w-[150px] text-xs sm:h-8"
      />
    );
  }

  return (
    <Input
      aria-label={field.label}
      inputMode={field.type === 'number' ? 'decimal' : undefined}
      value={draft}
      disabled={disabled}
      placeholder={field.type === 'number' ? '숫자' : ''}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={cn('h-11 text-xs sm:h-8', field.type === 'number' ? 'w-[100px]' : 'min-w-[160px]')}
    />
  );
}
