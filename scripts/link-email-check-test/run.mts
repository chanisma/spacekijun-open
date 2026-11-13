// 교사 리소스 연결의 이메일 비교 회귀 — npx tsx scripts/link-email-check-test/run.mts
import { checkLinkEmail, needsEmailReview, normalizeEmail } from '../../src/lib/linkEmailCheck';

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (got === want) pass++; else { fail++; console.error(`✗ ${name}: got ${String(got)}, want ${String(want)}`); }
};

eq('연결 없음', checkLinkEmail('a@myschool.hs.kr', null), 'unlinked');
eq('같음', checkLinkEmail('a@myschool.hs.kr', 'a@myschool.hs.kr'), 'match');
eq('대소문자·공백 무시', checkLinkEmail(' A@Kijun.hs.kr ', 'a@myschool.hs.kr'), 'match');
eq('다름', checkLinkEmail('kijungpt6@myschool.hs.kr', 'dan@myschool.hs.kr'), 'mismatch');
eq('명단 이메일 없음', checkLinkEmail(undefined, 'a@myschool.hs.kr'), 'resource_missing');
eq('엑셀 흔적 NAN = 없음', checkLinkEmail('NAN', 'a@myschool.hs.kr'), 'resource_missing');
eq('하이픈 = 없음', checkLinkEmail('-', 'a@myschool.hs.kr'), 'resource_missing');
eq('문자열 아님 = 없음', checkLinkEmail(123, 'a@myschool.hs.kr'), 'resource_missing');
eq('normalize null', normalizeEmail(''), null);
eq('불일치는 확인 필요', needsEmailReview('mismatch'), true);
eq('명단 없음도 확인 필요', needsEmailReview('resource_missing'), true);
eq('일치는 아님', needsEmailReview('match'), false);
eq('미연결은 아님', needsEmailReview('unlinked'), false);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
