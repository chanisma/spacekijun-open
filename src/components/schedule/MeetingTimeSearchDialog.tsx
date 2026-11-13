import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Label } from '../ui/label';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { SearchableMultiSelect } from '../ui/searchable-multi-select';
import { cn } from '@/lib/utils';

// Time code format: "{day}{period}" — day 1=Mon … 5=Fri, period 1–7
const DAYS = ['월', '화', '수', '목', '금'] as const;
const PERIODS = [1, 2, 3, 4, 5, 6, 7] as const;

type CellStatus = 'empty' | 'available' | 'partial' | 'busy';

interface MeetingTimeSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MeetingTimeSearchDialog: React.FC<MeetingTimeSearchDialogProps> = ({ open, onOpenChange }) => {
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  // Map: teacher id → set of busy time codes
  const [teacherSections, setTeacherSections] = useState<Record<string, Set<string>>>({});
  // Map: teacher id → display name
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedTeachers.length === 0) {
      setTeacherSections({});
      setTeacherNames({});
      return;
    }

    const fetchSections = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('resource')
          .select('id, name, meta')
          .in('id', selectedTeachers)   // selectedValues are resource UUIDs
          .in('type', ['teacher', 'staff']);

        if (error) throw error;

        const sections: Record<string, Set<string>> = {};
        const names: Record<string, string> = {};
        (data ?? []).forEach(resource => {
          const busyCodes = new Set<string>();
          const section = resource.meta?.section as Record<string, { time?: string[] }> | undefined;
          if (section) {
            Object.values(section).forEach(subjectData => {
              subjectData.time?.forEach(code => busyCodes.add(code));
            });
          }
          sections[resource.id] = busyCodes;
          names[resource.id] = resource.name;
        });
        setTeacherSections(sections);
        setTeacherNames(names);
      } catch (err) {
        console.error('Error fetching teacher sections:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSections();
  }, [selectedTeachers]);

  const handleClose = () => {
    setSelectedTeachers([]);
    setTeacherSections({});
    setTeacherNames({});
    onOpenChange(false);
  };

  const getCellStatus = (day: number, period: number): CellStatus => {
    if (selectedTeachers.length === 0) return 'empty';
    const code = `${day}${period}`;
    const busyCount = selectedTeachers.filter(name => teacherSections[name]?.has(code)).length;
    if (busyCount === 0) return 'available';
    if (busyCount === selectedTeachers.length) return 'busy';
    return 'partial';
  };

  const getBusyTeachersForCell = (day: number, period: number): string[] => {
    const code = `${day}${period}`;
    return selectedTeachers.filter(name => teacherSections[name]?.has(code));
  };

  const getFreeTeachersForCell = (day: number, period: number): string[] => {
    const code = `${day}${period}`;
    return selectedTeachers.filter(name => !teacherSections[name]?.has(code));
  };

  // Count available slots for summary
  const availableCount = DAYS.reduce((acc, _, di) =>
    acc + PERIODS.filter(p => getCellStatus(di + 1, p) === 'available').length, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-0 shadow-2xl">
        {/* Glassmorphism background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/95 via-blue-50/90 to-purple-50/95 backdrop-blur-xl rounded-lg" />

        <div className="relative z-10 flex flex-col h-full">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-white/40">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-indigo-900">
                <div className="p-1.5 rounded-lg bg-indigo-100/80 backdrop-blur-sm">
                  <Users className="h-4 w-4 text-indigo-600" />
                </div>
                회의 가능 시간 검색
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="flex flex-col gap-4 px-4 py-4 flex-1 overflow-hidden sm:px-6">
            {/* Teacher selector — max-h prevents badge overflow from squeezing the grid */}
            <div
              className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/60 shadow-sm p-4 shrink-0 max-h-[200px] overflow-y-auto [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none' }}
            >
              <Label className="text-sm font-medium text-slate-700 mb-2 block">교사 선택</Label>
              <SearchableMultiSelect
                selectedValues={selectedTeachers}
                onSelectionChange={setSelectedTeachers}
                placeholder="교사를 선택하거나 이름으로 검색하세요"
                searchPlaceholder="이름 또는 초성으로 검색..."
                filterByTeacher
                maxSelectedDisplay={6}
              />
              {selectedTeachers.length > 0 && !loading && (
                <p className="text-xs text-slate-500 mt-2">
                  <span className="text-emerald-600 font-semibold">{availableCount}개</span> 가능 시간대
                  {' '}/ 전체 {DAYS.length * PERIODS.length}개
                </p>
              )}
            </div>

            {/* Timetable grid */}
            <div className="flex-1 overflow-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
              <div className="bg-white/50 backdrop-blur-sm rounded-xl border border-white/60 shadow-sm">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="w-12 p-2 text-center text-xs font-medium text-slate-400 bg-white/40">
                        교시
                      </th>
                      {DAYS.map(day => (
                        <th
                          key={day}
                          className="p-2 text-center text-sm font-semibold text-slate-600 bg-white/40 border-l border-white/40"
                        >
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERIODS.map(period => (
                      <tr key={period}>
                        <td className="p-2 text-center text-xs font-medium text-slate-400 bg-white/30 border-t border-white/40">
                          {period}
                        </td>
                        {DAYS.map((_, di) => {
                          const day = di + 1;
                          const status = getCellStatus(day, period);
                          const busyTeachers = getBusyTeachersForCell(day, period);
                          const freeTeachers = getFreeTeachersForCell(day, period);

                          return (
                            <td
                              key={di}
                              className={cn(
                                'border-t border-l border-white/40 p-1 transition-all duration-200 group relative',
                                // 휴대폰(390px)에서 5일이 **다 들어와야 한다** — 80px 면 금요일이 화면 밖으로
                                // 밀리는데 이 표는 스크롤바를 숨겨 둬서 열이 빠진 줄도 모른다.
                                'min-w-[54px] h-12 align-middle sm:min-w-[80px]'
                              )}
                            >
                              <div
                                className={cn(
                                  'h-full w-full rounded-lg flex flex-col items-center justify-center text-xs transition-all duration-200 px-1',
                                  status === 'empty' && 'bg-white/20',
                                  status === 'available' && 'bg-emerald-100/80 border border-emerald-300/60 shadow-sm shadow-emerald-100',
                                  status === 'partial' && 'bg-amber-100/80 border border-amber-300/60 shadow-sm shadow-amber-100',
                                  status === 'busy' && 'bg-rose-100/70 border border-rose-200/60',
                                )}
                              >
                                {status === 'available' && (
                                  <span className="font-semibold text-emerald-700 text-[10px]">가능</span>
                                )}
                                {status === 'partial' && (
                                  <span className="font-semibold text-amber-700 text-[10px]">
                                    {freeTeachers.length}/{selectedTeachers.length}
                                  </span>
                                )}
                                {status === 'busy' && (
                                  <span className="text-rose-400 text-[10px]">●</span>
                                )}
                              </div>

                              {/* Hover tooltip — flip direction based on period to avoid dialog clipping */}
                              {status !== 'empty' && (
                                <div className={cn(
                                  "absolute z-20 left-1/2 -translate-x-1/2 w-36 hidden group-hover:block",
                                  period <= 3 ? "top-full mt-1" : "bottom-full mb-1"
                                )}>
                                  <div className="bg-slate-800/90 backdrop-blur-md text-white text-[10px] rounded-lg p-2 shadow-xl border border-white/10 leading-relaxed">
                                    {freeTeachers.length > 0 && (
                                      <div>
                                        <span className="text-emerald-400 font-semibold">가능: </span>
                                        {freeTeachers.map(id => teacherNames[id] ?? id).join(', ')}
                                      </div>
                                    )}
                                    {busyTeachers.length > 0 && (
                                      <div className="mt-0.5">
                                        <span className="text-rose-400 font-semibold">수업: </span>
                                        {busyTeachers.map(id => teacherNames[id] ?? id).join(', ')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 px-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300" />
                  <span className="text-xs text-slate-500">모두 가능</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
                  <span className="text-xs text-slate-500">일부 가능</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-rose-100 border border-rose-200" />
                  <span className="text-xs text-slate-500">모두 수업 중</span>
                </div>
              </div>

              {loading && (
                <div className="flex items-center justify-center py-4 text-sm text-slate-400">
                  시간표 불러오는 중...
                </div>
              )}

              {selectedTeachers.length === 0 && (
                <div className="flex items-center justify-center py-6 text-sm text-slate-400">
                  교사를 선택하면 회의 가능 시간이 표시됩니다
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MeetingTimeSearchDialog;
