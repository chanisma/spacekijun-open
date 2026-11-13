/**
 * 상세 모달 "입학처 · 복수지원" 섹션 **렌더** 회귀 테스트.
 *
 * 실행: npx tsx --tsconfig tsconfig.app.json scripts/admission-wishlist-test/render-univ-info.mts
 *
 * `--tsconfig` 가 필요한 이유: 루트 `tsconfig.json` 은 references 만 있는 solution 파일이라
 * tsx 가 `jsx` 옵션을 적용하지 않는다. 빠뜨리면 `.tsx` import 가 `React is not defined` 로 죽는다.
 *
 * `run-univ-info.mts` 가 순수 로직을 본다면 여기는 **실제 마크업**을 본다 — 이 화면의
 * 위험은 값이 아니라 **표현**에 있기 때문이다:
 *   · 주소가 아닌 값(`'입학처(해오름관 2층)'`)이 `href` 에 들어가면 **상대경로**로 해석돼
 *     우리 앱 안에서 이동한다. 로직 테스트는 `homeUrl === null` 만 보고 지나간다.
 *   · 캠퍼스를 특정하지 못했을 때 후보를 그리지 않으면 화면이 그냥 비어 보인다.
 *   · 복수지원 **원문**이 빠져도 요약은 멀쩡해 보인다.
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdmissionUnivInfo } from '../../src/features/admission-wishlist/utils/admissionUnivInfo';

// 컴포넌트 → 훅 → 서비스 → supabase 클라이언트 순으로 끌려 들어오는데 그 클라이언트가
// 모듈 최상단에서 `localStorage` 를 읽는다. **정적 import 는 호이스팅되므로** 전역을 먼저
// 세우고 동적 import 해야 한다(그냥 두면 `ReferenceError: localStorage is not defined`).
const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

const { UnivInfoSection } = await import('../../src/features/admission-wishlist/components/UnivInfoSection');
const { baseUniversity, canonUniversity } =
  await import('../../src/features/admission-wishlist/utils/admissionUnivInfo');

let passed = 0;
const failures: string[] = [];
const check = (name: string, cond: boolean, detail = '') => {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name}  ${detail}`); }
};

const info = (university: string, over: Partial<AdmissionUnivInfo> = {}): AdmissionUnivInfo => ({
  university,
  universityCanon: canonUniversity(university),
  universityBase: baseUniversity(university),
  region: '전북', address: '익산시 익산대로 460', phone: '063)850-5000',
  homeUrl: 'https://ipsi.wku.ac.kr', homeRaw: 'ipsi.wku.ac.kr',
  applyUrl: 'https://www.uwayapply.com', applyRaw: 'www.uwayapply.com',
  multiApplyStatus: 'allowed', multiApplyLimit: 5,
  multiApplySummary: '가능 · 본교 내 최대 5회',
  multiApplyText: '※ 본교 최대 5회 지원 가능 (단, 각각 지원 시 …)',
  baseDate: '2026년 6월 10일',
  ...over,
});

/**
 * 훅이 쓰는 쿼리 키를 그대로 채워 넣는다.
 * (`useWishlist.ts` 의 `[KEY, 'univ-info', 정렬한 대학명]` 과 같아야 한다 —
 *  어긋나면 이 테스트는 항상 "불러오는 중"만 본다.)
 */
function render(university: string, rows: AdmissionUnivInfo[] | undefined) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (rows) qc.setQueryData(['admission-wishlist', 'univ-info', university], rows);
  return renderToStaticMarkup(
    h(QueryClientProvider, { client: qc }, h(UnivInfoSection as never, { university })),
  );
}

