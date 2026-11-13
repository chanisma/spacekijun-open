import { useRef, useState, useEffect, KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { useStudentMention } from '@/hooks/useStudentMention';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onEscape?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export function MentionInput({
  value,
  onChange,
  onKeyDown,
  onEscape,
  placeholder,
  disabled,
  className,
  autoFocus,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data: items = [], isLoading, isError } = useStudentMention(mentionQuery);

  useEffect(() => {
    if (isError) {
      toast({ title: '검색 실패', description: '잠시 후 다시 시도해주세요.', variant: 'destructive' });
    }
  }, [isError]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [mentionQuery]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursor = e.target.selectionStart ?? newValue.length;
    const textBeforeCursor = newValue.slice(0, cursor);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1) {
      const query = textBeforeCursor.slice(atIndex + 1);
      if (!query.includes(' ')) {
        setMentionStart(atIndex);
        setMentionQuery(query);
        setDropdownOpen(true);
        return;
      }
    }

    setDropdownOpen(false);
    setMentionQuery('');
    setMentionStart(null);
  };

  const selectItem = (index: number) => {
    const item = items[index];
    if (!item || mentionStart === null) return;

    // 저장 포맷: @[G-C-N:이름] 또는 @[이름]
    const markup = `@[${item.bracketContent}]`;
    const before = value.slice(0, mentionStart);
    const after = value.slice(mentionStart + 1 + mentionQuery.length);
    const newValue = `${before}${markup}${after}`;

    onChange(newValue);
    setDropdownOpen(false);
    setMentionQuery('');
    setMentionStart(null);

    requestAnimationFrame(() => {
      const pos = before.length + markup.length;
      inputRef.current?.setSelectionRange(pos, pos);
      inputRef.current?.focus();
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (dropdownOpen && items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, items.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        selectItem(selectedIndex);
        return; // props.onKeyDown 호출 안 함 (submit 방지)
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDropdownOpen(false);
        return; // onEscape 호출 안 함
      }
    }

    if (e.key === 'Escape') {
      onEscape?.();
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative flex-1">
      <Input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoFocus={autoFocus}
      />

      {dropdownOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              검색 중...
            </div>
          )}

          {!isLoading && items.length === 0 && mentionQuery.length > 0 && (
            <div className="py-3 text-center text-xs text-slate-400">검색 결과가 없습니다</div>
          )}

          {!isLoading && items.map((item, i) => (
            <button
              key={`${item.type}-${item.bracketContent}`}
              type="button"
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-indigo-50 transition-colors',
                i === selectedIndex && 'bg-indigo-50'
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                selectItem(i);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className={cn(
                'h-7 w-7 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center',
                item.type === 'teacher' ? 'bg-emerald-100' : 'bg-indigo-100'
              )}>
                {item.type === 'student' && item.picture ? (
                  <img
                    src={item.picture}
                    alt={item.name}
                    className="h-full w-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <span className={cn(
                    'text-xs font-bold',
                    item.type === 'teacher' ? 'text-emerald-600' : 'text-indigo-600'
                  )}>
                    {item.name.charAt(0)}
                  </span>
                )}
              </div>

              <span className="text-xs font-semibold text-slate-700">{item.name}</span>

              <span className="ml-auto text-[10px]">
                {item.type === 'teacher'
                  ? <span className="bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">교사</span>
                  : <span className="text-slate-400">{item.bracketContent.split(':')[0]}</span>
                }
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
