import JSZip from 'jszip';
import { fillVolunteerSection0, type FillInput } from './volunteerFormFill';
import { mergeSectionsOnePage } from './hwpxManifest';
import { isClubFormData, type DocumentIssue } from '../types';
import templateUrl from './volunteer-template.hwpx?url';

const SCHOOL = '샘플고등학교';

function toDot(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';   // 빈/잘못된 날짜 → 공백 (NaN.NaN.NaN 방지)
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
function toKorean(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 반별 출력 필터 — 지정 시 해당 (학년,반) 학생만 확인서에 담는다. */
export interface ClassFilter { grade: number; cls: number; }

/** 출력 옵션 — 확인자(담임) 성명 등 호출부에서 정하는 값. */
export interface VolunteerExportOptions { confirmerName?: string; }

export async function generateVolunteerHwpx(
  issue: DocumentIssue, filter?: ClassFilter, opts?: VolunteerExportOptions,
): Promise<Blob> {
  if (!issue.form_data || isClubFormData(issue.form_data))
    throw new Error('form_data 없음 (반봉사 아님)');

  // 반별 출력이면 그 반 학생만, 아니면 전체
  const roster = filter
    ? issue.students.filter(s => s.grade === filter.grade && s.class === filter.cls)
    : issue.students;
  if (!roster.length) throw new Error('참여자 명단 없음');

  const res = await fetch(templateUrl);
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('Contents/section0.xml')!.async('string');

  const fd = issue.form_data;
  // 인정시간: 발급 전체 공통값(form_data.hours) 우선, 없으면 학생 개별값, 그것도 없으면 1
  const participants = roster.map(s => ({
    grade: s.grade ?? issue.grade ?? 0,
    classNum: s.class ?? issue.class_number ?? 0,
    number: s.number ?? 0,
    name: s.name,
    hours: fd.hours ?? s.hours ?? 1,
  }));

  const fillInput: FillInput = {
    school: SCHOOL,
    issueNo: issue.issue_no,
    grade: filter?.grade ?? issue.grade ?? participants[0]?.grade ?? 0,
    classNumber: filter?.cls ?? issue.class_number ?? participants[0]?.classNum ?? 0,
    repName: roster[0]?.name ?? '',
    totalCount: roster.length,
    // 봉사 시작일: form_data.period_start가 비면 record의 봉사일자(issued_on)로 폴백.
    // (import/backfill 기록은 form_data 날짜가 비어 있고 issued_on에만 날짜가 있음)
    periodStart: toDot(fd.period_start || issue.issued_on),
    // 종료일 미입력 시 시작일과 동일하게(단일 일자) — 양식 기간 칸 빈/NaN 방지
    periodEnd: toDot(fd.period_end || fd.period_start || issue.issued_on),
    org: fd.org, orgTel: fd.org_tel,
    // 활동 내용: form_data.content가 비면 record의 봉사활동내용(title)으로 폴백
    area: fd.area, place: fd.place, content: fd.content || issue.title,
    confirmDate: toKorean(issue.issued_on),
    confirmerName: opts?.confirmerName,
    participants,
  };

  const filled = fillVolunteerSection0(xml, fillInput);
  zip.file('Contents/section0.xml', filled);

  return reorderAndExport(zip);
}

/**
 * JSZip은 generateAsync 시 모든 항목을 DEFLATE로 재압축하고 삽입 순서로 정렬한다.
 * hwpx(OOXML/ODF 계열)는 'mimetype'이 맨 앞 + 무압축(STORE)이어야 유효하므로
 * mimetype을 STORE로 명시 재기록해 다시 묶는다.
 */
export async function reorderAndExport(zip: JSZip): Promise<Blob> {
  const mimeContent = await zip.file('mimetype')!.async('uint8array');
  const ordered = new JSZip();
  ordered.file('mimetype', mimeContent, { compression: 'STORE' });
  const names = Object.keys(zip.files).filter(n => n !== 'mimetype');
  for (const name of names) {
    const entry = zip.files[name];
    if (entry.dir) { ordered.folder(name.replace(/\/$/, '')); continue; }
    ordered.file(name, await entry.async('uint8array'));
  }
  return ordered.generateAsync({ type: 'blob', mimeType: 'application/hwp+zip' });
}

/** 반별 확인자(담임) 성명 — (학년,반) → 이름. 통합 출력 시 페이지별로 적용. */
export type ClassConfirmer = (grade: number, cls: number) => string | undefined;

/**
 * 통합 출력 — 한 record의 여러 반을 각각 별도 페이지(섹션)로 담은 단일 .hwpx.
 * 각 반마다 그 반 학생·담임으로 채운 완전한 확인서 섹션을 만들고,
 * HWPX 다중 섹션(section0..N) + content.hpf manifest로 묶어 반별로 페이지 분리.
 */
export async function generateVolunteerHwpxMultiClass(
  issue: DocumentIssue,
  classes: { grade: number; cls: number; students: typeof issue.students }[],
  confirmerOf?: ClassConfirmer,
): Promise<Blob> {
  if (!issue.form_data || isClubFormData(issue.form_data))
    throw new Error('form_data 없음 (반봉사 아님)');
  if (classes.length === 0) throw new Error('출력할 반이 없음');

  const res = await fetch(templateUrl);
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const templateXml = await zip.file('Contents/section0.xml')!.async('string');
  const fd = issue.form_data;

  // 반별로 완전히 채운 section XML 생성
  const filledPerClass = classes.map(cg => {
    const fillInput: FillInput = {
      school: SCHOOL,
      issueNo: issue.issue_no,
      grade: cg.grade,
      classNumber: cg.cls,
      repName: cg.students[0]?.name ?? '',
      totalCount: cg.students.length,
      periodStart: toDot(fd.period_start || issue.issued_on),
      periodEnd: toDot(fd.period_end || fd.period_start || issue.issued_on),
      org: fd.org, orgTel: fd.org_tel,
      area: fd.area, place: fd.place, content: fd.content || issue.title,
      confirmDate: toKorean(issue.issued_on),
      confirmerName: confirmerOf?.(cg.grade, cg.cls),
      participants: cg.students.map(s => ({
        grade: s.grade ?? cg.grade,
        classNum: s.class ?? cg.cls,
        number: s.number ?? 0,
        name: s.name,
        hours: fd.hours ?? s.hours ?? 1,
      })),
    };
    return fillVolunteerSection0(templateXml, fillInput);
  });

  // 단일 section0에 반별 폼을 페이지나누기로 이어붙인다.
  // (HWPX는 sectionN.xml을 자동 연결 렌더하지 않으므로 한 섹션 안에서 합친다)
  zip.file('Contents/section0.xml', mergeSectionsOnePage(filledPerClass));

  return reorderAndExport(zip);
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadVolunteerHwpx(
  issue: DocumentIssue, filter?: ClassFilter, opts?: VolunteerExportOptions,
): Promise<void> {
  const blob = await generateVolunteerHwpx(issue, filter, opts);
  // 반별 출력이면 그 반, 아니면 record 대표 학년·반으로 파일명 구성
  const g = filter?.grade ?? issue.grade ?? '';
  const c = filter?.cls ?? issue.class_number ?? '';
  triggerDownload(blob, `봉사활동확인서_${issue.issue_no}_${g}학년${c}반.hwpx`);
}

/** 통합 다운로드 — 여러 반을 페이지별로 분리한 단일 .hwpx 내려받기. */
export async function downloadVolunteerHwpxMultiClass(
  issue: DocumentIssue,
  classes: { grade: number; cls: number; students: typeof issue.students }[],
  confirmerOf?: ClassConfirmer,
): Promise<void> {
  const blob = await generateVolunteerHwpxMultiClass(issue, classes, confirmerOf);
  triggerDownload(blob, `봉사활동확인서_${issue.issue_no}_전체${classes.length}반.hwpx`);
}
