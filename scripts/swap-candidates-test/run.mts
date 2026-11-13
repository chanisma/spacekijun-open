/**
 * 수업 교체 후보 판정 회귀 테스트
 *
 * 실행: npx tsx scripts/swap-candidates-test/run.mts
 *
 * 검증 목적
 *  1) 교체를 막는 것은 **동아리활동뿐**이다 — 내 수업이든 상대 수업이든 (2026-09-15).
 *     자율·자치활동·진로활동은 교체할 수 있다(그 전 규칙은 창체 전체를 막았다).
 *  2) 판정 정본은 `activity_type` 이고, 없을 때만 과목명으로 폴백한다
 *  3) 학년·반 표기가 숫자/문자열로 갈려도 같은 학급으로 본다 (2026-08-14 장애 재발 방지)
 *  4) 시간이 겹치는 후보는 목록에 남되 canSwap=false 로 표시된다
 *  5) 학년-반 표기가 같아도 **수강생이 다르면** 교체할 수 없다 (2026-10-12) — 표기는 선택과목
 *     분반 번호일 수 있다. 명단이 없으면 표기로만 판정하되 unknown 으로 드러낸다.
 */
import {
  findSwappableClasses,
  isSwappableLesson,
  getSwapConflictReason,
  getRosterConflictReasons,
  lessonKey,
  rosterStatusOf,
  type LessonRosterFit,
  type RosterFitIndex,
} from '../../src/utils/timetableSwapUtils';
import type { TimetableEntry } from '../../src/hooks/useTimetableData';

let passed = 0;
const failures: string[] = [];

