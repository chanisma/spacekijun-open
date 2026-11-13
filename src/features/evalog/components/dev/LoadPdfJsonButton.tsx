import { useState } from 'react';
import { Student } from '../../types';
import { PdfSections } from '../../types/pdfTypes';
import { convertPdfToStudent } from '../../utils/pdf/convertPdfToStudent';

interface LoadPdfJsonButtonProps {
  onStudentLoaded: (student: Student) => void;
}

/**
 * 개발용 컴포넌트: PDF JSON 파일을 로드하고 Student 객체로 변환
 */
export function LoadPdfJsonButton({ onStudentLoaded }: LoadPdfJsonButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPdfJson = async () => {
    setLoading(true);
    setError(null);

    try {
      // public/pdf-sections.json 파일 로드
      const response = await fetch('/pdf-sections.json');
      if (!response.ok) {
        throw new Error('PDF JSON 파일을 로드할 수 없습니다.');
      }

      const pdfData: PdfSections = await response.json();

      // Student 객체로 변환
      const student = convertPdfToStudent(pdfData, 'pdf-test-001');

      // 변환 결과를 콘솔에 출력
      console.log('=== PDF 변환 결과 ===');
      console.log('성명:', student.name);
      console.log('출신 중학교:', student.schoolName);
      console.log('PDF 데이터:', student.pdfData);
      console.log('전체 Student 객체:', student);

      // 부모 컴포넌트에 전달
      onStudentLoaded(student);

      alert(`PDF 데이터 로드 완료!\n\n성명: ${student.name}\n출신 중학교: ${student.schoolName}\n\n콘솔에서 상세 정보를 확인하세요.`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
      setError(errorMessage);
      console.error('PDF 로드 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border-t border-gray-200 bg-yellow-50">
      <div className="flex items-center gap-4">
        <button
          onClick={loadPdfJson}
          disabled={loading}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? '로드 중...' : '🧪 PDF JSON 로드 (개발용)'}
        </button>

        {error && (
          <span className="text-red-600 text-sm">
            오류: {error}
          </span>
        )}

        <span className="text-sm text-gray-600">
          public/pdf-sections.json → Student 객체 변환
        </span>
      </div>
    </div>
  );
}
