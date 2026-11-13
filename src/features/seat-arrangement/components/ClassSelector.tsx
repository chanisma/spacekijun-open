import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ClassSelectorProps {
  grade: number | null;
  classNum: number | null;
  onChange: (grade: number | null, classNum: number | null) => void;
  studentCount?: number;
}

const GRADES = [1, 2, 3];
const CLASSES = Array.from({ length: 9 }, (_, i) => i + 1);

export function ClassSelector({ grade, classNum, onChange, studentCount }: ClassSelectorProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-500">학년</Label>
        <Select
          value={grade != null ? String(grade) : ''}
          onValueChange={(v) => onChange(v ? Number(v) : null, classNum)}
        >
          <SelectTrigger className="w-28">
            <SelectValue placeholder="학년 선택" />
          </SelectTrigger>
          <SelectContent>
            {GRADES.map((g) => (
              <SelectItem key={g} value={String(g)}>
                {g}학년
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-500">반</Label>
        <Select
          value={classNum != null ? String(classNum) : ''}
          onValueChange={(v) => onChange(grade, v ? Number(v) : null)}
          disabled={grade == null}
        >
          <SelectTrigger className="w-28">
            <SelectValue placeholder="반 선택" />
          </SelectTrigger>
          <SelectContent>
            {CLASSES.map((c) => (
              <SelectItem key={c} value={String(c)}>
                {c}반
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {grade != null && classNum != null && (
        <div className="text-sm text-slate-500 pb-2">
          {studentCount !== undefined ? `학생 ${studentCount}명` : '학생 로딩 중...'}
        </div>
      )}
    </div>
  );
}
