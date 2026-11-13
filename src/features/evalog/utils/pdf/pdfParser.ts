/**
 * PDF 파싱 유틸리티
 * 학생부 PDF를 Student 객체로 변환
 * test-pdf.html의 알고리즘을 TypeScript로 포팅
 */

import * as pdfjsLib from 'pdfjs-dist';
import { convertPdfToStudent } from './convertPdfToStudent';
import { validateStudent } from './validator';
import { PDFParseResult, PDFParseError } from '../../types/pdf';
import { normalizePDFSpacing } from './parsers/textProcessor';
import { parsePdfSections } from './parsers/sectionOrchestrator';
import { Student } from '../../types';

// PDF.js worker 설정
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * PDF 처리 메인 함수
 */
export class PDFParser {
  private rawText: string = '';
  private errors: PDFParseError[] = [];
  private warnings: string[] = [];

  /**
   * 1. PDF 텍스트 추출 (Raw Text)
   */
  async extractText(file: File): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: '/cmaps/',
        cMapPacked: true,
      }).promise;

      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        let pageText = '';
        let lastY = -1;

        textContent.items.forEach((item: any) => {
          const currentY = item.transform ? item.transform[5] : 0;

          if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
            pageText += '\n';
          }

          pageText += item.str;

          if (lastY !== -1 && Math.abs(currentY - lastY) <= 5) {
            pageText += ' ';
          }

          lastY = currentY;
        });

        fullText += pageText + '\n\n';
      }

      // PDF 텍스트 정규화 (섹션 헤더 제거 포함)
      // this.rawText = normalizePDFSpacing(fullText); // Moved to parseText
      this.rawText = fullText;

      console.log('✅ PDF 텍스트 추출 완료 (Raw)');
      console.log(`총 텍스트 길이 (Raw): ${this.rawText.length}자`);

      return this.rawText;
    } catch (error) {
      console.error('PDF 텍스트 추출 실패:', error);
      throw error;
    }
  }

  /**
   * 2. 텍스트 파싱 (Text -> Students)
   */
  parseText(text: string, options?: { separator?: string }): PDFParseResult {
    // Normalize text before parsing
    console.log(`🔄 텍스트 정규화 시작 (Input: ${text.length}자)...`);
    const normalizedText = normalizePDFSpacing(text);
    console.log(`✅ 텍스트 정규화 완료 (Output: ${normalizedText.length}자)`);

    this.rawText = normalizedText;
    this.errors = [];
    this.warnings = [];

    try {
      console.log('🔄 섹션 파싱 시작...');

      // Multi-student detection for Legacy PDF
      // Separator: "학교생활세부사항기록부(학교생활기록부II)"
      const separator = options?.separator || "학교생활세부사항기록부(학교생활기록부II)";
      const parts = this.rawText.split(separator);

      const students: Partial<Student>[] = [];

      if (parts.length > 1) {
        console.log(`📦 다중 학생 데이터 감지: ${parts.length - 1}명 예상`);

        parts.forEach((part, index) => {
          if (!part.trim()) return;

          const studentText = `${separator}\n${part}`;
          const sections = parsePdfSections(studentText);
          const student = convertPdfToStudent(sections);

          if (student.name) {
            students.push(student);
          }
        });
      } else {
        // Single student fallback
        const pdfSections = parsePdfSections(this.rawText);
        const student = convertPdfToStudent(pdfSections);
        students.push(student);
      }

      console.log(`✅ 섹션 파싱 완료. 추출된 학생 수: ${students.length}`);

      const student = students.length > 0 ? students[0] : {};

      console.log('🔄 유효성 검사 시작...');
      const validationResult = validateStudent(student);

      this.errors.push(...validationResult.errors);
      this.warnings.push(...validationResult.warnings);

      const result: PDFParseResult = {
        success: this.errors.filter(e => e.severity === 'error').length === 0,
        student,
        students: students as Student[],
        errors: this.errors,
        warnings: this.warnings,
        rawText: this.rawText,
      };

      return result;
    } catch (error) {
      console.error('PDF 파싱 실패:', error);
      this.errors.push({
        field: 'general',
        message: `PDF 파싱 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        severity: 'error'
      });

      return {
        success: false,
        errors: this.errors,
        warnings: this.warnings,
        rawText: this.rawText
      };
    }
  }

  async parse(file: File, options?: { separator?: string }): Promise<PDFParseResult> {
    try {
      const text = await this.extractText(file);
      return this.parseText(text, options);
    } catch (error) {
      return {
        success: false,
        errors: [{ field: 'general', message: 'PDF Extraction Failed', severity: 'error' }],
        warnings: [],
        rawText: ''
      };
    }
  }
}
