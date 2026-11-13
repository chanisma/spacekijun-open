import { Tag } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import type { FeedType } from './TypeFilterChips';
import { categoriesForType } from '../utils/categories';

type Props = {
  type: FeedType;
  active: string;
  onChange: (category: string) => void;
};

/**
 * 휴대폰용 태그(카테고리) 필터 — 칩 줄 대신 드롭다운 하나 (2026-09-22 사용자 요청).
 *
 * 칩 8개는 휴대폰에서 두세 줄로 접혀 헤더를 키웠고, 검색창을 놓을 자리가 없었다.
 * 목록은 데스크톱 칩(`CategoryFilterChips`)과 **같은 출처**(`categoriesForType`)라
 * 두 화면이 다른 분류를 보여 줄 수 없다.
 */
export function CategoryFilterSelect({ type, active, onChange }: Props) {
  const categories = categoriesForType(type);
  const filtered = active !== '전체';
  return (
    <Select value={active} onValueChange={onChange}>
      <SelectTrigger
        aria-label="태그 필터"
        className={`h-9 w-auto min-w-[92px] gap-1.5 rounded-lg px-2.5 text-sm ${
          filtered ? 'border-blue-200 bg-blue-50 font-medium text-blue-700' : 'border-slate-200 bg-white/70 text-slate-700'
        }`}
      >
        <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{filtered ? active : '태그 전체'}</span>
      </SelectTrigger>
      <SelectContent>
        {categories.map((category) => (
          <SelectItem key={category} value={category}>
            {category === '전체' ? '태그 전체' : category}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
