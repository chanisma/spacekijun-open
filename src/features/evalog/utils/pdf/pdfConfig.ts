/**
 * PDF.js 설정
 * Worker 경로 설정 및 초기화
 */

import * as pdfjsLib from 'pdfjs-dist';

// Worker 설정 - 로컬 public 폴더의 워커 사용
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// IndexedDB 비활성화 (런타임 에러 방지)
// @ts-ignore
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.pdfjsLib = pdfjsLib;
}

export { pdfjsLib };
