import type { TimetableInput } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// 교사 부하 하드 제약 4종의 단일 의미론 정의 (모든 솔버 계층이 이 모듈을 공유).
//
//  (1) 하루 최대 수업 수: 교사별 하루 lesson 수 ≤ maxPerTeacherPerDay (기본 4)
//  (2) 3연속 금지: 교사별 하루 연속 수업 run 길이 ≤ maxConsecutivePerTeacher (기본 2)
//  (3) 마지막 교시(7교시) 캡: 교사별 주간 7교시 수업 수 ≤ maxLastPeriodPerTeacher (기본 3)
//  (4) 같은 분반(offering)-같은 교사 연속 금지: 한 교사가 **같은 분반** 수업을
//      같은 날 인접 교시에 연달아 배치 금지.
//      ※ 같은 과목명이라도 **다른 분반**(다른 offering)이면 연속 배치 허용.
//
// 표현: 하루 교시 점유를 비트마스크로 다룬다 — 교시 p(1..P) ↔ 비트 (p-1).
// 모든 위반 카운트는 "한 단위 = 위반 1건"의 매끄러운 그라디언트로 정의해
// (런 길이 L → L−maxRun 건, 초과 인원 n → n건) 국소탐색이 부분 개선을 감지한다.
// ─────────────────────────────────────────────────────────────────────────────

export interface TeacherHardConfig {
  daily: boolean;
  cap: number;
  consec: boolean;
  maxRun: number;
  last: boolean;
  lastPeriod: number; // = grid.periodsPerDay (마지막 교시 번호)
  lastCap: number;
  subjAdj: boolean;
  /** 위 4종 중 하나라도 켜져 있는가 (전부 꺼짐 = 레거시 경로, 부가 비용 0) */
  any: boolean;
}

export function teacherHardConfig(input: TimetableInput): TeacherHardConfig {
  const h = input.options.hard;
  const daily = h.teacherDailyCap ?? false;
  const consec = h.teacherConsecutive ?? false;
  const last = h.teacherLastPeriodCap ?? false;
  const subjAdj = h.teacherSubjectConsecutive ?? false;
  return {
    daily,
    cap: input.options.maxPerTeacherPerDay ?? 4,
    consec,
    maxRun: input.options.maxConsecutivePerTeacher ?? 2,
    last,
    lastPeriod: input.grid.periodsPerDay,
    lastCap: input.options.maxLastPeriodPerTeacher ?? 3,
    subjAdj,
    any: daily || consec || last || subjAdj,
  };
}

