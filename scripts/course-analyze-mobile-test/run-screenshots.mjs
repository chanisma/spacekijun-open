/**
 * 선택과목 분석(/course-analyze) — 실제 사이트 전체를 휴대폰 폭으로 캡처한다.
 *
 * 앱 코드는 한 줄도 바꾸지 않는다. 바꾸는 것은 브라우저의 "전송"뿐이다:
 *   ① localStorage 에 가짜 세션을 넣어 로그인 화면을 건너뛴다(토큰은 서버에 가지 않는다)
 *   ② Supabase 로 가는 요청을 가로채 **서비스 키로 대신 보낸다** → 실제 데이터로 그려진다
 *   ③ 쓰기(PATCH·PUT·DELETE·INSERT)는 보내지 않고 가짜 성공만 돌려준다 — 캡처가 DB 를 바꾸면 안 된다
 * 서비스 키는 이 Node 프로세스 안에만 있고 페이지 JS 에는 전달되지 않는다.
 *
 * 실행: 개발 서버(npm run dev, :8080)를 띄운 뒤
 *   node scripts/course-analyze-mobile-test/run-screenshots.mjs
 *   (PLAYWRIGHT_MODULE=<playwright/index.mjs 경로> · CA_WIDTHS=390,1440 · CA_USER=<profiles.id>)
 * 출력: .tmp/course-analyze-mobile/*.png + report.json
 */
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright'
);

const env = (file) => {
  try {
    return Object.fromEntries(
      readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }),
    );
  } catch { return {}; }
};
const E = { ...env('.env'), ...env('.env.local') };
const SUPA = E.VITE_SUPABASE_URL;
const KEY = E.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) throw new Error('.env 의 VITE_SUPABASE_URL 과 .env.local 의 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다');
const REF = new URL(SUPA).hostname.split('.')[0];
const BASE = process.env.CA_URL || 'http://localhost:8080';
const OUT = join(process.cwd(), '.tmp', 'course-analyze-mobile');
mkdirSync(OUT, { recursive: true });

