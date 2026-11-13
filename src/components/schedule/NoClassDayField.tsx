import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { NoClassSetting } from '@/lib/schoolDay';

const GRADES = [1, 2, 3] as const;

/**
 * 학사일정의 «수업 없는 날» — 켜면 NEIS 와 같은 값(`휴업일`)을 저장해 대시보드 시간표·시간표 화면·
 * 다마고찌·자습 감독이 그날을 쉬는 날로 본다(2026-10-11). 학년을 고르면 그 학년만.
 * 저장 규칙은 `noClassMetaPatch`(lib/schoolDay).
 */
export function NoClassDayField({
  value,
  onChange,
  idPrefix = 'no-class',
}: {
  value: NoClassSetting;
  onChange: (next: NoClassSetting) => void;
  idPrefix?: string;
}) {
  const allGrades = value.grades.length === 0;
  const toggleGrade = (grade: number) => {
    const has = value.grades.includes(grade);
    const next = has ? value.grades.filter((g) => g !== grade) : [...value.grades, grade].sort((a, b) => a - b);
    // 셋 다 고르면 «전 학년»과 같다
    onChange({ ...value, grades: next.length >= GRADES.length ? [] : next });
  };

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <Checkbox
          id={`${idPrefix}-enabled`}
          checked={value.enabled}
          onCheckedChange={(checked) => onChange({ enabled: checked === true, grades: checked === true ? value.grades : [] })}
          className="mt-0.5"
        />
        <div className="min-w-0">
          <Label htmlFor={`${idPrefix}-enabled`} className="text-sm font-medium">수업 없는 날</Label>
          <p className="text-xs text-slate-500">
            재량휴업일처럼 수업이 없는 날이면 체크하세요. 대시보드 시간표·자습 감독 배정이 이 날을 쉬는 날로 봅니다.
          </p>
        </div>
      </div>
      {value.enabled && (
        <div className="flex flex-wrap items-center gap-1.5 pl-6" role="group" aria-label="수업이 없는 학년">
          <button
            type="button"
            aria-pressed={allGrades}
            onClick={() => onChange({ ...value, grades: [] })}
            className={cn('h-11 rounded-lg border px-3 text-xs font-semibold sm:h-8',
              allGrades ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}
          >
            전 학년
          </button>
          {GRADES.map((grade) => {
            const on = value.grades.includes(grade);
            return (
              <button
                key={grade}
                type="button"
                aria-pressed={on}
                onClick={() => toggleGrade(grade)}
                className={cn('h-11 rounded-lg border px-3 text-xs font-semibold sm:h-8',
                  on ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}
              >
                {grade}학년
              </button>
            );
          })}
          <span className="text-[11px] text-slate-400">
            {allGrades ? '모든 학년의 수업이 없습니다' : `${value.grades.join('·')}학년만 수업이 없습니다`}
          </span>
        </div>
      )}
    </div>
  );
}