const check = (name: string, condition: boolean, detail = '') => {
  if (condition) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

let seq = 0;
/** 최소 필드만 채운 시간표 항목 */
const entry = (over: Partial<TimetableEntry> & { weekday: number; period: number }): TimetableEntry =>
  ({
    id: `e${(seq += 1)}`,
    type: 'pattern',
    subject: '공통수학1 2-3',
    grade: 2,
    class_number: '3',
    resource_id: 'teacher-a',
    weekday_time: `${over.weekday}${over.period}`,
    ...over,
  }) as TimetableEntry;

// ────────────────────────────── 1) 동아리 판정 (막는 것은 club 하나뿐)
{
  check(
    'activity_type=club 만 교체 불가',
    !isSwappableLesson(entry({ weekday: 1, period: 1, activity_type: 'club' }))
  );
  // 라이브 4종 + 파서가 만들 수 있는 나머지. 차단 목록이므로 club 외에는 전부 통과해야 한다.
  for (const type of [
    'subject',
    'autonomy',
    'career',
    'volunteer',
    'self_study',
    'other',
  ] as const) {
    check(
      `activity_type=${type} 는 교체 가능`,
      isSwappableLesson(entry({ weekday: 1, period: 1, activity_type: type }))
    );
  }

  // activity_type 이 없으면 과목명 폴백 (섹션명은 "동아리활동 1-6" 처럼 학년-반 접미가 붙는다)
  check(
    'activity_type 없으면 과목명으로 동아리활동 판정',
    !isSwappableLesson(entry({ weekday: 1, period: 1, subject: '동아리활동 1-6' }))
  );
  check(
    '자율·자치활동은 과목명 폴백에서도 교체 가능',
    isSwappableLesson(entry({ weekday: 1, period: 1, subject: '자율·자치활동 2-3' }))
  );
  check(
    '진로활동은 과목명 폴백에서도 교체 가능',
    isSwappableLesson(entry({ weekday: 1, period: 1, subject: '진로활동 3-1' }))
  );
  check(
    '자율활동(3학년 표기)은 과목명 폴백에서도 교체 가능',
    isSwappableLesson(entry({ weekday: 1, period: 1, subject: '자율활동 3-1' }))
  );
  check(
    '일반 과목은 과목명 폴백에서도 교체 가능',
    isSwappableLesson(entry({ weekday: 1, period: 1, subject: '공통수학1 1-3' }))
  );
  check(
    '과목명에 활동이 들어가도 접두가 아니면 교체 가능',
    isSwappableLesson(entry({ weekday: 1, period: 1, subject: '스포츠 문화 2-1' }))
  );

  // 정본 우선: 이름이 동아리처럼 보여도 activity_type=subject 면 교체 가능
  check(
    'activity_type 이 있으면 과목명보다 우선한다',
    isSwappableLesson(
      entry({ weekday: 1, period: 1, subject: '동아리활동 1-6', activity_type: 'subject' })
    )
  );
  // 반대 방향도 정본이 이긴다 — 이름이 멀쩡해도 club 이면 막힌다
  check(
    'activity_type=club 은 과목명이 일반 과목이어도 교체 불가',
    !isSwappableLesson(
      entry({ weekday: 1, period: 1, subject: '창의 공학 설계 2-3', activity_type: 'club' })
    )
  );
}

// ────────────────────────────── 2) 후보 목록에서의 제외
{
  const target = entry({ weekday: 1, period: 1, resource_id: 'me', activity_type: 'subject' });
  const normal = entry({
    weekday: 2,
    period: 3,
    resource_id: 'other',
    subject: '영어 2-3',
    activity_type: 'subject',
  });
  const club = entry({
    weekday: 3,
    period: 4,
    resource_id: 'other2',
    subject: '동아리활동 2-3',
    activity_type: 'club',
  });

  // 자율·진로는 학급 단위로 담임이 맡는 시간이라 교체 후보로 남아야 한다 (2026-09-15)
  const autonomy = entry({
    weekday: 4,
    period: 5,
    resource_id: 'homeroom',
    subject: '자율·자치활동 2-3',
    activity_type: 'autonomy',
  });
  const career = entry({
    weekday: 5,
    period: 6,
    resource_id: 'career-teacher',
    subject: '진로활동 2-3',
    activity_type: 'career',
  });

  const result = findSwappableClasses(target, [target, normal, club, autonomy, career]);
  check('일반 수업은 후보에 남는다', result.some((c) => c.entry.id === normal.id));
  check('동아리 수업은 후보에서 빠진다', !result.some((c) => c.entry.id === club.id));
  check('자율·자치활동은 후보에 남는다', result.some((c) => c.entry.id === autonomy.id));
  check('진로활동은 후보에 남는다', result.some((c) => c.entry.id === career.id));

  // 내 수업이 동아리면 후보 자체가 없다
  const clubTarget = entry({
    weekday: 1,
    period: 1,
    resource_id: 'me',
    subject: '동아리활동 2-3',
    activity_type: 'club',
  });
  check(
    '내 수업이 동아리면 후보 0건',
    findSwappableClasses(clubTarget, [clubTarget, normal]).length === 0
  );

  // 반대로 내 수업이 자율·자치활동이면 같은 학급의 교과 수업이 후보로 잡힌다
  const autonomyTarget = entry({
    weekday: 1,
    period: 1,
    resource_id: 'homeroom',
    subject: '자율·자치활동 2-3',
    activity_type: 'autonomy',
  });
  const autonomyResult = findSwappableClasses(autonomyTarget, [autonomyTarget, normal, club]);
  check(
    '내 수업이 자율·자치활동이면 교과 수업이 후보가 된다',
    autonomyResult.some((c) => c.entry.id === normal.id)
  );
  check(
    '내 수업이 창체여도 동아리는 상대 후보에서 빠진다',
    !autonomyResult.some((c) => c.entry.id === club.id)
  );
}

// ────────────────────────────── 3) 학년·반 표기 정합 (숫자 ↔ 문자열)
{
  const target = entry({ weekday: 1, period: 1, resource_id: 'me', grade: 2, class_number: '3' });
  // RPC 는 정수, section.meta 는 JSON 숫자 — 표기가 갈려도 같은 학급이어야 한다
  const numeric = entry({
    weekday: 2,
    period: 2,
    resource_id: 'other',
    grade: 2,
    class_number: 3 as unknown as string,
  });
  const otherClass = entry({
    weekday: 2,
    period: 4,
    resource_id: 'other',
    grade: 2,
    class_number: '5',
  });

  const result = findSwappableClasses(target, [target, numeric, otherClass]);
  check('숫자/문자열 표기가 달라도 같은 학급으로 본다', result.some((c) => c.entry.id === numeric.id));
  check('다른 반은 후보가 아니다', !result.some((c) => c.entry.id === otherClass.id));
}

// ────────────────────────────── 4) 시간 충돌
{
  const target = entry({ weekday: 1, period: 1, resource_id: 'me' });
  const candidate = entry({ weekday: 2, period: 2, resource_id: 'other', subject: '영어 2-3' });
  // 상대가 내 시간(월1)에 이미 다른 수업이 있다
  const blocker = entry({
    weekday: 1,
    period: 1,
    resource_id: 'other',
    subject: '영어 1-1',
    grade: 1,
    class_number: '1',
  });

  const result = findSwappableClasses(target, [target, candidate, blocker]);
  const row = result.find((c) => c.entry.id === candidate.id);
  check('겹치는 후보도 목록에는 남는다', !!row);
  check('겹치면 canSwap=false', row?.canSwap === false);
  check(
    '충돌 사유가 사람 말로 나온다',
    getSwapConflictReason(target, candidate, [target, candidate, blocker]).length > 0
  );
}

// ────────────────────────────── 5) 수강생 판정 (2026-10-12)
// 학년-반 표기가 같아도 수강생이 다르면 교체할 수 없다 — `미적분Ⅰ 2-7` 은 세 학급 학생이다.
{
  const fit = (over: Partial<LessonRosterFit> = {}): LessonRosterFit => ({
    myCount: 23,
    theirCount: 23,
    sharedCount: 23,
    theirConflictCount: 0,
    theirConflictNames: [],
    myConflictCount: 0,
    myConflictNames: [],
    ...over,
  });

  // 상태 유도
  check('수강생이 똑같으면 same', rosterStatusOf(fit()) === 'same');
  check(
    '겹치는 학생이 있으면 conflict',
    rosterStatusOf(fit({ sharedCount: 9, theirCount: 21, theirConflictCount: 12, myConflictCount: 14 })) ===
      'conflict'
  );
  check(
    '수강생은 다르지만 다른 학생이 그 시간 비어 있으면 compatible',
    rosterStatusOf(fit({ sharedCount: 20, theirCount: 22 })) === 'compatible'
  );
  check('판정 행이 없으면 unknown', rosterStatusOf(undefined) === 'unknown');
  // 한쪽 명단이 비어 있으면(공동 수업에서 학생 행이 한 교사에게만 달린 경우 등) 판정 근거가 없다
  check('상대 명단이 비면 unknown', rosterStatusOf(fit({ theirCount: 0, sharedCount: 0 })) === 'unknown');
  check('내 명단이 비면 unknown', rosterStatusOf(fit({ myCount: 0, sharedCount: 0 })) === 'unknown');

  const target = entry({ weekday: 2, period: 3, resource_id: 'me', subject: '미적분Ⅰ 2-7', grade: 2, class_number: '7' });
  const sameLabelDiffStudents = entry({
    weekday: 5, period: 2, resource_id: 'kor', subject: '언어생활과 한자 2-7', grade: 2, class_number: '7',
  });
  const sameLabelSameStudents = entry({
    weekday: 4, period: 1, resource_id: 'eng', subject: '영어Ⅱ 2-7', grade: 2, class_number: '7',
  });
  const sameLabelNoRoster = entry({
    weekday: 1, period: 5, resource_id: 'pe', subject: '스포츠 문화 2-7', grade: 2, class_number: '7',
  });
  // 표기는 다르지만 수강생이 같은 수업 — 표기만 보던 때는 보이지 않던 후보
  const otherLabelSameStudents = entry({
    weekday: 3, period: 6, resource_id: 'math2', subject: '미적분Ⅰ 2-A', grade: 2, class_number: 'A',
  });
  // 표기도 다르고 학생이 겹치는데 맞바꾸면 겹치는 수업 — 후보에 올리지 않는다(소음)
  const otherLabelConflict = entry({
    weekday: 3, period: 2, resource_id: 'sci', subject: '물리학 2-2', grade: 2, class_number: '2',
  });

  const all = [target, sameLabelDiffStudents, sameLabelSameStudents, sameLabelNoRoster, otherLabelSameStudents, otherLabelConflict];
  const index: RosterFitIndex = new Map([
    [lessonKey('kor', 5, 2), fit({ theirCount: 21, sharedCount: 9, theirConflictCount: 12, theirConflictNames: ['강시우', '한은호', '조예준'], myConflictCount: 14, myConflictNames: ['가', '나', '다'] })],
    [lessonKey('eng', 4, 1), fit()],
    // pe 는 판정 행 없음
    [lessonKey('math2', 3, 6), fit()],
    [lessonKey('sci', 3, 2), fit({ sharedCount: 5, theirConflictCount: 15, myConflictCount: 18 })],
  ]);

  const result = findSwappableClasses(target, all, index);
  const byId = (e: TimetableEntry) => result.find((c) => c.entry.id === e.id);

  const diff = byId(sameLabelDiffStudents);
  check('표기가 같아도 수강생이 다르면 목록에는 남는다', !!diff);
  check('표기가 같아도 수강생이 다르면 canSwap=false', diff?.canSwap === false);
  check('수강생 충돌 수는 양방향 합', diff?.studentConflicts === 26, String(diff?.studentConflicts));
  check('선생님 시간 충돌로 오인하지 않는다', diff?.teacherConflict === false);

  const same = byId(sameLabelSameStudents);
  check('수강생이 같으면 교체 가능', same?.canSwap === true && same.rosterStatus === 'same');
  check('표기로 잡힌 후보는 matchedBy=classroom', same?.matchedBy === 'classroom');

  const unknown = byId(sameLabelNoRoster);
  check('명단이 없으면 표기 판정으로 교체 가능(단 unknown 표시)', unknown?.canSwap === true && unknown.rosterStatus === 'unknown');

  const roster = byId(otherLabelSameStudents);
  check('표기가 달라도 수강생이 같으면 후보가 된다', roster?.canSwap === true && roster.matchedBy === 'roster');
  check('표기가 다르고 겹치는 수업은 후보에 올리지 않는다', !byId(otherLabelConflict));

  check(
    '교체 가능한 후보가 불가 후보보다 앞에 온다',
    result.findIndex((c) => !c.canSwap) > result.findLastIndex((c) => c.canSwap)
  );

  // 판정 묶음을 못 받으면(조회 실패) 종전처럼 표기로만 고른다 — 모두 unknown
  const fallback = findSwappableClasses(target, all, null);
  check('판정 묶음이 없으면 표기 같은 후보는 모두 교체 가능', fallback.every((c) => c.canSwap));
  check('판정 묶음이 없으면 모두 unknown', fallback.every((c) => c.rosterStatus === 'unknown'));
  check('판정 묶음이 없으면 표기 다른 후보는 없다', !fallback.some((c) => c.entry.id === otherLabelSameStudents.id));

  // 사유 문장
  const reasons = getRosterConflictReasons(target, sameLabelDiffStudents, index.get(lessonKey('kor', 5, 2)));
  check('수강생 사유 3줄(요약 + 양방향)', reasons.length === 3, JSON.stringify(reasons));
  check('사유가 같은 학생 수를 말한다', reasons[0]?.includes('같은 학생 9명'), reasons[0]);
  check('상대 학생은 내 시간(화 3교시)에 겹친다', reasons[1]?.includes('화요일 3교시') && reasons[1].includes('강시우, 한은호, 조예준 외 9명'), reasons[1]);
  check('내 학생은 상대 시간(금 2교시)에 겹친다', reasons[2]?.includes('금요일 2교시') && reasons[2].includes('외 11명'), reasons[2]);
  check(
    '충돌이 아니면 수강생 사유 없음',
    getRosterConflictReasons(target, sameLabelSameStudents, fit()).length === 0
  );
  check(
    '같은 학생이 0명이면 "같은 학생 없음"',
    getRosterConflictReasons(target, sameLabelDiffStudents, fit({ sharedCount: 0, theirConflictCount: 21, myConflictCount: 23 }))[0]?.includes('같은 학생 없음')
  );
}

// ────────────────────────────── 결과
console.log(`\n통과 ${passed}건 / 실패 ${failures.length}건`);
if (failures.length > 0) {
  console.error('\n실패 목록:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log('모든 검사를 통과했습니다.');
