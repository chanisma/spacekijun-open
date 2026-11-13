/**
 * 교사 계정(meta.accounts) 다중 계정 회귀 테스트
 *
 * 실행: npx tsx scripts/teacher-accounts-test/run.mts
 *
 * 검증 목적
 *  1) 레거시 단일 객체 ↔ 신규 배열 형태를 모두 읽는가 (라이브에 두 형태가 공존한다)
 *  2) 병합 시맨틱 2종 — 전체 교체(편집 모달) vs 부분 패치(엑셀 일괄)
 *  3) 부분 패치가 **엉뚱한 계정을 덮어쓰지 않는가** (같은 종류에 계정이 여러 개일 때)
 *  4) 엑셀 헤더 매칭 — 서비스명 라벨 분리, 날짜 열 무시
 *  5) 개인 전화번호 키(phone/hp)는 어떤 경로로도 남지 않는가
 */
import {
  accountEntries,
  accountEntryLabel,
  countRegisteredAccounts,
  deepMergeAccounts,
  hasAnyAccount,
  matchAccountHeader,
  mergeAccountPatchIntoMeta,
  mergeAccountsIntoMeta,
  normalizeAccounts,
  parseAccounts,
  type TeacherAccounts,
} from '../../src/utils/teacherAccounts';

let passed = 0;
const failures: string[] = [];

const check = (name: string, condition: boolean, detail = '') => {
  if (condition) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

const eq = (name: string, actual: unknown, expected: unknown) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);

// ------------------------------------------------------------------ 1) 파싱
eq(
  '레거시 단일 객체를 배열로 읽는다',
  parseAccounts({ accounts: { ai: { id: 'a@x' } } }),
  { ai: [{ id: 'a@x' }] }
);

eq(
  '배열 형태를 그대로 읽는다',
  parseAccounts({ accounts: { ai: [{ label: 'Claude', id: 'c@x' }, { label: 'GPT', id: 'g@x' }] } }),
  { ai: [{ label: 'Claude', id: 'c@x' }, { label: 'GPT', id: 'g@x' }] }
);

eq('JSON 문자열 meta 도 파싱한다', parseAccounts('{"accounts":{"google":{"id":"g"}}}'), {
  google: [{ id: 'g' }],
});

eq('accounts 없는 meta 는 빈 객체', parseAccounts({ email: 'a@b' }), {});
eq('null meta 방어', parseAccounts(null), {});
eq('깨진 JSON 문자열 방어', parseAccounts('{not json'), {});
eq('내용 없는 항목(라벨만)은 버린다', parseAccounts({ accounts: { ai: [{ label: 'X' }] } }), {});
eq('배열 안 null 항목 방어', parseAccounts({ accounts: { ai: [null, { id: 'a' }] } }), {
  ai: [{ id: 'a' }],
});

// ------------------------------------------------------------------ 2) 표시 헬퍼
const multi: TeacherAccounts = {
  ai: [{ id: 'k@myschool.hs.kr' }, { label: 'Claude', id: 'c@x' }, { label: 'GPT', note: '발급 예정' }],
};
check('계정 목록 길이', accountEntries(multi, 'ai').length === 3);
check('등록 수는 id/password 있는 것만', countRegisteredAccounts(multi, 'ai') === 2);
check('없는 종류는 빈 배열', accountEntries(multi, 'google').length === 0);
eq('라벨 없으면 번호로 구분', accountEntryLabel(multi.ai![0], 0, 3), '계정 1');
eq('라벨이 있으면 라벨', accountEntryLabel(multi.ai![1], 1, 3), 'Claude');
eq('계정이 하나뿐이면 구분 이름 없음', accountEntryLabel({ id: 'a' }, 0, 1), '');

