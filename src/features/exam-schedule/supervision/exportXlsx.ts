import * as XLSXns from 'xlsx-js-style';
// xlsx-js-style는 CJS — Vite는 네임스페이스에 utils를 펼치지만 Node ESM(tsx)에선
// default 아래로 들어간다. 양쪽 모두에서 동작하도록 interop 처리.
const XLSX = ((XLSXns as unknown as { utils?: unknown }).utils
  ? XLSXns
  : (XLSXns as unknown as { default: typeof XLSXns }).default) as typeof XLSXns;
import type {
  ExamType,
  Grade,
  SupervisionTeacher,
  SupervisorPlan,
  SupervisorPlanRoom,
} from '../types';

/**
 * 감독 배정 결과를 학교 표준 양식("교사별 고사 감독 시간표")으로 내보낸다.
 *
 * 양식 (참조: 28일 감독시간표.xlsx):
 * - 교사가 가로(열), 교시가 세로(블록). 일차마다 시트 1개.
 * - 각 교시 블록 3행: 과 목 / 시험실 / 감(정·부).
 * - 맨 아래 "시수" 행에 교사별 그날 감독 횟수.
 * - 바탕체, 얇은 격자(바깥 thin, 안쪽 hair) 테두리.
 */

const FONT = '바탕체';
const HAIR = { style: 'hair' as const };
const THIN = { style: 'thin' as const };

type CellStyle = NonNullable<XLSX.CellObject['s']>;

function cell(v: string | number, style: CellStyle): XLSX.CellObject {
  return { t: typeof v === 'number' ? 'n' : 's', v, s: style } as XLSX.CellObject;
}

function baseStyle(over: Partial<CellStyle> = {}): CellStyle {
  return {
    font: { name: FONT, sz: 10 },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: { left: HAIR, right: HAIR, top: HAIR, bottom: HAIR },
    ...over,
  } as CellStyle;
}

const colLetter = (i: number): string => XLSX.utils.encode_col(i);

export interface SupervisionExportMeta {
  examType: ExamType;
  /** 시트/제목용 라벨 (예: "1학기 1차 정기시험") */
  title: string;
  schoolName: string;
  /** 일차별 표시 날짜 (정규고사). 없으면 "N일차" */
  dayDates?: Record<number, string>;
  /** 교시별 시각 라벨 (예: {1:"9:05~9:55"}) */
  periodTimes?: Record<number, string>;
}

interface TeacherCol {
  id: string;
  name: string;
}

