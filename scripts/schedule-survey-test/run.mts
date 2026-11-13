// 일정 설문 회귀 — 2026-09-17 신설.
//
// 못 박는 이유:
//  ① 집계(가능 인원·미응답자·후보/제안 구분)가 화면 3곳에서 같은 수를 말해야 한다.
//     화면마다 세면 조용히 갈라지고, 갈라져도 오류는 나지 않는다.
//  ② items 는 JSONB 라 무엇이든 들어온다(구 클라이언트·수작업 SQL). 날짜가 아닌 값이
//     들어오면 집계가 깨지는 게 아니라 **틀린 수를 자신 있게 보여준다**.
//  ③ 아래 정적 검사 3종은 전부 "오류 없이 조용히 틀리는" 자리다 —
//     알림 .select() 금지(42501로 알림 전체 롤백), 딥링크 경로, meta.survey_id 사용.
//
// 실행: npx tsx scripts/schedule-survey-test/run.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aggregateSurvey,
  canManageSurvey,
  canRespondToSurvey,
  daysUntilDue,
  isDateKey,
  isSurveyTarget,
  normalizeItems,
  suggestTitleForDate,
} from '../../src/features/schedule-survey/utils/surveyAggregate';
import type { ScheduleSurveyResponse } from '../../src/features/schedule-survey/types';

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};

const ROOT = join(import.meta.dirname, '..', '..');
const read = (relative: string) => readFileSync(join(ROOT, relative), 'utf8');

/**
 * 주석을 걷어낸 소스.
 *
 * ⚠ 이 파일들의 주석은 "이렇게 하면 안 된다"를 **그 코드를 그대로 적어서** 설명한다
 *   (`.insert(rows).select('id')` 는 42501, `related_meeting_id` 는 FK 위반 …).
 *   원문을 그대로 검사하면 경고 주석 자체가 위반으로 잡혀 늘 빨간불이 된다.
 *   블록 주석과 '온전히 주석인 줄'만 지운다 — URL 의 `//` 는 건드리지 않는다.
 */
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');

const readCode = (relative: string) => stripComments(read(relative));

const response = (
  id: string,
  name: string,
  items: unknown,
  comment: string | null = null
): ScheduleSurveyResponse => ({
  id: `r-${id}`,
  survey_id: 's1',
  respondent_resource_id: id,
  respondent_name: name,
  items: normalizeItems(items),
  comment,
  created_at: '2026-09-17T00:00:00Z',
  updated_at: '2026-09-17T00:00:00Z',
});

// ─────────────────────────────────────────────────────────────
console.log('\n[1] 날짜 키 판정');
check('정상 날짜', isDateKey('2026-09-22'));
check('존재하지 않는 날짜 거부 (2월 30일)', !isDateKey('2026-02-30'));
check('형식 불일치 거부', !isDateKey('2026-9-2'));
check('빈 값·숫자 거부', !isDateKey('') && !isDateKey(20260922 as unknown as string));

// ─────────────────────────────────────────────────────────────
console.log('\n[2] items 정규화 — JSONB 라 무엇이든 들어온다');
check('배열이 아니면 빈 배열', normalizeItems({ date: '2026-09-22' }).length === 0);
check('날짜 아닌 항목은 버린다', normalizeItems([{ date: 'tomorrow', available: true }]).length === 0);
check(
  'available 은 boolean true 일 때만 참 (문자열 "true" 는 거짓)',
  normalizeItems([{ date: '2026-09-22', available: 'true' }])[0].available === false
);
check(
  '같은 날짜가 여러 번이면 마지막이 이긴다',
  normalizeItems([
    { date: '2026-09-22', available: false },
    { date: '2026-09-22', available: true, activity: '협의회' },
  ])[0].activity === '협의회'
);
check(
  '공백만 있는 활동은 저장하지 않는다',
  normalizeItems([{ date: '2026-09-22', available: true, activity: '   ' }])[0].activity === undefined
);
check(
  '날짜 오름차순으로 정렬한다',
  normalizeItems([
    { date: '2026-09-24', available: true },
    { date: '2026-09-22', available: true },
  ]).map((item) => item.date).join(',') === '2026-09-22,2026-09-24'
);

// ─────────────────────────────────────────────────────────────
console.log('\n[3] 집계');
const survey = {
  candidate_dates: ['2026-09-22', '2026-09-24'],
  target_resource_ids: ['a', 'b', 'c'],
};
const responses = [
  response('a', '김교사', [
    { date: '2026-09-22', available: true, activity: '학년 협의회' },
    { date: '2026-09-24', available: false },
  ]),
  response('b', '이교사', [
    { date: '2026-09-22', available: true, activity: '학년 협의회' },
    { date: '2026-09-26', available: true, activity: '동아리 발표' },
  ]),
];

const agg = aggregateSurvey(survey, responses);
check('응답자 수', agg.respondedCount === 2 && agg.targetCount === 3);
check('미응답 대상자를 집어낸다', agg.pendingTargetIds.join(',') === 'c');
check('제안된 날짜도 집계에 들어온다', agg.dates.some((d) => d.date === '2026-09-26'));
check(
  '후보 날짜는 응답이 없어도 남는다 (아무도 안 된다는 것 자체가 결과다)',
  aggregateSurvey(survey, []).dates.length === 2
);
const d22 = agg.dates.find((d) => d.date === '2026-09-22')!;
check('가능 인원 집계', d22.availableCount === 2);
check('가능자 이름', d22.availableNames.join(',') === '김교사,이교사');
const d24 = agg.dates.find((d) => d.date === '2026-09-24')!;
check('불가 인원은 availableCount 에 들어가지 않는다', d24.availableCount === 0);
check('불가자 이름', d24.unavailableNames.join(',') === '김교사');
check('후보/제안 구분', d22.isCandidate === true &&
  agg.dates.find((d) => d.date === '2026-09-26')!.isCandidate === false);

