// 중첩 모달(모달 속 모달) 회귀 — 2026-09-04 신설.
//
// 잡으려는 사고: **모달 안에서 다른 모달을 닫으면 사이트 전체가 클릭되지 않는다**
// (새로고침해야 복구). 전자서명의 "요청 삭제" 확인 모달에서 취소·삭제·바깥 클릭
// 어느 쪽으로 닫아도 재현됐다.
//
// 원인은 우리 코드가 아니라 **의존성 트리**였다. Radix 의 `DismissableLayer` 는
// `body.style.pointerEvents` 의 원래 값을 **모듈 스코프 변수**에 적어 두는데,
// Radix 가 의존성을 정확한 버전으로 고정하는 탓에 사본이 갈라져 있었다:
//
//   @radix-ui/react-dialog       → dismissable-layer 1.1.11 (중첩 설치)
//   @radix-ui/react-alert-dialog → dismissable-layer 1.1.1  (호이스팅)
//
// 사본이 둘이면 변수도 둘이라 서로의 레이어를 못 본다 → AlertDialog 가 열릴 때
// 이미 오염된 `'none'` 을 "원래 값" 으로 저장하고, 닫힐 때 그 값으로 되돌린다.
// 두 모달이 같은 커밋에서 닫히면 **나중에 쓴 쪽이 이겨서** body 가 갇힌다.
//
// 이 테스트가 사본 수를 세는 이유: 사본이 다시 갈라져도 **빌드도 타입 검사도
// 통과하고 오류도 안 난다.** Radix 패키지를 하나 추가하는 것만으로 조용히 재발한다.
//
// 실행: npx tsx scripts/modal-layer-test/run.mts
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldReleasePointerEvents } from '../../src/lib/modalPointerEvents';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const NODE_MODULES = join(ROOT, 'node_modules');

let fails = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${detail}`}`);
  if (!cond) fails += 1;
};

// ── ① 모듈 스코프 상태를 가진 패키지는 사본이 정확히 하나여야 한다 ──────────
//
// 넷 다 "열린 레이어를 모듈 전역에 쌓아 두고 마지막 하나가 닫힐 때 되돌린다" 는
// 같은 구조라, 갈라지면 같은 종류의 고착이 생긴다:
//   dismissable-layer → body 의 pointer-events (클릭이 죽는다)
//   focus-guards      → 포커스 가드 span 이 body 에 남는다
//   focus-scope       → 포커스 트랩이 안 풀린다(탭이 모달 밖으로 못 나간다)
//   react-remove-scroll → 스크롤 잠금이 안 풀린다
//
// **`@radix-ui/react-dialog` 자체는 일부러 넣지 않았다** — 지금도 사본이 3개다
// (root 1.1.15 · alert-dialog 안 1.1.2 · cmdk 안 1.0.5). 이 패키지에는 모듈 전역
// **가변 상태가 없고** React 컨텍스트뿐이라, 사본이 갈라져도 Dialog 와 AlertDialog 가
// 서로의 컨텍스트를 볼 일이 애초에 없어 무해하다. 반대로 합치려 들면 cmdk 를
// 1.0.5 → 1.1.15 로 끌어올리게 돼 위험만 커진다. 고쳐야 할 것은 상태를 가진 넷뿐이다.
const SINGLETON_PACKAGES = [
  '@radix-ui/react-dismissable-layer',
  '@radix-ui/react-focus-guards',
  '@radix-ui/react-focus-scope',
  'react-remove-scroll',
];

/** node_modules 를 훑어 특정 패키지의 물리 사본을 전부 찾는다(중첩 설치 포함). */
function findCopies(pkg: string): { path: string; version: string }[] {
  const found: { path: string; version: string }[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;

      // 스코프 디렉터리(@radix-ui)는 패키지가 아니라 한 겹 더 들어간다
      if (entry.startsWith('@')) {
        walk(full, depth);
        continue;
      }
      // dist/src 등 패키지 내부는 볼 필요가 없다 — node_modules 만 따라간다
      if (entry === 'node_modules') {
        walk(full, depth + 1);
        continue;
      }

      const rel = relative(NODE_MODULES, full).split('\\').join('/');
      const name = rel.split('/node_modules/').pop()!;
      if (name === pkg) {
        try {
          const version = JSON.parse(readFileSync(join(full, 'package.json'), 'utf8')).version;
          found.push({ path: rel, version });
        } catch {
          /* package.json 이 없으면 패키지가 아니다 */
        }
      }
      const nested = join(full, 'node_modules');
      try {
        if (statSync(nested).isDirectory()) walk(nested, depth + 1);
      } catch {
        /* 중첩 설치 없음 */
      }
    }
  };
  walk(NODE_MODULES, 0);
  return found;
}

console.log('의존성 — 모듈 스코프 상태를 가진 패키지의 사본 수');
for (const pkg of SINGLETON_PACKAGES) {
  const copies = findCopies(pkg);
  check(
    `${pkg} 사본 1개`,
    copies.length === 1,
    `\n      → ${copies.length}개 발견: ${copies.map((c) => `${c.path}@${c.version}`).join(', ')}` +
    '\n      → package.json 의 "overrides" 에 이 패키지를 최신 버전으로 고정할 것',
  );
}

