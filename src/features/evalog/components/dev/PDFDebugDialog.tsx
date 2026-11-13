import React, { useState } from 'react';
import { Student } from '../../types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { FileText, Download, Copy, Check, X } from 'lucide-react';
import { normalizePDFSpacing, NormalizationOptions } from '../../utils/pdf/parsers/textProcessor';

interface PDFDebugDialogProps {
  student: Student | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PDFDebugDialog: React.FC<PDFDebugDialogProps> = ({
  student,
  open,
  onOpenChange,
}) => {
  // Hooks first (Rules of Hooks)
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);

  // Normalization Toggles
  const [normOptions, setNormOptions] = useState<NormalizationOptions>({
    removePageMetadata: true,
    initialSectionFiltering: true,
    removeSectionHeaders: true,
    normalizeLineBreaks: true,
    normalizeWhitespace: true,
    finalSectionFiltering: true
  });

  const hasOriginalText = student ? (!!(student as any).originalText || !!student.originalText) : false;
  const hasPdfData = student ? !!student.pdfData : false;
  const hasPdfFile = student ? !!student.pdfFile : false;

  // Calculate normalized text based on toggles
  const normalizedText = React.useMemo(() => {
    if (!student || !hasOriginalText) return '';
    return normalizePDFSpacing((student as any).originalText || student.originalText || '', normOptions);
  }, [student, hasOriginalText, normOptions]);

