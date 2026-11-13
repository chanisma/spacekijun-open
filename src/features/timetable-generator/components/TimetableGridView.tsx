import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DAY_LABELS } from '../constants';
import type { GridConfig, Lesson, Placement } from '../types';

interface CellLesson {
  lessonId: string;
  subject: string;
  teacher: string | null;
  /** 이 수업이 속한 반 "학년-반" 목록 (교사 뷰에서 어느 반 수업인지 표시) */
  classes: string;
  students: number;
  isElective: boolean;
}
interface CellEntry {
  lessons: CellLesson[];
}

interface Props {
  lessons: Lesson[];
  placements: Placement[];
  grid: GridConfig;
  /** 반 뷰: "학년-반". 학생 뷰에서도 그 반 인원 표시 기준 */
  classKey?: string;
  /** 지정 시 그 학생(resource id) 개인 시간표 (한 칸 2수업↑ = 충돌) */
  studentId?: string;
  /** 지정 시 그 교사(resource id) 시간표 (한 칸 2수업↑ = 교사 충돌) */
  teacherId?: string;
  /** 편집 모드(학생 뷰): 과목을 빈 칸(공강·교사불가 제외)으로 드래그해 이동 */
  editable?: boolean;
  /** 이동 콜백(lessonId, day, period). editable일 때만 호출 */
  onMoveLesson?: (lessonId: string, dayIndex: number, period: number) => void;
}

function classLabelOf(ck: string): string {
  const [g, c] = ck.split('-');
  return `${g}학년 ${c}반`;
}

/**
 * 반·학생·교사 주간 시간표 격자. 셀 클릭 시 과목·교사/반·인원을 표시하고,
 * 충돌 칸은 빨강으로 강조한다.
 *
 * 충돌 정의(중요):
 * - 반 뷰: 같은 교시에 같은 과목이 "다른 교사"로 나뉘는 건 분반이라 정상이다.
 *   같은 "교사"가 한 칸에 두 번 나오면 그 교사가 동시에 두 수업을 맡는 것이므로 충돌.
 * - 학생 뷰: 한 칸에 2개 이상이면 그 학생이 두 수업을 동시에 들어야 하므로 충돌.
 * - 교사 뷰: 한 칸에 2개 이상이면 그 교사가 두 수업에 동시 배정되므로 충돌.
 */