// ── ② vite 도 같은 목록을 고정해야 한다 ────────────────────────────────────
//
// **디스크 사본이 하나여도 개발 서버에서는 갈라질 수 있다.** Vite 는 사전 번들 결과를
// `node_modules/.vite/deps` 에 캐시하는데, 의존성을 고치기 전에 만들어진 캐시가 남아 있으면
// 브라우저는 여전히 옛 사본 둘을 받는다 — 실제로 이 경로로 재발했다(2026-09-04).
// 증상은 "모달 안 버튼을 누르면 모든 모달이 함께 닫힌다": 사본이 갈라지면 바깥 Dialog 가
// 안쪽 AlertDialog 를 자기 레이어로 못 봐서 그 안의 클릭을 **바깥 클릭으로 판정**한다.
// `resolve.dedupe` 에 적어 두면 해석이 하나로 고정되고, 이 파일이 바뀌면 캐시도 새로 만들어진다.
console.log('\nvite — resolve.dedupe 에도 같은 목록이 있는가');
{
  const vite = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
  const dedupe = vite.slice(vite.indexOf('dedupe:'), vite.indexOf('dedupe:') + 400);
  for (const pkg of SINGLETON_PACKAGES) {
    check(
      `resolve.dedupe 에 ${pkg}`,
      vite.includes('dedupe:') && dedupe.includes(pkg),
      '\n      → vite.config.ts 의 resolve.dedupe 에 추가할 것 ' +
      '(디스크 사본이 하나여도 Vite 사전 번들 캐시에서 갈라진다)',
    );
  }
}

// ── ③ lockfile 은 package-lock.json 하나여야 한다 ──────────────────────────
//
// **의존성을 고정하는 방법이 둘이면 둘은 반드시 갈라진다.** 이 저장소는 npm 으로
// 관리하고(package-lock.json), 배포(Lovable)는 bun 으로 빌드한다. bun 은 bun lockfile 이
// **없으면** package-lock.json 을 마이그레이션해 **같은 트리**를 만들지만(실측: 모달
// 관련 버전 8종 전부 일치), **있으면** 그쪽을 정본으로 삼고 package.json 범위를
// 만족하지 않는 항목만 새로 푼다.
//
// 그 "반쯤 고정된" 상태가 2026-09-04 배포를 죽였다. 2025-08-03 이후 한 번도 갱신되지
// 않은 bun.lockb 탓에 bun 에서만 @radix-ui/react-dialog 가 1.1.23 으로 튀었고, 그 버전이
// **정확 버전으로** 요구하는 dismissable-layer 1.1.19 를 위 overrides 가 1.1.11 로 덮어
// "useDismissableLayerSurface" is not exported by … 로 빌드가 죽었다.
//
// **로컬 npm 빌드는 27초 만에 성공했다** — package-lock 이 dialog 를 1.1.15 에 묶어 그
// API 를 쓰지 않았기 때문이다. 즉 이 사고는 개발자 기계에서 재현되지 않는다.
// 배포가 죽고 나서야 알게 되므로 여기서 잡는다.
console.log('\nlockfile — 정본은 package-lock.json 하나여야 한다');
{
  let tracked = '';
  try {
    tracked = execSync('git ls-files bun.lockb bun.lock', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    /* git 이 없는 환경이면 이 검사만 건너뛴다 */
  }
  check(
    'bun lockfile 이 추적되지 않는다',
    tracked === '',
    '\n      → 추적 중: ' + tracked.split('\n').join(', ') +
      '\n      → git rm --cached 로 지울 것. bun 은 package-lock.json 을 마이그레이션해' +
      ' 같은 트리를 만들지만, bun lockfile 이 있으면 그쪽이 이겨 조합이 갈라진다',
  );
  check(
    'package-lock.json 이 있다',
    existsSync(join(ROOT, 'package-lock.json')),
    '\n      → 정본 lockfile 이 없으면 배포 빌드가 매번 다른 트리를 만든다',
  );
}

// ── ④ 안전망의 순수 판정 ────────────────────────────────────────────────────
//
// 방향이 한쪽뿐인 것이 중요하다: **풀어 주기만** 하고 막지 않는다.
console.log('\n안전망 판정 — "열린 모달이 없는데 body 가 none" 일 때만 해제');
check(
  '모달 0개 + none → 해제 (갇힌 상태)',
  shouldReleasePointerEvents('none', 0),
);
check(
  '모달 1개 + none → 유지 (모달이 열려 있는 정상 상태)',
  !shouldReleasePointerEvents('none', 1),
);
check(
  '중첩 모달 2개 + none → 유지',
  !shouldReleasePointerEvents('none', 2),
);
check(
  '모달 0개 + 빈 값 → 아무것도 하지 않음 (이미 정상)',
  !shouldReleasePointerEvents('', 0),
);
check(
  '모달 0개 + auto → 아무것도 하지 않음',
  !shouldReleasePointerEvents('auto', 0),
);
check(
  '모달 1개 + 빈 값 → 아무것도 하지 않음 (비모달 다이얼로그)',
  !shouldReleasePointerEvents('', 1),
);

console.log(fails === 0 ? '\n전부 통과' : `\n${fails}건 실패`);
process.exit(fails === 0 ? 0 : 1);