// 캡처할 계정 — 기본값 = 관리자(모든 탭이 보인다)
const userId = process.env.CA_USER || (await (await fetch(
  `${SUPA}/rest/v1/profiles?select=id&role=eq.admin&limit=1`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
)).json())[0]?.id;
const profile = (await (await fetch(`${SUPA}/rest/v1/profiles?select=id,email&id=eq.${userId}`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
})).json())[0];
if (!profile) throw new Error('캡처할 계정을 찾지 못했습니다');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
const fakeJwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: userId, exp, role: 'authenticated', aud: 'authenticated', email: profile.email })}.x`;
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated', email: profile.email,
  app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: {}, created_at: '2025-01-01T00:00:00Z',
};
const session = { access_token: fakeJwt, token_type: 'bearer', expires_in: 30 * 24 * 3600, expires_at: exp, refresh_token: 'screenshot', user };

const TABS = ['과목별 선택', '조합 검색', '간단 분석', '학급별 보기', '과목별 예상등급', '학생별 예상등급', '등급 분포', '차수 비교', '학급 관리'];
const widths = (process.env.CA_WIDTHS || '390,1440').split(',').map(Number);
const blockedWrites = new Set();
const report = [];

const browser = await chromium.launch({ channel: process.env.CA_CHANNEL || 'chrome' });
for (const w of widths) {
  const mobile = w < 768;
  const ctx = await browser.newContext({
    viewport: { width: w, height: mobile ? 844 : 900 },
    deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile,
  });
  await ctx.addInitScript(([key, s, ts]) => {
    localStorage.setItem(key, JSON.stringify(s));
    localStorage.setItem('auth_login_timestamp', ts);
  }, [`sb-${REF}-auth-token`, session, String(Date.now())]);

  await ctx.route(`${SUPA}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const m = req.method();
    if (url.pathname.startsWith('/auth/v1/')) {
      if (url.pathname.endsWith('/user')) return route.fulfill({ json: user });
      if (url.pathname.endsWith('/token')) return route.fulfill({ json: session });
      return route.fulfill({ status: 204, body: '' });
    }
    const isRead = m === 'GET' || m === 'HEAD' || m === 'OPTIONS' || (m === 'POST' && url.pathname.startsWith('/rest/v1/rpc/'));
    if (!isRead || url.pathname.startsWith('/functions/')) {
      blockedWrites.add(`${m} ${url.pathname}`);
      return route.fulfill({ status: m === 'POST' ? 201 : 204, body: '' });
    }
    const headers = { ...req.headers(), apikey: KEY, authorization: `Bearer ${KEY}` };
    try {
      return await route.fulfill({ response: await route.fetch({ headers }) });
    } catch {
      return route.abort();
    }
  });

  const page = await ctx.newPage();
  await page.goto(`${BASE}/course-analyze`);
  const nav = page.locator('.course-analyze-wrapper header nav');
  await nav.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2500);

  // 화면 진단 — 페이지 가로 넘침, 너무 작은 글자, 너무 작은 버튼
  const diagnose = () => page.evaluate(() => {
    const vw = innerWidth;
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
    const inHScroll = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p).overflowX; if ((s === 'auto' || s === 'scroll') && p.scrollWidth > p.clientWidth) return true; } return false; };
    const small = new Map();
    const offscreen = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || el.closest('[aria-hidden="true"]')) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 12) { const t = el.textContent.trim().slice(0, 24); small.set(`${fs}px`, [...(small.get(`${fs}px`) ?? []), t].slice(0, 6)); }
        const r = el.getBoundingClientRect();
        if ((r.right > vw + 1 || r.left < -1) && !inHScroll(el)) offscreen.push(el.textContent.trim().slice(0, 30));
      }
    }
    const tinyButtons = [...document.querySelectorAll('button, a, [role="button"]')]
      .filter(visible).filter((el) => { const r = el.getBoundingClientRect(); return r.height < 32 || r.width < 32; })
      .map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)).slice(0, 15);
    return { pageScrollsX: document.documentElement.scrollWidth > vw, offscreen: offscreen.slice(0, 10), smallText: Object.fromEntries(small), tinyButtons };
  });

  // 탭 본문은 안쪽 스크롤 칸에 있다 — 그 칸을 내려 가며 여러 장 찍는다
  const scroller = () => page.evaluateHandle(() => {
    // 휴대폰은 사이트 <main> 이, 데스크톱은 분석 화면 안쪽 칸이 스크롤한다
    const els = [...document.querySelectorAll('main, .course-analyze-wrapper *')]
      .filter((e) => { const s = getComputedStyle(e).overflowY; return (s === 'auto' || s === 'scroll') && e.scrollHeight > e.clientHeight + 4 && e.clientWidth > innerWidth * 0.6; });
    return els.sort((a, b) => b.clientHeight - a.clientHeight)[0] ?? null;
  });

  const shoot = async (name, pages = mobile ? 4 : 1) => {
    const el = await scroller();
    const info = { name, width: w, ...(await diagnose()) };
    for (let i = 0; i < pages; i++) {
      await page.screenshot({ path: join(OUT, `${w}-${name}-${i + 1}.png`) });
      const moved = await page.evaluate((e) => { if (!e) return false; const before = e.scrollTop; e.scrollTop += e.clientHeight * 0.85; return e.scrollTop !== before; }, el);
      if (!moved) break;
      await page.waitForTimeout(300);
    }
    await page.evaluate((e) => { if (e) e.scrollTop = 0; }, el);
    report.push(info);
    console.log(w, name, JSON.stringify({ x: info.pageScrollsX, off: info.offscreen.length, small: Object.keys(info.smallText), tiny: info.tinyButtons.length }));
  };

  for (const [i, tab] of TABS.entries()) {
    const btn = nav.getByRole('button', { name: tab, exact: true });
    if (!(await btn.count())) { console.log(w, tab, '(탭 없음)'); continue; }
    await btn.click();
    await page.waitForTimeout(2500);
    await shoot(`${String(i + 1).padStart(2, '0')}-${tab.replace(/\s/g, '')}`);
  }

  if (mobile) {
    const open = page.getByRole('button', { name: '학생 목록', exact: true });
    if (await open.count()) { await open.click(); await page.waitForTimeout(500); await shoot('20-학생목록서랍', 1); await page.mouse.click(w - 15, 400); }
  }
  const print = page.getByRole('button', { name: '출력' });
  if (await print.count()) { await print.first().click(); await page.waitForTimeout(2500); await shoot('21-출력대화상자', 1); await page.keyboard.press('Escape'); }

  await ctx.close();
}
await browser.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ blockedWrites: [...blockedWrites], report }, null, 2));
console.log('쓰기 차단:', [...blockedWrites]);
console.log('→', OUT);
