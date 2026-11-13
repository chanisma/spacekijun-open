// block-structured 솔버 오케스트레이터.
//
// Phase 0(선택군 편성) → 밴드 구성(교사 라운드로빈) → Phase 1(라인 원자블록 배치) → 전개.
// 선택과목은 라인-분반으로 새 Lesson 재생성(메소드1: 학생 유연 재배치), 공통과목은 원본 Lesson 유지.
// 산출물 {lessons, placements}는 기존 파이프라인(미리보기·finalize)과 호환되는 형태.
import type { BlockModel } from '../utils/buildBlockInput';
import { constructLines } from './lineConstruction';
import { placeBlocks, type BandBlock, type CommonBlock } from './blockPlacement';
import type { Grade, Lesson, Placement } from '../types';
import { categorizeSubject, isMajorCategory } from '../constants';

export interface BlockSolveResult {
  lessons: Lesson[];
  placements: Placement[];
  conflicts: { teacher: number; bandOverlap: number; classOverlap: number; studentLine: number };
  uniformGongByGrade: Map<number, boolean>;
  diagnostics: { electiveGroups: number; bands: number; commons: number; totalSections: number };
}

export function solveBlockStructured(model: BlockModel, seed = 20260615): BlockSolveResult {
  const PER = model.grid.periodsPerDay;
  const cellToDP = (c: number) => ({ dayIndex: Math.floor(c / PER), period: (c % PER) + 1 });
  const dpToCell = (dayIndex: number, period: number) => dayIndex * PER + (period - 1);

  // ── Phase 0: 선택군 편성 ──
  const lc = constructLines(model.electiveGroups);

  // (groupKey, line) -> sections
  const sectionsByGroupLine = new Map<string, Map<number, typeof lc.sections>>();
  for (const sec of lc.sections) {
    if (!sectionsByGroupLine.has(sec.groupKey)) sectionsByGroupLine.set(sec.groupKey, new Map());
    const m = sectionsByGroupLine.get(sec.groupKey)!;
    (m.get(sec.line) ?? m.set(sec.line, []).get(sec.line)!).push(sec);
  }

  // ── 밴드 구성 (선택 라인 + 창체) ──
  const bands: BandBlock[] = [];
  // (groupKey|line|subject) -> teacherId (전개 시 재사용)
  const sectionTeacher = new Map<string, string | null>();
  const groupK = new Map(model.electiveGroups.map((g) => [g.key, g.lines]));

  for (const [groupKey, meta] of model.groupMeta) {
    const K = groupK.get(groupKey) ?? 1;
    const teacherIdx = new Map<string, number>(); // subject -> round-robin index
    const lineMap = sectionsByGroupLine.get(groupKey);
    for (let line = 0; line < K; line++) {
      const secs = lineMap?.get(line) ?? [];
      if (secs.length === 0) continue; // 빈 라인 (그 그룹에서 이 라인에 배정된 학생 없음)
      const bandTeachers: string[] = [];
      for (const sec of secs) {
        const cands = meta.subjectTeachers.get(sec.subject) ?? [];
        const idx = teacherIdx.get(sec.subject) ?? 0;
        const t = cands.length > 0 ? cands[idx % cands.length] : null;
        teacherIdx.set(sec.subject, idx + 1);
        sectionTeacher.set(`${groupKey}|${line}|${sec.subject}`, t);
        if (t) bandTeachers.push(t);
      }
      bands.push({ id: `${groupKey}#L${line}`, grade: meta.grade, credits: meta.lineCredits, teachers: bandTeachers });
    }
  }

  // 창체(고정 밴드)
  for (const act of model.activities) {
    bands.push({
      id: act.id,
      grade: act.grade,
      credits: act.credits,
      teachers: act.teachers,
      pinnedCells: act.cells.map((s) => { const [d, p] = s.split('|').map(Number); return dpToCell(d, p); }),
    });
  }

  // ── 공통 블록 ──
  const commons: CommonBlock[] = model.commons.map((c) => ({
    id: c.id, grade: c.grade, classKey: c.classKey, subject: c.subject, credits: c.credits, teacherId: c.teacherId,
  }));

  // ── Phase 1: 라인 원자블록 배치 ──
  const placement = placeBlocks({
    grid: model.grid,
    grades: model.grades,
    blockedByGrade: model.blockedByGrade,
    bands,
    commons,
    seed,
  });

  // ── 전개: 선택(재생성) + 공통(원본) → lessons + placements ──
  const lessons: Lesson[] = [];
  const placements: Placement[] = [];
  const origLessonById = new Map(model.lessons.map((l) => [l.id, l]));

  // 선택 라인-분반 → 새 Lesson
  for (const [groupKey, meta] of model.groupMeta) {
    const K = groupK.get(groupKey) ?? 1;
    const lineMap = sectionsByGroupLine.get(groupKey);
    for (let line = 0; line < K; line++) {
      const secs = lineMap?.get(line) ?? [];
      if (secs.length === 0) continue;
      const bandCells = placement.cells.get(`${groupKey}#L${line}`) ?? [];
      for (const sec of secs) {
        const teacherId = sectionTeacher.get(`${groupKey}|${line}|${sec.subject}`) ?? null;
        const offeringId = `blk:${groupKey}#${sec.subject}#L${line}`;
        const category = categorizeSubject(sec.subject);
        bandCells.forEach((cell, i) => {
          const { dayIndex, period } = cellToDP(cell);
          const id = `${offeringId}#${i + 1}`;
          lessons.push({
            id, offeringId, subjectName: sec.subject, grade: meta.grade,
            classLabel: null, teacherId, teacherName: teacherId,
            roomId: null, studentCodes: sec.studentCodes, studentCount: sec.studentCodes.length,
            category, isMajor: isMajorCategory(category), isElective: true, classKeys: [], blockedCells: [],
          });
          placements.push({ lessonId: id, dayIndex, period });
        });
      }
    }
  }

  // 공통 → 원본 Lesson 재사용, 타일 칸에 배치
  for (const c of model.commons) {
    const cells = placement.cells.get(c.id) ?? [];
    c.lessonIds.forEach((lid, i) => {
      if (i >= cells.length) return;
      const orig = origLessonById.get(lid);
      if (orig) lessons.push(orig);
      const { dayIndex, period } = cellToDP(cells[i]);
      placements.push({ lessonId: lid, dayIndex, period });
    });
  }

  return {
    lessons,
    placements,
    conflicts: {
      teacher: placement.teacherConflicts,
      bandOverlap: placement.bandOverlap,
      classOverlap: placement.classOverlap,
      studentLine: lc.studentConflicts,
    },
    uniformGongByGrade: placement.uniformGongByGrade,
    diagnostics: {
      electiveGroups: model.electiveGroups.length,
      bands: bands.length,
      commons: commons.length,
      totalSections: lc.totalSections,
    },
  };
}
