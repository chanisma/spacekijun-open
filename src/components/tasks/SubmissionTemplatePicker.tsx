// 할 일 편집 — 값 제출용 **양식 고르기** (2026-09-03).
//
// 별도 다이얼로그가 아니라 **인라인 목록**이다: 할 일 편집 자체가 이미 다이얼로그이고,
// 양식 선택은 한 번 고르면 끝나는 짧은 결정이라 창을 하나 더 띄울 값이 없다.
//
// 고른 값은 `meta.submission.template` 로 저장되는데 `familyId` 를 **반드시 함께** 담는다 —
// 양식에 새 버전이 등록되면 핀한 `id` 는 보관본이 되어 목록에서 사라지고, 그 순간 러너의
// 양식 잠금이 조용히 풀린다(담당자가 아무 양식이나 고르게 된다).
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, FileText, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { listSpecTemplates } from '@/features/task-workflow/services/specTemplateService';
import type { SubmissionTemplateRef } from '@/lib/taskSubmissionConfig';

export function SubmissionTemplatePicker({
  value,
  onChange,
  disabled,
  disabledReason,
}: {
  value: SubmissionTemplateRef | null;
  onChange: (next: SubmissionTemplateRef | null) => void;
  /** 이미 제출물이 있으면 바꿀 수 없다(이미 낸 사람과 앞으로 낼 사람의 서식이 갈린다) */
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState(!value);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['docgen-spec-templates'],
    queryFn: listSpecTemplates,
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? templates.filter((t) => (t.name || '').toLowerCase().includes(q)) : templates;
  }, [templates, search]);

  // 저장된 이름이 낡았을 수 있으니(양식 이름 변경) 라이브 행이 있으면 그쪽 이름을 쓴다
  const current = value ? templates.find((t) => t.id === value.id) ?? null : null;
  const currentName = current?.name ?? value?.name ?? '(삭제되었거나 보관된 양식)';

  if (value && !picking) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-indigo-200 bg-white px-2.5 py-2">
        <FileText className="h-4 w-4 shrink-0 text-indigo-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-800" title={currentName}>{currentName}</p>
          {current && (
            <p className="text-[11px] text-slate-400">v{current.version} · 대상자 모두가 이 양식으로 작성합니다</p>
          )}
          {!current && !isLoading && (
            <p className="text-[11px] text-amber-600">현재 목록에 없는 양식입니다. 다시 골라 주세요.</p>
          )}
        </div>
        <Button
          type="button" size="sm" variant="ghost" className="h-7 shrink-0 px-2 text-xs"
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          onClick={() => { setPicking(true); setSearch(''); }}
        >
          변경
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-indigo-200 bg-white">
      <div className="relative border-b border-slate-100">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="양식 이름으로 검색"
          className="h-8 border-0 pl-8 text-sm shadow-none focus-visible:ring-0"
          disabled={disabled}
        />
      </div>
      <div className="max-h-44 overflow-y-auto">
        {isLoading && (
          <p className="flex items-center justify-center gap-1.5 py-4 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />양식을 불러오는 중
          </p>
        )}
        {!isLoading && visible.length === 0 && (
          <p className="py-4 text-center text-xs text-slate-400">
            {templates.length === 0
              ? '등록된 스펙 양식이 없습니다. 문서 생성에서 먼저 양식을 등록하세요.'
              : '검색 결과가 없습니다.'}
          </p>
        )}
        {visible.map((t) => {
          const active = value?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange({ id: t.id, name: t.name, familyId: t.family_id });
                setPicking(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left transition-colors first:border-t-0 hover:bg-indigo-50/60 disabled:opacity-50',
                active && 'bg-indigo-50',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm', active ? 'font-medium text-indigo-700' : 'text-slate-800')} title={t.name}>
                  {t.name}
                </p>
                <p className="text-[11px] text-slate-400">
                  v{t.version} · {new Date(t.created_at).toLocaleDateString('ko-KR')}
                </p>
              </div>
              {active && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
            </button>
          );
        })}
      </div>
      {value && (
        <button
          type="button"
          className="w-full border-t border-slate-100 py-1.5 text-[11px] text-slate-400 hover:text-slate-600"
          onClick={() => setPicking(false)}
        >
          닫기
        </button>
      )}
    </div>
  );
}