/** 한 일차의 시트를 워크북에 추가 */
function buildDaySheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  dateLabel: string,
  meta: SupervisionExportMeta,
  teacherCols: TeacherCol[],
  rooms: SupervisorPlanRoom[],
): void {
  // 그 일차의 교시 목록
  const periods = Array.from(new Set(rooms.map((r) => r.period))).sort((a, b) => a - b);
  // teacherId|period -> { subject, room, seat }
  const cellByTP = new Map<string, { subject: string; room: string; seat: number }>();
  const dayCountByTeacher = new Map<string, number>();
  for (const room of rooms) {
    room.teachers.forEach((t, seat) => {
      if (!t) return;
      cellByTP.set(`${t.id}|${room.period}`, {
        subject: room.subjectNames.join(','),
        room: room.label,
        seat,
      });
      dayCountByTeacher.set(t.id, (dayCountByTeacher.get(t.id) ?? 0) + 1);
    });
  }

  const ncols = 2 + teacherCols.length; // A,B + teachers
  const lastColIdx = ncols - 1;
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const set = (r: number, c: number, co: XLSX.CellObject) => {
    ws[XLSX.utils.encode_cell({ r, c })] = co;
  };

  // ── Row 0-1: 제목 (A1:..2 병합) + 우측 범례 ──
  const titleEndCol = Math.max(2, lastColIdx - 12);
  set(0, 0, cell('교사별 고사 감독 시간표', baseStyle({
    font: { name: FONT, sz: 20 }, border: {},
  })));
  merges.push({ s: { r: 0, c: 0 }, e: { r: 1, c: titleEndCol } });
  // 우측 범례 박스 (계/부장/교감) — 라벨만, 값은 수기 기입
  const legend = ['계', '부장', '교감'];
  legend.forEach((lab, i) => {
    const c0 = lastColIdx - (3 - i) * 4 + 1;
    if (c0 <= titleEndCol + 1) return;
    set(0, c0, cell(lab, baseStyle({ border: { left: THIN, right: THIN, top: THIN, bottom: THIN } })));
    merges.push({ s: { r: 0, c: c0 }, e: { r: 0, c: Math.min(c0 + 3, lastColIdx) } });
    set(1, c0, cell('', baseStyle({ border: { left: THIN, right: THIN, top: THIN, bottom: THIN } })));
    merges.push({ s: { r: 1, c: c0 }, e: { r: 1, c: Math.min(c0 + 3, lastColIdx) } });
  });

  // ── Row 2: 날짜(좌) / 학교명(우) ──
  set(2, 0, cell(`${dateLabel} ${meta.title}`, baseStyle({
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
    border: { bottom: THIN },
  })));
  const midCol = Math.floor(lastColIdx * 0.55);
  merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: midCol } });
  set(2, midCol + 1, cell(meta.schoolName, baseStyle({
    alignment: { horizontal: 'right', vertical: 'center', wrapText: true },
    border: { bottom: THIN },
  })));
  merges.push({ s: { r: 2, c: midCol + 1 }, e: { r: 2, c: lastColIdx } });

  // ── Row 3-4: 교사 헤더 (A4:B5="교사", C4..="번호", C5..="이름") ──
  set(3, 0, cell('교사', baseStyle({ border: { left: THIN, right: THIN, top: THIN, bottom: THIN } })));
  merges.push({ s: { r: 3, c: 0 }, e: { r: 4, c: 1 } });
  set(4, 0, cell('', baseStyle()));
  set(4, 1, cell('', baseStyle()));
  teacherCols.forEach((t, i) => {
    const c = 2 + i;
    const isLast = i === teacherCols.length - 1;
    set(3, c, cell(i + 1, baseStyle({
      border: { left: i === 0 ? THIN : HAIR, right: isLast ? THIN : HAIR, top: THIN, bottom: THIN },
    })));
    set(4, c, cell(t.name, baseStyle({
      border: { left: i === 0 ? THIN : HAIR, right: isLast ? THIN : HAIR, bottom: THIN },
    })));
  });

  // 좁은 교사 열(한 글자/줄)에서 세로로 쌓이는 글자 수에 맞춰 행 높이를 정한다.
  // 줄당 약 13.5pt. 행별 최대 글자 수 × 줄높이 (최소값 보장).
  const LINE_PT = 13.5;
  const rowHeights: number[] = [];
  rowHeights[0] = 20.25; // 제목
  rowHeights[1] = 41.25; // 범례 값 칸
  rowHeights[2] = 16.5; // 날짜
  rowHeights[3] = 12; // 교사 번호
  const maxNameLen = Math.max(2, ...teacherCols.map((t) => t.name.length));
  rowHeights[4] = Math.max(40, maxNameLen * LINE_PT); // 교사 이름 (세로)

  // ── 교시 블록 (3행: 과목/시험실/감) ──
  const subLabels = ['과 목', '시험실', '감'];
  let r = 5;
  for (const period of periods) {
    const infos = teacherCols
      .map((t) => cellByTP.get(`${t.id}|${period}`))
      .filter((x): x is NonNullable<typeof x> => !!x);
    const maxSubjLen = Math.max(2, ...infos.map((x) => x.subject.length));
    const maxRoomLen = Math.max(2, ...infos.map((x) => x.room.length));
    rowHeights[r] = Math.max(28, maxSubjLen * LINE_PT); // 과목 (세로)
    rowHeights[r + 1] = Math.max(28, maxRoomLen * LINE_PT); // 시험실 (세로)
    rowHeights[r + 2] = 20.1; // 감 (정/부 한 글자)

    const time = meta.periodTimes?.[period] ?? '';
    set(r, 0, cell(`${period} 교시${time ? `\n\n${time}` : ''}`, baseStyle({
      border: { left: THIN, right: HAIR, top: THIN, bottom: THIN },
    })));
    merges.push({ s: { r, c: 0 }, e: { r: r + 2, c: 0 } });

    for (let sub = 0; sub < 3; sub++) {
      const rr = r + sub;
      set(rr, 1, cell(subLabels[sub], baseStyle({
        border: {
          left: HAIR, right: THIN,
          top: sub === 0 ? THIN : HAIR,
          bottom: sub === 2 ? THIN : HAIR,
        },
      })));
      teacherCols.forEach((t, i) => {
        const c = 2 + i;
        const isLast = i === teacherCols.length - 1;
        const info = cellByTP.get(`${t.id}|${period}`);
        let v = '';
        if (info) {
          if (sub === 0) v = info.subject;
          else if (sub === 1) v = info.room;
          else v = info.seat === 0 ? '정' : '부';
        }
        set(rr, c, cell(v, baseStyle({
          border: {
            left: i === 0 ? THIN : HAIR, right: isLast ? THIN : HAIR,
            top: sub === 0 ? THIN : HAIR,
            bottom: sub === 2 ? THIN : HAIR,
          },
        })));
      });
    }
    r += 3;
  }

  // ── 시수 행 ──
  set(r, 0, cell('시수', baseStyle({ border: { left: THIN, right: THIN, top: THIN, bottom: THIN } })));
  merges.push({ s: { r, c: 0 }, e: { r, c: 1 } });
  set(r, 1, cell('', baseStyle()));
  teacherCols.forEach((t, i) => {
    const c = 2 + i;
    const isLast = i === teacherCols.length - 1;
    const cnt = dayCountByTeacher.get(t.id) ?? 0;
    set(r, c, cell(cnt === 0 ? '' : cnt, baseStyle({
      border: { left: i === 0 ? THIN : HAIR, right: isLast ? THIN : HAIR, top: THIN, bottom: THIN },
    })));
  });
  rowHeights[r] = 16.5; // 시수

  // ── 시트 범위·열너비·행높이 ──
  ws['!ref'] = `A1:${colLetter(lastColIdx)}${r + 1}`;
  ws['!merges'] = merges;
  // xlsx는 wch에 ~0.83의 패딩을 더해 저장하므로, 목표 저장폭에서 역산한다.
  // 교사 열 저장폭 ≈ 3.0 (참조 3.625보다 좁아 한글 한 글자만 한 줄에 들어감).
  ws['!cols'] = [
    { wch: 9.4 }, // 교시(시각) → 저장폭 ≈ 10.25
    { wch: 1.8 }, // 라벨(과목/시험실/감) → 저장폭 ≈ 2.625
    ...teacherCols.map(() => ({ wch: 2.2 })), // → 저장폭 ≈ 3.0
  ];
  ws['!rows'] = rowHeights.map((h) => ({ hpt: h ?? 13.5 }));

  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
}