console.log('── 1) 정상 (원광대) ──');
{
  const html = render('원광대', [info('원광대학교')]);
  check('입학처가 링크로 나간다', html.includes('href="https://ipsi.wku.ac.kr"'), html.slice(0, 300));
  check('새 창 + noopener', html.includes('target="_blank"') && html.includes('rel="noopener noreferrer"'));
  check('링크 글자는 호스트만', html.includes('ipsi.wku.ac.kr') && !html.includes('>https://ipsi.wku.ac.kr<'));
  check('원서접수처도 링크', html.includes('href="https://www.uwayapply.com"'));
  check('전화가 보인다', html.includes('063)850-5000'));
  check('복수지원 판정 배지', html.includes('가능'));
  check('본교 상한을 적는다', html.includes('본교 내 최대 5회'));
  check('원문을 그대로 싣는다', html.includes('본교 최대 5회 지원 가능'));
  check('출처·기준일을 밝힌다', html.includes('2026년 6월 10일') && html.includes('한국대학교육협의회'));
  // 폴백이 아니면 굳이 매칭 대학명을 적지 않는다(잡음)
  check('정확 일치면 매칭 안내 없음', !html.includes('로 보고 있습니다'));
}

console.log('\n── 2) 입학처 칸이 주소가 아님 (조선대) ──');
{
  const html = render('조선대', [info('조선대학교', {
    homeUrl: null, homeRaw: '입학처(해오름관 2층)', applyUrl: null, applyRaw: null,
  })]);
  // ★ 핵심: 상대경로 링크를 만들면 안 된다
  check('링크를 만들지 않는다', !html.includes('href="입학처'), html.slice(0, 400));
  check('안내 문구는 글로 보여준다', html.includes('입학처(해오름관 2층)'));
  check('href 가 아예 없다(주소 자체가 없으므로)', !html.includes('href="'), html.slice(0, 400));
}

console.log('\n── 3) 복수지원 불가 (서울교대) ──');
{
  const html = render('서울교대', [info('서울교육대학교', {
    multiApplyStatus: 'blocked', multiApplyLimit: null,
    multiApplySummary: '본교 내 복수지원 불가', multiApplyText: '- 모든 전형 복수지원 불가',
  })]);
  check('불가 배지', html.includes('불가'));
  check('로즈 톤으로 구분', html.includes('text-rose-700'));
  check('원문을 싣는다', html.includes('모든 전형 복수지원 불가'));
  check('상한 표기는 없다', !html.includes('본교 내 최대'));
}

console.log('\n── 4) 캠퍼스 보류 (강원대) ──');
{
  const rows = [
    info('강원대학교(춘천)', { multiApplySummary: '가능' }),
    info('강원대학교(삼척)', { multiApplySummary: '가능' }),
    info('강원대학교(강릉,원주)', { multiApplySummary: '가능' }),
  ];
  const html = render('강원대', rows);
  check('보류를 말한다', html.includes('특정할 수 없습니다'), html.slice(0, 400));
  check('후보 3곳을 모두 그린다',
    html.includes('강원대학교(춘천)') && html.includes('강원대학교(삼척)') && html.includes('강원대학교(강릉,원주)'));
  check('보류에도 각 후보의 입학처는 준다', html.includes('href="https://ipsi.wku.ac.kr"'));
}

console.log('\n── 5) 캠퍼스 폴백 (명지대(자연) → 명지대학교) ──');
{
  const html = render('명지대(자연)', [info('명지대학교')]);
  check('무엇과 붙었는지 밝힌다', html.includes('명지대학교') && html.includes('로 보고 있습니다'), html.slice(0, 400));
}

console.log('\n── 6) 자료 없음 (DGIST) ──');
{
  const html = render('DGIST', []);
  check('자료 없음을 말한다', html.includes('자료가 없습니다'));
  check('왜 없는지도 말한다', html.includes('전문대'));
  check('링크는 없다', !html.includes('href="'));
}

console.log('\n── 7) 불러오는 중 ──');
{
  const html = render('원광대', undefined);
  check('로딩 상태를 구분해 그린다', html.includes('불러오는 중'), html.slice(0, 200));
}

console.log(`\n${failures.length === 0 ? '✅' : '❌'} pass ${passed} / fail ${failures.length}`);
if (failures.length > 0) for (const f of failures) console.log(`   · ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