console.log('\n[4] 정렬 — 기본은 가능 인원 많은 순(날짜순이 아니다)');
check(
  '가능 인원 많은 날이 맨 위',
  aggregateSurvey(survey, responses, 'availability').dates[0].date === '2026-09-22'
);
check(
  '날짜순 옵션은 날짜대로',
  aggregateSurvey(survey, responses, 'date').dates.map((d) => d.date).join(',') ===
    '2026-09-22,2026-09-24,2026-09-26'
);
check(
  '동점이면 날짜 오름차순 (정렬이 흔들리지 않는다)',
  aggregateSurvey(
    { candidate_dates: ['2026-09-24', '2026-09-22'], target_resource_ids: ['a'] },
    [],
    'availability'
  ).dates.map((d) => d.date).join(',') === '2026-09-22,2026-09-24'
);

console.log('\n[5] 제목 제안 — 가장 많이 제안된 할 일');
check('최빈 활동을 고른다', suggestTitleForDate(d22) === '학년 협의회');
check(
  '제안이 없으면 빈 문자열',
  suggestTitleForDate(agg.dates.find((d) => d.date === '2026-09-24')!) === ''
);

console.log('\n[6] 권한 판정');
const openSurvey = { status: 'open' as const, target_resource_ids: ['a', 'b'] };
check('대상자는 응답 가능', canRespondToSurvey(openSurvey, 'a'));
check('비대상자는 응답 불가', !canRespondToSurvey(openSurvey, 'z'));
check('resourceId 가 없으면 응답 불가 (fail-closed)', !canRespondToSurvey(openSurvey, null));
check(
  '마감된 설문은 대상자도 응답 불가',
  !canRespondToSurvey({ status: 'closed', target_resource_ids: ['a'] }, 'a')
);
check('대상자 판정', isSurveyTarget({ target_resource_ids: ['a'] }, 'a'));
check('주최자는 관리 가능', canManageSurvey({ created_by: 'u1' }, 'u1', false));
check('admin 은 남의 설문도 관리 가능', canManageSurvey({ created_by: 'u1' }, 'u2', true));
check('남의 설문은 관리 불가', !canManageSurvey({ created_by: 'u1' }, 'u2', false));

console.log('\n[7] 마감일 D-day');
const today = new Date(2026, 8, 17); // 2026-09-17
check('D-5', daysUntilDue('2026-09-22', today) === 5);
check('오늘은 0', daysUntilDue('2026-09-17', today) === 0);
check('지난 날짜는 음수', daysUntilDue('2026-09-15', today) === -2);
check('마감일 없으면 null', daysUntilDue(null, today) === null);

// ─────────────────────────────────────────────────────────────
// 아래는 전부 "오류 없이 조용히 틀리는" 자리라 정적 검사가 유일한 방어선이다.
console.log('\n[8] 정적 검사 — 알림 발송');
const notifySource = readCode('src/features/schedule-survey/services/scheduleSurveyNotify.ts');
check(
  "남에게 보내는 알림 insert 에 .select() 를 붙이지 않는다 (붙이면 42501로 전체 롤백)",
  !/\.insert\([^)]*\)\s*\.\s*select\(/s.test(notifySource) &&
    !/from\('notification_events'\)[\s\S]{0,200}\.select\(/.test(notifySource)
);
check(
  'related_meeting_id 에 설문 id 를 넣지 않는다 (meeting FK 위반)',
  !notifySource.includes('related_meeting_id')
);
check('설문 id 는 meta.survey_id 로 싣는다', notifySource.includes('survey_id: surveyId'));

console.log('\n[9] 정적 검사 — 딥링크 한 벌로 유지');
const linksSource = readCode('src/features/notice-board/utils/noticeLinks.ts');
check("공지 본문 토큰 타입에 'survey' 가 있다", /NoticeLinkType =[^;]*'survey'/.test(linksSource));
check(
  '토큰 정규식이 survey 를 받는다 (타입만 넓히면 파싱이 조용히 실패한다)',
  /const LINK_RE =[^\n]*survey/.test(linksSource)
);
check(
  '설문 토큰은 /schedule?survey= 로 간다',
  /case 'survey':[\s\S]{0,200}\/schedule\?survey=/.test(linksSource)
);

const navSource = readCode('src/components/notifications/notificationNavigation.ts');
check(
  '알림 클릭도 같은 경로로 간다 (앱 안 목록과 브라우저 알림이 갈리면 안 된다)',
  /schedule_survey_requested[\s\S]{0,400}\/schedule\?survey=/.test(navSource)
);
check(
  '알림 이동은 meta.survey_id 를 읽는다',
  /schedule_survey_requested[\s\S]{0,300}meta\?\.survey_id/.test(navSource)
);

console.log('\n[10] 정적 검사 — 대상자 명단 조회');
const hooksSource = readCode('src/features/schedule-survey/hooks/useScheduleSurveys.ts');
check(
  "공용 useResources() 를 쓰지 않는다 (상한 1000행에서 조용히 잘린다)",
  !hooksSource.includes('useResources')
);
check(
  '대상자 이름은 id 지정(.in) 으로만 읽는다',
  /from\('resource'\)[\s\S]{0,200}\.in\('id'/.test(hooksSource)
);

console.log(`\n${fails === 0 ? '✅ 전부 통과' : `❌ 실패 ${fails}건`}`);
process.exit(fails === 0 ? 0 : 1);
