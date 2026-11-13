/**
 * File Registration Step - 파일 등록 (Step 1)
 * 6개 파일 슬롯 관리: 1학년/2학년 × 1차/2차/최종
 * 원본 vanilla JS 디자인 적용
 */

import React, { useCallback, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Database, Users, BookOpen, FileText } from 'lucide-react';
import { useAdmin } from '../../../context/AdminContext';
import { useCourseAnalyzeData } from '../../../context/CourseAnalyzeContext';
import type { FileKey, FileType, UploadedFile } from '../../../types/admin.types';
import { parseFile } from '../../../utils/fileParser';

// File type options
const FILE_TYPES: { value: FileType; label: string }[] = [
  { value: 'riroschool', label: '리로스쿨 알림신청 자료' },
  { value: 'education-office', label: '교육청 수강신청 자동분반 자료' },
];

// Slot configuration
const SLOT_CONFIG = [
  { year: 1, round: 1, label: '1학년 1차' },
  { year: 1, round: 2, label: '1학년 2차' },
  { year: 1, round: 3, label: '1학년 최종' },
  { year: 2, round: 1, label: '2학년 1차' },
  { year: 2, round: 2, label: '2학년 2차' },
  { year: 2, round: 3, label: '2학년 최종' },
];

export function FileRegistration() {
  const { state, setFileType, addFile, updateFile, removeFile } = useAdmin();
  const courseData = useCourseAnalyzeData();
  const [dragOver, setDragOver] = useState<FileKey | null>(null);
  const [showFormatGuide, setShowFormatGuide] = useState(false);

  // 메인 시스템에 로드된 데이터가 있는지 확인
  const hasMainSystemData = courseData.students.length > 0;
  const mainSystemStats = useMemo(() => {
    if (!hasMainSystemData) return null;
    const subjects = new Set<string>();
    courseData.students.forEach(student => {
      student.semester1.forEach(s => subjects.add(s));
      student.semester2.forEach(s => subjects.add(s));
    });
    return {
      totalStudents: courseData.students.length,
      totalSubjects: subjects.size,
      fileName: courseData.fileName,
      availableGrades: courseData.availableGrades,
      availableRounds: courseData.availableRounds,
    };
  }, [courseData.students, courseData.fileName, courseData.availableGrades, courseData.availableRounds, hasMainSystemData]);

  const handleFileTypeChange = useCallback((value: FileType) => {
    setFileType(value);
  }, [setFileType]);

  const handleFileUpload = useCallback(async (fileKey: FileKey, file: File) => {
    // Create initial file entry
    const uploadedFile: UploadedFile = {
      file,
      fileName: file.name,
      fileSize: file.size,
      uploadedAt: new Date(),
      parsedData: null,
      status: 'pending',
    };
    addFile(fileKey, uploadedFile);

    // Update status to parsing
    updateFile(fileKey, { status: 'parsing' });

    try {
      // Parse the file based on file type
      const [yearStr, roundStr] = fileKey.split('-');
      const year = parseInt(yearStr);
      const round = parseInt(roundStr);

      const parsedData = await parseFile(file, state.fileType, year, round);
      updateFile(fileKey, {
        parsedData,
        status: 'completed',
      });
    } catch (error) {
      updateFile(fileKey, {
        status: 'error',
        error: error instanceof Error ? error.message : '파일 파싱 중 오류가 발생했습니다.',
      });
    }
  }, [state.fileType, addFile, updateFile]);

  const handleDrop = useCallback((fileKey: FileKey, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);

    const files = Array.from(e.dataTransfer.files);
    const file = files.find(f =>
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv')
    );

    if (file) {
      handleFileUpload(fileKey, file);
    }
  }, [handleFileUpload]);

  const handleFileInputChange = useCallback((fileKey: FileKey, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(fileKey, file);
    }
    // Reset input
    e.target.value = '';
  }, [handleFileUpload]);

  const downloadSampleFile = (fileType: FileType) => {
    const fileName = fileType === 'riroschool'
      ? '리로스쿨 알림신청 자료 예시.xlsx'
      : '교육청 수강신청 자동분반 자료 예시.xlsx';
    const link = document.createElement('a');
    link.href = `/course_analyze/resource/${encodeURIComponent(fileName)}`;
    link.download = fileName;
    link.click();
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-6">
        {/* Compact Options Bar - 원본 스타일 */}
        <div
          style={{
            background: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '6px',
            padding: '12px 15px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          {/* Left side: File Type Selection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <span style={{ fontSize: '13px', color: '#495057', fontWeight: 500 }}>형식:</span>
            {FILE_TYPES.map(type => (
              <button
                key={type.value}
                onClick={() => handleFileTypeChange(type.value)}
                style={{
                  padding: '4px 10px',
                  background: state.fileType === type.value ? '#667eea' : '#e2e8f0',
                  color: state.fileType === type.value ? 'white' : '#4a5568',
                  border: state.fileType === type.value ? 'none' : '1px solid #cbd5e0',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 500,
                  transition: 'all 0.2s ease',
                }}
              >
                {type.label}
              </button>
            ))}
          </div>

          {/* Right side: Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '13px', color: '#495057', fontWeight: 500 }}>리로스쿨 샘플:</span>
            <button
              onClick={() => downloadSampleFile('riroschool')}
              style={{
                padding: '4px 6px',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 500,
                lineHeight: 1,
              }}
              title="리로스쿨 샘플 다운로드"
            >
              📚
            </button>
            <span style={{ fontSize: '13px', color: '#495057', fontWeight: 500 }}>교육청 샘플:</span>
            <button
              onClick={() => downloadSampleFile('education-office')}
              style={{
                padding: '4px 6px',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 500,
                lineHeight: 1,
              }}
              title="교육청 샘플 다운로드"
            >
              🏫
            </button>
            <span style={{ fontSize: '13px', color: '#495057', fontWeight: 500 }}>도움말:</span>
            <button
              onClick={() => setShowFormatGuide(!showFormatGuide)}
              style={{
                padding: '4px 6px',
                background: '#ffc107',
                color: '#212529',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 500,
                lineHeight: 1,
              }}
              title="양식 작성 가이드"
            >
              💡
            </button>
          </div>
        </div>

        {/* Collapsible Format Guide - 원본 스타일 */}
        {showFormatGuide && (
          <div
            style={{
              background: '#fff3cd',
              border: '1px solid #ffeaa7',
              borderRadius: '4px',
              padding: '8px 12px',
              marginBottom: '10px',
              fontSize: '11px',
              color: '#856404',
              lineHeight: 1.4,
            }}
          >
            <strong>💡 양식 가이드:</strong>{' '}
            🟢 초록색 셀은 기본 양식에 추가된 내용으로 수정 필요 • 📊 등급 열 추가 필요 • 📅 학기 구분 필요 • 학년제 과목의 경우 이름 구분 필요
          </div>
        )}

        {/* Main System Data Banner */}
        {hasMainSystemData && mainSystemStats && (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Database className="w-5 h-5 text-emerald-600" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#059669' }}>
                  메인 시스템 데이터 로드됨
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    background: '#10b981',
                    color: 'white',
                    borderRadius: '4px',
                    fontWeight: 500,
                  }}
                >
                  활성
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#4a5568' }}>
                {mainSystemStats.fileName && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FileText className="w-3 h-3" />
                    {mainSystemStats.fileName.length > 25
                      ? mainSystemStats.fileName.slice(0, 22) + '...'
                      : mainSystemStats.fileName}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Users className="w-3 h-3" />
                  <strong style={{ color: '#059669' }}>{mainSystemStats.totalStudents}</strong>명 학생
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <BookOpen className="w-3 h-3" />
                  <strong style={{ color: '#059669' }}>{mainSystemStats.totalSubjects}</strong>개 과목
                </span>
                {mainSystemStats.availableGrades.length > 0 && (
                  <span>
                    ({mainSystemStats.availableGrades.map(g => `${g}학년`).join(', ')})
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* File Upload Grid - 원본 스타일 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '20px',
            marginBottom: '30px',
          }}
        >
          {SLOT_CONFIG.map((slot) => {
            const fileKey: FileKey = `${slot.year}-${slot.round as 1 | 2 | 3}`;
            const uploadedFile = state.files.get(fileKey);
            return (
              <FileSlot
                key={fileKey}
                fileKey={fileKey}
                label={slot.label}
                file={uploadedFile}
                dragOver={dragOver === fileKey}
                onDragOver={(e) => { e.preventDefault(); setDragOver(fileKey); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => handleDrop(fileKey, e)}
                onFileSelect={(e) => handleFileInputChange(fileKey, e)}
                onRemove={() => removeFile(fileKey)}
              />
            );
          })}
        </div>

        {/* Additional Info - 원본 스타일 */}
        <div
          style={{
            background: '#f8f9fa',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '15px',
            marginBottom: '20px',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontSize: '13px', color: '#4a5568', lineHeight: 1.4 }}>
            💡 <strong>참고:</strong> 모든 차수를 업로드 할 필요 없이 필요한 차수만 등록하여 활용할 수도 있습니다.
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}

// File Slot Component - 원본 스타일
interface FileSlotProps {
  fileKey: FileKey;
  label: string;
  file: UploadedFile | undefined;
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}

function FileSlot({
  fileKey,
  label,
  file,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  onRemove,
}: FileSlotProps) {
  const inputId = `file-input-${fileKey}`;

  // File uploaded state
  if (file) {
    const isCompleted = file.status === 'completed';
    const isParsing = file.status === 'parsing';
    const isError = file.status === 'error';

    return (
      <div
        style={{
          border: `2px dashed ${isCompleted ? '#48bb78' : isError ? '#e53e3e' : '#cbd5e0'}`,
          borderRadius: '8px',
          padding: '20px',
          textAlign: 'center',
          transition: 'all 0.3s ease',
          background: isCompleted ? 'rgba(72, 187, 120, 0.1)' : isError ? 'rgba(229, 62, 62, 0.1)' : 'white',
          position: 'relative',
        }}
      >
        <h4 style={{ marginBottom: '10px', color: '#2d3748' }}>{label}</h4>

        {/* Status Icon */}
        <div style={{ fontSize: '24px', marginBottom: '10px', color: isCompleted ? '#48bb78' : isError ? '#e53e3e' : '#667eea' }}>
          {isCompleted && '✅'}
          {isParsing && '⏳'}
          {isError && '❌'}
          {file.status === 'pending' && '📄'}
        </div>

        {/* File Name */}
        <p
          style={{
            color: isCompleted ? '#48bb78' : isError ? '#e53e3e' : '#718096',
            fontSize: '14px',
            margin: 0,
            fontWeight: 600,
          }}
        >
          {file.fileName.length > 20 ? file.fileName.slice(0, 17) + '...' : file.fileName}
        </p>

        {/* Student Count */}
        {file.parsedData && (
          <p style={{ color: '#718096', fontSize: '12px', margin: '5px 0 0 0' }}>
            {file.parsedData.students.length}명 학생 데이터 (관리자 전용)
          </p>
        )}

        {/* Parsing Progress */}
        {isParsing && (
          <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px', marginTop: '10px' }}>
            <div
              className="animate-pulse"
              style={{
                height: '100%',
                background: '#667eea',
                width: '60%',
                borderRadius: '2px',
                transition: 'width 0.3s',
              }}
            />
          </div>
        )}

        {/* Error Message */}
        {file.error && (
          <p style={{ color: '#e53e3e', fontSize: '12px', margin: '5px 0 0 0' }}>
            {file.error.length > 30 ? file.error.slice(0, 27) + '...' : file.error}
          </p>
        )}

        {/* Remove Button */}
        <button
          onClick={onRemove}
          style={{
            marginTop: '8px',
            padding: '4px 8px',
            background: '#fed7d7',
            color: '#e53e3e',
            border: 'none',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          제거
        </button>
      </div>
    );
  }

  // Empty slot state - 원본 스타일
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        border: '2px dashed #cbd5e0',
        borderRadius: '8px',
        padding: '20px',
        textAlign: 'center',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        background: dragOver ? 'rgba(102, 126, 234, 0.1)' : 'white',
        borderColor: dragOver ? '#667eea' : '#cbd5e0',
        position: 'relative',
      }}
    >
      <input
        id={inputId}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={onFileSelect}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
        }}
      />
      <h4 style={{ marginBottom: '10px', color: '#2d3748' }}>{label}</h4>
      <div style={{ fontSize: '48px', marginBottom: '10px' }}>📄</div>
      <p style={{ color: '#718096', fontSize: '14px', margin: 0 }}>
        파일을 드래그하거나 클릭하여 업로드
      </p>
    </div>
  );
}
