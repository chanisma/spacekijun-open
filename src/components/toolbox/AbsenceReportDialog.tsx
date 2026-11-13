import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import AbsenceReportPreview from './AbsenceReportPreview';

interface Student {
  id: string;
  name: string;
  meta: {
    grade: number;
    class: number;
    number: number;
  };
}

interface AbsenceReportData {
  student: Student;
  startDate: string;
  endDate: string;
  reasonType: string;
  reasonDetail?: string;
  parentName?: string;
  doctorCertificate?: boolean;
}

interface AbsenceReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AbsenceReportDialog: React.FC<AbsenceReportDialogProps> = ({ open, onOpenChange }) => {
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [reports, setReports] = useState<AbsenceReportData[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch students when grade and class are selected
  useEffect(() => {
    if (selectedGrade && selectedClass) {
      fetchStudents();
    } else {
      setStudents([]);
      setReports([]);
    }
  }, [selectedGrade, selectedClass]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('resource')
        .select('*')
        .eq('type', 'student')
        .eq('meta->>grade', selectedGrade)
        .eq('meta->>class', selectedClass);

      if (error) throw error;

      const formattedStudents = data
        .map(student => ({
          id: student.id,
          name: student.name,
          meta: {
            grade: student.meta.grade,
            class: student.meta.class,
            number: student.meta.number,
          }
        }))
        .sort((a, b) => a.meta.number - b.meta.number);

      setStudents(formattedStudents);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };

  const isStudentSelected = (studentId: string) => {
    return reports.some(report => report.student.id === studentId);
  };

  const toggleStudent = (student: Student) => {
    if (isStudentSelected(student.id)) {
      // Remove student
      setReports(reports.filter(report => report.student.id !== student.id));
    } else {
      // Add student with default values
      setReports([...reports, {
        student,
        startDate: format(new Date(), 'yyyy-MM-dd'),
        endDate: format(new Date(), 'yyyy-MM-dd'),
        reasonType: '질병',
        doctorCertificate: false
      }]);
    }
  };

  const updateReport = (studentId: string, field: keyof Omit<AbsenceReportData, 'student'>, value: any) => {
    setReports(reports.map(report =>
      report.student.id === studentId
        ? { ...report, [field]: value }
        : report
    ));
  };

  const getReport = (studentId: string) => {
    return reports.find(report => report.student.id === studentId);
  };

  const getDaysCount = (startDate: string, endDate: string) => {
    const days = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
    return days > 0 ? days : 1;
  };

  const handleNext = () => {
    if (reports.length > 0) {
      setStep('preview');
    }
  };

  const handleBack = () => {
    setStep('input');
  };

  const handleClose = () => {
    setStep('input');
    setSelectedGrade('');
    setSelectedClass('');
    setReports([]);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open && step === 'input'} onOpenChange={handleClose}>
        <DialogContent className={`max-h-[85vh] flex flex-col transition-all ${
          selectedGrade && selectedClass ? 'max-w-5xl' : 'max-w-md'
        }`}>
          <DialogHeader>
            <DialogTitle>학생 결석 신고서 작성</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col p-1">
            {/* Grade and Class Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>학년</Label>
                <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                  <SelectTrigger>
                    <SelectValue placeholder="학년 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1학년</SelectItem>
                    <SelectItem value="2">2학년</SelectItem>
                    <SelectItem value="3">3학년</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>반</Label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger>
                    <SelectValue placeholder="반 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                      <SelectItem key={num} value={num.toString()}>{num}반</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Student Table */}
            {selectedGrade && selectedClass && (
              <div className="flex-1 overflow-auto border rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b">
                      <th className="w-12 p-3 text-center font-semibold">선택</th>
                      <th className="w-16 p-3 text-center font-semibold">번호</th>
                      <th className="w-32 p-3 text-left font-semibold">이름</th>
                      <th className="w-40 p-3 text-left font-semibold">시작일</th>
                      <th className="w-40 p-3 text-left font-semibold">종료일</th>
                      <th className="w-32 p-3 text-left font-semibold">사유</th>
                      <th className="flex-1 p-3 text-left font-semibold">상세사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-gray-500">
                          학생 목록을 불러오는 중...
                        </td>
                      </tr>
                    ) : students.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-gray-500">
                          학생이 없습니다
                        </td>
                      </tr>
                    ) : (
                      students.map((student) => {
                        const isSelected = isStudentSelected(student.id);
                        const report = getReport(student.id);

                        return (
                          <tr
                            key={student.id}
                            className={`border-b hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                          >
                            <td className="p-3 text-center">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleStudent(student)}
                              />
                            </td>
                            <td className="p-3 text-center">
                              {student.meta.number}
                            </td>
                            <td className="p-3 font-medium">
                              {student.name}
                            </td>
                            <td className="p-3">
                              {isSelected && report ? (
                                <Input
                                  type="date"
                                  value={report.startDate}
                                  onChange={(e) => updateReport(student.id, 'startDate', e.target.value)}
                                  className="h-8"
                                />
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="p-3">
                              {isSelected && report ? (
                                <Input
                                  type="date"
                                  value={report.endDate}
                                  min={report.startDate}
                                  onChange={(e) => updateReport(student.id, 'endDate', e.target.value)}
                                  className="h-8"
                                />
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="p-3">
                              {isSelected && report ? (
                                <Select
                                  value={report.reasonType}
                                  onValueChange={(value) => updateReport(student.id, 'reasonType', value)}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="질병">질병</SelectItem>
                                    <SelectItem value="인정">인정</SelectItem>
                                    <SelectItem value="기타">기타</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="p-3">
                              {isSelected && report ? (
                                <Input
                                  placeholder="예: 독감"
                                  value={report.reasonDetail || ''}
                                  onChange={(e) => updateReport(student.id, 'reasonDetail', e.target.value)}
                                  className="h-8"
                                />
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Action Buttons */}
            {selectedGrade && selectedClass && reports.length > 0 && (
              <div className="flex justify-between items-center pt-2 border-t">
                <div className="text-sm text-gray-600">
                  선택된 학생: <span className="font-semibold text-blue-600">{reports.length}명</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleClose}>
                    취소
                  </Button>
                  <Button onClick={handleNext}>
                    다음
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      {step === 'preview' && (
        <AbsenceReportPreview
          open={true}
          reports={reports}
          onBack={handleBack}
          onClose={handleClose}
        />
      )}
    </>
  );
};

export default AbsenceReportDialog;