export function TimetableGridView({ lessons, placements, grid, classKey, studentId, teacherId, editable, onMoveLesson }: Props) {
  const mode: 'teacher' | 'student' | 'class' =
    teacherId != null ? 'teacher' : studentId != null ? 'student' : 'class';

  const byLesson = useMemo(() => new Map(lessons.map((l) => [l.id, l])), [lessons]);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragLesson = dragId ? byLesson.get(dragId) ?? null : null;

  const cells = useMemo(() => {
    const map = new Map<string, CellEntry>(); // "day|period" -> entry
    for (const p of placements) {
      const l = byLesson.get(p.lessonId);
      if (!l) continue;
      const inView =
        mode === 'teacher'
          ? l.teacherId === teacherId
          : mode === 'student'
            ? l.studentCodes.includes(studentId!)
            : l.classKeys.includes(classKey!);
      if (!inView) continue;
      const key = `${p.dayIndex}|${p.period}`;
      const entry = map.get(key) ?? { lessons: [] };
      // 반 뷰는 현재 보는 반의 인원, 그 외는 강좌 총 수강 인원
      const students =
        mode === 'class' && classKey
          ? l.studentCountByClass?.[classKey] ?? l.studentCount ?? l.studentCodes.length
          : l.studentCount ?? l.studentCodes.length;
      entry.lessons.push({
        lessonId: l.id,
        subject: l.subjectName,
        teacher: l.teacherName,
        classes: l.classKeys.join(', '),
        students,
        isElective: l.isElective,
      });
      map.set(key, entry);
    }
    // 인원 많은 순 정렬 — 대표로 보일 과목 안정화
    for (const e of map.values()) e.lessons.sort((a, b) => b.students - a.students);
    return map;
  }, [byLesson, placements, classKey, studentId, teacherId, mode]);

  // 드롭 유효성: 편집 모드 + 드래그 중 + 대상 칸이 비어있고(현재 뷰 기준) 드래그 lesson의 차단칸이 아님
  const canDrop = (d: number, p: number): boolean =>
    !!editable && !!dragLesson && !cells.has(`${d}|${p}`) && !dragLesson.blockedCells.includes(`${d}|${p}`);

  // 충돌 판정: 반 뷰=같은 교사 중복, 학생/교사 뷰=한 칸 2수업↑
  const isConflict = (entry: CellEntry): boolean => {
    if (mode === 'class') {
      const seen = new Set<string>();
      for (const ls of entry.lessons) {
        if (ls.teacher == null) continue;
        if (seen.has(ls.teacher)) return true;
        seen.add(ls.teacher);
      }
      return false;
    }
    return entry.lessons.length > 1;
  };

  const headerLabel = mode === 'teacher' ? '교사 시간표' : classKey ? classLabelOf(classKey) : '';
  const days = Array.from({ length: grid.days }, (_, i) => i);
  const periods = Array.from({ length: grid.periodsPerDay }, (_, i) => i + 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border bg-muted px-2 py-1 text-muted-foreground">교시</th>
            {days.map((d) => (
              <th key={d} className="border bg-muted px-2 py-1 font-medium">
                {DAY_LABELS[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p}>
              <td className="border bg-muted/50 px-2 py-1 text-center text-muted-foreground">{p}</td>
              {days.map((d) => {
                const entry = cells.get(`${d}|${p}`);
                if (!entry) {
                  const droppable = canDrop(d, p);
                  return (
                    <td
                      key={d}
                      className={`border px-1 py-1 text-center align-middle h-12 ${droppable ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-400' : ''}`}
                      onDragOver={editable ? (e) => { if (droppable) e.preventDefault(); } : undefined}
                      onDrop={editable ? (e) => {
                        e.preventDefault();
                        if (droppable && dragId) onMoveLesson?.(dragId, d, p);
                        setDragId(null);
                      } : undefined}
                    >
                      <span className={droppable ? 'text-emerald-600' : 'text-muted-foreground/40'}>{droppable ? '＋' : '·'}</span>
                    </td>
                  );
                }
                const head = entry.lessons[0];
                const extra = entry.lessons.length - 1;
                const conflict = isConflict(entry);
                return (
                  <td key={d} className="border p-0 align-middle h-12">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={`w-full h-12 px-1 leading-tight focus:outline-none ${conflict ? 'bg-red-100 ring-1 ring-inset ring-red-400' : 'hover:bg-muted/60 focus:bg-muted/60'}`}
                        >
                          {conflict ? (
                            entry.lessons.map((ls, i) => (
                              <div
                                key={i}
                                draggable={editable}
                                onDragStart={editable ? (e) => { e.stopPropagation(); setDragId(ls.lessonId); e.dataTransfer.effectAllowed = 'move'; } : undefined}
                                onDragEnd={editable ? () => setDragId(null) : undefined}
                                className={`font-medium text-red-700 truncate ${editable ? 'cursor-grab active:cursor-grabbing' : ''}`}
                              >
                                {ls.subject}
                                <span className="text-[10px] font-normal">
                                  {' · '}
                                  {mode === 'teacher' ? ls.classes : ls.teacher ?? '-'}
                                </span>
                              </div>
                            ))
                          ) : (
                            <>
                              <div
                                draggable={editable}
                                onDragStart={editable ? (e) => { e.stopPropagation(); setDragId(head.lessonId); e.dataTransfer.effectAllowed = 'move'; } : undefined}
                                onDragEnd={editable ? () => setDragId(null) : undefined}
                                className={`font-medium truncate ${editable ? 'cursor-grab active:cursor-grabbing' : ''}`}
                              >{head.subject}</div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {mode === 'teacher' ? head.classes : head.teacher ?? ''}
                              </div>
                              {extra > 0 && <div className="text-[10px] text-blue-600">+{extra} 선택</div>}
                            </>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-64 p-2 text-xs">
                        <div className="font-medium mb-1.5 flex items-center justify-between">
                          <span>{DAY_LABELS[d]} {p}교시 · {headerLabel}</span>
                          {conflict ? (
                            <span className="text-red-600">⚠ 충돌 {entry.lessons.length}개</span>
                          ) : entry.lessons.length > 1 ? (
                            <span className="text-blue-600">선택 {entry.lessons.length}개</span>
                          ) : null}
                        </div>
                        <ul className="space-y-0.5">
                          {entry.lessons.map((ls, i) => (
                            <li key={i} className="flex items-center justify-between gap-2 border-b last:border-0 py-1">
                              <span className="font-medium">
                                {ls.subject}
                                {ls.isElective && <span className="ml-1 text-[10px] text-blue-600">선택</span>}
                              </span>
                              <span className="text-muted-foreground whitespace-nowrap">
                                {mode === 'teacher' ? ls.classes : ls.teacher ?? '-'} · {ls.students}명
                              </span>
                            </li>
                          ))}
                        </ul>
                        {conflict ? (
                          <p className="mt-1.5 text-[10px] text-red-600">
                            {mode === 'teacher'
                              ? '⚠ 한 교사가 같은 교시에 두 수업에 배정되었습니다 (교사 충돌). 완전히 풀지 못한 최선안입니다.'
                              : mode === 'student'
                                ? '⚠ 한 학생이 같은 교시에 두 수업을 듣게 됩니다 (학생 충돌). 완전히 풀지 못한 최선안입니다.'
                                : '⚠ 같은 교사가 같은 교시 두 수업에 배정되었습니다 (교사 충돌). 완전히 풀지 못한 최선안입니다.'}
                          </p>
                        ) : entry.lessons.length > 1 ? (
                          <p className="mt-1.5 text-[10px] text-muted-foreground">
                            이 교시에 반 학생들이 위 과목으로 나뉘어 수업합니다 (선택/분반).
                          </p>
                        ) : null}
                      </PopoverContent>
                    </Popover>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
