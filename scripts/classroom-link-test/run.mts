/**
 * 교실 기기 QR 세팅 — 프리셋 규칙·화면 연결 회귀 (2026-10-13)
 *
 * 프리셋 항목 규칙은 세 곳(서버 CHECK · 이 화면 · 교실 프로그램)에 따로 있다. 화면 쪽 규칙이
 * 서버보다 느슨하면 저장이 조용히 거부되고, 더 빡빡하면 쓸 수 있는 항목을 못 넣는다.
 *
 *   npx tsx scripts/classroom-link-test/run.mts
 *   npx tsx scripts/classroom-link-test/handler.mts   (Edge Function)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLASSROOM_PROGRAMS, GOOGLE_APPS, isValidItem, normalizeUrl, orderPresets, suggestedPresetId, validateDraft,
  type ClassroomPreset,
} from '../../src/features/classroom-link/presetItems';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
let fails = 0;
const check = (name: string, cond: boolean) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond) fails++;
};

console.log('① 항목 규칙');
check('주소에 https 를 붙인다', normalizeUrl('padlet.com/abc') === 'https://padlet.com/abc');
check('javascript: 주소 거절', normalizeUrl('javascript:alert(1)') === null);
check('file: 주소 거절', normalizeUrl('file:///C:/Windows') === null);
check('드라이브 id', isValidItem({ kind: 'drive', id: '1AbC_def-GHIjkl', name: 'a' }) && !isValidItem({ kind: 'drive', id: '../x', name: 'a' }));
check('프로그램은 이름만(경로 거절)', isValidItem({ kind: 'program', program: 'powerpoint', name: '' })
  && !isValidItem({ kind: 'program', program: 'C:\\Windows\\cmd.exe', name: '' }));
check('스페이스기전 경로는 / 로 시작', isValidItem({ kind: 'space', path: '/timetable', name: '' })
  && !isValidItem({ kind: 'space', path: 'https://evil.example', name: '' }));
check('항목 없는 세팅도 저장(독에 구글·내 드라이브가 늘 있다)', validateDraft({ title: 'a', section_name: null, items: [], auto_end_minutes: 50 }) === null);
check('이름 없는 세팅 거절', validateDraft({ title: ' ', section_name: null, items: [{ kind: 'space', path: '/', name: '홈' }], auto_end_minutes: 50 }) !== null);
check('구글 앱은 웹사이트 규칙을 그대로 통과', GOOGLE_APPS.every((g) => isValidItem({ kind: 'url', url: g.url, name: g.label, app: g.key })));
check('정상 세팅 통과', validateDraft({ title: '1-3', section_name: '정보 1-3', items: [{ kind: 'space', path: '/', name: '홈' }], auto_end_minutes: 50 }) === null);

console.log('② 서버 CHECK 와 같은 규칙');
{
  const sql = read('supabase/migrations/20261013220000_classroom_link.sql');
  const items = read('src/features/classroom-link/presetItems.ts');
  for (const re of ['[A-Za-z0-9_-]{10,128}', '[a-z0-9_-]{1,40}', '[A-Za-z0-9/_?=&.-]{0,200}']) {
    check(`정규식 ${re} 이 서버·화면 양쪽에`, sql.includes(re) && items.includes(re));
  }
  // Postgres 정규식의 반복 횟수 상한은 255 — 넘으면 저장 때마다 2201B 로 터진다(2026-10-13 웹사이트 항목 400)
  // 주석은 빼고 본다 — 머리 주석이 옛 잘못된 식을 인용한다
  const fix = read('supabase/migrations/20261013230000_classroom_preset_url_check.sql').replace(/--.*$/gm, '');
  const counts = [...fix.matchAll(/\{(\d+)(?:,(\d+))?\}/g)].map((m) => Number(m[2] ?? m[1]));
  check('서버 정규식 반복 횟수 ≤ 255', counts.length > 0 && counts.every((n) => n <= 255));
  // 같은 함정이 휴대폰 입력(20261014130000)에서 또 — 지금 쓰는 함수 본문(고친 판)에 255 넘는 반복이 없어야 한다
  const typeFix = read('supabase/migrations/20261014140000_classroom_type_submit_regex.sql');
  const typeBody = typeFix.slice(0, typeFix.indexOf('-- 스스로 확인')).split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('--')).join('\n');
  const typeCounts = [...typeBody.matchAll(/\{(\d+)(?:,(\d+))?\}/g)].map((m) => Number(m[2] ?? m[1]));
  check('휴대폰 입력 보내기 정규식 반복 ≤ 255', typeCounts.every((n) => n <= 255) && /char_length\(v_ct\) not between 20 and 1400/.test(typeBody));
  check('웹사이트 길이는 정규식이 아니라 char_length 로', /char_length\(v_item->>'url'\) > 2000/.test(fix));
  check('항목 30개 상한이 같다', /jsonb_array_length\(p_items\) > 30/.test(sql) && /MAX_ITEMS = 30/.test(items));
}

console.log('③ 교실 프로그램이 아는 이름과 같다');
{
  let device = '';
  try { device = readFileSync('D:/NEIS_helper/app/core/classroom_setup.py', 'utf-8'); } catch { /* 다른 PC */ }
  if (!device) console.log('  - NEIS_helper 저장소가 없어 건너뜀');
  for (const { key } of device ? CLASSROOM_PROGRAMS : []) check(`프로그램 «${key}»`, device.includes(`'${key}'`));
  for (const { key } of device ? GOOGLE_APPS : []) check(`구글 앱 «${key}»`, device.includes(`'${key}': ('`));
  // 안드로이드(전자칠판)판 — android/app/src/main/java/kr/hs/kijun/classroom/Session.kt
  let board = '';
  try { board = readFileSync('D:/NEIS_helper/android/app/src/main/java/kr/hs/kijun/classroom/Session.kt', 'utf-8'); } catch { /* 다른 PC */ }
  for (const { key } of board ? CLASSROOM_PROGRAMS : []) check(`전자칠판 프로그램 «${key}»`, board.includes(`"${key}" to (`));
  for (const { key } of board ? GOOGLE_APPS : []) check(`전자칠판 구글 앱 «${key}»`, board.includes(`"${key}" to (`));
}

