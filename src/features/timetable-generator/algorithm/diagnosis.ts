// 구조적 불가능 진단 — "0위반 시간표가 수학적으로 불가능한가?"를 교사 단위로 판정한다.
//
// 두 계층:
//  1) 폐형(closed-form) 하한 — 즉시 계산되는 필요조건 위반 (주간 용량, 7교시 최소 수요,
//     같은 과목 무인접 배치 상한). 위반이면 그 자체로 증명.
//  2) 교사 단독 exact 체크 — 그 교사의 lesson만 변수로 두고 (다른 교사·학생 제약 없이)
//     교사 부하 4종 + 차단칸 + 하루한도만으로 소형 MILP를 푼다. infeasible이면 "어떤
//     전체 배치에서도 이 교사는 0위반이 불가능"의 완화-증명이 된다 (단독 문제는 전체
//     문제의 완화이므로 단독 infeasible ⇒ 전체 infeasible — 방향이 안전하다).
//
// 인증서는 솔브를 막지 않는다 — 솔버는 최소 위반 해를 계속 찾고, UI가 원인(교사·과목·
// 제약)을 명시해 사용자가 시수·분반·제약 상한을 조정하도록 안내한다.

import type { InfeasibilityCertificate, Lesson, TimetableInput } from '../types';
import { type CellKey, cellKeyStr, enumerateCells } from './csp';
import { buildConflictGraph } from './conflictGraph';
import { getHighsInstance } from './cpSatSolver';
import { type MilpOut, solveMilp } from './bruteforceRepair';
import { type TeacherHardConfig, teacherHardConfig } from './teacherConstraints';

interface TeacherGroup {
  teacherId: string;
  teacherName: string | null;
  lessons: Lesson[];
}

function groupByTeacher(input: TimetableInput): TeacherGroup[] {
  const map = new Map<string, TeacherGroup>();
  for (const l of input.lessons) {
    if (!l.teacherId) continue;
    const g = map.get(l.teacherId) ?? { teacherId: l.teacherId, teacherName: l.teacherName, lessons: [] };
    g.lessons.push(l);
    if (!g.teacherName && l.teacherName) g.teacherName = l.teacherName;
    map.set(l.teacherId, g);
  }
  return [...map.values()];
}

/** 교사 전 수업이 공통으로 막힌 칸 집합 (보수적 불가시간 = 교집합) */
function commonBlocked(lessons: Lesson[]): Set<string> {
  let acc = new Set(lessons[0]?.blockedCells ?? []);
  for (let i = 1; i < lessons.length && acc.size > 0; i++) {
    const b = new Set(lessons[i].blockedCells);
    const next = new Set<string>();
    for (const k of acc) if (b.has(k)) next.add(k);
    acc = next;
  }
  return acc;
}

/** 폐형 하한 검사 — 위반 시 인증서 (증명 수준의 필요조건만 사용) */
function closedFormChecks(
  input: TimetableInput,
  cfg: TeacherHardConfig,
  g: TeacherGroup,
): InfeasibilityCertificate[] {
  const out: InfeasibilityCertificate[] = [];
  const name = g.teacherName ?? g.teacherId.slice(0, 8);
  const P = input.grid.periodsPerDay;
  const days = input.grid.days;
  const L = g.lessons.length;
  const blocked = commonBlocked(g.lessons);
  const cells = enumerateCells(input.grid);
  const availCells = cells.filter((c) => !blocked.has(cellKeyStr(c)));

  // (0) 절대 용량: 주간 수업 수 > 가용 칸 (교사 동시수업 금지 하에)
  if (input.options.hard.teacherConflict && L > availCells.length) {
    out.push({
      teacherId: g.teacherId, teacherName: g.teacherName, kind: 'closed-form',
      reason: `'${name}' 주당 ${L}교시 > 배치 가능 ${availCells.length}칸 — 어떤 배치로도 동시수업 없이 소화할 수 없습니다.`,
    });
  }

  // (1) 하루 상한: 주간 수업 수 > cap × 일수
  if (cfg.daily && L > cfg.cap * days) {
    out.push({
      teacherId: g.teacherId, teacherName: g.teacherName, kind: 'closed-form',
      reason: `'${name}' 주당 ${L}교시 > 하루 ${cfg.cap}개 × ${days}일 = ${cfg.cap * days} — 하루 상한을 어길 수밖에 없습니다.`,
    });
  }

  // (2) 7교시 상한: 마지막 교시를 최소 몇 번 써야 하는가 = L − (마지막 교시 아닌 가용 칸)
  if (cfg.last) {
    const availNonLast = availCells.filter((c) => c.period !== cfg.lastPeriod).length;
    const minLastNeeded = L - availNonLast;
    if (minLastNeeded > cfg.lastCap) {
      out.push({
        teacherId: g.teacherId, teacherName: g.teacherName, kind: 'closed-form',
        reason: `'${name}' 주당 ${L}교시는 ${cfg.lastPeriod}교시를 최소 ${minLastNeeded}회 써야 하나 상한이 주 ${cfg.lastCap}회입니다.`,
      });
    }
  }

  // (3) 같은 분반 무인접 상한: 하루에 같은 분반을 인접 없이 놓을 수 있는 최대 = ceil(P/2),
  //     하루 상한(cap)과의 min. 주간 = days × min(...). 분반 시수가 이를 넘으면 불가능.
  if (cfg.subjAdj) {
    const byOff = new Map<string, { n: number; subject: string }>();
    for (const l of g.lessons) {
      const cur = byOff.get(l.offeringId);
      if (cur) cur.n++;
      else byOff.set(l.offeringId, { n: 1, subject: l.subjectName });
    }
    const perDay = Math.min(Math.ceil(P / 2), cfg.daily ? cfg.cap : Number.POSITIVE_INFINITY);
    for (const [, { n, subject }] of byOff) {
      if (n > perDay * days) {
        out.push({
          teacherId: g.teacherId, teacherName: g.teacherName, kind: 'closed-form',
          reason: `'${name}'의 '${subject}' 분반 ${n}교시는 연속 금지 하에 주 최대 ${perDay * days}교시(하루 ${perDay}개 × ${days}일)까지만 배치할 수 있습니다.`,
        });
      }
    }
  }

  return out;
}

