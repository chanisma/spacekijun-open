/**
 * PDF 파일 업로드 컴포넌트
 * 드래그 앤 드롭, 파일 선택, 유효성 검사, 진행률 표시
 */

import React, { useState, useRef, useCallback } from 'react';
import { PDFUploadState } from '../../types/pdf';
import PDFPreview from './PDFPreview';
import { analyzePDFStructure } from '../../utils/pdf/testPDFParser';
import { Upload, FileText, AlertCircle, RefreshCw, Eye, Bug, FileIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PDFUploaderProps {
  onFileSelect: (file: File) => void;
  maxFileSize?: number; // MB 단위
  allowMultiple?: boolean;
}

const PDFUploader: React.FC<PDFUploaderProps> = ({
  onFileSelect,
  maxFileSize = 10,
  allowMultiple = false
}) => {
  const [uploadState, setUploadState] = useState<PDFUploadState>({
    file: null,
    status: 'idle',
    progress: 0,
    error: null,
    result: null
  });
  const [isDragging, setIsDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 파일 유효성 검사
  const validateFile = useCallback((file: File): string | null => {
    // PDF 파일 체크
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      return 'PDF 파일만 업로드 가능합니다.';
    }

    // 파일 크기 체크
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxFileSize) {
      return `파일 크기는 ${maxFileSize}MB 이하여야 합니다. (현재: ${fileSizeMB.toFixed(2)}MB)`;
    }

    return null;
  }, [maxFileSize]);

  // 파일 처리
  const handleFile = useCallback((file: File) => {
    const error = validateFile(file);

    if (error) {
      setUploadState(prev => ({
        ...prev,
        status: 'error',
        error
      }));
      return;
    }

    setUploadState(prev => ({
      ...prev,
      file,
      status: 'uploading',
      progress: 0,
      error: null
    }));

    // 파일 선택 콜백 호출
    onFileSelect(file);

    // 진행률 시뮬레이션
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      if (progress <= 100) {
        setUploadState(prev => ({
          ...prev,
          progress
        }));
      } else {
        clearInterval(interval);
      }
    }, 100);
  }, [validateFile, onFileSelect]);

  // 파일 선택 핸들러
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  // 드래그 앤 드롭 핸들러
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  // 파일 선택 버튼 클릭
  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 업로드 재시도
  const handleRetry = useCallback(() => {
    setUploadState({
      file: null,
      status: 'idle',
      progress: 0,
      error: null,
      result: null
    });
  }, []);

  return (
    <div className="w-full">
      {/* 드래그 앤 드롭 영역 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200",
          isDragging
            ? "border-brand-500 bg-brand-50/50 scale-[0.99]"
            : "border-slate-200 hover:border-brand-300 hover:bg-slate-50/50",
          uploadState.status === 'error' && "border-red-300 bg-red-50/30"
        )}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
          multiple={allowMultiple}
        />

        {uploadState.status === 'idle' && (
          <div className="flex flex-col items-center space-y-3 py-4">
            <div className="bg-brand-50 p-4 rounded-full mb-2">
              <Upload className="w-8 h-8 text-brand-500" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-700">
                PDF 파일을 드롭하세요
              </p>
              <p className="text-xs text-slate-500 mt-1.5">
                또는 아래 버튼을 눌러 선택하세요
              </p>
            </div>
            <Button
              onClick={handleButtonClick}
              className="mt-2 bg-brand-600 hover:bg-brand-700 text-white shadow-sm shadow-brand-100"
              size="sm"
            >
              파일 선택하기
            </Button>
            <p className="text-[10px] text-slate-400 mt-4">
              최대 {maxFileSize}MB PDF 파일만 업로드 가능
            </p>
          </div>
        )}

        {uploadState.status === 'uploading' && (
          <div className="space-y-4 py-4">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <svg className="animate-spin w-full h-full text-brand-200" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-bold text-brand-600">{Math.round(uploadState.progress!)}%</span>
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">
                업로드 중입니다...
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {uploadState.file?.name}
              </p>
            </div>
          </div>
        )}

        {uploadState.status === 'error' && (
          <div className="space-y-3 py-4">
            <div className="bg-red-50 p-3 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-2">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-700">
                업로드 실패
              </p>
              <p className="text-xs text-red-600 mt-1 max-w-[200px] mx-auto break-keep">
                {uploadState.error}
              </p>
            </div>
            <Button
              onClick={handleRetry}
              variant="outline"
              size="sm"
              className="mt-2 text-slate-600 border-slate-200 hover:bg-slate-50"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-2" />
              다시 시도
            </Button>
          </div>
        )}
      </div>

      {/* 선택된 파일 정보 - 로딩중이나 에러가 아닐 때만, 그리고 파일이 있을 때 */}
      {uploadState.file && uploadState.status !== 'error' && uploadState.status !== 'uploading' && (
        <div className="mt-4 p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-50 rounded-lg">
                <FileIcon className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex flex-col">
                <p className="text-sm font-bold text-slate-700 truncate max-w-[180px]" title={uploadState.file.name}>
                  {uploadState.file.name}
                </p>
                <p className="text-[10px] text-slate-400">
                  {(uploadState.file.size / 1024 / 1024).toFixed(2)}MB
                </p>
              </div>
            </div>
            <div className="flex space-x-1">
              <Button
                onClick={() => setShowPreview(true)}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-brand-600 hover:bg-brand-50"
                title="미리보기"
              >
                <Eye className="w-4 h-4" />
              </Button>
              <Button
                onClick={() => uploadState.file && analyzePDFStructure(uploadState.file)}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                title="구조 분석"
              >
                <Bug className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PDF 미리보기 모달 */}
      {showPreview && (
        <PDFPreview
          file={uploadState.file}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
};

export default PDFUploader;
