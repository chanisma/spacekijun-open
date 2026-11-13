/**
 * PDF 미리보기 컴포넌트
 * 업로드된 PDF 파일을 캔버스에 렌더링하여 미리보기 제공
 */

import React, { useState, useEffect, useRef } from 'react';
import { pdfjsLib } from '../../utils/pdf/pdfConfig';

interface PDFPreviewProps {
  file: File | null;
  onClose?: () => void;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ file, onClose }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // PDF 문서 로드
  useEffect(() => {
    if (!file) return;

    const loadPDF = async () => {
      setLoading(true);
      setError(null);

      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
      } catch (err) {
        console.error('PDF 로드 오류:', err);
        setError('PDF 파일을 로드할 수 없습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadPDF();

    // 컴포넌트 언마운트 시 정리
    return () => {
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
      }
    };
  }, [file]);

  // 페이지 렌더링
  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current) return;

    const renderPage = async () => {
      setLoading(true);

      try {
        const page = await pdfDocRef.current!.getPage(currentPage);
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d')!;

        // 뷰포트 설정 (스케일 1.5로 선명하게)
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // 페이지 렌더링
        const renderContext: any = {
          canvasContext: context,
          viewport: viewport
        };

        await page.render(renderContext).promise;
      } catch (err) {
        console.error('페이지 렌더링 오류:', err);
        setError('페이지를 렌더링할 수 없습니다.');
      } finally {
        setLoading(false);
      }
    };

    renderPage();
  }, [currentPage]);

  // 페이지 이동 핸들러
  const goToFirstPage = () => setCurrentPage(1);
  const goToPrevPage = () => setCurrentPage(prev => Math.max(1, prev - 1));
  const goToNextPage = () => setCurrentPage(prev => Math.min(totalPages, prev + 1));
  const goToLastPage = () => setCurrentPage(totalPages);

  if (!file) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">PDF 미리보기</h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* PDF 뷰어 */}
        <div className="flex-1 overflow-auto p-4 bg-gray-100">
          <div className="flex justify-center">
            {loading && (
              <div className="flex items-center justify-center h-96">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600"></div>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center h-96">
                <div className="text-center">
                  <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-600">{error}</p>
                </div>
              </div>
            )}

            {!loading && !error && (
              <canvas
                ref={canvasRef}
                className="shadow-lg bg-white"
              />
            )}
          </div>
        </div>

        {/* 페이지 네비게이션 */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <div className="flex items-center space-x-2">
            <button
              onClick={goToFirstPage}
              disabled={currentPage === 1}
              className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goToPrevPage}
              disabled={currentPage === 1}
              className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          <div className="text-sm text-gray-700">
            <span className="font-medium">{currentPage}</span>
            <span className="mx-2">/</span>
            <span>{totalPages}</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={goToLastPage}
              disabled={currentPage === totalPages}
              className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* 파일 정보 */}
        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-600">
          <span className="font-medium">파일명:</span> {file.name}
          <span className="mx-2">|</span>
          <span className="font-medium">크기:</span> {(file.size / 1024 / 1024).toFixed(2)}MB
        </div>
      </div>
    </div>
  );
};

export default PDFPreview;
