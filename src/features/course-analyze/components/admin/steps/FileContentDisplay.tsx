/**
 * File Content Display Step - 내용 확인 (Step 2)
 * 업로드된 파일 내용을 그리드 카드 형태로 표시
 * 원본 vanilla JS 디자인 적용
 */

import React, { useState, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Database, FileText, Users, BookOpen, Pencil, Trash2, X } from 'lucide-react';
import { useAdmin } from '../../../context/AdminContext';
import { useCourseAnalyzeData } from '../../../context/CourseAnalyzeContext';
import type { FileKey, UploadedFile, ParsedStudent } from '../../../types/admin.types';
import type { Student } from '../../../types/course.types';
import { formatGrade } from '../../../utils/gradeFormat';

// 메인 시스템 그룹 타입 정의
interface MainSystemGroup {
  key: string;
  label: string;
  students: Student[];
  subjects: { semester1: Set<string>; semester2: Set<string> };
}

export function FileContentDisplay() {
  const { state } = useAdmin();
  const courseData = useCourseAnalyzeData();
  const [selectedStudent, setSelectedStudent] = useState<ParsedStudent | null>(null);
  const [selectedMainStudent, setSelectedMainStudent] = useState<Student | null>(null);
  const [detailFileKey, setDetailFileKey] = useState<FileKey | null>(null);
  const [showMainDataDetail, setShowMainDataDetail] = useState(false);
  const [selectedMainGroupKey, setSelectedMainGroupKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mainSearchQuery, setMainSearchQuery] = useState('');

  // 메인 시스템 데이터 확인
  const hasMainSystemData = courseData.students.length > 0;

  // Get available files
  const files = useMemo(() => {
    const result: { key: FileKey; file: UploadedFile }[] = [];
    state.files.forEach((file, key) => {
      if (file.status === 'completed' && file.parsedData) {
        result.push({ key, file });
      }
    });
    return result;
  }, [state.files]);

  // 메인 시스템 과목 통계
  const mainSystemSubjects = useMemo(() => {
    if (!hasMainSystemData) return { semester1: new Set<string>(), semester2: new Set<string>() };

    const semester1 = new Set<string>();
    const semester2 = new Set<string>();

    courseData.students.forEach(student => {
      student.semester1.forEach(s => semester1.add(s));
      student.semester2.forEach(s => semester2.add(s));
    });

    return { semester1, semester2 };
  }, [courseData.students, hasMainSystemData]);

  // 메인 시스템 데이터를 학년-차수별로 그룹화
  const mainSystemGroups = useMemo(() => {
    if (!hasMainSystemData) return [];

    const groups: Record<string, {
      key: string;
      label: string;
      students: Student[];
      subjects: { semester1: Set<string>; semester2: Set<string> };
    }> = {};

    courseData.students.forEach(student => {
      const key = `${student.year}-${student.round}`;
      if (!groups[key]) {
        const roundLabel = student.round === 3 ? '최종' : `${student.round}차`;
        groups[key] = {
          key,
          label: `${student.year}학년 ${roundLabel}`,
          students: [],
          subjects: { semester1: new Set(), semester2: new Set() }
        };
      }
      groups[key].students.push(student);
      student.semester1.forEach(s => groups[key].subjects.semester1.add(s));
      student.semester2.forEach(s => groups[key].subjects.semester2.add(s));
    });

    // 키 기준으로 정렬 (1-1, 1-2, 1-3, 2-1, 2-2, ...)
    return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
  }, [courseData.students, hasMainSystemData]);

  // 선택된 그룹의 현재 데이터 (삭제/수정 시 자동 업데이트)
  const currentMainGroup = useMemo(() => {
    if (!selectedMainGroupKey) return null;
    return mainSystemGroups.find(g => g.key === selectedMainGroupKey) || null;
  }, [selectedMainGroupKey, mainSystemGroups]);

  // Open detail dialog
  const openDetailDialog = (fileKey: FileKey) => {
    setDetailFileKey(fileKey);
    setSearchQuery('');
  };

  // Close detail dialog
  const closeDetailDialog = () => {
    setDetailFileKey(null);
    setSelectedStudent(null);
    setSearchQuery('');
  };

  // Get label from file key
  const getFileLabel = (key: FileKey) => {
    const [yearStr, roundStr] = key.split('-');
    return `${yearStr}학년 ${roundStr === '3' ? '최종' : `${roundStr}차`}`;
  };

  // 파일도 없고 메인 데이터도 없는 경우
  if (files.length === 0 && !hasMainSystemData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '72px', marginBottom: '20px' }}>📋</div>
          <p style={{ fontSize: '18px', fontWeight: 600, color: '#2d3748', marginBottom: '8px' }}>
            업로드된 파일이 없습니다
          </p>
          <p style={{ fontSize: '14px', color: '#718096' }}>
            먼저 파일 등록 단계에서 파일을 업로드해주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-full">
        <div className="p-6">
          {/* 메인 시스템 로드된 데이터 섹션 - 학년-차수별 분리 */}
          {hasMainSystemData && mainSystemGroups.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                }}
              >
                <Database className="w-5 h-5" style={{ color: '#10b981' }} />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#059669' }}>
                  메인 시스템 로드된 데이터
                </h3>
                <span
                  style={{
                    background: '#d1fae5',
                    color: '#059669',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  {mainSystemGroups.length}개 파일
                </span>
                <span
                  style={{
                    background: '#ecfdf5',
                    color: '#059669',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  {courseData.fileName || 'data.json'}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: '20px',
                }}
              >
                {mainSystemGroups.map((group) => (
                  <MainSystemGroupCard
                    key={group.key}
                    groupKey={group.key}
                    label={group.label}
                    students={group.students}
                    subjects={group.subjects}
                    onViewDetail={() => {
                      setSelectedMainGroupKey(group.key);
                      setShowMainDataDetail(true);
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 관리자 업로드 파일 섹션 */}
          {files.length > 0 && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                }}
              >
                <FileText className="w-5 h-5" style={{ color: '#667eea' }} />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#4c51bf' }}>
                  관리자 업로드 파일
                </h3>
                <span
                  style={{
                    background: '#e0e7ff',
                    color: '#4c51bf',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 500,
                  }}
                >
                  {files.length}개
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: '20px',
                }}
              >
                {files.map(({ key, file }) => (
                  <FileCard
                    key={key}
                    fileKey={key}
                    file={file}
                    label={getFileLabel(key)}
                    onViewDetail={() => openDetailDialog(key)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Detail Dialog */}
      <Dialog open={detailFileKey !== null} onOpenChange={(open) => !open && closeDetailDialog()}>
        <DialogContent className="max-w-4xl max-h-[85vh] p-0 overflow-hidden">
          {detailFileKey && (
            <DetailView
              fileKey={detailFileKey}
              file={state.files.get(detailFileKey)!}
              label={getFileLabel(detailFileKey)}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedStudent={selectedStudent}
              onSelectStudent={setSelectedStudent}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Main System Data Detail Dialog */}
      <Dialog open={showMainDataDetail} onOpenChange={(open) => {
        setShowMainDataDetail(open);
        if (!open) {
          setSelectedMainGroupKey(null);
          setSelectedMainStudent(null);
          setMainSearchQuery('');
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[85vh] p-0 overflow-hidden">
          {currentMainGroup && (
            <MainSystemGroupDetailView
              group={currentMainGroup}
              searchQuery={mainSearchQuery}
              onSearchChange={setMainSearchQuery}
              selectedStudent={selectedMainStudent}
              onSelectStudent={setSelectedMainStudent}
              onUpdateStudent={courseData.updateStudent}
              onDeleteStudent={courseData.deleteStudent}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// File Card Component - 원본 스타일
interface FileCardProps {
  fileKey: FileKey;
  file: UploadedFile;
  label: string;
  onViewDetail: () => void;
}

function FileCard({ fileKey, file, label, onViewDetail }: FileCardProps) {
  const parsedData = file.parsedData!;
  const uploadDate = new Date(file.uploadedAt).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Get top 3 subjects for each semester
  const topSubjects = useMemo(() => {
    const semester1Counts: Record<string, number> = {};
    const semester2Counts: Record<string, number> = {};

    parsedData.students.forEach(student => {
      student.semester1.forEach(subj => {
        semester1Counts[subj] = (semester1Counts[subj] || 0) + 1;
      });
      student.semester2.forEach(subj => {
        semester2Counts[subj] = (semester2Counts[subj] || 0) + 1;
      });
    });

    const semester1Top = Object.entries(semester1Counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name]) => name);

    const semester2Top = Object.entries(semester2Counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name]) => name);

    return { semester1: semester1Top, semester2: semester2Top };
  }, [parsedData]);

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'box-shadow 0.3s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Card Header */}
      <div
        style={{
          background: '#f7fafc',
          padding: '15px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span style={{ fontSize: '24px' }}>📄</span>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#2d3748' }}>
            {label}
          </h3>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#718096' }}>
            {file.fileName.length > 30 ? file.fileName.slice(0, 27) + '...' : file.fileName}
          </p>
        </div>
      </div>

      {/* Statistics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1px',
          background: '#e2e8f0',
          margin: '15px',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <div style={{ background: '#f7fafc', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#667eea' }}>
            {parsedData.students.length}
          </div>
          <div style={{ fontSize: '11px', color: '#718096', fontWeight: 500 }}>학생</div>
        </div>
        <div style={{ background: '#f7fafc', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#764ba2' }}>
            {parsedData.totalSubjects}
          </div>
          <div style={{ fontSize: '11px', color: '#718096', fontWeight: 500 }}>과목</div>
        </div>
      </div>

      {/* Subject Tags Section */}
      <div style={{ padding: '0 15px 15px 15px' }}>
        {/* 1학기 과목 */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', color: '#2b6cb0', fontWeight: 600, marginBottom: '6px' }}>
            📘 1학기 과목 ({parsedData.subjects.semester1.length}개)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {topSubjects.semester1.map((subject, i) => (
              <span
                key={i}
                style={{
                  background: '#bee3f8',
                  color: '#2b6cb0',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {subject}
              </span>
            ))}
            {parsedData.subjects.semester1.length > 3 && (
              <span
                style={{
                  background: '#e2e8f0',
                  color: '#718096',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                +{parsedData.subjects.semester1.length - 3}
              </span>
            )}
          </div>
        </div>

        {/* 2학기 과목 */}
        <div>
          <div style={{ fontSize: '11px', color: '#276749', fontWeight: 600, marginBottom: '6px' }}>
            📗 2학기 과목 ({parsedData.subjects.semester2.length}개)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {topSubjects.semester2.map((subject, i) => (
              <span
                key={i}
                style={{
                  background: '#c6f6d5',
                  color: '#276749',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {subject}
              </span>
            ))}
            {parsedData.subjects.semester2.length > 3 && (
              <span
                style={{
                  background: '#e2e8f0',
                  color: '#718096',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                +{parsedData.subjects.semester2.length - 3}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div
        style={{
          background: '#f7fafc',
          padding: '12px 15px',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '11px', color: '#718096' }}>
          📅 {uploadDate}
        </span>
        <button
          onClick={onViewDetail}
          style={{
            background: '#667eea',
            color: 'white',
            border: 'none',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#5a67d8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#667eea';
          }}
        >
          📋 상세 보기
        </button>
      </div>
    </div>
  );
}

// Detail View Component - 원본 스타일
interface DetailViewProps {
  fileKey: FileKey;
  file: UploadedFile;
  label: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedStudent: ParsedStudent | null;
  onSelectStudent: (student: ParsedStudent | null) => void;
}

function DetailView({
  fileKey,
  file,
  label,
  searchQuery,
  onSearchChange,
  selectedStudent,
  onSelectStudent,
}: DetailViewProps) {
  const parsedData = file.parsedData!;

  // Filter students by search
  const filteredStudents = useMemo(() => {
    if (!searchQuery) return parsedData.students;

    const query = searchQuery.toLowerCase();
    return parsedData.students.filter(s =>
      s.name.toLowerCase().includes(query) ||
      String(s.id).toLowerCase().includes(query)
    );
  }, [parsedData.students, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '80vh' }}>
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '20px 24px',
          color: 'white',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
          📄 {label} - 상세 보기
        </h2>
        <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
          {file.fileName}
        </p>
      </div>

      {/* Stats Bar */}
      <div
        style={{
          display: 'flex',
          gap: '20px',
          padding: '12px 24px',
          background: '#f7fafc',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#667eea', fontWeight: 700, fontSize: '18px' }}>
            {parsedData.students.length}
          </span>
          <span style={{ color: '#718096', fontSize: '13px' }}>학생</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#2b6cb0', fontWeight: 700, fontSize: '18px' }}>
            {parsedData.subjects.semester1.length}
          </span>
          <span style={{ color: '#718096', fontSize: '13px' }}>1학기 과목</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#276749', fontWeight: 700, fontSize: '18px' }}>
            {parsedData.subjects.semester2.length}
          </span>
          <span style={{ color: '#718096', fontSize: '13px' }}>2학기 과목</span>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#718096' }}>
            🔍
          </span>
          <Input
            placeholder="이름 또는 학번으로 검색..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              paddingLeft: '38px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
            }}
          />
        </div>
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#718096' }}>
          {filteredStudents.length}명 표시 중 {searchQuery && `(검색어: "${searchQuery}")`}
        </div>
      </div>

      {/* Student List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
          }}
        >
          {filteredStudents.map((student) => (
            <StudentCard
              key={student.id}
              student={student}
              isSelected={selectedStudent?.id === student.id}
              onClick={() => onSelectStudent(selectedStudent?.id === student.id ? null : student)}
            />
          ))}
        </div>
      </div>

      {/* Selected Student Detail */}
      {selectedStudent && (
        <div
          style={{
            borderTop: '1px solid #e2e8f0',
            padding: '16px 24px',
            background: '#f7fafc',
          }}
        >
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#2d3748' }}>
            👤 {selectedStudent.name} 선택 과목
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#2b6cb0', fontWeight: 600, marginBottom: '8px' }}>
                📘 1학기 ({selectedStudent.semester1.length}과목)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {selectedStudent.semester1.map((subject, i) => (
                  <span
                    key={i}
                    style={{
                      background: '#bee3f8',
                      color: '#2b6cb0',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  >
                    {subject}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#276749', fontWeight: 600, marginBottom: '8px' }}>
                📗 2학기 ({selectedStudent.semester2.length}과목)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {selectedStudent.semester2.map((subject, i) => (
                  <span
                    key={i}
                    style={{
                      background: '#c6f6d5',
                      color: '#276749',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  >
                    {subject}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Student Card Component - 원본 스타일
interface StudentCardProps {
  student: ParsedStudent;
  isSelected: boolean;
  onClick: () => void;
}

function StudentCard({ student, isSelected, onClick }: StudentCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: isSelected ? 'rgba(102, 126, 234, 0.1)' : 'white',
        border: `1px solid ${isSelected ? '#667eea' : '#e2e8f0'}`,
        borderRadius: '8px',
        padding: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = '#cbd5e0';
          e.currentTarget.style.background = '#f7fafc';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = '#e2e8f0';
          e.currentTarget.style.background = 'white';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: isSelected ? '#667eea' : '#e2e8f0',
            color: isSelected ? 'white' : '#4a5568',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          {student.name.charAt(0)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#2d3748' }}>
            {student.name}
          </div>
          <div style={{ fontSize: '11px', color: '#718096' }}>
            {student.grade}학년 {student.class || '-'}반 {student.number || '-'}번 • ID: {student.id}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
        <span
          style={{
            background: '#bee3f8',
            color: '#2b6cb0',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '10px',
            fontWeight: 500,
          }}
        >
          1학기 {student.semester1.length}과목
        </span>
        <span
          style={{
            background: '#c6f6d5',
            color: '#276749',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '10px',
            fontWeight: 500,
          }}
        >
          2학기 {student.semester2.length}과목
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// 메인 시스템 데이터 컴포넌트들
// ============================================================================

interface MainSystemDataCardProps {
  courseData: ReturnType<typeof useCourseAnalyzeData>;
  subjects: { semester1: Set<string>; semester2: Set<string> };
  onViewDetail: () => void;
}

function MainSystemDataCard({ courseData, subjects, onViewDetail }: MainSystemDataCardProps) {
  // 인기 과목 계산
  const topSubjects = useMemo(() => {
    const semester1Counts: Record<string, number> = {};
    const semester2Counts: Record<string, number> = {};

    courseData.students.forEach(student => {
      student.semester1.forEach(subj => {
        semester1Counts[subj] = (semester1Counts[subj] || 0) + 1;
      });
      student.semester2.forEach(subj => {
        semester2Counts[subj] = (semester2Counts[subj] || 0) + 1;
      });
    });

    const semester1Top = Object.entries(semester1Counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name]) => name);

    const semester2Top = Object.entries(semester2Counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name]) => name);

    return { semester1: semester1Top, semester2: semester2Top };
  }, [courseData.students]);

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(5, 150, 105, 0.1) 100%)',
        border: '2px solid #10b981',
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'box-shadow 0.3s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Card Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          padding: '15px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: 'white',
        }}
      >
        <Database className="w-6 h-6" />
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
            메인 시스템 로드 데이터
          </h3>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', opacity: 0.9 }}>
            {courseData.fileName
              ? (courseData.fileName.length > 30
                ? courseData.fileName.slice(0, 27) + '...'
                : courseData.fileName)
              : '데이터 로드됨'}
          </p>
        </div>
      </div>

      {/* Statistics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1px',
          background: '#d1fae5',
          margin: '15px',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <div style={{ background: 'white', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#059669' }}>
            {courseData.students.length}
          </div>
          <div style={{ fontSize: '11px', color: '#718096', fontWeight: 500 }}>전체 학생</div>
        </div>
        <div style={{ background: 'white', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#059669' }}>
            {courseData.currentStudents.length}
          </div>
          <div style={{ fontSize: '11px', color: '#718096', fontWeight: 500 }}>
            {courseData.currentGrade}학년 {courseData.currentRound}차
          </div>
        </div>
        <div style={{ background: 'white', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#2b6cb0' }}>
            {subjects.semester1.size}
          </div>
          <div style={{ fontSize: '11px', color: '#718096', fontWeight: 500 }}>1학기 과목</div>
        </div>
        <div style={{ background: 'white', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#276749' }}>
            {subjects.semester2.size}
          </div>
          <div style={{ fontSize: '11px', color: '#718096', fontWeight: 500 }}>2학기 과목</div>
        </div>
      </div>

      {/* Subject Tags Section */}
      <div style={{ padding: '0 15px 15px 15px' }}>
        {/* 학년 정보 */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600, marginBottom: '6px' }}>
            📊 사용 가능한 학년/차수
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {courseData.availableGrades.map((grade) => (
              <span
                key={grade}
                style={{
                  background: courseData.currentGrade === grade ? '#10b981' : '#d1fae5',
                  color: courseData.currentGrade === grade ? 'white' : '#059669',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {grade}학년
              </span>
            ))}
            {courseData.availableRounds.map((round) => (
              <span
                key={round}
                style={{
                  background: courseData.currentRound === round ? '#10b981' : '#d1fae5',
                  color: courseData.currentRound === round ? 'white' : '#059669',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {round === 3 ? '최종' : `${round}차`}
              </span>
            ))}
          </div>
        </div>

        {/* 1학기 인기 과목 */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', color: '#2b6cb0', fontWeight: 600, marginBottom: '6px' }}>
            📘 1학기 인기 과목
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {topSubjects.semester1.map((subject, i) => (
              <span
                key={i}
                style={{
                  background: '#bee3f8',
                  color: '#2b6cb0',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {subject}
              </span>
            ))}
            {subjects.semester1.size > 3 && (
              <span
                style={{
                  background: '#e2e8f0',
                  color: '#718096',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                +{subjects.semester1.size - 3}
              </span>
            )}
          </div>
        </div>

        {/* 2학기 인기 과목 */}
        <div>
          <div style={{ fontSize: '11px', color: '#276749', fontWeight: 600, marginBottom: '6px' }}>
            📗 2학기 인기 과목
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {topSubjects.semester2.map((subject, i) => (
              <span
                key={i}
                style={{
                  background: '#c6f6d5',
                  color: '#276749',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {subject}
              </span>
            ))}
            {subjects.semester2.size > 3 && (
              <span
                style={{
                  background: '#e2e8f0',
                  color: '#718096',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                +{subjects.semester2.size - 3}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div
        style={{
          background: '#ecfdf5',
          padding: '12px 15px',
          borderTop: '1px solid #d1fae5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '11px', color: '#059669' }}>
          ✅ 분석 시스템에서 사용 중
        </span>
        <button
          onClick={onViewDetail}
          style={{
            background: '#10b981',
            color: 'white',
            border: 'none',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#059669';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#10b981';
          }}
        >
          📋 상세 보기
        </button>
      </div>
    </div>
  );
}

// Main System Detail View Component
interface MainSystemDetailViewProps {
  courseData: ReturnType<typeof useCourseAnalyzeData>;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedStudent: Student | null;
  onSelectStudent: (student: Student | null) => void;
}

function MainSystemDetailView({
  courseData,
  searchQuery,
  onSearchChange,
  selectedStudent,
  onSelectStudent,
}: MainSystemDetailViewProps) {
  // Filter students by search
  const filteredStudents = useMemo(() => {
    if (!searchQuery) return courseData.currentStudents;

    const query = searchQuery.toLowerCase();
    return courseData.currentStudents.filter(s =>
      s.name.toLowerCase().includes(query) ||
      String(s.id).toLowerCase().includes(query)
    );
  }, [courseData.currentStudents, searchQuery]);

  // 과목 통계
  const subjectStats = useMemo(() => {
    const semester1 = new Set<string>();
    const semester2 = new Set<string>();

    courseData.currentStudents.forEach(student => {
      student.semester1.forEach(s => semester1.add(s));
      student.semester2.forEach(s => semester2.add(s));
    });

    return { semester1: semester1.size, semester2: semester2.size };
  }, [courseData.currentStudents]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '80vh' }}>
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          padding: '20px 24px',
          color: 'white',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Database className="w-5 h-5" />
          메인 시스템 데이터 - 상세 보기
        </h2>
        <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
          {courseData.fileName || '로드된 데이터'} • {courseData.currentGrade}학년 {courseData.currentRound === 3 ? '최종' : `${courseData.currentRound}차`}
        </p>
      </div>

      {/* Stats Bar */}
      <div
        style={{
          display: 'flex',
          gap: '20px',
          padding: '12px 24px',
          background: '#ecfdf5',
          borderBottom: '1px solid #d1fae5',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#059669', fontWeight: 700, fontSize: '18px' }}>
            {courseData.currentStudents.length}
          </span>
          <span style={{ color: '#718096', fontSize: '13px' }}>학생</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#2b6cb0', fontWeight: 700, fontSize: '18px' }}>
            {subjectStats.semester1}
          </span>
          <span style={{ color: '#718096', fontSize: '13px' }}>1학기 과목</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#276749', fontWeight: 700, fontSize: '18px' }}>
            {subjectStats.semester2}
          </span>
          <span style={{ color: '#718096', fontSize: '13px' }}>2학기 과목</span>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#718096' }}>
            🔍
          </span>
          <Input
            placeholder="이름 또는 학번으로 검색..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              paddingLeft: '38px',
              border: '1px solid #d1fae5',
              borderRadius: '8px',
            }}
          />
        </div>
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#718096' }}>
          {filteredStudents.length}명 표시 중 {searchQuery && `(검색어: "${searchQuery}")`}
        </div>
      </div>

      {/* Student List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '12px',
          }}
        >
          {filteredStudents.map((student) => (
            <MainStudentCard
              key={student.id}
              student={student}
              isSelected={selectedStudent?.id === student.id}
              onClick={() => onSelectStudent(selectedStudent?.id === student.id ? null : student)}
            />
          ))}
        </div>
      </div>

      {/* Selected Student Detail */}
      {selectedStudent && (
        <div
          style={{
            borderTop: '1px solid #d1fae5',
            padding: '16px 24px',
            background: '#ecfdf5',
          }}
        >
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#065f46' }}>
            👤 {selectedStudent.name} 선택 과목
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#2b6cb0', fontWeight: 600, marginBottom: '8px' }}>
                📘 1학기 ({selectedStudent.semester1.length}과목)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {selectedStudent.semester1.map((subject, i) => (
                  <span
                    key={i}
                    style={{
                      background: '#bee3f8',
                      color: '#2b6cb0',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  >
                    {subject}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#276749', fontWeight: 600, marginBottom: '8px' }}>
                📗 2학기 ({selectedStudent.semester2.length}과목)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {selectedStudent.semester2.map((subject, i) => (
                  <span
                    key={i}
                    style={{
                      background: '#c6f6d5',
                      color: '#276749',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  >
                    {subject}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Main Student Card Component
interface MainStudentCardProps {
  student: Student;
  isSelected: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function MainStudentCard({ student, isSelected, onClick, onEdit, onDelete }: MainStudentCardProps) {
  return (
    <div
      style={{
        background: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'white',
        border: `1px solid ${isSelected ? '#10b981' : '#e2e8f0'}`,
        borderRadius: '8px',
        padding: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = '#a7f3d0';
          e.currentTarget.style.background = '#ecfdf5';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = '#e2e8f0';
          e.currentTarget.style.background = 'white';
        }
      }}
    >
      {/* Edit/Delete Buttons */}
      {(onEdit || onDelete) && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            display: 'flex',
            gap: '4px',
          }}
        >
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              style={{
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '4px',
                padding: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e0f2fe';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f0f9ff';
              }}
              title="수정"
            >
              <Pencil className="w-3.5 h-3.5 text-blue-500" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '4px',
                padding: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fee2e2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fef2f2';
              }}
              title="삭제"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </button>
          )}
        </div>
      )}

      <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: isSelected ? '#10b981' : '#d1fae5',
            color: isSelected ? 'white' : '#065f46',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          {student.name.charAt(0)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#2d3748' }}>
            {student.name}
          </div>
          <div style={{ fontSize: '11px', color: '#718096' }}>
            {student.year}학년 {student.class || '-'}반 {student.number || '-'}번 • ID: {student.id}
          </div>
        </div>
      </div>

      <div onClick={onClick} style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
        <span
          style={{
            background: '#bee3f8',
            color: '#2b6cb0',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '10px',
            fontWeight: 500,
          }}
        >
          1학기 {student.semester1.length}과목
        </span>
        <span
          style={{
            background: '#c6f6d5',
            color: '#276749',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '10px',
            fontWeight: 500,
          }}
        >
          2학기 {student.semester2.length}과목
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// 메인 시스템 그룹 카드 컴포넌트 (학년-차수별)
// ============================================================================

interface MainSystemGroupCardProps {
  groupKey: string;
  label: string;
  students: Student[];
  subjects: { semester1: Set<string>; semester2: Set<string> };
  onViewDetail: () => void;
}

function MainSystemGroupCard({ groupKey, label, students, subjects, onViewDetail }: MainSystemGroupCardProps) {
  // 인기 과목 계산
  const topSubjects = useMemo(() => {
    const semester1Counts: Record<string, number> = {};
    const semester2Counts: Record<string, number> = {};

    students.forEach(student => {
      student.semester1.forEach(subj => {
        semester1Counts[subj] = (semester1Counts[subj] || 0) + 1;
      });
      student.semester2.forEach(subj => {
        semester2Counts[subj] = (semester2Counts[subj] || 0) + 1;
      });
    });

    const semester1Top = Object.entries(semester1Counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name]) => name);

    const semester2Top = Object.entries(semester2Counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name]) => name);

    return { semester1: semester1Top, semester2: semester2Top };
  }, [students]);

  return (
    <div
      style={{
        background: 'white',
        border: '2px solid #10b981',
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'box-shadow 0.3s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Card Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          padding: '15px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: 'white',
        }}
      >
        <Database className="w-5 h-5" />
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
            {label}
          </h3>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', opacity: 0.9 }}>
            메인 시스템 데이터
          </p>
        </div>
      </div>

      {/* Statistics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1px',
          background: '#d1fae5',
          margin: '15px',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <div style={{ background: 'white', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#059669' }}>
            {students.length}
          </div>
          <div style={{ fontSize: '11px', color: '#718096', fontWeight: 500 }}>학생</div>
        </div>
        <div style={{ background: 'white', padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#059669' }}>
            {subjects.semester1.size + subjects.semester2.size}
          </div>
          <div style={{ fontSize: '11px', color: '#718096', fontWeight: 500 }}>과목</div>
        </div>
      </div>

      {/* Subject Tags Section */}
      <div style={{ padding: '0 15px 15px 15px' }}>
        {/* 1학기 과목 */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', color: '#2b6cb0', fontWeight: 600, marginBottom: '6px' }}>
            📘 1학기 과목 ({subjects.semester1.size}개)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {topSubjects.semester1.map((subject, i) => (
              <span
                key={i}
                style={{
                  background: '#bee3f8',
                  color: '#2b6cb0',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {subject}
              </span>
            ))}
            {subjects.semester1.size > 3 && (
              <span
                style={{
                  background: '#e2e8f0',
                  color: '#718096',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                +{subjects.semester1.size - 3}
              </span>
            )}
          </div>
        </div>

        {/* 2학기 과목 */}
        <div>
          <div style={{ fontSize: '11px', color: '#276749', fontWeight: 600, marginBottom: '6px' }}>
            📗 2학기 과목 ({subjects.semester2.size}개)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {topSubjects.semester2.map((subject, i) => (
              <span
                key={i}
                style={{
                  background: '#c6f6d5',
                  color: '#276749',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {subject}
              </span>
            ))}
            {subjects.semester2.size > 3 && (
              <span
                style={{
                  background: '#e2e8f0',
                  color: '#718096',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                +{subjects.semester2.size - 3}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div
        style={{
          background: '#ecfdf5',
          padding: '12px 15px',
          borderTop: '1px solid #d1fae5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '11px', color: '#059669' }}>
          ✅ 메인 시스템
        </span>
        <button
          onClick={onViewDetail}
          style={{
            background: '#10b981',
            color: 'white',
            border: 'none',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#059669';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#10b981';
          }}
        >
          📋 상세 보기
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 메인 시스템 그룹 상세 보기 컴포넌트
// ============================================================================

interface MainSystemGroupDetailViewProps {
  group: MainSystemGroup;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedStudent: Student | null;
  onSelectStudent: (student: Student | null) => void;
  onUpdateStudent: (studentId: string, updates: Partial<Student>) => void;
  onDeleteStudent: (studentId: string) => void;
}

function MainSystemGroupDetailView({
  group,
  searchQuery,
  onSearchChange,
  selectedStudent,
  onSelectStudent,
  onUpdateStudent,
  onDeleteStudent,
}: MainSystemGroupDetailViewProps) {
  // Edit dialog state
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    class: number;
    number: number;
    grade: string;
    semester1: string[];
    semester2: string[];
  }>({ name: '', class: 0, number: 0, grade: '', semester1: [], semester2: [] });

  // Delete confirmation state
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);

  // Get all available subjects for this group (sorted)
  const availableSubjects = useMemo(() => ({
    semester1: Array.from(group.subjects.semester1).sort((a, b) => a.localeCompare(b, 'ko')),
    semester2: Array.from(group.subjects.semester2).sort((a, b) => a.localeCompare(b, 'ko')),
  }), [group.subjects]);

  // Filter students by search
  const filteredStudents = useMemo(() => {
    if (!searchQuery) return group.students;

    const query = searchQuery.toLowerCase();
    return group.students.filter(s =>
      s.name.toLowerCase().includes(query) ||
      String(s.id).toLowerCase().includes(query)
    );
  }, [group.students, searchQuery]);

  // Handle edit click
  const handleEditClick = (student: Student) => {
    setEditingStudent(student);
    setEditForm({
      name: student.name,
      class: student.class,
      number: student.number,
      grade: student.grade,
      semester1: [...student.semester1],
      semester2: [...student.semester2],
    });
  };

  // Handle edit save
  const handleEditSave = () => {
    if (editingStudent) {
      onUpdateStudent(editingStudent.id, {
        name: editForm.name,
        class: editForm.class,
        number: editForm.number,
        grade: editForm.grade,
        semester1: editForm.semester1,
        semester2: editForm.semester2,
      });
      setEditingStudent(null);
    }
  };

  // Toggle subject selection
  const toggleSubject = (semester: 'semester1' | 'semester2', subject: string) => {
    setEditForm(prev => {
      const currentSubjects = prev[semester];
      const isSelected = currentSubjects.includes(subject);

      return {
        ...prev,
        [semester]: isSelected
          ? currentSubjects.filter(s => s !== subject)
          : [...currentSubjects, subject]
      };
    });
  };

  // Select all / Deselect all for a semester
  const selectAllSubjects = (semester: 'semester1' | 'semester2') => {
    setEditForm(prev => ({
      ...prev,
      [semester]: [...availableSubjects[semester]]
    }));
  };

  const deselectAllSubjects = (semester: 'semester1' | 'semester2') => {
    setEditForm(prev => ({
      ...prev,
      [semester]: []
    }));
  };

  // Handle delete confirm
  const handleDeleteConfirm = () => {
    if (studentToDelete) {
      onDeleteStudent(studentToDelete.id);
      setStudentToDelete(null);
      // Also deselect if deleted student was selected
      if (selectedStudent?.id === studentToDelete.id) {
        onSelectStudent(null);
      }
    }
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '80vh' }}>
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            padding: '20px 24px',
            color: 'white',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database className="w-5 h-5" />
            {group.label} - 상세 보기
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.9 }}>
            메인 시스템 데이터 • 학생 카드에서 수정/삭제 가능
          </p>
        </div>

        {/* Stats Bar */}
        <div
          style={{
            display: 'flex',
            gap: '20px',
            padding: '12px 24px',
            background: '#ecfdf5',
            borderBottom: '1px solid #d1fae5',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#059669', fontWeight: 700, fontSize: '18px' }}>
              {group.students.length}
            </span>
            <span style={{ color: '#718096', fontSize: '13px' }}>학생</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#2b6cb0', fontWeight: 700, fontSize: '18px' }}>
              {group.subjects.semester1.size}
            </span>
            <span style={{ color: '#718096', fontSize: '13px' }}>1학기 과목</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#276749', fontWeight: 700, fontSize: '18px' }}>
              {group.subjects.semester2.size}
            </span>
            <span style={{ color: '#718096', fontSize: '13px' }}>2학기 과목</span>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#718096' }}>
              🔍
            </span>
            <Input
              placeholder="이름 또는 학번으로 검색..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{
                paddingLeft: '38px',
                border: '1px solid #d1fae5',
                borderRadius: '8px',
              }}
            />
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#718096' }}>
            {filteredStudents.length}명 표시 중 {searchQuery && `(검색어: "${searchQuery}")`}
          </div>
        </div>

        {/* Student List */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '12px',
            }}
          >
            {filteredStudents.map((student) => (
              <MainStudentCard
                key={student.id}
                student={student}
                isSelected={selectedStudent?.id === student.id}
                onClick={() => onSelectStudent(selectedStudent?.id === student.id ? null : student)}
                onEdit={() => handleEditClick(student)}
                onDelete={() => setStudentToDelete(student)}
              />
            ))}
          </div>
        </div>

        {/* Selected Student Detail */}
        {selectedStudent && (
          <div
            style={{
              borderTop: '1px solid #d1fae5',
              padding: '16px 24px',
              background: '#ecfdf5',
            }}
          >
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#065f46' }}>
              👤 {selectedStudent.name} 선택 과목 (등급: {formatGrade(selectedStudent.grade)})
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#2b6cb0', fontWeight: 600, marginBottom: '8px' }}>
                  📘 1학기 ({selectedStudent.semester1.length}과목)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {selectedStudent.semester1.map((subject, i) => (
                    <span
                      key={i}
                      style={{
                        background: '#bee3f8',
                        color: '#2b6cb0',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    >
                      {subject}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#276749', fontWeight: 600, marginBottom: '8px' }}>
                  📗 2학기 ({selectedStudent.semester2.length}과목)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {selectedStudent.semester2.map((subject, i) => (
                    <span
                      key={i}
                      style={{
                        background: '#c6f6d5',
                        color: '#276749',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    >
                      {subject}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editingStudent !== null} onOpenChange={(open) => !open && setEditingStudent(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-500" />
              학생 정보 수정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-name">이름</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="이름"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-class">반</Label>
                <Input
                  id="edit-class"
                  type="number"
                  value={editForm.class}
                  onChange={(e) => setEditForm(prev => ({ ...prev, class: parseInt(e.target.value) || 0 }))}
                  placeholder="반"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-number">번호</Label>
                <Input
                  id="edit-number"
                  type="number"
                  value={editForm.number}
                  onChange={(e) => setEditForm(prev => ({ ...prev, number: parseInt(e.target.value) || 0 }))}
                  placeholder="번호"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-grade">등급</Label>
                <Input
                  id="edit-grade"
                  value={editForm.grade}
                  onChange={(e) => setEditForm(prev => ({ ...prev, grade: e.target.value }))}
                  placeholder="등급"
                />
              </div>
            </div>

            {/* Semester 1 Subjects */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-blue-600">📘 1학기 과목 ({editForm.semester1.length}/{availableSubjects.semester1.length}개 선택)</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectAllSubjects('semester1')}
                    className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700"
                  >
                    전체선택
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => deselectAllSubjects('semester1')}
                    className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700"
                  >
                    전체해제
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg max-h-[150px] overflow-y-auto">
                {availableSubjects.semester1.length === 0 ? (
                  <span className="text-sm text-slate-400">이 학년에 등록된 1학기 과목이 없습니다</span>
                ) : (
                  availableSubjects.semester1.map((subject) => {
                    const isSelected = editForm.semester1.includes(subject);
                    return (
                      <button
                        key={subject}
                        type="button"
                        onClick={() => toggleSubject('semester1', subject)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        {isSelected && '✓ '}{subject}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Semester 2 Subjects */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-green-600">📗 2학기 과목 ({editForm.semester2.length}/{availableSubjects.semester2.length}개 선택)</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => selectAllSubjects('semester2')}
                    className="h-6 px-2 text-xs text-green-600 hover:text-green-700"
                  >
                    전체선택
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => deselectAllSubjects('semester2')}
                    className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700"
                  >
                    전체해제
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg max-h-[150px] overflow-y-auto">
                {availableSubjects.semester2.length === 0 ? (
                  <span className="text-sm text-slate-400">이 학년에 등록된 2학기 과목이 없습니다</span>
                ) : (
                  availableSubjects.semester2.map((subject) => {
                    const isSelected = editForm.semester2.includes(subject);
                    return (
                      <button
                        key={subject}
                        type="button"
                        onClick={() => toggleSubject('semester2', subject)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-green-500 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-green-300 hover:bg-green-50'
                        }`}
                      >
                        {isSelected && '✓ '}{subject}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStudent(null)}>
              취소
            </Button>
            <Button onClick={handleEditSave}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={studentToDelete !== null} onOpenChange={(open) => !open && setStudentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              학생 삭제 확인
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{studentToDelete?.name}</strong> 학생을 삭제하시겠습니까?
              <br />
              이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
