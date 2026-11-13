/**
 * PDF 업로드 전체 워크플로우 컴포넌트
 * 업로드 → PDF→JSON 변환 → 완료 단계를 관리
 */

import React, { useState, useEffect } from 'react';
import { Student } from '../../types';
import { usePDFParser } from '../../hooks/usePDFParser';
import PDFUploader from './PDFUploader';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, FileText, AlertCircle, ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type WorkflowStep = 'upload' | 'converting' | 'selection' | 'complete';

interface PDFUploadWorkflowProps {
  onComplete?: (student: Partial<Student> | Partial<Student>[]) => void;
  onCancel?: () => void;
  initialFile?: File | null;
}

const PDFUploadWorkflow: React.FC<PDFUploadWorkflowProps> = ({
  onComplete,
  onCancel,
  initialFile
}) => {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(initialFile ? 'converting' : 'upload');
  const [savedStudent, setSavedStudent] = useState<Partial<Student> | null>(null);
  const [savedStudents, setSavedStudents] = useState<Partial<Student>[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

  const { parseFile, student, students, error, reset } = usePDFParser();

  // 초기 파일이 있으면 자동 시작
  useEffect(() => {
    if (initialFile) {
      handleFileSelect(initialFile);
    }
  }, []); // Mount 시 1회만 실행

  // 파일 업로드 핸들러
  const handleFileSelect = async (file: File) => {
    setCurrentStep('converting');

    try {
      await parseFile(file);
      // parseFile 완료 후 student/students는 useEffect에서 처리됨
    } catch (err) {
      console.error('파일 파싱 오류:', err);
      setCurrentStep('upload');
    }
  };

  // 파싱 완료 후 처리
  useEffect(() => {
    if (currentStep === 'converting' && !error) {
      if (students && students.length > 1) {
        // 다중 학생 감지 -> 선택 단계로 이동
        console.log(`PDF Workflow: ${students.length} students detected. Moving to selection.`);
        setSavedStudents(students);
        // 기본적으로 모두 선택
        setSelectedIndices(students.map((_, i) => i));
        setCurrentStep('selection');
      } else if (student) {
        // 단일 학생 -> 기존 로직대로 진행
        processSingleStudent(student);
      }
    }
  }, [student, students, currentStep, error]);

  const processSingleStudent = async (studentData: Partial<Student>) => {
    if (!studentData.studentNo || !studentData.name) {
      completeWorkflow(studentData);
      return;
    }

    try {
      // Find resource match
      const { data: resources, error } = await supabase
        .from('resource')
        .select('id, meta')
        .eq('type', 'student')
        .ilike('name', studentData.name); // match name first

      if (error || !resources) {
        console.log('PDF Workflow: Resource fetch failed or empty', error);
        completeWorkflow(studentData);
        return;
      }

      // check snum match
      const matchedResource = resources.find(r => {
        const meta = r.meta as any;
        const snums = [meta.snum1, meta.snum2, meta.snum3].map(String);
        return snums.includes(String(studentData.studentNo));
      });

      if (matchedResource) {
        console.log('PDF Workflow: Found matching resource ID:', matchedResource.id);
        // add studentId
        const meta = matchedResource.meta as any;
        completeWorkflow({
          ...studentData,
          studentId: matchedResource.id,
        }, meta.id ? String(meta.id) : undefined);
      } else {
        completeWorkflow(studentData);
      }

    } catch (e) {
      console.error('PDF Workflow: Error fetching resource', e);
      completeWorkflow(studentData);
    }
  };

  const completeWorkflow = (studentData: Partial<Student> | Partial<Student>[], metaId?: string) => {
    if (Array.isArray(studentData)) {
      // Batch complete
      setSavedStudents(studentData);
      setCurrentStep('complete');
      if (onComplete) {
        onComplete(studentData);
      }
    } else {
      // Single complete
      const finalStudent = { ...studentData };
      if (metaId) {
        finalStudent.studentId = metaId;
      }
      setSavedStudent(finalStudent);
      setCurrentStep('complete');
      if (onComplete) {
        onComplete(finalStudent);
      }
    }
  };

  const handleSelectionComplete = () => {
    const selectedStudents = savedStudents.filter((_, i) => selectedIndices.includes(i));
    completeWorkflow(selectedStudents);
  };

  const toggleSelection = (index: number) => {
    setSelectedIndices(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  // 취소 및 재시작
  const handleCancel = () => {
    reset();
    setCurrentStep('upload');
    setSavedStudent(null);
    setSavedStudents([]);
    if (onCancel) {
      onCancel();
    }
  };

  const handleRestart = () => {
    reset();
    setCurrentStep('upload');
    setSavedStudent(null);
    setSavedStudents([]);
  };

  // 진행 단계 표시
  const renderProgressBar = () => {
    const steps = [
      { id: 'upload', label: 'PDF 업로드' },
      { id: 'converting', label: '변환 및 분석' },
      ...(students && students.length > 1 ? [{ id: 'selection', label: '학생 선택' }] : []),
      { id: 'complete', label: '완료' }
    ];

    const currentIndex = steps.findIndex(s => s.id === currentStep);

    return (
      <div className="w-full mb-8 px-4">
        <div className="flex items-center justify-between relative">
          {/* 연결 선 */}
          <div className="absolute left-0 top-3 -translate-y-1/2 w-full h-0.5 bg-slate-100 -z-10" />

          {steps.map((step, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = step.id === currentStep;

            return (
              <div key={step.id} className="flex flex-col items-center bg-transparent gap-2">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all duration-300 z-10",
                    isCompleted ? "bg-brand-600 border-brand-600 text-white" :
                      isCurrent ? "bg-white border-brand-600 text-brand-600 ring-4 ring-brand-50" :
                        "bg-white border-slate-200 text-slate-300"
                  )}
                >
                  {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : index + 1}
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium transition-colors duration-300",
                    isCurrent ? "text-brand-700" :
                      isCompleted ? "text-brand-600/70" : "text-slate-400"
                  )}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-xl bg-white p-0 overflow-hidden border-0 shadow-2xl gap-0" hideCloseButton>
        <div className="bg-slate-50/50 border-b border-slate-100 flex items-center justify-between px-6 py-4">
          <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
            <div className="p-1.5 bg-white rounded-md border border-slate-200 shadow-sm">
              <FileText className="w-3.5 h-3.5 text-brand-600" />
            </div>
            학생부 PDF 등록
          </DialogTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-slate-600" onClick={handleCancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-8">
          {renderProgressBar()}

          <div className="min-h-[280px] flex flex-col justify-center">
            {/* 1. 업로드 단계 */}
            {currentStep === 'upload' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <PDFUploader
                  onFileSelect={handleFileSelect}
                  maxFileSize={10}
                  allowMultiple={false}
                />
              </div>
            )}

            {/* 2. 변환 중 */}
            {currentStep === 'converting' && (
              <div className="flex flex-col items-center justify-center py-6 animate-in fade-in zoom-in-95 duration-500">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-brand-500/20 rounded-full blur-xl animate-pulse"></div>
                  <div className="relative bg-white p-3 rounded-full shadow-lg border border-brand-100">
                    <Loader2 className="h-8 w-8 text-brand-600 animate-spin" />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">
                  PDF를 분석하고 있습니다
                </h3>
                <p className="text-slate-500 text-xs text-center max-w-xs leading-relaxed">
                  학생부 데이터를 추출하여 구조화된 데이터로 변환하는 중입니다.<br />
                  잠시만 기다려주세요.
                </p>
              </div>
            )}

            {/* 3. 학생 선택 (다중 학생 감지 시) */}
            {currentStep === 'selection' && (
              <div className="flex flex-col animate-in fade-in zoom-in-95 duration-500 w-full">
                <h3 className="text-lg font-bold text-slate-800 mb-4 text-center">
                  {savedStudents.length}명의 학생이 감지되었습니다
                </h3>
                <p className="text-slate-500 text-xs text-center mb-6">
                  가져올 학생을 선택해주세요.
                </p>

                <div className="max-h-[300px] overflow-y-auto space-y-2 mb-6 pr-2">
                  {savedStudents.map((s, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all",
                        selectedIndices.includes(idx)
                          ? "bg-brand-50 border-brand-200 ring-1 ring-brand-200"
                          : "bg-white border-slate-200 hover:bg-slate-50"
                      )}
                      onClick={() => toggleSelection(idx)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-5 h-5 rounded flex items-center justify-center border transition-colors",
                          selectedIndices.includes(idx)
                            ? "bg-brand-600 border-brand-600 text-white"
                            : "bg-white border-slate-300"
                        )}>
                          {selectedIndices.includes(idx) && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700">{s.name}</span>
                          <span className="text-xs text-slate-400">{s.studentNo || '학번 없음'}</span>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400">
                        {s.header?.gradeInfo?.length ? `${s.header.gradeInfo[0].grade}학년` : ''}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 w-full">
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    className="flex-1"
                  >
                    취소
                  </Button>
                  <Button
                    onClick={handleSelectionComplete}
                    disabled={selectedIndices.length === 0}
                    className="flex-1 bg-brand-600 hover:bg-brand-700 text-white"
                  >
                    {selectedIndices.length}명 가져오기
                  </Button>
                </div>
              </div>
            )}

            {/* 4. 완료 단계 */}
            {currentStep === 'complete' && (
              <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">
                <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-4 ring-4 ring-green-50/50">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-1">
                  분석 완료!
                </h3>
                <p className="text-slate-500 mb-6 text-center text-xs">
                  {savedStudents.length > 0
                    ? `${savedStudents.length}명의 학생 데이터가 추가되었습니다.`
                    : "PDF가 성공적으로 변환되어 학생 목록에 추가되었습니다."}
                </p>

                {savedStudent && !savedStudents.length && (
                  <Card className="w-full max-w-sm mb-6 bg-slate-50/50 border-slate-200 shadow-sm">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-slate-400 font-medium">학번</span>
                          <p className="font-bold text-slate-700">{savedStudent.studentNo}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-slate-400 font-medium">성명</span>
                          <p className="font-bold text-slate-700">{savedStudent.name}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="flex gap-2 w-full max-w-sm">
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    size="sm"
                    className="flex-1 border-slate-200 hover:bg-slate-50 hover:text-slate-700"
                  >
                    닫기
                  </Button>
                  <Button
                    onClick={handleRestart}
                    size="sm"
                    className="flex-1 bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-200"
                  >
                    다른 파일 추가
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* 오류 표시 */}
            {error && currentStep !== 'converting' && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-red-700">변환 오류</h4>
                  <p className="text-red-600 text-[11px] mt-0.5 leading-relaxed">{error}</p>
                  <Button
                    onClick={handleRestart}
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-auto py-0.5 px-0 text-red-700 hover:text-red-800 hover:bg-red-100/50 font-medium text-[10px]"
                  >
                    다시 시도하기
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PDFUploadWorkflow;