// ------------------------------------------------------------------ 3) 정규화
eq(
  '공백만 있는 필드는 제거',
  normalizeAccounts({ ai: [{ label: '  ', id: ' a@x ', password: '  ', note: '' }] }),
  { ai: [{ id: 'a@x' }] }
);
eq('전부 빈 계정은 종류째 사라진다', normalizeAccounts({ ai: [{ id: '  ' }] }), {});
check('빈 accounts 는 hasAnyAccount=false', hasAnyAccount({ ai: [] }) === false);
check('note 만 있어도 계정으로 센다', hasAnyAccount({ ai: [{ note: '확인 필요' }] }) === true);

// ------------------------------------------------------------------ 4) 전체 교체 (편집 모달)
{
  const meta = { email: 'x@myschool.hs.kr', section: { A: {} }, accounts: { ai: { id: 'old' } } };
  const next = mergeAccountsIntoMeta(meta, { ai: [{ label: 'Claude', id: 'new' }] });
  eq('전체 교체: accounts 는 통째로 바뀐다', (next as any).accounts, {
    ai: [{ label: 'Claude', id: 'new' }],
  });
  eq('전체 교체: 나머지 meta 보존(email)', (next as any).email, 'x@myschool.hs.kr');
  check('전체 교체: section 보존', !!(next as any).section);
}
{
  const next = mergeAccountsIntoMeta({ accounts: { ai: { id: 'a' } }, email: 'e' }, {});
  check('계정이 비면 accounts 키 자체가 사라진다', !('accounts' in next));
  eq('그래도 나머지 meta 는 남는다', (next as any).email, 'e');
}
{
  const next = mergeAccountsIntoMeta({ phone: '010-0000-0000', hp: '010-1', accounts: {} }, {
    ai: [{ id: 'a' }],
  });
  check('개인 전화번호 키는 제거된다(phone)', !('phone' in next));
  check('개인 전화번호 키는 제거된다(hp)', !('hp' in next));
}
{
  // 쓰기는 항상 배열 — 레거시 객체를 읽어 저장하면 배열로 승격된다.
  const next = mergeAccountsIntoMeta({}, parseAccounts({ accounts: { google: { id: 'g' } } }));
  check('쓰기 형태는 항상 배열', Array.isArray((next as any).accounts.google));
}