  React.useEffect(() => {
    if (student?.pdfFile) {
      const url = URL.createObjectURL(student.pdfFile);
      setPdfUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [student?.pdfFile]);

  if (!student) {
    return null;
  }

  const handleCopy = async (text: string, tabName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTab(tabName);
      setTimeout(() => setCopiedTab(null), 2000);
    } catch (err) {
      console.error('복사 실패:', err);
    }
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleOption = (key: keyof NormalizationOptions) => {
    setNormOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
      <DialogContent className="max-w-6xl w-[90vw] h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              PDF 디버그 데이터 - {student.name}
            </DialogTitle>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:pointer-events-none"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">닫기</span>
            </button>
          </div>
          <DialogDescription>
            추출된 원본 파일, JSON 데이터, 정규화 과정을 테스트할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="normalization" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="pdf" disabled={!hasPdfFile}>
              원본 PDF
              {!hasPdfFile && ' (없음)'}
            </TabsTrigger>
            <TabsTrigger value="normalization" disabled={!hasOriginalText}>
              텍스트 정규화 분석
              {!hasOriginalText && ' (없음)'}
            </TabsTrigger>
            <TabsTrigger value="json" disabled={!hasPdfData}>
              JSON 데이터
              {!hasPdfData && ' (없음)'}
            </TabsTrigger>
            <TabsTrigger value="student">Student 객체</TabsTrigger>
          </TabsList>

          <TabsContent value="pdf" className="flex-1 overflow-hidden mt-4 bg-slate-100 rounded-lg">
            {hasPdfFile && pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="w-full h-full border-none"
                title="Original PDF"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                원본 PDF 파일이 없습니다.
              </div>
            )}
          </TabsContent>

          <TabsContent value="normalization" className="flex-1 overflow-hidden mt-4">
            <div className="flex gap-4 h-full">
              {/* Left: Options & Status */}
              <div className="w-64 flex-shrink-0 flex flex-col gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200 overflow-y-auto">
                <h3 className="font-semibold text-sm text-slate-900 mb-2">정규화 옵션</h3>

                <div className="space-y-3">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!normOptions.normalizeLineBreaks} onChange={() => toggleOption('normalizeLineBreaks')} className="mt-1" />
                    <div>
                      <span className="block text-sm font-medium">1. 줄바꿈 정규화</span>
                      <span className="text-xs text-slate-500">CRLF 제거 (\r\n {'->'} \n)</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!normOptions.removeSectionHeaders} onChange={() => toggleOption('removeSectionHeaders')} className="mt-1" />
                    <div>
                      <span className="block text-sm font-medium">2. 섹션 헤더 제거</span>
                      <span className="text-xs text-slate-500">'창의적체험활동...' 등 제거</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!normOptions.normalizeWhitespace} onChange={() => toggleOption('normalizeWhitespace')} className="mt-1" />
                    <div>
                      <span className="block text-sm font-medium">3. 공백 정규화</span>
                      <span className="text-xs text-slate-500">연속 공백 제거 (Aggressive)</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!normOptions.initialSectionFiltering} onChange={() => toggleOption('initialSectionFiltering')} className="mt-1" />
                    <div>
                      <span className="block text-sm font-medium">4. 섹션/출결 필터링</span>
                      <span className="text-xs text-slate-500">출결 병합 및 불필요 섹션 제거</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!normOptions.removePageMetadata} onChange={() => toggleOption('removePageMetadata')} className="mt-1" />
                    <div>
                      <span className="block text-sm font-medium">5. 페이지 메타데이터 제거</span>
                      <span className="text-xs text-slate-500">페이지 번호, 학교명 등 후처리</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer opacity-50">
                    <input type="checkbox" checked={!!normOptions.finalSectionFiltering} onChange={() => toggleOption('finalSectionFiltering')} className="mt-1" />
                    <div>
                      <span className="block text-sm font-medium">(옵션) 추가 필터링 플래그</span>
                      <span className="text-xs text-slate-500">호환성 유지용 (4번과 동일 동작)</span>
                    </div>
                  </label>
                </div>

                <div className="mt-auto pt-4 border-t border-slate-200">
                  <div className="text-xs text-slate-500">
                    <div>원본 길이: {hasOriginalText ? ((student as any).originalText || student.originalText).length : 0}자</div>
                    <div>결과 길이: {normalizedText.length}자</div>
                  </div>
                </div>
              </div>

              {/* Right: Result */}
              <div className="flex-1 flex flex-col min-h-0 bg-white rounded-lg border border-slate-200">
                <div className="p-3 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                  <span className="text-sm font-medium text-slate-700">정규화 결과</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopy(normalizedText, 'norm')}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 text-slate-700 text-xs rounded hover:bg-gray-50 transition-colors"
                    >
                      {copiedTab === 'norm' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedTab === 'norm' ? '복사됨' : '복사'}
                    </button>
                  </div>
                </div>
                <pre className="flex-1 p-4 overflow-auto text-xs whitespace-pre-wrap font-mono">
                  {normalizedText}
                </pre>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="json" className="flex-1 overflow-auto mt-4">
            {hasPdfData ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopy(JSON.stringify(student.pdfData, null, 2), 'json')}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                  >
                    {copiedTab === 'json' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedTab === 'json' ? '복사됨!' : '복사'}
                  </button>
                  <button
                    onClick={() => handleDownload(JSON.stringify(student.pdfData, null, 2), student.name + '_pdfdata.json')}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    다운로드
                  </button>
                </div>
                <pre className="bg-gray-50 p-4 rounded border text-xs whitespace-pre-wrap font-mono max-h-[calc(90vh-250px)] overflow-auto">
                  {JSON.stringify(student.pdfData, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-8">PDF 데이터가 없습니다.</div>
            )}
          </TabsContent>

          <TabsContent value="student" className="flex-1 overflow-auto mt-4">
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopy(JSON.stringify(student, null, 2), 'student')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                >
                  {copiedTab === 'student' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedTab === 'student' ? '복사됨!' : '복사'}
                </button>
                <button
                  onClick={() => handleDownload(JSON.stringify(student, null, 2), student.name + '_student.json')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  다운로드
                </button>
              </div>
              <pre className="bg-gray-50 p-4 rounded border text-xs whitespace-pre-wrap font-mono max-h-[calc(90vh-250px)] overflow-auto">
                {JSON.stringify(student, null, 2)}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};