/**
 * 교사 단독 exact 체크: 그 교사의 lesson만 변수로 두고 부하 4종을 하드로 강제한 소형
 * MILP. 'Infeasible' 증명 시 인증서. (다른 제약을 뺀 완화 문제라 infeasible ⇒ 전체 불가능.)
 */
function exactSoloCheck(
  input: TimetableInput,
  cfg: TeacherHardConfig,
  g: TeacherGroup,
  timeSec: number,
): InfeasibilityCertificate | null {
  const highs = getHighsInstance();
  if (!highs) return null;
  const name = g.teacherName ?? g.teacherId.slice(0, 8);
  const soloInput: TimetableInput = { ...input, lessons: g.lessons, pinned: [] };
  const graph = buildConflictGraph(g.lessons, { teacher: true, room: false });
  const cells = enumerateCells(input.grid);
  const cellIdx = new Map<string, number>();
  cells.forEach((c, i) => cellIdx.set(cellKeyStr(c), i));
  const domains = new Map<string, CellKey[]>();
  for (const l of g.lessons) {
    const blocked = new Set(l.blockedCells);
    domains.set(l.id, cells.filter((c) => !blocked.has(cellKeyStr(c))));
  }
  // 교사 단독 모델: 클리크 = 그 교사의 전 수업 (동시수업 금지가 전 쌍을 커버)
  const cliques = [g.lessons.map((l) => l.id)];
  const out: MilpOut = {};
  const sub = solveMilp(highs, soloInput, graph, g.lessons, new Map(), domains, cliques, cells, cellIdx, {
    timeSec, symmetry: true, teacher: { cfg, soft: false }, out,
  });
  if (out.status === 'Infeasible') {
    const subjects = [...new Set(g.lessons.map((l) => l.subjectName))].join('·');
    return {
      teacherId: g.teacherId, teacherName: g.teacherName, kind: 'exact',
      reason: `'${name}'(${subjects}, 주 ${g.lessons.length}교시)는 부하 제약(하루 최대 ${cfg.cap}개·${cfg.maxRun + 1}연속 금지·${cfg.lastPeriod}교시 주 ${cfg.lastCap}회·같은 분반 연속 금지)과 불가시간을 동시에 만족하는 배치가 존재하지 않습니다 (exact 증명). 시수·분반을 조정하거나 제약 상한을 완화해 주세요.`,
    };
  }
  void sub;
  return null;
}

/**
 * 교사별 구조적 불가능 진단. HiGHS가 로드돼 있으면 exact 체크까지, 아니면 폐형만.
 * deadlineMs 초과 시 남은 교사의 exact 체크는 건너뛴다 (폐형은 전 교사 수행).
 */
export function diagnoseTeacherFeasibility(
  input: TimetableInput,
  opts?: { deadlineMs?: number; perTeacherSec?: number },
): InfeasibilityCertificate[] {
  const cfg = teacherHardConfig(input);
  if (!cfg.any && !input.options.hard.teacherConflict) return [];
  const deadline = opts?.deadlineMs ?? Date.now() + 60_000;
  const perTeacherSec = opts?.perTeacherSec ?? 3;
  const groups = groupByTeacher(input);
  const out: InfeasibilityCertificate[] = [];
  // 부하 큰 교사부터 (불가능 후보가 먼저 검사되도록)
  groups.sort((a, b) => b.lessons.length - a.lessons.length);
  for (const g of groups) {
    const closed = closedFormChecks(input, cfg, g);
    out.push(...closed);
    // 폐형으로 이미 증명됐으면 exact 생략. 부하 4종이 전부 꺼져 있어도 생략.
    if (closed.length > 0 || !cfg.any) continue;
    if (Date.now() + perTeacherSec * 1000 > deadline) continue;
    const cert = exactSoloCheck(input, cfg, g, perTeacherSec);
    if (cert) out.push(cert);
  }
  return out;
}