console.log('④ 추천 순서');
{
  const p = (id: string, section: string | null, used: string | null, sort = 0): ClassroomPreset =>
    ({ id, title: id, section_name: section, items: [], auto_end_minutes: 50, sort_order: sort, last_used_at: used, updated_at: '' });
  const list = [p('a', '정보 1-1', '2026-10-01'), p('b', '정보 1-3', null), p('c', null, '2026-10-12')];
  check('지금 수업과 같은 반이 맨 위', orderPresets(list, '정보 1-3')[0].id === 'b');
  check('그다음은 최근에 쓴 것', orderPresets(list, '정보 1-3')[1].id === 'c');
  check('맞는 반이 하나면 미리 고른다', suggestedPresetId(list, '정보 1-3') === 'b');
  check('수업이 아니면 고르지 않는다(추측 금지)', suggestedPresetId(list, null) === null);
  check('세팅이 하나뿐이면 그것', suggestedPresetId([p('only', null, null)], null) === 'only');
}

console.log('⑤ 화면 연결');
{
  const app = read('src/App.tsx');
  const profile = read('src/pages/Profile.tsx');
  const page = read('src/features/classroom-link/ClassroomLinkBody.tsx');
  check('승인 화면 = 교직원 전용 라우트', /path="\/classroom\/link\/:code" element={<ProtectedRoute allowed={FACULTY_ROLES}>/.test(app));
  check('프로필에서 빠졌다 — 독립 화면 «교실 기기»', !/ClassroomPreset/.test(profile));
  check('교실 기기 화면 = 교직원 전용 라우트', /path="\/classroom" element={<ProtectedRoute allowed={FACULTY_ROLES}>/.test(app));
  check('메뉴 «도구»에 교실 기기', /commonNavItems\.collab,\s*commonNavItems\.classroomDevices/.test(read('src/config/navigation.ts')));
  check('승인 때 드라이브 전체 토큰을 새로 받는다', /connectDrive \|\| needsDrive\(preset\.items\) \? await requestClassroomDriveToken\(\)/.test(page));
  const token = read('src/features/classroom-link/driveToken.ts');
  const handlerSrc = read('supabase/functions/classroom-link/handler.js');
  const toolScopes = [...token.matchAll(/'(https:\/\/www\.googleapis\.com\/auth\/classroom\.[a-z.]+)'/g)].map((m) => m[1]);
  check('클래스룸 범위를 웹·서버가 같게 안다', toolScopes.length === 7 && toolScopes.every((s) => handlerSrc.includes(`'${s}'`)));
  check('교실 토큰 = 전체 드라이브 범위, 저장하지 않는다', /auth\/drive'/.test(token) && !/localStorage/.test(token));
  check('드라이브 다시 연결 = 세팅 없이 승인', /approveLink\(code, null, googleToken\)/.test(page));
  check('로그인 보관 문구는 기기 종류대로(PC·칠판)', /deviceWord = info\?\.platform === 'android' \? '칠판' : 'PC'/.test(page)
    && /이 \$\{deviceWord\}에 로그인 보관/.test(page));
  check('구글 로그인 보관 선택을 승인에 싣는다(A+)', /approveLink\(code, preset\.id, googleToken, keepGoogle\)/.test(page)
    && /keep_google: keepGoogle/.test(read('src/features/classroom-link/classroomLinkService.ts')));
}

console.log('⑥ 휴대폰으로 구글 비밀번호 — 휴대폰 봉인 ↔ 기기 풀기가 맞는가');
{
  const { createECDH, hkdfSync, createDecipheriv } = await import('node:crypto');
  const { sealForDevice, fromB64url, toB64url, TYPE_INFO } = await import('../../src/features/classroom-link/typeCrypto.ts');
  const device = createECDH('prime256v1');
  device.generateKeys();
  const code = 'AbCdEfGhIjKlMnOpQrStUvWx';
  const sealed = await sealForDevice(toB64url(device.getPublicKey()), code, '비밀번호 P@ss!');
  // 기기 쪽(core/classroom_type.py · TypeRelay.kt)이 하는 그대로
  const shared = device.computeSecret(Buffer.from(fromB64url(sealed.epk)));
  const key = Buffer.from(hkdfSync('sha256', shared, Buffer.from(code), Buffer.from(TYPE_INFO), 32));
  const ct = Buffer.from(fromB64url(sealed.ct));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(fromB64url(sealed.iv)));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString('utf8');
  check('기기가 풀면 같은 비밀번호', plain === '비밀번호 P@ss!');
  check('봉인 결과에 평문이 없다', !JSON.stringify(sealed).includes('P@ss'));
  check('휴대폰 입력 화면 = 교직원 전용 라우트', /path="\/classroom\/type\/:code" element={<ProtectedRoute allowed={FACULTY_ROLES}>/.test(read('src/App.tsx')));
}

console.log('⑦ 휴대폰 탭 정리 — QR 마다 탭이 쌓이지 않게(2026-10-14)');
{
  const link = read('src/features/classroom-link/ClassroomLinkBody.tsx');
  const type = read('src/features/classroom-link/ClassroomTypeBody.tsx');
  const tab = read('src/features/classroom-link/phoneTab.ts');
  check('비밀번호를 보내면 잠시 뒤 탭을 닫는다', /useAutoCloseTab\(sent, \d+\)/.test(type));
  check('비밀번호 화면끼리 새 것이 예전 것을 닫는다', /useSupersededTab\('type'/.test(type));
  check('드라이브 다시 연결·끝난 연결은 잠시 뒤 닫는다', /const finished = \(isDrive && !!done\)/.test(link) && /useAutoCloseTab\(finished/.test(link));
  check('드라이브 QR 이 수업 화면(수업 끝내기)을 닫지 않는다 — 종류가 다르다', /isDrive \? 'drive' : 'link'/.test(link));
  check('승인·보내는 중에는 닫지 않는다', /\(\) => !busy\);/.test(link) && /useSupersededTab\('type', \(\) => !busy\)/.test(type));
  check('막히면 «닫아도 됩니다»(브라우저는 기록이 하나뿐인 탭만 닫게 한다)', /window\.closed/.test(tab));
}

console.log(fails ? `\n✗ ${fails}건 실패` : '\n✓ 모두 통과');
process.exit(fails ? 1 : 0);