export function popcount(x: number): number {
  x -= (x >> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

/**
 * 점유 마스크에서 "연속 run이 maxRun을 넘는 칸 수" 합.
 * = 길이 (maxRun+1)짜리 완전 점유 윈도 개수 (score.ts consecutiveExcess와 동일 정의).
 */
export function runExcessMask(mask: number, maxRun: number): number {
  let m = mask;
  for (let k = 1; k <= maxRun; k++) m &= mask >>> k;
  return popcount(m);
}

/** offering·요일별 점유 마스크 키 */
export function offeringDayMaskKey(offeringId: string, dayIndex: number): string {
  return `${offeringId}|${dayIndex}`;
}

/** 점유 마스크에서 인접 교시 쌍 수 (같은 분반 연속 위반 계수) */
export function adjacentPairsMask(mask: number): number {
  return popcount(mask & (mask >>> 1));
}

/**
 * 교사 lesson 1개를 (day, period)에 둘 때 생기는 **한계(marginal) 위반 수**.
 * others* 인자는 전부 "자기 자신을 제외한" 그 교사의 현 상태여야 한다.
 *  - daily: 초과분이 1 늘면 +1
 *  - consec: 추가로 생기는 (maxRun+1)-윈도 수 (두 run을 잇는 배치는 +2 이상 가능)
 *  - last: 마지막 교시 캡 초과분이 1 늘면 +1
 *  - subjAdj: 새로 생기는 같은 분반(offering) 인접쌍 수 (좌/우 각각 +1)
 */
export function teacherPlaceCost(
  cfg: TeacherHardConfig,
  othersDayCount: number,
  othersDayMask: number,
  othersLastCount: number,
  othersSubjMask: number,
  period: number,
): number {
  let cost = 0;
  const bit = 1 << (period - 1);
  if (cfg.daily && othersDayCount >= cfg.cap) cost += 1;
  if (cfg.consec) {
    cost += runExcessMask(othersDayMask | bit, cfg.maxRun) - runExcessMask(othersDayMask, cfg.maxRun);
  }
  if (cfg.last && period === cfg.lastPeriod && othersLastCount >= cfg.lastCap) cost += 1;
  if (cfg.subjAdj) {
    cost += popcount(othersSubjMask & (((bit << 1) | (bit >>> 1)) >>> 0));
  }
  return cost;
}

/** 정렬된 교시 배열 기준 연속 초과 (마스크 없는 집계 경로용 — score.ts와 동일) */
export function consecutiveExcessPeriods(periods: Iterable<number>, maxRun: number): number {
  let mask = 0;
  for (const p of periods) mask |= 1 << (p - 1);
  return runExcessMask(mask, maxRun);
}

/** 교시 집합의 인접쌍 수 */
export function adjacentPairsPeriods(periods: Iterable<number>): number {
  let mask = 0;
  for (const p of periods) mask |= 1 << (p - 1);
  return adjacentPairsMask(mask);
}

// ─── 배치 전체 재측정 (seed 재검증·moves 검사·테스트 공용) ───

export interface TeacherPlacedLesson {
  lessonId: string;
  teacherId: string;
  subjectName: string;
  offeringId: string;
  dayIndex: number;
  period: number;
}

/**
 * 한 교사의 배치 목록에서 하드 위반 총수 (4종 합).
 * 멀티셋 안전: 같은 (day,period) 중복 배치는 dayCount에 2로 잡히고 마스크 비트는 1개
 * (겹침 자체는 교사충돌 간선이 별도로 셈).
 */
export function teacherViolationsOf(
  cfg: TeacherHardConfig,
  days: number,
  entries: Iterable<{ dayIndex: number; period: number; offeringId: string }>,
): number {
  const dayCount = new Array<number>(days).fill(0);
  const dayMask = new Array<number>(days).fill(0);
  const offMask = new Map<string, number>(); // offeringDayMaskKey -> mask
  let lastCount = 0;
  for (const e of entries) {
    dayCount[e.dayIndex]++;
    dayMask[e.dayIndex] |= 1 << (e.period - 1);
    if (e.period === cfg.lastPeriod) lastCount++;
    if (cfg.subjAdj) {
      const k = offeringDayMaskKey(e.offeringId, e.dayIndex);
      offMask.set(k, (offMask.get(k) ?? 0) | (1 << (e.period - 1)));
    }
  }
  let v = 0;
  for (let d = 0; d < days; d++) {
    if (cfg.daily && dayCount[d] > cfg.cap) v += dayCount[d] - cfg.cap;
    if (cfg.consec) v += runExcessMask(dayMask[d], cfg.maxRun);
  }
  if (cfg.last && lastCount > cfg.lastCap) v += lastCount - cfg.lastCap;
  if (cfg.subjAdj) for (const m of offMask.values()) v += adjacentPairsMask(m);
  return v;
}

/**
 * placements 전체의 교사 하드 위반 총수 + 위반에 참여하는 lessonId 집합.
 * blockAware/cpSat의 "seed 재측정"용 — 참여 lesson은 위반이 발생한 (교사,요일)의
 * 수업 전체(또는 마지막 교시 캡이면 그 교사의 마지막 교시 수업 전체)로 잡는다
 * (거칠어도 무방: seed 채택 게이트는 위반 0 여부만 본다).
 */
export function collectTeacherViolations(
  cfg: TeacherHardConfig,
  days: number,
  placed: Iterable<TeacherPlacedLesson>,
): { violations: number; lessonIds: Set<string> } {
  const byTeacher = new Map<string, TeacherPlacedLesson[]>();
  for (const p of placed) {
    const arr = byTeacher.get(p.teacherId);
    if (arr) arr.push(p);
    else byTeacher.set(p.teacherId, [p]);
  }
  let violations = 0;
  const lessonIds = new Set<string>();
  for (const entries of byTeacher.values()) {
    const dayCount = new Array<number>(days).fill(0);
    const dayMask = new Array<number>(days).fill(0);
    const offMask = new Map<string, number>();
    let lastCount = 0;
    for (const e of entries) {
      dayCount[e.dayIndex]++;
      dayMask[e.dayIndex] |= 1 << (e.period - 1);
      if (e.period === cfg.lastPeriod) lastCount++;
      if (cfg.subjAdj) {
        const k = offeringDayMaskKey(e.offeringId, e.dayIndex);
        offMask.set(k, (offMask.get(k) ?? 0) | (1 << (e.period - 1)));
      }
    }
    const badDays = new Set<number>();
    for (let d = 0; d < days; d++) {
      if (cfg.daily && dayCount[d] > cfg.cap) {
        violations += dayCount[d] - cfg.cap;
        badDays.add(d);
      }
      if (cfg.consec) {
        const ex = runExcessMask(dayMask[d], cfg.maxRun);
        if (ex > 0) {
          violations += ex;
          badDays.add(d);
        }
      }
    }
    if (cfg.last && lastCount > cfg.lastCap) {
      violations += lastCount - cfg.lastCap;
      for (const e of entries) if (e.period === cfg.lastPeriod) lessonIds.add(e.lessonId);
    }
    if (cfg.subjAdj) {
      for (const [k, m] of offMask) {
        const pairs = adjacentPairsMask(m);
        if (pairs > 0) {
          violations += pairs;
          const pipe = k.lastIndexOf('|');
          const offId = k.slice(0, pipe);
          const d = Number(k.slice(pipe + 1));
          for (const e of entries) if (e.offeringId === offId && e.dayIndex === d) lessonIds.add(e.lessonId);
        }
      }
    }
    for (const e of entries) if (badDays.has(e.dayIndex)) lessonIds.add(e.lessonId);
  }
  return { violations, lessonIds };
}
