import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Plus, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { PickerContent, PickerRoot, PickerTrigger } from '@/components/ui/responsive-picker';
import { MAX_CATEGORY_LENGTH, normalizeCategory } from '@/lib/collabCategories';

interface BoardCategorySelectProps {
  /** 이미 쓰이고 있는 카테고리 이름들 — 남이 만든 것도 고를 수 있어야 한다 */
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

/**
 * 보드 카테고리 고르기 — **고르기와 만들기가 한 칸**이다.
 *
 * 미리 정해진 목록에서만 고르게 하면 쓸모가 없다는 것이 이 기능의 출발점이었다.
 * 반대로 자유 입력만 두면 같은 뜻의 이름이 조금씩 다르게 갈라진다(`수업`/`수업 `/`수업자료`).
 * 그래서 **이미 있는 이름을 먼저 보여 주고**, 거기 없을 때만 새로 만들게 한다.
 *
 * 입력값은 `normalizeCategory` 로 다듬어 저장한다(공백 접기 · 트림 · 길이 제한).
 * 이 정규화는 목록 화면 필터와 **같은 함수**라, 만든 이름이 칩으로 그대로 선다.
 */
export function BoardCategorySelect({
  options,
  value,
  onChange,
  disabled = false,
}: BoardCategorySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const typed = normalizeCategory(query);
  const canCreate = Boolean(
    typed && !options.some((o) => o.toLowerCase() === typed.toLowerCase()),
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const commit = (next: string | null) => {
    onChange(next);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-1.5">
      <PickerRoot
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery('');
        }}
      >
        <PickerTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-9 min-w-0 flex-1 justify-between gap-2 px-3 font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Tag className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <span className={`truncate ${value ? 'text-slate-800' : 'text-muted-foreground'}`}>
                {value || '카테고리 없음'}
              </span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
          </Button>
        </PickerTrigger>

        <PickerContent
          title="카테고리"
          className="w-[--radix-popover-trigger-width] min-w-[16rem] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="카테고리 검색 또는 새로 입력..."
              value={query}
              onValueChange={(v) => setQuery(v.slice(0, MAX_CATEGORY_LENGTH))}
            />
            <CommandList>
              {filtered.length === 0 && !canCreate && (
                <CommandEmpty>아직 만들어진 카테고리가 없습니다</CommandEmpty>
              )}

              {canCreate && (
                <CommandGroup>
                  <CommandItem value={`__create__${typed}`} onSelect={() => commit(typed)}>
                    <Plus className="mr-2 h-3.5 w-3.5 text-blue-600" />
                    <span className="truncate">
                      <span className="font-medium">{typed}</span>
                      <span className="text-muted-foreground"> 새로 만들기</span>
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}

              {filtered.length > 0 && (
                <CommandGroup heading="이미 쓰이는 카테고리">
                  {filtered.map((option) => (
                    <CommandItem key={option} value={option} onSelect={() => commit(option)}>
                      <Check
                        className={`mr-2 h-3.5 w-3.5 ${value === option ? 'opacity-100' : 'opacity-0'}`}
                      />
                      <span className="truncate">{option}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PickerContent>
      </PickerRoot>

      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={() => onChange(null)}
          title="카테고리 지우기"
          className="h-9 w-9 flex-shrink-0 text-slate-400 hover:text-slate-600"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