// ------------------------------------------------------------- 5) 부분 패치 (엑셀)
eq(
  '패치: 같은 아이디면 필드만 갱신',
  deepMergeAccounts({ ai: [{ id: 'a@x' }] }, { ai: [{ id: 'a@x', password: 'p' }] }),
  { ai: [{ id: 'a@x', password: 'p' }] }
);
eq(
  '패치: 아이디 대소문자 무시하고 같은 계정으로 본다',
  deepMergeAccounts({ ai: [{ id: 'A@X' }] }, { ai: [{ id: 'a@x', password: 'p' }] }),
  { ai: [{ id: 'A@X', password: 'p' }] }
);
eq(
  '패치: 새 아이디는 계정으로 추가된다 (기존 계정 보존)',
  deepMergeAccounts(
    { ai: [{ id: 'kijungpt1@myschool.hs.kr' }] },
    { ai: [{ label: 'Claude', id: 'claude440@x' }] }
  ),
  { ai: [{ id: 'kijungpt1@myschool.hs.kr' }, { label: 'Claude', id: 'claude440@x' }] }
);
eq(
  '패치: 라벨이 같으면 같은 계정',
  deepMergeAccounts(
    { ai: [{ label: 'Claude', id: 'c@x' }] },
    { ai: [{ label: 'claude', password: 'p' }] }
  ),
  { ai: [{ label: 'Claude', id: 'c@x', password: 'p' }] }
);
eq(
  '패치: 계정이 하나뿐이면 아이디 없는 패치도 그 계정에 붙는다(레거시 시맨틱)',
  deepMergeAccounts({ google: [{ id: 'g@x' }] }, { google: [{ password: 'p' }] }),
  { google: [{ id: 'g@x', password: 'p' }] }
);
eq(
  '패치: 계정이 여러 개면 대상 불명 패치는 버린다 (엉뚱한 비밀번호 덮어쓰기 방지)',
  deepMergeAccounts(
    { ai: [{ label: 'Claude', id: 'c@x' }, { label: 'GPT', id: 'g@x' }] },
    { ai: [{ password: 'p' }] }
  ),
  { ai: [{ label: 'Claude', id: 'c@x' }, { label: 'GPT', id: 'g@x' }] }
);
eq(
  '패치: 다른 종류는 서로 간섭하지 않는다',
  deepMergeAccounts({ google: [{ id: 'g' }] }, { ai: [{ id: 'a' }] }),
  { google: [{ id: 'g' }], ai: [{ id: 'a' }] }
);
{
  const meta = { email: 'x', accounts: { ai: { id: 'kijungpt1@myschool.hs.kr' }, google: { id: 'g' } } };
  const next = mergeAccountPatchIntoMeta(meta, { ai: [{ label: 'Claude', id: 'c@x', password: 'p' }] });
  eq('엑셀 경로: 기존 AI 계정 옆에 새 계정이 추가된다', (next as any).accounts.ai, [
    { id: 'kijungpt1@myschool.hs.kr' },
    { label: 'Claude', id: 'c@x', password: 'p' },
  ]);
  eq('엑셀 경로: 패치에 없는 종류는 보존', (next as any).accounts.google, [{ id: 'g' }]);
  eq('엑셀 경로: 나머지 meta 보존', (next as any).email, 'x');
}
{
  // 같은 패치를 두 번 적용해도 계정이 늘지 않아야 한다(재실행 안전).
  const once = mergeAccountPatchIntoMeta({}, { ai: [{ label: 'Claude', id: 'c@x' }] });
  const twice = mergeAccountPatchIntoMeta(once, { ai: [{ label: 'Claude', id: 'c@x' }] });
  eq('엑셀 경로: 같은 파일 재적용은 멱등', (twice as any).accounts.ai, [
    { label: 'Claude', id: 'c@x' },
  ]);
}

// ------------------------------------------------------------- 6) 헤더 매칭
eq('구글 아이디', matchAccountHeader('구글 아이디'), { kind: 'google', field: 'id' });
eq('웨일 비밀번호', matchAccountHeader('웨일스페이스 비밀번호'), {
  kind: 'whalespace',
  field: 'password',
});
eq('Claude 계정 → ai + 라벨', matchAccountHeader('Claude 계정'), {
  kind: 'ai',
  field: 'id',
  label: 'Claude',
});
eq('GPT 비밀번호 → ai + 라벨', matchAccountHeader('GPT 비밀번호'), {
  kind: 'ai',
  field: 'password',
  label: 'GPT',
});
eq('Gemini 계정 → ai + 라벨', matchAccountHeader('Gemini 계정'), {
  kind: 'ai',
  field: 'id',
  label: 'Gemini',
});
eq('chatgpt 는 GPT 라벨로 (gpt 부분일치보다 우선순위 문제 없음)', matchAccountHeader('ChatGPT 아이디'), {
  kind: 'ai',
  field: 'id',
  label: 'GPT',
});
eq('서비스명이 없으면 라벨 없음', matchAccountHeader('인공지능 아이디'), {
  kind: 'ai',
  field: 'id',
});
check('날짜 열은 무시 — Claude 시작일', matchAccountHeader('Claude 시작일') === null);
check('날짜 열은 무시 — GPT 발급일', matchAccountHeader('GPT 발급일') === null);
check('계정과 무관한 열은 null — 연락처', matchAccountHeader('연락처') === null);
check('계정과 무관한 열은 null — 비고', matchAccountHeader('비고') === null);
check('빈 헤더는 null', matchAccountHeader('  ') === null);

// ------------------------------------------------------------------ 결과
console.log(`\n통과 ${passed}건, 실패 ${failures.length}건`);
if (failures.length) {
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log('✓ 교사 계정 다중 계정 회귀 테스트 전건 통과');