/**
 * SupervisorPlan을 표준 양식 워크북으로 변환.
 * - 정규고사: 일차별 시트 (rooms의 dayIndex로 분리)
 * - 모의고사: 단일 시트 (1일)
 */
export function buildSupervisionWorkbook(
  plan: SupervisorPlan,
  teachers: SupervisionTeacher[],
  meta: SupervisionExportMeta,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  // 교사 열 = 배정에 등장하는 교사 ∪ 전체 명단, 이름 가나다순
  const inPlan = new Set<string>();
  for (const r of plan.rooms) for (const t of r.teachers) if (t) inPlan.add(t.id);
  const byId = new Map(teachers.map((t) => [t.id, t.name] as const));
  for (const r of plan.rooms)
    for (const t of r.teachers) if (t && !byId.has(t.id)) byId.set(t.id, t.name);
  const teacherCols: TeacherCol[] = [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const days = Array.from(new Set(plan.rooms.map((r) => r.dayIndex))).sort((a, b) => a - b);
  for (const day of days) {
    const dayRooms = plan.rooms.filter((r) => r.dayIndex === day);
    const dateLabel = meta.dayDates?.[day] ?? `${day + 1}일차`;
    const sheetName = days.length > 1 ? `${day + 1}일차` : meta.examType === 'mock' ? '모의고사' : '감독';
    buildDaySheet(wb, sheetName, dateLabel, meta, teacherCols, dayRooms);
  }
  if (days.length === 0) {
    buildDaySheet(wb, '감독', meta.dayDates?.[0] ?? '', meta, teacherCols, []);
  }
  return wb;
}

/** 워크북을 파일로 다운로드 */
export function downloadSupervisionXlsx(
  plan: SupervisorPlan,
  teachers: SupervisionTeacher[],
  meta: SupervisionExportMeta,
  fileName: string,
): void {
  const wb = buildSupervisionWorkbook(plan, teachers, meta);
  XLSX.writeFile(wb, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}
