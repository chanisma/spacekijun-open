import JSZip from 'jszip';
import { fillClubSection0, type ClubFillInput } from './clubFormFill';
import { mergeSectionsOnePage } from './hwpxManifest';
import { reorderAndExport, triggerDownload } from './generateVolunteerHwpx';
import {
  isClubFormData,
  type ClubEntry, type ClubVolunteerFormData, type DocumentIssue,
} from '../types';
import templateUrl from './club-template.hwpx?url';

/** ISO 'YYYY-MM-DD' → 'M.D' (명단 날짜 열·활동 라벨). 빈/잘못 → '' */
function toMD(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}.${d.getDate()}`;
}
/** ISO → 'YYYY년 M월 D일'. 빈/잘못 → '' */
function toKorean(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * 다운로드 미리보기에서 정한 출석/제외 설정.
 *  - attendance: resource_id → 활동 날짜(ISO)별 참가 여부. 없으면 전원·전일 참가(√).
 *  - excludedResourceIds: 확인서에서 제외할 학생 resource_id.
 */
export interface ClubExportOptions {
  attendance?: Record<string, Record<string, boolean>>;
  excludedResourceIds?: string[];
}

/** 동아리 1개(ClubEntry) + 발급 공통(form_data) → clubFormFill 입력. */
function toClubFillInput(
  issue: DocumentIssue, fd: ClubVolunteerFormData, club: ClubEntry, opts?: ClubExportOptions,
): ClubFillInput {
  if (!club.activities.length) throw new Error(`'${club.club_name}' 동아리의 활동이 없습니다`);
  if (!club.students.length) throw new Error(`'${club.club_name}' 동아리의 학생 명단이 없습니다`);

  const acts = [...club.activities].sort((a, b) => a.date.localeCompare(b.date));
  const isoDates = acts.map(a => a.date).filter(Boolean);
  const periodStart = toKorean(isoDates[0] ?? issue.issued_on);
  const periodEnd = toKorean(isoDates[isoDates.length - 1] ?? issue.issued_on);

  // opts(미리보기 즉시 선택) 우선, 없으면 동아리에 저장된 출력 설정으로 폴백
  const excludedIds = opts?.excludedResourceIds ?? club.excludedResourceIds ?? [];
  const attendanceMap = opts?.attendance ?? club.attendance;
  const excluded = new Set(excludedIds);
  const students = club.students.filter(s => !excluded.has(s.resource_id));
  if (!students.length) throw new Error(`'${club.club_name}' 동아리: 제외 후 남은 학생이 없습니다`);

  return {
    issueNo: issue.issue_no,
    clubName: club.club_name,
    teacherName: club.teacher_name,
    scope: fd.scope,
    area: fd.area,
    org: fd.org, orgTel: fd.org_tel, place: fd.place,
    periodStart, periodEnd,
    confirmDate: toKorean(issue.issued_on),
    activities: acts.map(a => ({
      dateLabel: toMD(a.date), hours: a.hours, content: a.content,
    })),
    students: students.map(s => {
      const att = attendanceMap?.[s.resource_id];
      return {
        grade: s.grade ?? 0, classNum: s.class ?? 0, number: s.number ?? 0, name: s.name,
        // 활동 날짜별 참가 여부 (미설정 = 참가). att가 아예 없으면 attend 생략 → 전부 √
        attend: att ? acts.map(a => att[a.date] ?? true) : undefined,
      };
    }),
  };
}

/** 발급에 포함된 동아리 중 확인서 생성 가능한 것 (활동 입력됨 + 명단 있음). */
export function clubsReadyForExport(issue: DocumentIssue): ClubEntry[] {
  const fd = issue.form_data;
  if (!isClubFormData(fd)) return [];
  return fd.clubs.filter(c => c.activities.length > 0 && c.students.length > 0);
}

/**
 * 동아리 확인서 생성. clubId 지정 시 그 동아리 1장, 없으면 활동이 입력된
 * 모든 동아리를 페이지 분리해 한 파일로 묶는다(단체 통합출력과 동일 방식).
 */
export async function generateClubHwpx(
  issue: DocumentIssue, clubId?: string, opts?: ClubExportOptions,
): Promise<Blob> {
  const fd = issue.form_data;
  if (!isClubFormData(fd)) throw new Error('동아리 양식 데이터(form_data.kind=club)가 아닙니다');

  const targets = clubId
    ? fd.clubs.filter(c => c.club_id === clubId)
    : fd.clubs.filter(c => c.activities.length > 0 && c.students.length > 0);
  if (!targets.length) throw new Error('확인서를 만들 동아리(활동 입력됨)가 없습니다');

  const res = await fetch(templateUrl);
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const templateXml = await zip.file('Contents/section0.xml')!.async('string');

  // 출석/제외 옵션은 단일 동아리 미리보기에서만 의미 있으므로 그 동아리에만 적용
  const filled = targets.map(club =>
    fillClubSection0(templateXml, toClubFillInput(issue, fd, club, clubId ? opts : undefined)));
  // 1개면 그대로, 여러 개면 동아리별 페이지 분리해 단일 섹션으로 병합
  zip.file('Contents/section0.xml', mergeSectionsOnePage(filled));

  return reorderAndExport(zip);
}

export async function downloadClubHwpx(
  issue: DocumentIssue, clubId?: string, opts?: ClubExportOptions,
): Promise<void> {
  const blob = await generateClubHwpx(issue, clubId, opts);
  const fd = issue.form_data as ClubVolunteerFormData;
  const club = clubId ? fd.clubs.find(c => c.club_id === clubId) : undefined;
  const tag = club ? club.club_name : `전체${fd.clubs.length}개동아리`;
  triggerDownload(blob, `동아리봉사활동확인서_${issue.issue_no}_${tag}.hwpx`);
}
