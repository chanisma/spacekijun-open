import JSZip from 'jszip';
import { fillLessonSection0, type LessonFillInput } from './lessonExchangeFormFill';
import { reorderAndExport, triggerDownload } from '@/features/issue-register/hwpx/generateVolunteerHwpx';
import templateUrl from './lesson-exchange-template.hwpx?url';

/**
 * 결강시 보강 계획서 .hwpx Blob 생성 — 봉사활동 확인서(generateVolunteerHwpx)와 동일한 절차:
 * 템플릿 zip 로드 → section0.xml 채우기 → mimetype STORE-first 재압축.
 */
export async function generateLessonExchangeHwpx(input: LessonFillInput): Promise<Blob> {
  const res = await fetch(templateUrl);
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('Contents/section0.xml')!.async('string');

  const filled = fillLessonSection0(xml, input);
  zip.file('Contents/section0.xml', filled);

  return reorderAndExport(zip);
}

/** 결강시 보강 계획서 .hwpx 내려받기. 파일명에 교사명을 포함한다. */
export async function downloadLessonExchangeHwpx(input: LessonFillInput): Promise<void> {
  const blob = await generateLessonExchangeHwpx(input);
  const who = input.teacherName ? `_${input.teacherName}` : '';
  triggerDownload(blob, `결강시 보강 계획서${who}.hwpx`);
}
