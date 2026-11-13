import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRescueAccess } from '../../hooks/useRescueAccess';
import { useCrisisDashboard } from '../../hooks/useRescueRoster';
import { useTagDefinitions } from '../../hooks/useTagDefinitions';
import { StatsCards } from './StatsCards';
import { StudentRoster } from './StudentRoster';
import { RESCUE_STATUS, STATUS_LABELS } from '../../constants';

export function CrisisDashboardContent() {
  const access = useRescueAccess();
  const crisis = useCrisisDashboard();
  const defs = useTagDefinitions();
  const [gradeF, setGradeF] = useState<string>('all');
  const [classF, setClassF] = useState<string>('all');
  const [tagF, setTagF] = useState<string>('all');
  const [statusF, setStatusF] = useState<string>('all');
  const [nameF, setNameF] = useState('');

  const rows = useMemo(() => {
    let xs = crisis.data ?? [];
    if (gradeF !== 'all') xs = xs.filter((r) => String(r.grade) === gradeF);
    if (classF !== 'all') xs = xs.filter((r) => String(r.classNum) === classF);
    if (tagF !== 'all') xs = xs.filter((r) => r.tagKeys.includes(tagF));
    if (statusF !== 'all') xs = xs.filter((r) => r.status === statusF);
    if (nameF.trim()) xs = xs.filter((r) => r.name.includes(nameF.trim()));
    return xs;
  }, [crisis.data, gradeF, classF, tagF, statusF, nameF]);

  if (!access.canAccessDashboard) return null;

  const grades = Array.from(new Set((crisis.data ?? []).map((r) => r.grade))).sort();
  const classes = Array.from(
    new Set(
      (crisis.data ?? [])
        .filter((r) => gradeF === 'all' || String(r.grade) === gradeF)
        .map((r) => r.classNum)
    )
  ).sort();

  return (
    <div className="p-6">
      <StatsCards rows={crisis.data ?? []} />

      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={gradeF} onValueChange={setGradeF}>
          <SelectTrigger className="w-28 text-xs bg-white/60 border-slate-200">
            <SelectValue placeholder="학년" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 학년</SelectItem>
            {grades.map((g) => (
              <SelectItem key={g} value={String(g)}>{g}학년</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={classF} onValueChange={setClassF}>
          <SelectTrigger className="w-28 text-xs bg-white/60 border-slate-200">
            <SelectValue placeholder="반" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 반</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c} value={String(c)}>{c}반</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tagF} onValueChange={setTagF}>
          <SelectTrigger className="w-36 text-xs bg-white/60 border-slate-200">
            <SelectValue placeholder="태그" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 태그</SelectItem>
            {(defs.data ?? []).map((d) => (
              <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-28 text-xs bg-white/60 border-slate-200">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {Object.values(RESCUE_STATUS).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="이름 검색"
          value={nameF}
          onChange={(e) => setNameF(e.target.value)}
          className="w-40 text-xs bg-white/60 border-slate-200"
        />
      </div>

      <StudentRoster rows={rows} />
    </div>
  );
}
