// 자습 감독 — 못 하는 날 (2026-10-12)
//
// 매주 반복(«매주 수요일 저녁 — 대학원 수업») 또는 특정 날짜(«11/3 아침·저녁»)를 적어 두면
// 자동 배정이 피한다. 배정 화면(학년부장·담임이 명단 전체)과 [내 감독·교체](나만) 두 곳에서 같은
// 부품을 쓴다. 판정은 `@/lib/selfStudySupervision` 의 `unavailabilityReason` 하나.
import { useMemo, useState } from 'react';
import { CalendarX2, Loader2, Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  SLOT_LABEL,
  SUPERVISION_SLOTS,
  describeRule,
  type SupervisionSlot,
  type UnavailabilityRule,
} from '@/lib/selfStudySupervision';
import { UNAVAILABILITY_QUERY_KEY, addUnavailability, deleteUnavailability } from './useSupervisionSources';

const WEEKDAYS: [number, string][] = [[1, '월'], [2, '화'], [3, '수'], [4, '목'], [5, '금'], [6, '토']];

export function UnavailabilityPanel({
  people,
  rules,
  autoRules = [],
  canEdit,
  fixedPerson,
  slots = SUPERVISION_SLOTS,
  intro,
}: {
  /** 적을 수 있는 사람 — 배정 화면은 그 명단, 내 화면은 나 하나 */
  people: { resourceId: string; name: string }[];
  /** 저장된 규칙(이 사람들 것만 보인다) */
  rules: UnavailabilityRule[];
  /** 화면이 만든 규칙 — 보여 주기만 한다(수능 이후 3학년 제외 등) */
  autoRules?: UnavailabilityRule[];
  canEdit: (rule: UnavailabilityRule) => boolean;
  /** 사람 선택 없이 이 사람으로 고정(내 화면) */
  fixedPerson?: { resourceId: string; name: string };
  /** 고를 수 있는 시간대 — 전 학년 아침 화면은 아침만 */
  slots?: SupervisionSlot[];
  intro?: string;
}) {
  const queryClient = useQueryClient();
  const [person, setPerson] = useState(fixedPerson?.resourceId ?? '');
  const [mode, setMode] = useState<'weekly' | 'date'>('weekly');
  const [weekday, setWeekday] = useState(3);
  const [date, setDate] = useState('');
  const [until, setUntil] = useState('');
  const [picked, setPicked] = useState<Set<SupervisionSlot>>(new Set([slots.includes('evening') ? 'evening' : slots[0]]));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const names = useMemo(() => new Set(people.map((p) => p.name)), [people]);
  const visible = rules.filter((r) => names.has(r.name));
  const visibleAuto = autoRules.filter((r) => names.has(r.name));
  const targetId = fixedPerson?.resourceId ?? person;
  const ready = !!targetId && picked.size > 0 && (mode === 'weekly' || !!date);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: UNAVAILABILITY_QUERY_KEY });
  };

  const add = async () => {
    if (!ready) return;
    setBusy('add');
    try {
      await addUnavailability({
        resourceId: targetId,
        weekday: mode === 'weekly' ? weekday : null,
        date: mode === 'date' ? date : null,
        from: null,
        until: mode === 'weekly' && until ? until : null,
        slots: SUPERVISION_SLOTS.filter((s) => picked.has(s)),
        note,
      });
      setNote(''); setDate(''); setUntil('');
      refresh();
    } catch (error) {
      toast.error(`저장하지 못했습니다: ${(error as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await deleteUnavailability(id);
      refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      {intro && <p className="text-xs text-slate-500">{intro}</p>}

      {visible.length + visibleAuto.length === 0 ? (
        <p className="text-xs text-slate-400">적어 둔 사정이 없습니다.</p>
      ) : (
        <ul className="space-y-1">
          {[...visibleAuto, ...visible].map((rule, i) => (
            <li key={rule.id ?? `auto-${rule.name}-${i}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
              <CalendarX2 className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              {!fixedPerson && <span className="shrink-0 font-semibold text-slate-800">{rule.name}</span>}
              <span className="shrink-0 text-slate-700">{describeRule(rule)}</span>
              {rule.note && <span className="min-w-0 truncate text-slate-400" title={rule.note}>{rule.note}</span>}
              {rule.auto ? (
                <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">자동</span>
              ) : canEdit(rule) && rule.id ? (
                <button type="button" aria-label={`${rule.name} ${describeRule(rule)} 지우기`}
                  className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  disabled={busy === rule.id} onClick={() => remove(rule.id as string)}>
                  {busy === rule.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* 추가 */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-xs">
        {!fixedPerson && (
          <select aria-label="선생님" className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
            value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">선생님</option>
            {people.map((p) => <option key={p.resourceId} value={p.resourceId}>{p.name}</option>)}
          </select>
        )}
        <div className="flex rounded-lg border border-slate-100 bg-white p-0.5">
          {([['weekly', '매주'], ['date', '특정 날짜']] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setMode(value)}
              className={cn('h-7 rounded-md px-2.5 font-medium', mode === value ? 'bg-slate-800 text-white' : 'text-slate-500')}>
              {label}
            </button>
          ))}
        </div>
        {mode === 'weekly' ? (
          <>
            <select aria-label="요일" className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
              value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEKDAYS.map(([d, label]) => <option key={d} value={d}>{label}요일</option>)}
            </select>
            <label className="flex items-center gap-1 text-slate-500">
              언제까지(선택)
              <input type="date" aria-label="언제까지" className="h-8 rounded-md border border-slate-200 bg-white px-2 tabular-nums"
                value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
          </>
        ) : (
          <input type="date" aria-label="날짜" className="h-8 rounded-md border border-slate-200 bg-white px-2 tabular-nums"
            value={date} onChange={(e) => setDate(e.target.value)} />
        )}
        {slots.length > 1 && (
          <div className="flex gap-1">
            {slots.map((slot) => (
              <label key={slot} className={cn('flex h-8 cursor-pointer items-center gap-1 rounded-md border px-2',
                picked.has(slot) ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-500')}>
                <input type="checkbox" className="h-3.5 w-3.5" checked={picked.has(slot)}
                  onChange={(e) => setPicked((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(slot); else next.delete(slot);
                    return next;
                  })} />
                {SLOT_LABEL[slot]}
              </label>
            ))}
          </div>
        )}
        <input type="text" maxLength={100} placeholder="사유(선택) — 예: 대학원 수업" aria-label="사유"
          className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 sm:max-w-[200px]"
          value={note} onChange={(e) => setNote(e.target.value)} />
        <Button className="h-8 gap-1 bg-blue-600 px-3 text-xs hover:bg-blue-700" disabled={!ready || busy === 'add'} onClick={add}>
          {busy === 'add' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} 추가
        </Button>
      </div>
    </div>
  );
}
