/**
 * File Extract Step - 파일 추출 (Step 4)
 * 통합 데이터 내보내기 및 다운로드
 * 원본 vanilla JS 디자인 적용 + 메인 시스템 데이터 통합
 */

import React, { useState, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Database } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAdmin } from '../../../context/AdminContext';
import { useCourseAnalyzeData } from '../../../context/CourseAnalyzeContext';
import type { ExportType, ExportFormat, ExportedFile } from '../../../types/admin.types';
import type { Student } from '../../../types/course.types';

// Export type configuration
const EXPORT_TYPES: { type: ExportType; title: string; description: string }[] = [
  { type: 'unified', title: '통합 데이터', description: '모든 학생 데이터를 하나의 파일로 통합' },
  { type: 'combined', title: '학년별 데이터', description: '학년-차수별로 분리된 데이터' },
  { type: 'categories', title: '과목 카테고리', description: '과목 분류 및 카테고리 설정' },
  { type: 'gradeAnalysis', title: '과목별 현황', description: '과목별 선택 인원 통계' },
  { type: 'config', title: '설정 백업', description: '카테고리 설정만 백업' },
];

// Format options
const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'json', label: 'JSON' },
  { value: 'excel', label: 'Excel' },
  { value: 'csv', label: 'CSV' },
];

