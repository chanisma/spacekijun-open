import JSZip from 'jszip';
import { fillPersonalSection0, type PersonalFillInput } from './personalFormFill';
import { mergeSectionsOnePage } from './hwpxManifest';
import { reorderAndExport, triggerDownload } from './generateVolunteerHwpx';
import { isClubFormData, type DocumentIssue, type PersonalVolunteerFormData } from '../types';
import templateUrl from './personal-template.hwpx?url';

/** ISO 'YYYY-MM-DD' → 'YYYY.M.D'. 빈/잘못된 날짜 → '' (NaN.NaN.NaN 방지) */
function toDot(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
/** ISO → 'YYYY년 M월 D일'. 빈/잘못된 날짜 → '' */
function toKorean(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function toFillInput(issue: DocumentIssue): PersonalFillInput {
  if (!issue.form_data || isClubFormData(issue.form_data)) {
    throw new Error('form_data 없음 (개인봉사 아님)');
  }
  const fd = issue.form_data as PersonalVolunteerFormData;
  const s = issue.students[0];
  if (!s) throw new Error('참여 학생 정보 없음');

  return {
    issueNo: issue.issue_no,
    grade: s.grade ?? issue.grade ?? 0,
    classNumber: s.class ?? issue.class_number ?? 0,
    number: s.number ?? 0,
    studentName: s.name,
    periodStart: toDot(fd.period_start || issue.issued_on),
    periodEnd: toDot(fd.period_end || fd.period_start || issue.issued_on),
    totalHours: fd.hours ?? s.hours ?? 1,
    org: fd.org,
    place: fd.place,
    area: fd.area,
    content: fd.content || issue.title,
    note: fd.note,
    opinion: fd.opinion,
    confirmDate: toKorean(issue.issued_on),
    confirmerTitle: fd.confirmer_title || '교사',
    confirmerName: fd.confirmer_name,
  };
}

/** 개인 봉사활동 확인서 1건 생성 (학생 1명). */
export async function generatePersonalHwpx(issue: DocumentIssue): Promise<Blob> {
  const fillInput = toFillInput(issue);

  const res = await fetch(templateUrl);
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('Contents/section0.xml')!.async('string');

  const filled = fillPersonalSection0(xml, fillInput);
  zip.file('Contents/section0.xml', filled);

  return reorderAndExport(zip);
}

export async function downloadPersonalHwpx(issue: DocumentIssue): Promise<void> {
  const blob = await generatePersonalHwpx(issue);
  const s = issue.students[0];
  triggerDownload(blob, `봉사활동확인서_${issue.issue_no}_${s?.name ?? '학생'}.hwpx`);
}

/**
 * 배치(같은 제출 묶음) 통합 출력 — 여러 학생의 개인 확인서를 각각 별도 페이지(섹션)로
 * 담은 단일 .hwpx. 로스터 표가 없어 학생별로 완전히 채운 정적 섹션을 그대로 이어붙인다
 * (club/class 통합 다운로드와 동일한 mergeSectionsOnePage 재사용).
 */
export async function generatePersonalHwpxBatch(issues: DocumentIssue[]): Promise<Blob> {
  if (issues.length === 0) throw new Error('출력할 발급 건이 없음');

  const res = await fetch(templateUrl);
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const templateXml = await zip.file('Contents/section0.xml')!.async('string');

  const filledPerStudent = issues.map(issue => fillPersonalSection0(templateXml, toFillInput(issue)));
  zip.file('Contents/section0.xml', mergeSectionsOnePage(filledPerStudent));

  return reorderAndExport(zip);
}

export async function downloadPersonalHwpxBatch(batchLabel: string, issues: DocumentIssue[]): Promise<void> {
  const blob = await generatePersonalHwpxBatch(issues);
  triggerDownload(blob, `봉사활동확인서_${batchLabel}_전체${issues.length}명.hwpx`);
}
