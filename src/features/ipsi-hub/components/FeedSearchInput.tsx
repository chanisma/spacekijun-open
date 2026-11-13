import { Loader2, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MAX_SEARCH_QUERY_LENGTH } from '../utils/search';

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Enter — 입력이 멈추기를 기다리지 않고 바로 찾는다 */
  onCommit: () => void;
  onClear: () => void;
  /** 결과를 받아 오는 중(검색 한 번이 수백 ms 라 아이콘으로 알린다) */
  busy?: boolean;
};

/**
 * 입시 정보 검색창. 제목·요약·본문·자막을 서버에서 한꺼번에 찾는다.
 *
 * - `type="search"` 를 쓰지 않는다 — 크롬·사파리가 자체 지우기 버튼을 그려 X 가 두 개가 된다.
 *   대신 `inputMode`/`enterKeyHint` 로 휴대폰 키보드에 [검색] 키를 띄운다.
 * - 글자 크기를 지정하지 않는다: `Input` 기본값이 휴대폰 16px(`text-base md:text-sm`)이고,
 *   16px 미만이면 iOS 가 포커스 때 화면을 확대한다(CLAUDE.md §2-1).
 */
export function FeedSearchInput({ value, onChange, onCommit, onClear, busy = false }: Props) {
  const Icon = busy ? Loader2 : Search;
  return (
    <div className="relative w-full">
      <Icon
        className={`pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 ${busy ? 'animate-spin' : ''}`}
        aria-hidden
      />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onCommit();
          } else if (event.key === 'Escape' && value) {
            event.preventDefault();
            onClear();
          }
        }}
        maxLength={MAX_SEARCH_QUERY_LENGTH}
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder="제목·내용·자막 검색"
        aria-label="입시 정보 검색 (제목·내용·자막)"
        className="h-9 rounded-lg border-slate-200 bg-white/70 pl-8 pr-9 focus-visible:ring-1 focus-visible:ring-blue-400 focus-visible:ring-offset-0"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-r-lg text-slate-400 transition-colors hover:text-slate-700"
          aria-label="검색어 지우기"
          title="검색어 지우기"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
