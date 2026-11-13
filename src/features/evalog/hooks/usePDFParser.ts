/**
 * PDF 파싱 훅
 * PDF 파일을 파싱하여 Student 객체로 변환하는 훅
 */

import { useState, useCallback } from 'react';
import { PDFParser } from '../utils/pdf/pdfParser';
import { PDFParseResult } from '../types/pdf';
import { Student } from '../types';

interface UsePDFParserReturn {
  parseFile: (file: File) => Promise<void>;
  result: PDFParseResult | null;
  student: Partial<Student> | null;
  students: Partial<Student>[] | null; // Added
  loading: boolean;
  error: string | null;
  reset: () => void;
}

export function usePDFParser(): UsePDFParserReturn {
  const [result, setResult] = useState<PDFParseResult | null>(null);
  const [student, setStudent] = useState<Partial<Student> | null>(null);
  const [students, setStudents] = useState<Partial<Student>[] | null>(null); // Added
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseFile = useCallback(async (file: File) => {
    console.log('🔄 usePDFParser: 파일 파싱 시작', file.name);
    setLoading(true);
    setError(null);
    setResult(null);
    setStudent(null);
    setStudents(null); // Reset

    try {
      const parser = new PDFParser();
      console.log('🔄 usePDFParser: PDFParser.parse() 호출');
      const parseResult = await parser.parse(file);

      console.log('✅ usePDFParser: 파싱 결과 받음', {
        success: parseResult.success,
        hasStudent: !!parseResult.student,
        studentCount: parseResult.students?.length || 0,
        errorCount: parseResult.errors?.length || 0
      });

      setResult(parseResult);

      if (parseResult.success) {
        // Handle single student (legacy/default)
        if (parseResult.student) {
          console.log('✅ usePDFParser: Student 객체 설정');
          const studentWithRawText = {
            ...parseResult.student,
            rawText: parseResult.rawText,
            originalText: parseResult.originalText,
            pdfFile: file
          };
          setStudent(studentWithRawText);
        }

        // Handle multiple students
        if (parseResult.students && parseResult.students.length > 0) {
          console.log(`✅ usePDFParser: ${parseResult.students.length}명의 학생 데이터 설정`);
          const studentsWithRawText = parseResult.students.map(s => ({
            ...s,
            rawText: parseResult.rawText, // Share raw text for now, or split if needed
            originalText: parseResult.originalText,
            pdfFile: file
          }));
          setStudents(studentsWithRawText);
        }
      } else {
        const errorMessages = parseResult.errors
          .filter(e => e.severity === 'error')
          .map(e => e.message)
          .join(', ');
        console.error('❌ usePDFParser: 파싱 실패', errorMessages);
        setError(errorMessages || 'PDF 파싱에 실패했습니다.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'PDF 파싱 중 오류가 발생했습니다.';
      console.error('❌ usePDFParser: 예외 발생', err);
      setError(errorMessage);
    } finally {
      console.log('✅ usePDFParser: loading=false 설정');
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setStudent(null);
    setStudents(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    parseFile,
    result,
    student,
    students,
    loading,
    error,
    reset
  };
}
