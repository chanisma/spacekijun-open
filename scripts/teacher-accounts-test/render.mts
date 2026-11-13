/**
 * 프로필 "내 계정" 섹션 렌더 회귀 테스트
 *
 * 실행: npx tsx --tsconfig tsconfig.app.json scripts/teacher-accounts-test/render.mts
 *
 * `--tsconfig` 가 필요한 이유: 루트 `tsconfig.json` 은 references 만 있는 solution 파일이라
 * tsx 가 그 compilerOptions(특히 `jsx`)를 적용하지 않는다. 그대로 돌리면 컴포넌트(.tsx)가
 * classic 런타임으로 컴파일돼 `ReferenceError: React is not defined` 로 죽는다.
 * (순수 로직만 보는 `run.mts` 는 .tsx 를 import 하지 않아 플래그가 필요 없다.)
 *
 * `run.mts` 가 순수 로직(파싱·병합)을 본다면 여기는 **실제 렌더 결과(SSR 마크업)**를 본다.
 * 다중 계정 지원 전에는 종류당 한 칸만 그렸으므로, 같은 종류의 두 번째 계정이 조용히
 * 사라져도 로직 테스트만으로는 잡히지 않는다.
 *
 * 픽스처는 라이브 `resource.meta` 형태 그대로다 — AI는 배열(신규), 구글·웨일은
 * 단일 객체(레거시)로 **두 형태가 실제로 공존**하는 상태를 재현한다.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountsSection } from '../../src/components/profile/AccountsSection';

let passed = 0;
const failures: string[] = [];

const check = (name: string, condition: boolean, detail = '') => {
  if (condition) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

const render = (meta: unknown) =>
  renderToStaticMarkup(h(AccountsSection as never, { resourceMeta: meta }));

// ---------------------------------------------------------------- 픽스처 (라이브 형태)
// 장채원: AI 2개(배열) + 구글 1개(레거시 객체)
const multiAi = {
  email: 'teacher@myschool.hs.kr',
  accounts: {
    google: { id: 'teacher@myschool.hs.kr', password: 'GooglePw1!' },
    ai: [
      {
        id: 'claude440@edusub-mail.co.kr',
        note: '기관 발급 · 2026-08-28',
        label: 'Claude',
        password: 'Edukj20260828!',
      },
      {
        id: 'gpt1147@edusub-mail.co.kr',
        note: '기관 발급 · 2026-08-28',
        label: 'GPT',
        password: 'Edukj20260828!',
      },
    ],
  },
};

// 윤도윤: 아이디 일부만 있고 비밀번호가 없는 계정
const partialAi = {
  accounts: {
    ai: [
      {
        id: 'thdbs7894…',
        note: '개인 → 대여 전환 · 2026-06-04 · 계정 ID 일부만 확인됨 · 비밀번호 미표시 — 확인 필요',
        label: 'Claude',
      },
    ],
  },
};

// 라벨이 없는 계정이 여러 개인 경우 (구분 이름을 번호로 보여줘야 한다)
const unlabeledMulti = {
  accounts: { ai: [{ id: 'a@x' }, { id: 'b@x' }] },
};

const multi = render(multiAi);
const partial = render(partialAi);
const unlabeled = render(unlabeledMulti);

// ------------------------------------------------------- 1) 여러 AI 계정이 모두 보인다
check('AI 계정 2건의 아이디가 모두 렌더된다 (Claude)', multi.includes('claude440@edusub-mail.co.kr'));
check('AI 계정 2건의 아이디가 모두 렌더된다 (GPT)', multi.includes('gpt1147@edusub-mail.co.kr'));
check('종류 라벨이 보인다', multi.includes('인공지능용 계정'));
check('계정 구분 이름 Claude 가 보인다', multi.includes('Claude'));
check('계정 구분 이름 GPT 가 보인다', multi.includes('GPT'));
check('비고가 보인다', multi.includes('기관 발급 · 2026-08-28'));
check(
  '인공지능용 계정 칸이 2개 그려진다',
  (multi.match(/인공지능용 계정/g) || []).length === 2,
  `${(multi.match(/인공지능용 계정/g) || []).length}개`
);

// ------------------------------------------------- 2) 레거시 객체 종류도 함께 보인다
check('구글 계정(레거시 단일 객체)도 렌더된다', multi.includes('teacher@myschool.hs.kr'));
check('구글 라벨이 보인다', multi.includes('구글 계정'));
check(
  '계정이 하나인 종류에는 번호를 붙이지 않는다',
  !multi.includes('계정 1') && !multi.includes('계정 2')
);

// ------------------------------------------------------ 3) 비밀번호 기본 마스킹
check('AI 비밀번호가 평문으로 노출되지 않는다', !multi.includes('Edukj20260828!'));
check('구글 비밀번호가 평문으로 노출되지 않는다', !multi.includes('GooglePw1!'));
check('마스킹 문자가 계정 수만큼 있다', (multi.match(/••••••••/g) || []).length === 3);

// --------------------------------------------- 4) 비밀번호 없는 계정 / 잘린 아이디
check('잘린 아이디가 말줄임표째 보인다', partial.includes('thdbs7894…'));
check('확인 필요 비고가 보인다', partial.includes('계정 ID 일부만 확인됨'));
check('비밀번호가 없으면 마스킹 줄 자체가 없다', !partial.includes('••••••••'));

// ------------------------------------------------- 5) 라벨 없는 다중 계정은 번호로 구분
check('라벨이 없고 계정이 여럿이면 계정 1', unlabeled.includes('계정 1'));
check('라벨이 없고 계정이 여럿이면 계정 2', unlabeled.includes('계정 2'));
check('두 아이디가 모두 보인다', unlabeled.includes('a@x') && unlabeled.includes('b@x'));

// ------------------------------------------------------------- 6) 빈 경우 미노출
check('계정이 없으면 섹션 자체를 그리지 않는다', render({ email: 'x' }) === '');
check('meta 가 없어도 안전하다', render(undefined) === '');
check('JSON 문자열 meta 도 렌더된다', render(JSON.stringify(multiAi)).includes('gpt1147@edusub-mail.co.kr'));

// ------------------------------------------------------------------ 결과
console.log(`\n통과 ${passed}건, 실패 ${failures.length}건`);
if (failures.length) {
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log('✓ 프로필 "내 계정" 렌더 회귀 테스트 전건 통과');
