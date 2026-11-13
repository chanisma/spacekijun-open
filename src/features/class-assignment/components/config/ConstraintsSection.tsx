import React, { useState, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Plus, X, Users, UserMinus, UserX, Info } from 'lucide-react';
import { useClassAssignmentContext } from '../../context/ClassAssignmentContext';

export const ConstraintsSection: React.FC = () => {
  const { config, updateConfig, sourceStudents } = useClassAssignmentContext();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Dialog Form State
  const [searchTerm1, setSearchTerm1] = useState('');
  const [searchTerm2, setSearchTerm2] = useState('');
  const [selectedStudent1, setSelectedStudent1] = useState<string>('');
  const [selectedStudent2, setSelectedStudent2] = useState<string>('');
  const [constraintType, setConstraintType] = useState<'separate' | 'combine' | 'exclude'>('separate');

  // Filter students for autocomplete
  const filteredStudents1 = useMemo(() => {
    if (!searchTerm1) return sourceStudents.slice(0, 50);
    const term = searchTerm1.toLowerCase();
    return sourceStudents
      .filter(s =>
        s.name.toLowerCase().includes(term) ||
        s.student_code.toLowerCase().includes(term)
      )
      .slice(0, 50);
  }, [sourceStudents, searchTerm1]);

  const filteredStudents2 = useMemo(() => {
    if (!searchTerm2) return sourceStudents.slice(0, 50);
    const term = searchTerm2.toLowerCase();
    return sourceStudents
      .filter(s =>
        (s.name.toLowerCase().includes(term) ||
          s.student_code.toLowerCase().includes(term)) &&
        s.student_code !== selectedStudent1
      )
      .slice(0, 50);
  }, [sourceStudents, searchTerm2, selectedStudent1]);

  // Parse existing constraints
  const { separatePairs, combinePairs, excludePairs } = useMemo(() => {
    const separate: string[][] = [];
    const combine: string[][] = [];
    const exclude: string[][] = [];

    config.constraints.separateList.forEach(pair => {
      if (pair[0]?.startsWith('COMBINE:')) {
        combine.push([pair[0].replace('COMBINE:', ''), pair[1]]);
      } else if (pair[0]?.startsWith('EXCLUDE:')) {
        exclude.push([pair[0].replace('EXCLUDE:', ''), pair[1]]);
      } else if (pair[0]) {
        separate.push(pair);
      }
    });

    return { separatePairs: separate, combinePairs: combine, excludePairs: exclude };
  }, [config.constraints.separateList]);

  const handleConstraintChange = (key: keyof typeof config.constraints, value: boolean) => {
    updateConfig({
      constraints: {
        ...config.constraints,
        [key]: value,
      },
    });
  };

  const getStudentName = (code: string): string => {
    const student = sourceStudents.find(s => s.student_code === code);
    return student ? `${student.name}(${student.class_num}반)` : code;
  };

  const addConstraintPair = () => {
    if (!selectedStudent1) return;
    if (constraintType !== 'exclude' && (!selectedStudent2 || selectedStudent1 === selectedStudent2)) return;

    let newPair: string[];
    if (constraintType === 'combine') {
      newPair = [`COMBINE:${selectedStudent1}`, selectedStudent2];
    } else if (constraintType === 'exclude') {
      newPair = [`EXCLUDE:${selectedStudent1}`, ''];
    } else {
      newPair = [selectedStudent1, selectedStudent2];
    }

    // Check for duplicates
    const exists = config.constraints.separateList.some(pair => {
      const [c1, c2] = pair;
      if (constraintType === 'exclude') {
        return c1 === `EXCLUDE:${selectedStudent1}`;
      }
      const code1 = c1?.startsWith('COMBINE:') ? c1.replace('COMBINE:', '') : c1;
      return (code1 === selectedStudent1 && c2 === selectedStudent2) ||
        (code1 === selectedStudent2 && c2 === selectedStudent1);
    });

    if (exists) return;

    updateConfig({
      constraints: {
        ...config.constraints,
        separateList: [...config.constraints.separateList, newPair],
      },
    });

    // Close dialog and reset form
    setIsDialogOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setSelectedStudent1('');
    setSelectedStudent2('');
    setSearchTerm1('');
    setSearchTerm2('');
    setConstraintType('separate');
  };

  const removeConstraintPair = (index: number, type: 'separate' | 'combine' | 'exclude') => {
    const pairs = type === 'combine' ? combinePairs : type === 'exclude' ? excludePairs : separatePairs;
    const pairToRemove = pairs[index];

    const newList = config.constraints.separateList.filter(pair => {
      if (type === 'exclude') {
        return pair[0] !== `EXCLUDE:${pairToRemove[0]}`;
      }
      const code1 = pair[0]?.startsWith('COMBINE:') ? pair[0].replace('COMBINE:', '') : pair[0];
      return !(code1 === pairToRemove[0] && pair[1] === pairToRemove[1]);
    });

    updateConfig({
      constraints: {
        ...config.constraints,
        separateList: newList,
      },
    });
  };

  return (
    <div className="space-y-6 text-sm">
      {/* Basic Options */}
      <div className="flex items-center space-x-3 p-2 bg-muted/40 rounded-md">
        <Checkbox
          id="balancePerformance"
          checked={config.constraints.balancePerformance}
          onCheckedChange={(checked) =>
            handleConstraintChange('balancePerformance', checked === true)
          }
        />
        <Label htmlFor="balancePerformance" className="font-medium cursor-pointer flex-1">
          성적 균형 유지
        </Label>
        <div className="text-xs text-muted-foreground mr-2" title="각 반의 평균 성적이 비슷하도록 배정합니다">
          <Info className="w-3.5 h-3.5" />
        </div>
      </div>

      <div className="flex items-center space-x-3 p-2 bg-muted/40 rounded-md">
        <Checkbox
          id="separateSameNames"
          checked={config.constraints.separateSameNames}
          onCheckedChange={(checked) =>
            handleConstraintChange('separateSameNames', checked === true)
          }
        />
        <div className="flex-1">
          <Label htmlFor="separateSameNames" className="font-medium cursor-pointer">
            동명이인 다른 반 배정
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">같은 이름의 학생을 자동으로 서로 다른 반에 배정합니다</p>
        </div>
        <div className="text-xs text-muted-foreground mr-2" title="같은 이름의 학생을 자동으로 서로 다른 반에 배정합니다">
          <Info className="w-3.5 h-3.5" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="font-semibold text-foreground">학생 제약 조건</Label>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs bg-white hover:bg-slate-50 border-dashed" onClick={resetForm}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                조건 추가
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>학생 제약 조건 추가</DialogTitle>
                <DialogDescription>
                  특정 학생들을 서로 분리하거나(같은 반 금지), 결합(같은 반 필수)하도록 설정합니다.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-6 py-4">
                {/* Type Selector */}
                <div className="grid grid-cols-3 p-1 bg-muted rounded-lg">
                  <button
                    className={`flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-md transition-all ${constraintType === 'separate'
                      ? 'bg-white text-destructive shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                      }`}
                    onClick={() => setConstraintType('separate')}
                  >
                    <UserMinus className="h-4 w-4" />
                    분리
                  </button>
                  <button
                    className={`flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-md transition-all ${constraintType === 'combine'
                      ? 'bg-white text-green-600 shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                      }`}
                    onClick={() => setConstraintType('combine')}
                  >
                    <Users className="h-4 w-4" />
                    결합
                  </button>
                  <button
                    className={`flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-md transition-all ${constraintType === 'exclude'
                      ? 'bg-white text-slate-600 shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                      }`}
                    onClick={() => { setConstraintType('exclude'); setSelectedStudent2(''); }}
                  >
                    <UserX className="h-4 w-4" />
                    제외
                  </button>
                </div>

                {/* Student Selectors */}
                <div className="flex items-center gap-3">
                  <div className={`space-y-2 ${constraintType === 'exclude' ? 'w-full' : 'flex-1'}`}>
                    <Label className="text-xs text-muted-foreground">{constraintType === 'exclude' ? '제외할 학생' : '학생 1'}</Label>
                    <Select value={selectedStudent1} onValueChange={setSelectedStudent1}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="선택..." />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-2 border-b sticky top-0 bg-popover z-10">
                          <Input
                            placeholder="검색..."
                            value={searchTerm1}
                            onChange={(e) => setSearchTerm1(e.target.value)}
                            className="h-8 text-xs"
                            autoFocus
                          />
                        </div>
                        <ScrollArea className="h-48">
                          {filteredStudents1.map(student => (
                            <SelectItem key={student.student_code} value={student.student_code} className="text-sm">
                              {student.name} <span className="text-muted-foreground text-xs">({student.class_num}반)</span>
                            </SelectItem>
                          ))}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  </div>

                  {constraintType !== 'exclude' && (
                    <>
                      <div className="flex flex-col justify-end pb-3 text-muted-foreground">
                        {constraintType === 'separate' ? <UserMinus className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                      </div>

                      <div className="space-y-2 flex-1">
                        <Label className="text-xs text-muted-foreground">학생 2</Label>
                        <Select value={selectedStudent2} onValueChange={setSelectedStudent2}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="선택..." />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="p-2 border-b sticky top-0 bg-popover z-10">
                              <Input
                                placeholder="검색..."
                                value={searchTerm2}
                                onChange={(e) => setSearchTerm2(e.target.value)}
                                className="h-8 text-xs"
                                autoFocus
                              />
                            </div>
                            <ScrollArea className="h-48">
                              {filteredStudents2.map(student => (
                                <SelectItem key={student.student_code} value={student.student_code} className="text-sm">
                                  {student.name} <span className="text-muted-foreground text-xs">({student.class_num}반)</span>
                                </SelectItem>
                              ))}
                            </ScrollArea>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>

                {/* Summary Preview */}
                <div className="p-3 bg-muted/50 rounded-md flex items-center justify-center text-sm min-h-[50px]">
                  {constraintType === 'exclude' ? (
                    !selectedStudent1 ? (
                      <span className="text-muted-foreground text-xs">제외할 학생을 선택해주세요</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{getStudentName(selectedStudent1)}</span>
                        <span className="text-slate-600 font-bold text-xs px-2 py-0.5 bg-slate-100 rounded-full">배정에서 제외</span>
                      </div>
                    )
                  ) : !selectedStudent1 || !selectedStudent2 ? (
                    <span className="text-muted-foreground text-xs">학생 두 명을 선택해주세요</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{getStudentName(selectedStudent1)}</span>
                      {constraintType === 'separate' ? (
                        <span className="text-destructive font-bold text-xs px-2 py-0.5 bg-destructive/10 rounded-full">와(과) 분리</span>
                      ) : (
                        <span className="text-green-600 font-bold text-xs px-2 py-0.5 bg-green-100 rounded-full">와(과) 결합</span>
                      )}
                      <span className="font-medium">{getStudentName(selectedStudent2)}</span>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">취소</Button>
                </DialogClose>
                <Button
                  type="button"
                  onClick={addConstraintPair}
                  disabled={!selectedStudent1 || (constraintType !== 'exclude' && (!selectedStudent2 || selectedStudent1 === selectedStudent2))}
                  className={constraintType === 'separate' ? 'bg-destructive hover:bg-destructive/90' : constraintType === 'exclude' ? 'bg-slate-600 hover:bg-slate-700' : 'bg-green-600 hover:bg-green-700'}
                >
                  조건 추가
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* List of Active Constraints */}
        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
          {separatePairs.length === 0 && combinePairs.length === 0 && excludePairs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
              <p className="text-xs">등록된 제약 조건이 없습니다</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {/* Combine Rules First (Positive) */}
              {combinePairs.map((pair, idx) => (
                <div key={`com-${idx}`} className="group flex items-center justify-between p-2 rounded-md border border-green-200 bg-green-50/50 hover:bg-green-50 transition-colors">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="p-1 rounded bg-green-100 text-green-700">
                      <Users className="h-3 w-3" />
                    </div>
                    <span className="font-medium text-slate-700">{getStudentName(pair[0])}</span>
                    <span className="text-green-600 font-bold">&</span>
                    <span className="font-medium text-slate-700">{getStudentName(pair[1])}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-destructive hover:bg-red-50"
                    onClick={() => removeConstraintPair(idx, 'combine')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              {/* Exclude Rules (Neutral) */}
              {excludePairs.map((pair, idx) => (
                <div key={`exc-${idx}`} className="group flex items-center justify-between p-2 rounded-md border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="p-1 rounded bg-slate-100 text-slate-700">
                      <UserX className="h-3 w-3" />
                    </div>
                    <span className="font-medium text-slate-700">{getStudentName(pair[0])}</span>
                    <span className="text-slate-500 font-bold text-xs">제외</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-destructive hover:bg-red-50"
                    onClick={() => removeConstraintPair(idx, 'exclude')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              {/* Separate Rules (Negative) */}
              {separatePairs.map((pair, idx) => (
                <div key={`sep-${idx}`} className="group flex items-center justify-between p-2 rounded-md border border-red-200 bg-red-50/50 hover:bg-red-50 transition-colors">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="p-1 rounded bg-red-100 text-red-700">
                      <UserMinus className="h-3 w-3" />
                    </div>
                    <span className="font-medium text-slate-700">{getStudentName(pair[0])}</span>
                    <span className="text-red-500 font-bold">≠</span>
                    <span className="font-medium text-slate-700">{getStudentName(pair[1])}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-destructive hover:bg-red-50"
                    onClick={() => removeConstraintPair(idx, 'separate')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
