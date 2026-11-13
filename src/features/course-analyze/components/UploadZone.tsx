/**
 * Upload Zone Component - 파일 업로드 영역
 * evalog 글래스모피즘 + 드래그 앤 드롭 스타일
 */

import React, { useCallback, useState, useRef } from 'react';
import { Upload, FileJson, FileSpreadsheet, Loader2, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCourseAnalyzeData } from '../context';

export function UploadZone() {
  const { uploadFile, isLoading, fileName, clearData } = useCourseAnalyzeData();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await uploadFile(files[0]);
    }
  }, [uploadFile]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadFile(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [uploadFile]);

  // 파일 로드 완료 상태 - evalog 스타일
  if (fileName) {
    return (
      <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-brand-100/40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shrink-0 shadow-sm">
            {fileName.endsWith('.json') ? (
              <FileJson className="h-4 w-4 text-white" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              <span className="text-xs font-bold text-green-600 tracking-wide">로드 완료</span>
            </div>
            <p className="text-xs font-medium text-slate-700 tracking-tight truncate">{fileName}</p>
          </div>
          <button
            onClick={clearData}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 transition-colors shrink-0"
            title="파일 제거"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative rounded-xl transition-all duration-200 cursor-pointer overflow-hidden",
        "border-2 border-dashed",
        isDragging
          ? "border-brand-400 bg-brand-50/50 scale-[1.02]"
          : "border-slate-200/60 hover:border-brand-300/60 bg-white/40 hover:bg-white/60"
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.xlsx,.xls"
        onChange={handleFileChange}
        className="hidden"
      />

      {isLoading ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <div className="w-10 h-10 rounded-full bg-brand-50/80 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
          </div>
          <p className="text-xs text-slate-500 font-medium">파일 처리 중...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-5">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200",
            isDragging
              ? "bg-brand-100 scale-110"
              : "bg-slate-100/80 group-hover:bg-brand-50"
          )}>
            <Upload className={cn(
              "h-5 w-5 transition-colors",
              isDragging ? "text-brand-500" : "text-slate-400"
            )} />
          </div>
          <div className="text-center">
            <p className={cn(
              "text-xs font-bold tracking-tight transition-colors",
              isDragging ? "text-brand-600" : "text-slate-600"
            )}>
              {isDragging ? '여기에 놓으세요!' : '파일 업로드'}
            </p>
            <p className="text-xs font-medium text-slate-400 mt-0.5">
              JSON 또는 Excel 파일
            </p>
          </div>
        </div>
      )}

      {/* 드래그 오버레이 효과 */}
      {isDragging && (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-brand-600/10 pointer-events-none" />
      )}
    </div>
  );
}
