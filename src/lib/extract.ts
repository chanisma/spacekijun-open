import JSZip from 'jszip';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

// Use bundled ESM worker to avoid CDN and cross-origin issues
GlobalWorkerOptions.workerPort = new PdfWorker();

export async function extractPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  let extractedText = '';
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = (textContent.items as any[])
      .map((item) => item.str)
      .join(' ');
    extractedText += pageText + '\n';
  }
  
  return extractedText;
}

export async function extractHwpx(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const contentEntries = Object.keys(zip.files)
    .filter((path) => 
      path.toLowerCase().includes('/contents/') && 
      path.toLowerCase().endsWith('.xml')
    )
    .sort();
  
  let extractedText = '';
  
  for (const entryPath of contentEntries) {
    const xmlString = await zip.files[entryPath].async('string');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'application/xml');
    
    // Extract text content from all elements
    const textNodes = Array.from(xmlDoc.getElementsByTagName('*'))
      .map((element) => element.textContent?.trim() ?? '')
      .filter(Boolean);
    
    extractedText += textNodes.join(' ') + '\n';
  }
  
  return extractedText;
}