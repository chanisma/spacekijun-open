import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Upload, X, FileSpreadsheet, ChevronRight } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { useToast } from '../../hooks/use-toast';
import RiroSurveyPreview from './RiroSurveyPreview';

interface SurveyItem {
  questionCategory: string; // 질문 카테고리 (1행의 묶인 셀 제목)
  questionName: string; // 세부 항목 (2행)
  selected: boolean;
}

interface StudentSurveyData {
  studentId: string; // 학번
  studentName: string; // 이름
  surveys: {
    surveyName: string; // 파일명
    items: SurveyItem[]; // 선택된 항목들
  }[];
}

interface RiroSurveyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RiroSurveyDialog: React.FC<RiroSurveyDialogProps> = ({ open, onOpenChange }) => {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [studentData, setStudentData] = useState<StudentSurveyData[]>([]);
  const { toast } = useToast();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Filter only Excel files
    const excelFiles = acceptedFiles.filter(file =>
      file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    );

    if (excelFiles.length !== acceptedFiles.length) {
      toast({
        title: '파일 형식 오류',
        description: 'Excel 파일(.xlsx, .xls)만 업로드할 수 있습니다.',
        variant: 'destructive',
      });
    }

    setFiles(prev => [...prev, ...excelFiles]);
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: true,
  });

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const parseExcelFile = async (file: File): Promise<{
    surveyName: string;
    records: {
      studentId: string;
      studentName: string;
      selectedItems: { category: string; itemName: string }[];
    }[];
  }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];

          // Convert to array of arrays
          const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (rawData.length < 3) {
            throw new Error('데이터가 충분하지 않습니다.');
          }

          // Row 1 (index 0) contains question categories (merged cells)
          const questionCategories: string[] = rawData[0].slice(6).map(val => val?.toString() || '');

          // Row 2 (index 1) contains question names starting from column 7 (index 6)
          const questionNames: string[] = rawData[1].slice(6).filter(Boolean);

          // Build category mapping by finding which category each question belongs to
          const categoryMap: string[] = [];
          let currentCategory = '';
          for (let i = 6; i < Math.max(questionCategories.length + 6, questionNames.length + 6); i++) {
            const category = questionCategories[i - 6];
            if (category && category.trim()) {
              currentCategory = category.trim();
            }
            categoryMap.push(currentCategory);
          }

          // Data starts from row 3 (index 2)
          const records = rawData.slice(2).map(row => {
            if (!row || row.length < 7) return null;

            const studentId = row[1]?.toString() || ''; // 학번 (column B)
            const studentName = row[2]?.toString() || ''; // 이름 (column C)

            // Check selected items (columns starting from G, index 6)
            const selectedItems: { category: string; itemName: string }[] = [];
            for (let i = 6; i < row.length && i - 6 < questionNames.length; i++) {
              if (row[i] === 1 || row[i] === '1') {
                selectedItems.push({
                  category: categoryMap[i - 6] || '',
                  itemName: questionNames[i - 6],
                });
              }
            }

            return {
              studentId,
              studentName,
              selectedItems,
            };
          }).filter(record => record !== null && record.studentId);

          const surveyName = file.name.replace(/\.(xlsx|xls)$/i, '');

          resolve({
            surveyName,
            records,
          });
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
      reader.readAsBinaryString(file);
    });
  };

  const processFiles = async () => {
    try {
      const allSurveys: {
        surveyName: string;
        records: {
          studentId: string;
          studentName: string;
          selectedItems: { category: string; itemName: string }[];
        }[];
      }[] = [];

      // Parse all Excel files
      for (const file of files) {
        const surveyData = await parseExcelFile(file);
        allSurveys.push(surveyData);
      }

      // Merge data by student ID (학번)
      const studentMap = new Map<string, StudentSurveyData>();

      allSurveys.forEach(survey => {
        survey.records.forEach(record => {
          if (!record.studentId) return;

          if (!studentMap.has(record.studentId)) {
            studentMap.set(record.studentId, {
              studentId: record.studentId,
              studentName: record.studentName,
              surveys: [],
            });
          }

          const student = studentMap.get(record.studentId)!;
          student.surveys.push({
            surveyName: survey.surveyName,
            items: record.selectedItems.map(item => ({
              questionCategory: item.category,
              questionName: item.itemName,
              selected: true,
            })),
          });
        });
      });

      const processedData = Array.from(studentMap.values()).sort((a, b) =>
        a.studentId.localeCompare(b.studentId)
      );

      setStudentData(processedData);
      setStep('preview');

      toast({
        title: '파일 처리 완료',
        description: `총 ${processedData.length}명의 학생 데이터가 처리되었습니다.`,
      });
    } catch (error) {
      console.error('파일 처리 오류:', error);
      toast({
        title: '파일 처리 실패',
        description: error instanceof Error ? error.message : '파일을 처리하는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleNext = () => {
    if (files.length === 0) {
      toast({
        title: '파일을 선택하세요',
        description: '최소 1개 이상의 Excel 파일을 업로드해야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    processFiles();
  };

  const handleBack = () => {
    setStep('upload');
  };

  const handleClose = () => {
    setStep('upload');
    setFiles([]);
    setStudentData([]);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open && step === 'upload'} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>리로스쿨 설문지 개인별 출력</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col p-1">
            {/* File Upload Area */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              {isDragActive ? (
                <p className="text-lg text-blue-600">파일을 여기에 놓으세요...</p>
              ) : (
                <>
                  <p className="text-lg mb-2">Excel 파일을 드래그하거나 클릭하여 업로드</p>
                  <p className="text-sm text-gray-500">여러 개의 파일을 동시에 업로드할 수 있습니다</p>
                </>
              )}
            </div>

            {/* Uploaded Files List */}
            {files.length > 0 && (
              <div className="flex-1 overflow-auto border rounded-lg">
                <div className="p-4 bg-gray-50 border-b sticky top-0">
                  <h3 className="font-semibold">업로드된 파일 ({files.length}개)</h3>
                </div>
                <div className="divide-y">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <FileSpreadsheet className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium">{file.name}</p>
                          <p className="text-sm text-gray-500">
                            {(file.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-between items-center pt-2 border-t">
              <div className="text-sm text-gray-600">
                {files.length > 0 && (
                  <span>선택된 파일: <span className="font-semibold text-blue-600">{files.length}개</span></span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>
                  취소
                </Button>
                <Button onClick={handleNext} disabled={files.length === 0}>
                  다음
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      {step === 'preview' && (
        <RiroSurveyPreview
          open={true}
          studentData={studentData}
          onBack={handleBack}
          onClose={handleClose}
        />
      )}
    </>
  );
};

export default RiroSurveyDialog;
