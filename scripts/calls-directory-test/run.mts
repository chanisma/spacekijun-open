/**
 * 전화번호부(내선 디렉터리) 회귀 테스트
 *
 * 실행: npx tsx scripts/calls-directory-test/run.mts
 *
 * 검증 목적
 *  1) 데이터 무결성 — 중복 id, 번호 없는 항목, 원본 문서 대비 건수
 *  2) 검색 정규화 — 하이픈 유무와 무관하게 전화번호가 걸리는지
 *  3) 카테고리 필터가 그룹을 정확히 좁히는지
 */
import { extensionData, quickDialContacts } from '../../src/data/extensionDirectory';
import { countEntries, filterDirectory, normalizeText, toTelHref } from '../../src/lib/callsDirectory';

let passed = 0;
const failures: string[] = [];

const check = (name: string, condition: boolean, detail = '') => {
  if (condition) {
    passed += 1;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const allEntries = extensionData.flatMap((group) => group.entries);
const groupById = (id: string) => extensionData.find((group) => group.id === id);

// ---------------------------------------------------------------- 데이터 무결성
const ids = allEntries.map((entry) => entry.id);
check('entry id는 전역적으로 유일', new Set(ids).size === ids.length, `${ids.length - new Set(ids).size}건 중복`);

check(
  '모든 항목은 내선 또는 전화번호를 가진다',
  allEntries.every((entry) => entry.extension || entry.phone),
  allEntries.filter((e) => !e.extension && !e.phone).map((e) => e.id).join(', ')
);

check(
  '내선번호는 3자리 숫자',
  allEntries.every((entry) => !entry.extension || /^\d{3}$/.test(entry.extension)),
  allEntries.filter((e) => e.extension && !/^\d{3}$/.test(e.extension)).map((e) => e.extension).join(', ')
);

check(
  '전화번호 표기는 000-000-0000 형식',
  allEntries.every((entry) => !entry.phone || /^\d{3}-\d{3,4}-\d{4}$/.test(entry.phone)),
  allEntries.filter((e) => e.phone && !/^\d{3}-\d{3,4}-\d{4}$/.test(e.phone)).map((e) => e.phone).join(', ')
);

// ------------------------------------------------------------ 원본 문서 대비 건수
check(
  '그룹 수 9개(운영실 + 학년3 + 담당자 + 부속실 + 행정실 + 기숙사 + 식생활관)',
  extensionData.length === 9,
  `${extensionData.length}개`
);

for (const grade of [1, 2, 3] as const) {
  const group = groupById(`grade-${grade}`);
  check(`${grade}학년: 부장 + 9개 반 = 10건`, group?.entries.length === 10, `${group?.entries.length}건`);
  check(
    `${grade}학년 모든 반은 내선과 직통을 함께 가진다`,
    Boolean(group?.entries.every((entry) => entry.extension && entry.phone))
  );
}

const staff = groupById('staff');
check('담당자 25명 (원본 26명 중 최병현 제외)', staff?.entries.length === 25, `${staff?.entries.length}명`);
check('담당자 전원 담당업무 표기', Boolean(staff?.entries.every((entry) => entry.duty)));
check(
  '최병현은 목록에서 제외',
  !allEntries.some((entry) => entry.name === '최병현')
);
// 358번 담당자는 장재윤 (원본 표기 '류로아'는 사용자 확인으로 정정)
check('류로아는 목록에 없음', !allEntries.some((entry) => entry.name === '류로아'));
check(
  '담당자 내선번호 중복 없음',
  new Set(staff?.entries.map((e) => e.extension)).size === (staff?.entries.length ?? 0)
);

check('운영실 9건', groupById('admin')?.entries.length === 9);
check('부속실 10건', groupById('facility')?.entries.length === 10);
check('행정실 8건', groupById('office')?.entries.length === 8);
check('기숙사 2건', groupById('dorm')?.entries.length === 2);
check('식생활관 5건', groupById('cafeteria')?.entries.length === 5);

// 원본 표의 특정 값 스팟 체크 (전사 오류 방지)
const spotChecks: Array<[string, string | undefined, string | undefined]> = [
  ['교장실', '301', '000-0000-0038'],
  ['교목실', '303', '000-0000-0039'],
  ['황지유', '361', undefined],
  ['장재윤', '358', undefined],
  ['안하준', '364', undefined],
  ['오하린', '352', undefined],
  ['상담실', '341', '000-0000-0035'],
  ['최요한', '311', undefined],
  ['사감', '329', '000-0000-0048'],
];
for (const [name, extension, phone] of spotChecks) {
  const entry = allEntries.find((item) => item.name === name);
  check(`스팟체크 ${name}`, entry?.extension === extension && entry?.phone === phone, JSON.stringify(entry));
}

// 3학년 9반 직통이 문서 마지막 값과 일치
const grade3Class9 = allEntries.find((entry) => entry.id === 'grade-3-class-9');
check('3학년 9반 = 239 / 070-4267-6497', grade3Class9?.extension === '239' && grade3Class9?.phone === '070-4267-6497');

// ------------------------------------------------------------------- 검색 동작
const search = (query: string) => filterDirectory(extensionData, { query, category: 'all' });
const searchNames = (query: string) => search(query).flatMap((g) => g.entries.map((e) => e.name));

check('하이픈 없는 전화번호 검색', searchNames('2368932').includes('교무실 1'));
check('하이픈 포함 전화번호 검색', searchNames('000-0000-0032').includes('교무실 1'));
check('부분 번호 검색', searchNames('4267-6471').includes('1반'));
check('이름 검색', searchNames('황지유').length === 1);
check('담당업무 검색', searchNames('학교폭력').includes('최건우'));
check('내선번호 검색', searchNames('211').some((name) => name === '1반'));
check('그룹명 검색(부속실 전체)', search('부속실').length === 1);
check('공백 검색어는 전체 반환', countEntries(search('   ')) === allEntries.length);
check('없는 검색어는 0건', search('존재하지않는이름').length === 0);

// -------------------------------------------------------------- 카테고리 필터
check(
  '학년 필터는 3개 그룹',
  filterDirectory(extensionData, { query: '', category: 'grade' }).length === 3
);
check(
  '담당자 필터 + 검색 조합',
  countEntries(filterDirectory(extensionData, { query: '부장', category: 'staff' })) > 0
);
check(
  '카테고리와 무관한 검색어는 0건',
  filterDirectory(extensionData, { query: '조리원', category: 'grade' }).length === 0
);

// ------------------------------------------------------------------- 유틸리티
check('toTelHref는 하이픈 제거', toTelHref('000-0000-0032') === 'tel:0632368932');
check('normalizeText는 공백/기호 제거 및 소문자화', normalizeText(' FAX-01 ') === 'fax01');

// --------------------------------------------------------------- 빠른 연결 검증
check(
  '빠른 연결 번호는 모두 디렉터리에 존재',
  quickDialContacts.every((contact) => allEntries.some((entry) => entry.phone === contact.phone)),
  quickDialContacts.filter((c) => !allEntries.some((e) => e.phone === c.phone)).map((c) => c.label).join(', ')
);

// ----------------------------------------------------------------------- 결과
console.log(`\n전화번호부 회귀 테스트: ${passed}건 통과, ${failures.length}건 실패`);
if (failures.length > 0) {
  console.error('\n실패 목록:');
  failures.forEach((failure) => console.error(`  ✗ ${failure}`));
  process.exit(1);
}
console.log('전 항목 통과 ✓\n');
