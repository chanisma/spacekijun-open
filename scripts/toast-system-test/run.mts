/**
 * 토스트 시스템 회귀 — `npx tsx scripts/toast-system-test/run.mts`
 *
 * 이 검사가 막는 것은 **조용한 되돌림** 세 가지다.
 *
 * ① **두 번째 토스트 시스템의 부활.** 2026-09-12 이전까지 이 앱은 Radix 토스트와
 *    sonner 를 `App.tsx` 에 **동시에** 마운트하고 있었다. 둘 다 우측 하단에 뜨는데
 *    모양·크기·동시 표시 개수가 달라, 같은 앱에서 토스트가 두 종류로 보였다.
 *    누가 `sonner` 를 직접 import 하거나 `<Toaster>` 를 하나 더 붙여도
 *    **빌드도 타입 검사도 통과한다** — 그래서 여기서 못 박는다.
 *
 * ② **닫기 버튼 소실.** `closeButton` 은 prop 하나이고, 빠져도 오류가 나지 않는다.
 *    빠지면 휴대폰에서 토스트를 **닫을 방법이 사라진다**(hover 가 없으므로).
 *
 * ③ **대비 부족.** 토스트 색은 CSS 변수라 Tailwind 검사기가 보지 못한다.
 *    글자 4.5:1 을 **실제로 계산해서** 확인한다(CLAUDE.md "3. 색").
 *
 * 나머지 절반은 순수 판정(`src/lib/toastMessage.ts`)의 표 검사다 — 색 유추가
 * 뒤집히면 '삭제 실패' 가 초록 체크로 뜨는데, 그것도 오류를 내지 않는다.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';

import {
  TOAST_DURATION_MS,
  inferToneFromTitle,
  isRestatement,
  resolveLegacyToast,
} from '../../src/lib/toastMessage';
import { TOAST_PALETTE, toastPaletteStyle } from '../../src/lib/toastPalette';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(p, 'utf8');

function listSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  walk('src');
  return out;
}

// ── 1. tone 유추 ────────────────────────────────────────────────────────────
console.log('1. tone 유추 — 실패를 성공으로 칠하지 않는다');

// `variant` 는 작성자가 명시한 신호이므로 무엇보다 먼저다.
check('destructive 는 제목과 무관하게 error',
  resolveLegacyToast({ title: '저장 완료', variant: 'destructive' }).tone === 'error');

// 제목에 '삭제'·'저장' 이 들어 있어도 실패면 실패다 — 판정 순서가 뒤집히면 초록이 된다.
for (const t of ['삭제 실패', '저장 실패', '업로드 오류', '불러오기 실패', '권한 없음']) {
  check(`'${t}' → error`, inferToneFromTitle(t) === 'error', String(inferToneFromTitle(t)));
}
for (const t of ['저장 완료', '삭제 완료', '배정 완료', '성공', '수정되었습니다']) {
  check(`'${t}' → success`, inferToneFromTitle(t) === 'success', String(inferToneFromTitle(t)));
}
check("'경고' → warning", inferToneFromTitle('경고') === 'warning');
check("'알림' → neutral", inferToneFromTitle('알림') === 'neutral');
check('모르는 제목은 유추하지 않는다', inferToneFromTitle('탐구 설계') === undefined);
check('제목이 없으면 유추하지 않는다', inferToneFromTitle(undefined) === undefined);

// ── 2. 상투어 제목 접기 ──────────────────────────────────────────────────────
console.log('2. 정보 없는 제목은 버리고 설명문을 본문으로 올린다');
{
  const r = resolveLegacyToast({ title: '성공', description: '프로필이 업데이트되었습니다.' });
  check('성공 + 설명 → 한 줄', r.message === '프로필이 업데이트되었습니다.' && r.description === undefined);
  check('그래도 tone 은 success 다', r.tone === 'success');
}
{
  const r = resolveLegacyToast({ title: '오류', description: '권한이 없습니다.', variant: 'destructive' });
  check('오류 + 설명 → 한 줄', r.message === '권한이 없습니다.' && r.description === undefined);
}
{
  // 설명문이 없으면 상투어라도 본문으로 남는다(빈 토스트를 만들지 않는다).
  check('설명문이 없으면 제목을 남긴다', resolveLegacyToast({ title: '성공' }).message === '성공');
}
{
  const r = resolveLegacyToast({ description: '저장했습니다.' });
  check('제목이 없으면 설명문이 본문', r.message === '저장했습니다.' && r.description === undefined);
}

// ── 3. 동어반복 접기 ────────────────────────────────────────────────────────
console.log('3. 제목을 되풀이하는 설명문만 버린다 (양방향 일치)');
const RESTATE: Array<[string, string]> = [
  ['노트 삭제 완료', '노트가 삭제되었습니다.'],
  ['댓글 수정 완료', '댓글이 수정되었습니다.'],
  ['플러그인 삭제됨', '플러그인이 성공적으로 삭제되었습니다.'],
  ['보드 복원 완료', '보드가 복원되었습니다.'],
  ['노트 생성 완료', '새로운 노트가 생성되었습니다.'],
];
for (const [t, d] of RESTATE) check(`동어반복 '${t}'`, isRestatement(t, d));

// 설명문이 **무엇에 대한 것인지**를 더 말해 주면 지우지 않는다.
const KEEP_BOTH: Array<[string, string]> = [
  ['서명 완료', '연수 참석 서명이 저장되었습니다.'],
  ['저장 완료', '메뉴 활성화 설정이 적용되었습니다. 사용자는 다음 화면 이동부터 반영됩니다.'],
  ['노트 복사 완료', '노트 내용이 입력창에 로드되었습니다. 수정 후 생성하세요.'],
  ['삭제 완료', '미팅이 삭제되었습니다.'],
];
for (const [t, d] of KEEP_BOTH) check(`정보를 더 담은 설명 유지 '${t}'`, !isRestatement(t, d));
{
  const r = resolveLegacyToast({ title: '노트 삭제 완료', description: '노트가 삭제되었습니다.' });
  check('resolve 도 같은 판정', r.message === '노트 삭제 완료' && r.description === undefined);
}

// ── 4. 지속 시간 ────────────────────────────────────────────────────────────
console.log('4. 오류는 성공보다 오래 머문다');
check('error > warning > neutral ≥ success',
  TOAST_DURATION_MS.error > TOAST_DURATION_MS.warning &&
  TOAST_DURATION_MS.warning > TOAST_DURATION_MS.neutral &&
  TOAST_DURATION_MS.neutral >= TOAST_DURATION_MS.success);
check('가장 짧은 것도 2.5초 이상', Math.min(...Object.values(TOAST_DURATION_MS)) >= 2500);

// ── 5. 시스템이 하나인가 (정적 검사) ─────────────────────────────────────────
console.log('5. 토스트 시스템은 하나다');
check('구 Radix toaster.tsx 가 없다', !existsSync('src/components/ui/toaster.tsx'));
check('구 Radix toast.tsx 가 없다', !existsSync('src/components/ui/toast.tsx'));
check('@radix-ui/react-toast 의존성이 없다', !read('package.json').includes('@radix-ui/react-toast'));

const app = read('src/App.tsx');
const toasterMounts = (app.match(/<Toaster\b/g) ?? []).length;
check('App.tsx 에 <Toaster /> 가 정확히 하나', toasterMounts === 1, `${toasterMounts}개`);
check('App.tsx 에 <Sonner /> 가 남아 있지 않다', !/<Sonner\b/.test(app));

{
  // `sonner` 직접 import 는 두 파일에만 허용한다 — 그래야 duration·위치·색이 한 곳에서 정해진다.
  const allowed = new Set(['src/components/ui/sonner.tsx', 'src/lib/toast.ts']);
  const strays = listSourceFiles()
    .filter((f) => /from\s*["']sonner["']/.test(read(f)))
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => !allowed.has(f));
  check('sonner 를 직접 import 하는 곳은 허용된 2개뿐', strays.length === 0, strays.join(', '));
}

// ── 6. 닫기 버튼·위치 ───────────────────────────────────────────────────────
console.log('6. 모든 토스트를 사용자가 닫을 수 있다');
const sonnerSrc = read('src/components/ui/sonner.tsx');
check('closeButton 이 켜져 있다', /\bcloseButton\b/.test(sonnerSrc));
check('위치는 우측 하단', /position="bottom-right"/.test(sonnerSrc));
// ThemeProvider 가 없는 앱에서 theme="system" 이면 다크 기기에서 토스트만 어두워진다.
check('theme 을 system 에 맡기지 않는다', /theme="light"/.test(sonnerSrc));
check('next-themes 를 import 하지 않는다', !/from\s*["']next-themes["']/.test(sonnerSrc));

const css = read('src/index.css');
check('모바일에서 하단 네비 위로 띄운다',
  /data-y-position=.bottom./.test(css) && /--mobile-nav-height/.test(css));

// ── 7. 색 대비를 실제로 계산한다 ─────────────────────────────────────────────
console.log('7. 색 대비 — 글자 4.5:1');
function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}
for (const [tone, c] of Object.entries(TOAST_PALETTE)) {
  const t = ratio(c.text, c.bg);
  check(`${tone} 글자 대비 ≥ 4.5 (${t.toFixed(2)})`, t >= 4.5);
  // 테두리는 같은 색 계열의 옅은 톤이라 3:1 을 요구하지 않는다(카드 경계는 그림자도 같이 진다).
  check(`${tone} 테두리가 배경과 구분된다 (${ratio(c.border, c.bg).toFixed(2)})`, ratio(c.border, c.bg) >= 1.15);
}

/*
 * 팔레트는 **인라인 style 로** 전달돼야 한다. CSS 파일에 적으면 sonner 가 런타임에
 * 주입하는 `[data-sonner-toaster][data-theme=light]`(특이도 0-2-0)에 져서 조용히
 * 무시된다 — 2026-09-12 에 실제로 그렇게 만들었고, 브라우저에서 계산값을 재 보기
 * 전까지 아무 신호도 없었다(변수는 index.css 에 분명히 있었으므로 정적 검사도 통과했다).
 */
check('팔레트를 인라인 style 로 넘긴다', /style=\{toastPaletteStyle\(\)/.test(sonnerSrc));
check('index.css 는 색을 다시 정의하지 않는다', !/--success-bg\s*:/.test(css));
check('CSS 변수 이름이 sonner 규격과 같다',
  ['--success-bg', '--error-text', '--warning-border', '--info-bg', '--normal-bg']
    .every((k) => k in toastPaletteStyle()));

// ── 8. 어댑터가 sonner 위에 있는가 ───────────────────────────────────────────
console.log('8. 구 use-toast 는 자체 store 를 갖지 않는다');
const useToastSrc = read('src/hooks/use-toast.ts');
check('reducer·listener 기반 store 가 사라졌다',
  !/TOAST_REMOVE_DELAY|TOAST_LIMIT|listeners\.push/.test(useToastSrc));
check('@/lib/toast 위에 얹혀 있다', /from '@\/lib\/toast'/.test(useToastSrc));
check('useToast() 가 여전히 { toast } 를 준다',
  /function useToast/.test(useToastSrc) && /\btoast,/.test(useToastSrc));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
