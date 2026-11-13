/**
 * Search Input Component - 학생 검색
 * evalog 글래스모피즘 스타일 적용
 */

import React, { useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCourseAnalyzeFilter } from '../context';
import { debounce } from '../utils/subjectUtils';

export function SearchInput() {
  const { filters, setNameQuery } = useCourseAnalyzeFilter();
  const [inputValue, setInputValue] = useState(filters.nameQuery || '');
  const [isFocused, setIsFocused] = useState(false);

  // Debounced search
  const debouncedSearch = useCallback(
    debounce((value: string) => {
      setNameQuery(value);
    }, 200),
    [setNameQuery]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    debouncedSearch(value);
  };

  const handleClear = () => {
    setInputValue('');
    setNameQuery('');
  };

  return (
    <div className="relative group">
      <div className={cn(
        "absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200",
        isFocused ? "text-brand-500" : "text-slate-400"
      )}>
        <Search className="h-3.5 w-3.5" />
      </div>
      <input
        type="text"
        value={inputValue}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="이름, 반, 번호로 검색..."
        className={cn(
          "w-full pl-8 pr-8 py-2 text-xs font-medium rounded-lg transition-all duration-200",
          "bg-white/50 backdrop-blur-sm border",
          "placeholder:text-slate-400",
          isFocused
            ? "border-brand-300/60 bg-white/80 shadow-sm ring-2 ring-brand-100/50"
            : "border-white/40 hover:border-brand-200/50 hover:bg-white/60"
        )}
      />
      {inputValue && (
        <button
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
