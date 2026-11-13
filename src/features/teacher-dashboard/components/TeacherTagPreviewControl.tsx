import { useMemo, useState } from 'react';
import { Briefcase, Check, ChevronDown, Search, X } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useResourceTags } from '@/hooks/useResourceTags';
import {
  getTeacherTagCategory,
  summarizeTeacherPreviewTags,
  teacherTagCategoryLabels,
  teacherTagCategoryOrder,
  type TeacherTagCategory,
} from '../utils/teacherPreviewTags';

export function TeacherTagPreviewControl() {
  // isAdmin은 미리보기 중 false가 되므로 여기선 쓰면 안 된다 — 나가기 칩이 사라진다.
  const {
    isRealAdmin,
    isTeacherView,
    teacherPreviewTags,
    setTeacherPreviewTags,
    setViewAsTeacher,
  } = useAuth();
  const { data: resourceTags = [], isLoading } = useResourceTags(isRealAdmin);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>(teacherPreviewTags);

  const groupedTags = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('ko-KR');
    const groups = new Map<TeacherTagCategory, typeof resourceTags>();

    teacherTagCategoryOrder.forEach((category) => groups.set(category, []));
    resourceTags
      .filter((tag) => {
        if (!normalizedSearch) return true;
        return `${tag.name} ${tag.description ?? ''}`
          .toLocaleLowerCase('ko-KR')
          .includes(normalizedSearch);
      })
      .forEach((tag) => {
        groups.get(getTeacherTagCategory(tag))?.push(tag);
      });

    return groups;
  }, [resourceTags, search]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setDraftTags(teacherPreviewTags);
      setSearch('');
    }
  };

  const toggleTag = (tagName: string) => {
    setDraftTags((current) => (
      current.includes(tagName)
        ? current.filter((name) => name !== tagName)
        : [...current, tagName]
    ));
  };

  const applyPreview = () => {
    setTeacherPreviewTags(draftTags);
    setViewAsTeacher(true);
    setOpen(false);
  };

  if (!isRealAdmin) return null;

  return (
    <div className={isTeacherView
      ? 'flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-1'
      : undefined}
    >
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          {isTeacherView ? (
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5 rounded-full px-1 text-xs font-medium text-emerald-700 hover:text-emerald-900"
              title="교사 역할 태그 변경"
            >
              <Briefcase className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="max-w-36 truncate">{summarizeTeacherPreviewTags(teacherPreviewTags)}</span>
              <ChevronDown className="h-3 w-3 flex-shrink-0" />
            </button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600"
              title="교사 역할 태그별 대시보드 미리보기"
            >
              <Briefcase className="h-3.5 w-3.5" />
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="border-b p-3">
            <p className="text-sm font-semibold text-slate-900">교사 역할 태그 미리보기</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              실제 태그나 권한은 바꾸지 않고 대시보드 카드 구성만 확인합니다.
            </p>
            <div className="relative mt-3">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="태그 이름 또는 설명 검색"
                className="h-9 w-full rounded-md border border-slate-200 pl-8 pr-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => setDraftTags([])}
              className={`mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${
                draftTags.length === 0
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div>
                <p className="text-sm font-medium">일반 교사</p>
                <p className="text-xs text-slate-500">역할 태그 없음</p>
              </div>
              {draftTags.length === 0 && <Check className="h-4 w-4" />}
            </button>

            {isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : teacherTagCategoryOrder.map((category) => {
              const tags = groupedTags.get(category) ?? [];
              if (tags.length === 0) return null;

              return (
                <div key={category} className="mb-3 last:mb-0">
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {teacherTagCategoryLabels[category]}
                  </p>
                  <div className="space-y-1">
                    {tags.map((tag) => {
                      const selected = draftTags.includes(tag.name);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.name)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left ${
                            selected ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                            selected ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'
                          }`}>
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{tag.name}</span>
                            {tag.description && (
                              <span className="block truncate text-xs text-slate-500">{tag.description}</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 border-t bg-slate-50 p-3">
            <span className="text-xs text-slate-500">{draftTags.length}개 태그 선택</span>
            <Button size="sm" onClick={applyPreview} className="bg-emerald-600 hover:bg-emerald-700">
              미리보기 적용
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {isTeacherView && (
        <button
          type="button"
          onClick={() => setViewAsTeacher(false)}
          className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-emerald-200"
          title="관리자 화면으로 돌아가기"
        >
          <X className="h-3 w-3 text-emerald-600" />
        </button>
      )}
    </div>
  );
}
