import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { fetchInterestSuggestionSources, saveMyInterests } from '../services/worldNewsService';
import { MAX_INTEREST_FIELDS, preselectedFields, suggestFields, WORLD_FIELDS, type WorldField } from '../utils/fields';
import { worldForMeKey, worldInterestsKey } from '../hooks/useWorldInterests';

/**
 * 관심 분야 고르기. 처음(저장 행 없음)에는 희망 학과·생기부 관심에서 추천한 분야를 미리 체크해 두고,
 * 한 번 저장한 뒤에는 저장값만 보여 준다(추천이 학생의 선택을 다시 덮지 않는다). 추천 근거는 늘 글로 보인다.
 */
export function InterestDialog({ userId, saved, current, notify: currentNotify, onClose }: {
  userId: string;
  saved: boolean;
  current: WorldField[];
  notify: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const sources = useQuery({
    queryKey: ['world-today', 'interest-sources', userId],
    queryFn: fetchInterestSuggestionSources,
    staleTime: 30 * 60 * 1000,
  });
  const suggestions = useMemo(() => suggestFields(sources.data ?? { departments: [], interests: [] }), [sources.data]);
  const suggestionOf = useMemo(() => new Map(suggestions.map(item => [item.field, item])), [suggestions]);
  // 사용자가 손대기 전까지는 «저장값, 없으면 추천»을 따른다. 추천은 늦게 도착하므로 상태에 굳히지 않는다.
  const [picked, setPicked] = useState<WorldField[] | null>(null);
  const selected = picked ?? (saved ? current : preselectedFields(suggestions));
  const [notify, setNotify] = useState(currentNotify);
  const full = selected.length >= MAX_INTEREST_FIELDS;

  const save = useMutation({
    mutationFn: () => saveMyInterests(userId, selected, notify),
    onSuccess: data => {
      queryClient.setQueryData(worldInterestsKey(userId), data);
      void queryClient.invalidateQueries({ queryKey: worldForMeKey(userId) });
      onClose();
    },
  });

  const toggle = (field: WorldField) => {
    setPicked(selected.includes(field) ? selected.filter(item => item !== field) : full ? selected : [...selected, field]);
  };

  return (
    <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
      <DialogContent className="max-w-lg gap-0 p-0 bg-[#fcf9f3]">
        <div className="border-b border-[#ece3d6] px-5 pb-4 pt-5 sm:px-6">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-[#9a7d50]"><Sparkles size={14} aria-hidden /> 나를 위한 관측</p>
          <DialogTitle className="mt-2 text-lg font-bold text-[#41344f]">관심 분야 고르기</DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-6 text-[#7d7085]">
            고른 분야의 새 소식을 요즘 세상 맨 위와 홈에서 먼저 보여 줄게요. 최대 {MAX_INTEREST_FIELDS}개까지 고를 수 있어요.
          </DialogDescription>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div role="group" aria-label="관심 분야" className="flex flex-wrap gap-2">
            {WORLD_FIELDS.map(field => {
              const on = selected.includes(field);
              const suggested = suggestionOf.has(field);
              return (
                <button key={field} type="button" aria-pressed={on} disabled={!on && full}
                  onClick={() => toggle(field)}
                  className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9473a6] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9 sm:text-xs',
                    on ? 'border-[#644574] bg-[#644574] text-[#fff8f0]' : 'border-[#e2d6e7] bg-white text-[#5d4a6a] hover:border-[#b8a0c6]')}>
                  {on && <Check size={14} aria-hidden />}{field}
                  {suggested && !on && <span className="rounded-full bg-[#f6ecd8] px-1.5 text-[10px] font-semibold text-[#8a6a2e]">추천</span>}
                </button>
              );
            })}
          </div>
          {full && <p className="text-[11px] text-[#8a6a2e]">{MAX_INTEREST_FIELDS}개를 모두 골랐어요. 바꾸려면 하나를 먼저 해제해 주세요.</p>}

          <section aria-label="추천 근거" className="rounded-xl border border-[#ece3d6] bg-white/70 p-3.5">
            <p className="text-[11px] font-semibold text-[#8a6a2e]">추천한 까닭</p>
            {sources.isPending ? <p role="status" className="mt-1.5 text-xs text-[#857a8c]">희망 학과와 생기부 기록을 살펴보는 중이에요.</p>
              : sources.isError ? <p className="mt-1.5 text-xs text-[#857a8c]">추천을 불러오지 못했어요. 직접 골라도 괜찮아요.</p>
              : suggestions.length === 0 ? <p className="mt-1.5 text-xs leading-5 text-[#857a8c]">아직 추천할 근거(희망 학과·생기부 관심 기록)가 없어요. 끌리는 분야를 직접 골라 주세요.</p>
              : <ul className="mt-1.5 space-y-1.5">
                  {suggestions.slice(0, 6).map(item => (
                    <li key={item.field} className="min-w-0 text-xs leading-5 text-[#5d4a6a]">
                      <span className="font-semibold">{item.field}</span>
                      <span className="text-[#857a8c]"> — {item.reasons.slice(0, 2).join(' · ')}{item.reasons.length > 2 ? ` 외 ${item.reasons.length - 2}` : ''}</span>
                    </li>
                  ))}
                </ul>}
            <p className="mt-2 text-[10px] leading-4 text-[#9a8ba2]">추천은 참고일 뿐이에요. 관심은 바뀌니까 언제든 다시 고를 수 있어요.</p>
          </section>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#ece3d6] bg-white/70 p-3.5">
            <input type="checkbox" checked={notify} onChange={event => setNotify(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#644574]" />
            <span className="min-w-0 text-xs leading-5 text-[#5d4a6a]">
              <span className="flex items-center gap-1.5 font-semibold"><Bell size={13} aria-hidden /> 새 소식 알림 받기</span>
              <span className="text-[#857a8c]">관심 분야에 새 소식이 오면 아침에 하루 한 번만 알려 드려요. 휴대폰으로 받으려면 알림 페이지에서 브라우저 알림을 켜 주세요.</span>
            </span>
          </label>
          {save.isError && <p role="alert" className="text-xs text-rose-600">저장하지 못했어요. 잠시 후 다시 시도해 주세요.</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#ece3d6] px-5 py-3 sm:px-6">
          <button type="button" className="min-h-11 rounded-full px-4 text-sm font-semibold text-[#805e92] hover:text-[#51365f] sm:min-h-9 sm:text-xs" disabled={save.isPending} onClick={onClose}>닫기</button>
          <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#644574] px-5 text-sm font-semibold text-[#fff8f0] hover:bg-[#4d345a] disabled:opacity-50 sm:min-h-9 sm:text-xs" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {selected.length === 0 ? '관심 분야 없이 저장' : `${selected.length}개 분야 저장`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