export function FileExtract() {
  const { state, statistics } = useAdmin();
  const courseData = useCourseAnalyzeData();
  const [selectedTypes, setSelectedTypes] = useState<ExportType[]>(['unified']);
  const [format, setFormat] = useState<ExportFormat>('json');
  const [isExporting, setIsExporting] = useState(false);
  const [exportedFiles, setExportedFiles] = useState<ExportedFile[]>([]);

  // 메인 시스템 데이터 확인
  const hasMainSystemData = courseData.students.length > 0;

  // Get all parsed data from admin files
  const allParsedData = useMemo(() => {
    const result: Array<{ key: string; data: NonNullable<(typeof state.files extends Map<string, infer V> ? V : never)['parsedData']> }> = [];
    state.files.forEach((file, key) => {
      if (file.parsedData) {
        result.push({ key, data: file.parsedData });
      }
    });
    return result;
  }, [state.files]);

  // 메인 시스템 학생을 관리자 형식으로 변환
  const mainSystemParsedData = useMemo(() => {
    if (!hasMainSystemData) return null;

    // 학년-차수별로 그룹핑
    const groups: Record<string, Student[]> = {};
    courseData.students.forEach(student => {
      const key = `${student.year}-${student.round}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(student);
    });

    return Object.entries(groups).map(([key, students]) => ({
      key,
      data: {
        students: students.map(s => ({
          id: s.id,
          name: s.name,
          year: s.year,           // 학년 (1, 2, 3)
          class: s.class,
          number: s.number,
          semester1: s.semester1,
          semester2: s.semester2,
          grade: s.grade,         // 성적 등급 (GPA) - 원래 값 유지!
        })),
        subjects: {
          semester1: [...new Set(students.flatMap(s => s.semester1))],
          semester2: [...new Set(students.flatMap(s => s.semester2))],
        },
        totalSubjects: 0, // Will be calculated
      }
    }));
  }, [courseData.students, hasMainSystemData]);

  // 모든 데이터 합치기 (관리자 + 메인 시스템)
  const combinedParsedData = useMemo(() => {
    const result = [...allParsedData];
    if (mainSystemParsedData) {
      mainSystemParsedData.forEach(mpd => {
        // 중복 키 체크 후 추가
        if (!result.some(r => r.key === mpd.key)) {
          result.push(mpd as any);
        }
      });
    }
    return result;
  }, [allParsedData, mainSystemParsedData]);

  const handleExport = async () => {
    setIsExporting(true);
    setExportedFiles([]);

    try {
      const files: ExportedFile[] = [];

      for (const exportType of selectedTypes) {
        const file = await generateExportFile(
          exportType,
          format,
          combinedParsedData,
          state.subjectConfig,
          hasMainSystemData ? courseData : undefined
        );
        if (file) {
          files.push(file);
          downloadFile(file);
        }
      }

      setExportedFiles(files);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const toggleExportType = (type: ExportType) => {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  // 관리자 파일 또는 메인 시스템 데이터가 있으면 내보내기 가능
  const hasData = allParsedData.length > 0 || hasMainSystemData;

  // 메인 시스템 통계
  const mainSystemStats = useMemo(() => {
    if (!hasMainSystemData) return null;
    const semester1Subjects = new Set<string>();
    const semester2Subjects = new Set<string>();
    courseData.students.forEach(s => {
      s.semester1.forEach(subj => semester1Subjects.add(subj));
      s.semester2.forEach(subj => semester2Subjects.add(subj));
    });
    return {
      totalStudents: courseData.students.length,
      uniqueSubjects: semester1Subjects.size + semester2Subjects.size,
      fileName: courseData.fileName
    };
  }, [courseData, hasMainSystemData]);

  return (
    <ScrollArea className="h-full">
      <div className="p-6">
        {/* 메인 시스템 데이터 표시 */}
        {hasMainSystemData && mainSystemStats && (
          <div
            style={{
              background: 'linear-gradient(to right, #ecfdf5, #d1fae5)',
              border: '2px solid #10b981',
              borderRadius: '12px',
              padding: '16px 20px',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Database style={{ width: '20px', height: '20px', color: '#059669' }} />
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#059669' }}>
                메인 시스템 데이터 로드됨
              </span>
              <span
                style={{
                  background: '#10b981',
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                내보내기 가능
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>📄</span>
                <span style={{ fontSize: '13px', color: '#065f46' }}>
                  {mainSystemStats.fileName || '로드된 데이터'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>👥</span>
                <span style={{ fontSize: '13px', color: '#065f46' }}>
                  학생 <strong style={{ color: '#059669' }}>{mainSystemStats.totalStudents}</strong>명
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>📚</span>
                <span style={{ fontSize: '13px', color: '#065f46' }}>
                  과목 <strong style={{ color: '#059669' }}>{mainSystemStats.uniqueSubjects}</strong>개
                </span>
              </div>
            </div>
          </div>
        )}

        {/* System Status - 원본 스타일 (관리자 파일 통계) */}
        <div
          style={{
            background: '#f8f9fa',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '15px 20px',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '30px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>📂</span>
              <span style={{ fontSize: '13px', color: '#4a5568' }}>
                파일 <strong style={{ color: '#667eea' }}>{statistics.totalFiles}</strong>개
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>👥</span>
              <span style={{ fontSize: '13px', color: '#4a5568' }}>
                학생 <strong style={{ color: '#667eea' }}>{statistics.totalStudents}</strong>명
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>📚</span>
              <span style={{ fontSize: '13px', color: '#4a5568' }}>
                과목 <strong style={{ color: '#667eea' }}>{statistics.totalUniqueSubjects}</strong>개
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🏷️</span>
              <span style={{ fontSize: '13px', color: '#4a5568' }}>
                카테고리 <strong style={{ color: '#667eea' }}>{Object.keys(state.subjectConfig.categories).length}</strong>개
              </span>
            </div>
          </div>
        </div>

        {/* Export Options Section - 원본 스타일 */}
        <div
          style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px',
          }}
        >
          <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', fontWeight: 600, color: '#2d3748' }}>
            📤 내보내기 옵션
          </h3>

          {/* Export Type Selection */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4a5568', marginBottom: '10px' }}>
              데이터 유형 선택
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
              {EXPORT_TYPES.map(({ type, title, description }) => (
                <label
                  key={type}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px',
                    background: selectedTypes.includes(type) ? 'rgba(102, 126, 234, 0.1)' : '#f8f9fa',
                    border: `1px solid ${selectedTypes.includes(type) ? '#667eea' : '#e2e8f0'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(type)}
                    onChange={() => toggleExportType(type)}
                    style={{
                      width: '16px',
                      height: '16px',
                      marginTop: '2px',
                      accentColor: '#667eea',
                    }}
                  />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#2d3748' }}>{title}</div>
                    <div style={{ fontSize: '11px', color: '#718096', marginTop: '2px' }}>{description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* File Format Selection */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4a5568', marginBottom: '10px' }}>
              파일 형식
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {FORMAT_OPTIONS.map(({ value, label }) => (
                <label
                  key={value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    background: format === value ? 'rgba(102, 126, 234, 0.1)' : '#f8f9fa',
                    border: `1px solid ${format === value ? '#667eea' : '#e2e8f0'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <input
                    type="radio"
                    name="format"
                    checked={format === value}
                    onChange={() => setFormat(value)}
                    style={{
                      width: '14px',
                      height: '14px',
                      accentColor: '#667eea',
                    }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 500, color: format === value ? '#667eea' : '#4a5568' }}>
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Export Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '15px',
              background: '#f7fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div>
              <div style={{ fontSize: '13px', color: '#4a5568' }}>
                <strong style={{ color: '#667eea' }}>{selectedTypes.length}</strong>개 유형 선택됨 •{' '}
                <strong style={{ color: '#667eea' }}>{format.toUpperCase()}</strong> 형식
              </div>
            </div>
            <button
              onClick={handleExport}
              disabled={!hasData || selectedTypes.length === 0 || isExporting}
              style={{
                background: (!hasData || selectedTypes.length === 0 || isExporting)
                  ? '#cbd5e0'
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: (!hasData || selectedTypes.length === 0 || isExporting) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
              }}
            >
              {isExporting ? (
                <>
                  <span
                    style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid transparent',
                      borderTopColor: 'white',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                  내보내는 중...
                </>
              ) : (
                <>
                  📥 내보내기
                </>
              )}
            </button>
          </div>
        </div>

        {/* Download Section - 원본 스타일 */}
        {exportedFiles.length > 0 && (
          <div
            style={{
              background: 'linear-gradient(135deg, #e8f5e8 0%, #f0f8f0 100%)',
              border: '2px solid #48bb78',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '20px',
            }}
          >
            <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', fontWeight: 600, color: '#276749', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ✅ 내보내기 완료
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {exportedFiles.map((file, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'white',
                    borderRadius: '8px',
                    border: '1px solid #c6f6d5',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>📄</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#2d3748' }}>{file.name}</div>
                      <div style={{ fontSize: '12px', color: '#718096' }}>{formatFileSize(file.size)}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadFile(file)}
                    style={{
                      background: '#48bb78',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    📥 다시 다운로드
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Data Warning - 원본 스타일 */}
        {!hasData && (
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fbbf24',
              borderRadius: '8px',
              padding: '16px 20px',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>⚠️</span>
            <p style={{ margin: 0, fontSize: '14px', color: '#92400e', fontWeight: 500 }}>
              내보낼 데이터가 없습니다. 먼저 파일을 업로드해주세요.
            </p>
          </div>
        )}

        {/* Help Section - 원본 스타일 */}
        <div
          style={{
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '8px',
            padding: '16px 20px',
            marginTop: '20px',
          }}
        >
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 600, color: '#0369a1' }}>
            💡 내보내기 안내
          </h4>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#0c4a6e', lineHeight: 1.6 }}>
            <li><strong>통합 데이터:</strong> 모든 학생의 과목 선택 정보를 하나의 파일로 통합</li>
            <li><strong>학년별 데이터:</strong> 학년 및 차수별로 분리된 데이터</li>
            <li><strong>과목 카테고리:</strong> 과목 분류 설정 정보 (다른 시스템과 공유 가능)</li>
            <li><strong>과목별 현황:</strong> 과목별 선택 인원 통계</li>
            <li><strong>설정 백업:</strong> 현재 카테고리 설정만 백업</li>
          </ul>
        </div>
      </div>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </ScrollArea>
  );
}

// Generate Export File
async function generateExportFile(
  type: ExportType,
  format: ExportFormat,
  parsedData: Array<{ key: string; data: any }>,
  subjectConfig: any,
  mainSystemData?: ReturnType<typeof useCourseAnalyzeData>
): Promise<ExportedFile | null> {
  const timestamp = new Date().toISOString().slice(0, 10);
  let data: any;
  let filename: string;

  switch (type) {
    case 'unified': {
      // 통합 학생 데이터 구조: { id, name, year, class, number, round, semester1, semester2, academicGrade }
      const allStudents: Array<{
        id: string | number;
        name: string;
        year: number | string;
        class: number | string;
        number: number | string;
        round: number | string;
        semester1: string[];
        semester2: string[];
        academicGrade: number | string;
      }> = [];

      // 관리자 파일 데이터 처리
      parsedData.forEach(({ key, data: pd }) => {
        const [yearFromKey, roundFromKey] = key.split('-');
        pd.students.forEach((student: any) => {
          allStudents.push({
            id: student.id,
            name: student.name,
            year: student.year ?? yearFromKey,           // 학년
            class: student.class ?? '',
            number: student.number ?? '',
            round: roundFromKey,                          // 차수 (키에서 추출)
            semester1: student.semester1 || [],
            semester2: student.semester2 || [],
            academicGrade: student.grade ?? ''            // 성적 등급 (GPA)
          });
        });
      });

      // 메인 시스템 데이터도 포함 (중복 방지)
      if (mainSystemData && mainSystemData.students.length > 0) {
        const existingIds = new Set(allStudents.map(s => `${s.id}-${s.year}-${s.round}`));
        mainSystemData.students.forEach(student => {
          const uniqueKey = `${student.id}-${student.year}-${student.round}`;
          if (!existingIds.has(uniqueKey)) {
            allStudents.push({
              id: student.id,
              name: student.name,
              year: student.year,                         // 학년
              class: student.class ?? '',
              number: student.number ?? '',
              round: student.round,                       // 차수
              semester1: student.semester1 || [],
              semester2: student.semester2 || [],
              academicGrade: student.grade ?? ''          // 성적 등급 (GPA)
            });
          }
        });
      }

      data = {
        fileType: 'kijun_unified_export',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        metadata: {
          description: '기준분석 통합 데이터 파일',
          totalStudents: allStudents.length,
          exportedFrom: 'admin_dashboard',
          includesMainSystemData: !!(mainSystemData && mainSystemData.students.length > 0),
        },
        studentData: [
          ['학생ID', '이름', '학년', '반', '번호', '차수', '1학기 과목', '2학기 과목', '등급'],
          ...allStudents.map(s => [
            s.id,
            s.name,
            String(s.year),                               // 학년 (문자열)
            s.class,
            s.number,
            String(s.round),                              // 차수 (문자열)
            s.semester1.join(', '),
            s.semester2.join(', '),
            s.academicGrade                               // 성적 등급 (GPA)
          ])
        ],
        subjectConfiguration: subjectConfig
      };
      filename = `통합데이터_${timestamp}`;
      break;
    }

    case 'combined': {
      data = {};
      parsedData.forEach(({ key, data: pd }) => {
        data[key] = pd;
      });
      filename = `학년별데이터_${timestamp}`;
      break;
    }

    case 'categories': {
      const categorySubjects: Record<string, string[]> = {};
      Object.entries(subjectConfig.categories).forEach(([name, cat]: [string, any]) => {
        categorySubjects[name] = cat.subjects;
      });
      data = {
        categories: categorySubjects,
        uncategorized: subjectConfig.uncategorized,
        exportedAt: new Date().toISOString()
      };
      filename = `과목카테고리_${timestamp}`;
      break;
    }

    case 'gradeAnalysis': {
      const subjectCounts: Record<string, { semester1: number; semester2: number }> = {};

      // 관리자 파일 데이터
      parsedData.forEach(({ data: pd }) => {
        pd.students.forEach((student: any) => {
          student.semester1.forEach((subject: string) => {
            if (!subjectCounts[subject]) subjectCounts[subject] = { semester1: 0, semester2: 0 };
            subjectCounts[subject].semester1++;
          });
          student.semester2.forEach((subject: string) => {
            if (!subjectCounts[subject]) subjectCounts[subject] = { semester1: 0, semester2: 0 };
            subjectCounts[subject].semester2++;
          });
        });
      });

      // 메인 시스템 데이터 (관리자 파일이 없는 경우)
      if (mainSystemData && mainSystemData.students.length > 0 && parsedData.length === 0) {
        mainSystemData.students.forEach((student) => {
          student.semester1.forEach((subject: string) => {
            if (!subjectCounts[subject]) subjectCounts[subject] = { semester1: 0, semester2: 0 };
            subjectCounts[subject].semester1++;
          });
          student.semester2.forEach((subject: string) => {
            if (!subjectCounts[subject]) subjectCounts[subject] = { semester1: 0, semester2: 0 };
            subjectCounts[subject].semester2++;
          });
        });
      }

      data = {
        subjectCounts: Object.entries(subjectCounts).map(([subject, counts]) => ({
          subject,
          ...counts,
          total: counts.semester1 + counts.semester2
        })).sort((a, b) => b.total - a.total),
        exportedAt: new Date().toISOString(),
        includesMainSystemData: !!(mainSystemData && mainSystemData.students.length > 0)
      };
      filename = `과목별현황_${timestamp}`;
      break;
    }

    case 'config': {
      data = {
        ...subjectConfig,
        exportedAt: new Date().toISOString()
      };
      filename = `설정백업_${timestamp}`;
      break;
    }

    default:
      return null;
  }

  // Generate file based on format
  let blob: Blob;
  let extension: string;

  switch (format) {
    case 'json': {
      blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      extension = 'json';
      break;
    }

    case 'excel': {
      const wb = XLSX.utils.book_new();

      if (type === 'unified' && data.studentData) {
        const ws = XLSX.utils.aoa_to_sheet(data.studentData);
        XLSX.utils.book_append_sheet(wb, ws, '학생데이터');
      } else if (type === 'gradeAnalysis' && data.subjectCounts) {
        const wsData = [
          ['과목명', '1학기', '2학기', '합계'],
          ...data.subjectCounts.map((s: any) => [s.subject, s.semester1, s.semester2, s.total])
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, '과목별현황');
      } else {
        // For other types, convert to sheet format
        const ws = XLSX.utils.json_to_sheet([data]);
        XLSX.utils.book_append_sheet(wb, ws, 'Data');
      }

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      extension = 'xlsx';
      break;
    }

    case 'csv': {
      let csvContent = '';

      if (type === 'unified' && data.studentData) {
        csvContent = data.studentData.map((row: any[]) => row.join(',')).join('\n');
      } else if (type === 'gradeAnalysis' && data.subjectCounts) {
        csvContent = '과목명,1학기,2학기,합계\n' +
          data.subjectCounts.map((s: any) => `${s.subject},${s.semester1},${s.semester2},${s.total}`).join('\n');
      } else {
        csvContent = JSON.stringify(data);
      }

      blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
      extension = 'csv';
      break;
    }

    default:
      return null;
  }

  return {
    name: `${filename}.${extension}`,
    type,
    blob,
    size: blob.size
  };
}

// Download File
function downloadFile(file: ExportedFile) {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Format File Size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
