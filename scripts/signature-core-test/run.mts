/**
 * 전자서명 핵심 로직 회귀 — `npx tsx scripts/signature-core-test/run.mts`
 *
 * 여기 담긴 계산은 **틀려도 예외가 나지 않는다**. 서명이 엉뚱한 자리에 찍히거나,
 * 찌그러지거나, "내 차례"가 서버와 어긋나 눌러도 거부당하는 형태로만 나타난다.
 * 특히 PDF 의 y 뒤집기는 페이지 가운데 근처에서 얼추 맞아 보여 늦게 발견된다.
 */
import {
  rectFromDrag, rectToPixels, rectToPdf, rectToHwpUnit, fitContain,
  isValidPlacement, parsePlacements, clamp01, MIN_BOX_SIZE, HWPUNIT_PER_INCH,
} from '../../src/features/e-signature/lib/signatureField';
import {
  flowShape, groupSigners, activeOrder, myTurn, signProgress, validateSigners,
  type SignerLike,
} from '../../src/features/e-signature/lib/signatureFlow';
import {
  sourceObjectPath, signedObjectPath,
} from '../../src/features/e-signature/lib/storagePath';
import {
  detectSourceKind, sourceRejectReason, purgeDeadline, dueError, dueRange, defaultDueAt, DUE_MAX_DAYS, PURGE_DAYS,
} from '../../src/features/e-signature/types';
import { readFileSync } from 'node:fs';
import { looksLikeZip } from '../../src/features/e-signature/lib/stampDocument';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

// ══ 좌표 ═══════════════════════════════════════════════════════════════════
{
  const c = { width: 800, height: 1000 };
  const r = rectFromDrag({ x: 100, y: 200 }, { x: 300, y: 400 }, c)!;
  check('드래그 → 정규화', near(r.x, 0.125) && near(r.y, 0.2) && near(r.w, 0.25) && near(r.h, 0.2),
    JSON.stringify(r));

  const rev = rectFromDrag({ x: 300, y: 400 }, { x: 100, y: 200 }, c)!;
  check('역방향 드래그도 같은 결과', JSON.stringify(rev) === JSON.stringify(r));

  check('너무 작은 박스는 거부', rectFromDrag({ x: 10, y: 10 }, { x: 12, y: 12 }, c) === null);
  check('크기 0 컨테이너는 안전', rectFromDrag({ x: 0, y: 0 }, { x: 5, y: 5 }, { width: 0, height: 0 }) === null);

  const out = rectFromDrag({ x: -500, y: -500 }, { x: 4000, y: 4000 }, c)!;
  check('페이지 밖으로 끌어도 0~1 로 잘린다',
    out.x === 0 && out.y === 0 && near(out.w, 1) && near(out.h, 1), JSON.stringify(out));
  check('clamp01', clamp01(-1) === 0 && clamp01(2) === 1 && clamp01(0.5) === 0.5);
}

// ── PDF 는 원점이 좌하단 ────────────────────────────────────────────────────
{
  const page = { width: 595, height: 842 };            // A4 pt
  const rect = { x: 0.1, y: 0.1, w: 0.2, h: 0.05 };    // 위쪽에 있는 박스

  const px = rectToPixels(rect, page);
  check('픽셀 변환', near(px.x, 59.5) && near(px.y, 84.2) && near(px.w, 119) && near(px.h, 42.1));

  const pdf = rectToPdf(rect, page);
  check('PDF x 는 그대로', near(pdf.x, 59.5));
  // y = 842 - 84.2 - 42.1 = 715.7 (위쪽 박스 = PDF 에서 큰 y)
  check('PDF y 가 뒤집힌다', near(pdf.y, 715.7), String(pdf.y));
  check('PDF 크기는 그대로', near(pdf.w, 119) && near(pdf.h, 42.1));

  // 뒤집기를 빠뜨리면 위/아래가 대칭 이동한다 — 가운데 박스에서는 티가 안 난다
  const middle = { x: 0.4, y: 0.475, w: 0.2, h: 0.05 };
  const mid = rectToPdf(middle, page);
  check('가운데 박스는 뒤집어도 거의 그대로(그래서 눈으로 못 잡는다)',
    Math.abs(mid.y - rectToPixels(middle, page).y) < 2, String(mid.y));
}

// ── HWPUNIT ────────────────────────────────────────────────────────────────
{
  check('HWPUNIT = 1/7200 inch', HWPUNIT_PER_INCH === 7200);
  // A4 = 8.27 x 11.69 inch ≈ 59528 x 84188 HU
  const hu = rectToHwpUnit({ x: 0.5, y: 0.25, w: 0.1, h: 0.05 }, { widthHu: 59528, heightHu: 84188 });
  check('HWPUNIT 변환', near(hu.x, 29764) && near(hu.y, 21047) && near(hu.w, 5952.8),
    JSON.stringify(hu));
}

// ══ 비율 유지 ══════════════════════════════════════════════════════════════
{
  // 가로로 긴 서명(600x200)을 정사각 칸(100x100)에
  const box = { x: 10, y: 20, w: 100, h: 100 };
  const fit = fitContain({ width: 600, height: 200 }, box);
  check('가로가 칸을 채운다', near(fit.w, 100), String(fit.w));
  check('세로는 비율대로 줄어든다', near(fit.h, 100 / 3), String(fit.h));
  check('종횡비 보존', near(fit.w / fit.h, 3), String(fit.w / fit.h));
  check('세로 가운데 정렬', near(fit.y, 20 + (100 - 100 / 3) / 2), String(fit.y));
  check('가로는 꽉 차서 x 그대로', near(fit.x, 10));

  // 세로로 긴 서명
  const tall = fitContain({ width: 100, height: 400 }, box);
  check('세로가 칸을 채운다', near(tall.h, 100));
  check('가로 가운데 정렬', near(tall.x, 10 + (100 - 25) / 2), String(tall.x));

  // 칸보다 작은 서명도 **칸에 맞춰 키운다**(작게 찍히면 안 보인다)
  const small = fitContain({ width: 10, height: 10 }, box);
  check('작은 서명도 칸 크기로 확대', near(small.w, 100) && near(small.h, 100));

  check('0 크기 입력은 안전', fitContain({ width: 0, height: 0 }, box).w === 0);
}

// ══ 배치 검증 ══════════════════════════════════════════════════════════════
{
  check('정상 page-box', isValidPlacement({ kind: 'page-box', page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1 }));
  check('정상 hwpx-cell', isValidPlacement({ kind: 'hwpx-cell', label: '교감' }));
  check('빈 라벨 거부', !isValidPlacement({ kind: 'hwpx-cell', label: '  ' }));
  check('음수 페이지 거부', !isValidPlacement({ kind: 'page-box', page: -1, x: 0.1, y: 0.1, w: 0.2, h: 0.1 }));
  check('소수 페이지 거부', !isValidPlacement({ kind: 'page-box', page: 1.5, x: 0.1, y: 0.1, w: 0.2, h: 0.1 }));
  check('페이지 넘는 박스 거부', !isValidPlacement({ kind: 'page-box', page: 0, x: 0.9, y: 0.1, w: 0.2, h: 0.1 }));
  check('너무 작은 박스 거부',
    !isValidPlacement({ kind: 'page-box', page: 0, x: 0.1, y: 0.1, w: MIN_BOX_SIZE / 2, h: 0.1 }));
  check('알 수 없는 kind 거부', !isValidPlacement({ kind: 'whatever' }));
  check('null 안전', !isValidPlacement(null) && !isValidPlacement(undefined));
  check('NaN 거부', !isValidPlacement({ kind: 'page-box', page: 0, x: NaN, y: 0.1, w: 0.2, h: 0.1 }));

  const parsed = parsePlacements([
    { kind: 'page-box', page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
    { kind: 'garbage' },
    { kind: 'hwpx-cell', label: '부장' },
  ]);
  check('잘못된 항목만 걸러 낸다', parsed.length === 2, String(parsed.length));
  check('배열이 아니면 빈 배열', parsePlacements('nope').length === 0);
}

// ══ 진행 판정 ══════════════════════════════════════════════════════════════
const box = [{ kind: 'page-box' as const, page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1 }];
const signer = (
  id: string, name: string, orderIndex: number,
  status: SignerLike['status'] = 'pending', userId: string | null = `u-${id}`,
): SignerLike => ({
  id, orderIndex, roleLabel: null, signerUserId: userId, signerName: name, status, fields: box,
});

{
  check('단독', flowShape([signer('a', 'A', 0)]) === 'single');
  check('동시 = 순번이 모두 같다',
    flowShape([signer('a', 'A', 0), signer('b', 'B', 0), signer('c', 'C', 0)]) === 'parallel');
  check('순차 = 순번이 모두 다르다',
    flowShape([signer('a', 'A', 0), signer('b', 'B', 1)]) === 'sequential');
  check('혼합',
    flowShape([signer('a', 'A', 0), signer('b', 'B', 0), signer('c', 'C', 1)]) === 'mixed');

  const groups = groupSigners([signer('c', 'C', 1), signer('a', 'A', 0), signer('b', 'B', 0)]);
  check('그룹은 순번 오름차순', groups.map(g => g.orderIndex).join(',') === '0,1');
  check('그룹 안은 이름순(화면 안정)', groups[0].signers.map(s => s.signerName).join(',') === 'A,B');
}

// ── 동시 서명: 한 명이 해도 차례가 넘어가지 않는다 ─────────────────────────
{
  const s = [signer('a', 'A', 0, 'signed'), signer('b', 'B', 0), signer('c', 'C', 1)];
  check('그룹 0 이 아직 안 끝나면 차례는 0', activeOrder(s) === 0, String(activeOrder(s)));

  const done = [signer('a', 'A', 0, 'signed'), signer('b', 'B', 0, 'signed'), signer('c', 'C', 1)];
  check('그룹 전원이 끝나야 다음 그룹', activeOrder(done) === 1, String(activeOrder(done)));

  const all = done.map(x => ({ ...x, status: 'signed' as const }));
  check('전원 끝나면 null', activeOrder(all) === null);
}

// ── 순번이 0부터 시작하지 않아도 동작한다 ──────────────────────────────────
{
  const s = [signer('a', 'A', 5), signer('b', 'B', 9)];
  check('첫 차례 = 가장 작은 순번', activeOrder(s) === 5, String(activeOrder(s)));
}

// ── 내 차례 ────────────────────────────────────────────────────────────────
{
  const s = [signer('a', 'A', 0), signer('b', 'B', 1)];
  check('그룹 0 의 A 는 차례', myTurn(s, 'pending', { userId: 'u-a', name: 'A' }).isMyTurn);

  const b = myTurn(s, 'pending', { userId: 'u-b', name: 'B' });
  check('그룹 1 의 B 는 대기', !b.isMyTurn && b.reason === 'waiting-turn', String(b.reason));

  const other = myTurn(s, 'pending', { userId: 'u-x', name: 'X' });
  check('배정 안 된 사람', !other.isMyTurn && other.reason === 'not-assigned');

  const closed = myTurn(s, 'completed', { userId: 'u-a', name: 'A' });
  check('종료된 요청', !closed.isMyTurn && closed.reason === 'closed');

  const acted = myTurn([signer('a', 'A', 0, 'signed'), signer('b', 'B', 0)], 'pending',
    { userId: 'u-a', name: 'A' });
  check('이미 서명함', !acted.isMyTurn && acted.reason === 'already-acted');

  // 계정 연결이 없는 사람 — 이름 폴백(서버 RPC 와 같은 규칙)
  const byName = myTurn([signer('a', 'A', 0, 'pending', null)], 'pending',
    { userId: 'u-zzz', name: 'A' });
  check('user_id 가 없으면 이름으로 판정', byName.isMyTurn);
  const wrongName = myTurn([signer('a', 'A', 0, 'pending', null)], 'pending',
    { userId: 'u-zzz', name: '다른사람' });
  check('이름이 다르면 배정 아님', !wrongName.isMyTurn && wrongName.reason === 'not-assigned');
}

// ── 진행률 ─────────────────────────────────────────────────────────────────
{
  const p = signProgress([signer('a', 'A', 0, 'signed'), signer('b', 'B', 0), signer('c', 'C', 1)]);
  check('진행률', p.total === 3 && p.signed === 1 && p.percent === 33, JSON.stringify(p));
  check('대기 목록은 현재 그룹만', p.waitingOn.join(',') === 'B', p.waitingOn.join(','));
  check('빈 목록 안전', signProgress([]).percent === 0);
}

// ── 저장 전 검증 ───────────────────────────────────────────────────────────
{
  check('서명자 없음', validateSigners([]) !== null);
  check('정상', validateSigners([{ signerName: 'A', orderIndex: 0, fields: box }]) === null);

  const noField = validateSigners([{ signerName: 'A', orderIndex: 0, fields: [] }]);
  check('칸 없는 서명자는 거부(서명해도 문서에 안 찍힌다)',
    noField !== null && noField.includes('위치'), String(noField));

  check('중복 이름 거부',
    validateSigners([
      { signerName: 'A', orderIndex: 0, fields: box },
      { signerName: 'A', orderIndex: 1, fields: box },
    ]) !== null);

  check('빈 이름 거부', validateSigners([{ signerName: '  ', orderIndex: 0, fields: box }]) !== null);
  check('음수 순번 거부', validateSigners([{ signerName: 'A', orderIndex: -1, fields: box }]) !== null);
}

// ══ Storage 키 ════════════════════════════════════════════════════════════
//
// Supabase Storage 의 객체명 검증은 ASCII 기반이라(`\w` = [A-Za-z0-9_]) 한글이 키에
// 들어가면 `Invalid key` 로 업로드가 **거부된다**. 실제로 겪었다:
//   `<id>/source-2026학년도 샘플여자고 교과 수업공개 계획.pdf`
// 그래서 키에는 원본 파일명을 넣지 않는다. 보여 줄 이름은 DB(`source_name`)에 있다.
{
  const id = 'f1144685-9388-4a40-9d35-cb5dc5a6b97a';
  const korean = '2026학년도 샘플여자고 교과 수업공개 계획.pdf';

  const src = sourceObjectPath(id, korean);
  const signed = signedObjectPath(id, korean);

  check('키에 한글이 없다', !/[^ -]/.test(src), src);
  check('키에 공백이 없다', !src.includes(' '), src);
  check('첫 세그먼트가 요청 id (RLS 가 이걸로 판정한다)', src.split('/')[0] === id, src);
  check('원본/완성본이 다른 키', src !== signed);
  check('확장자는 보존', src.endsWith('.pdf') && signed.endsWith('.pdf'), `${src} / ${signed}`);

  // 확장자가 이상하면 아예 붙이지 않는다(키에 쓰레기를 남기지 않는다)
  check('확장자 없는 파일', sourceObjectPath(id, '문서') === `${id}/source`);
  check('한글 확장자는 버린다', sourceObjectPath(id, '문서.한글') === `${id}/source`);
  check('대문자 확장자는 소문자로', sourceObjectPath(id, 'A.PDF') === `${id}/source.pdf`);
  check('긴 확장자는 버린다', sourceObjectPath(id, 'a.verylongextension') === `${id}/source`);
  check('점만 있는 이름', sourceObjectPath(id, '.') === `${id}/source`);
  check('hwpx 보존', sourceObjectPath(id, '계획.hwpx') === `${id}/source.hwpx`);

  // 어떤 입력이든 Supabase 가 받는 문자만 남아야 한다
  for (const name of ['a b.png', '가/나.jpg', 'x?y.pdf', '%%%.hwpx', '', '..']) {
    const key = sourceObjectPath(id, name);
    check(`안전한 키: ${JSON.stringify(name)}`, /^[A-Za-z0-9/_.-]+$/.test(key), key);
  }
}

// ══ 문서 형식 판정 ═════════════════════════════════════════════════════════
//
// 실제 사고(2026-09-04): `.hwp` 를 'hwpx' 로 분류해 통과시킨 탓에, 서명을 다 받은 뒤
// 완성본을 구울 때 JSZip 이 "Can't find end of central directory" 를 던졌다.
// `.hwpx` 는 zip(OPC) 이지만 `.hwp` 는 한글 97~2007 의 복합 바이너리(CFB)라 완전히 다른
// 포맷이고, 이 기능의 한글 처리는 전부 zip 전제다. **가장 나쁜 시점에 터지는** 종류라
// 판정 자체를 못 박는다.
{
  check('.hwpx 는 hwpx', detectSourceKind('계획.hwpx') === 'hwpx');
  check('.hwp 는 거절 (zip 이 아니다)', detectSourceKind('계획.hwp') === null);
  check('.HWP 대문자도 거절', detectSourceKind('계획.HWP') === null);
  check('.pdf 는 pdf', detectSourceKind('계획.pdf') === 'pdf');
  check('.png 는 image', detectSourceKind('사인.png') === 'image');
  check('확장자 없이 MIME 폴백(image)', detectSourceKind('scan', 'image/png') === 'image');
  check('확장자 없이 MIME 폴백(pdf)', detectSourceKind('scan', 'application/pdf') === 'pdf');
  check('알 수 없는 형식은 거절', detectSourceKind('계획.docx') === null);
  // MIME 이 hwp 를 되살리면 안 된다 — 브라우저가 임의 MIME 을 붙이는 경우가 있다
  check('.hwp 는 MIME 이 있어도 거절',
    detectSourceKind('계획.hwp', 'application/x-hwp') === null);

  // 거절 사유는 **무엇을 하면 되는지**까지 말해야 한다
  check('.hwp 안내에 hwpx 저장법', sourceRejectReason('계획.hwp').includes('hwpx'));
  check('docx 안내에 PDF', sourceRejectReason('계획.docx').includes('PDF'));
  check('알 수 없는 형식은 기본 안내', sourceRejectReason('계획.zip').includes('한글(hwpx)'));
}

// ══ zip 서명 확인 (날인 단계 방어막) ═══════════════════════════════════════
{
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]);
  const emptyZip = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0]);
  // .hwp = OLE2 복합 문서 시그니처
  const hwp = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
  check('zip 로컬 헤더 통과', looksLikeZip(zip));
  check('빈 zip 통과', looksLikeZip(emptyZip));
  check('.hwp(OLE2) 차단', !looksLikeZip(hwp));
  check('PDF 차단', !looksLikeZip(new Uint8Array([0x25, 0x50, 0x44, 0x46])));
  check('너무 짧으면 차단', !looksLikeZip(new Uint8Array([0x50, 0x4b])));
}

/* ── 서명 마감(2026-10-25) — 화면 판정과 서버 SQL 의 짝 ── */
{
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date('2026-10-25T03:00:00Z');
  const base = { createdAt: '2026-10-20T00:00:00Z', decidedAt: null, purgedAt: null, meta: {} };
  const due = '2026-11-10T09:00:00Z';
  check('진행 중 = 마감에 정리', purgeDeadline({ ...base, status: 'pending', dueAt: due })?.toISOString() === new Date(due).toISOString());
  check('진행 중인데 마감이 없으면(옛 캐시) 요청 후 7일',
    purgeDeadline({ ...base, status: 'pending' })?.getTime() === new Date(base.createdAt).getTime() + PURGE_DAYS * DAY);
  check('완료 = 마감과 무관하게 완료 후 7일',
    purgeDeadline({ ...base, status: 'completed', decidedAt: '2026-10-22T00:00:00Z', dueAt: due })?.getTime()
      === new Date('2026-10-22T00:00:00Z').getTime() + PURGE_DAYS * DAY);
  check('Drive 로 옮겼으면 대상 아님', purgeDeadline({ ...base, status: 'pending', dueAt: due, meta: { drive: {} } }) === null);
  check('기본 마감 = 7일 뒤', defaultDueAt(now).getTime() === now.getTime() + PURGE_DAYS * DAY);
  check('1시간 안은 거부', dueError(new Date(now.getTime() + 30 * 60 * 1000), null, now) !== null);
  check('새 요청 60일 뒤는 통과', dueError(new Date(now.getTime() + DUE_MAX_DAYS * DAY - 1000), null, now) === null);
  check('새 요청 60일 넘으면 거부', dueError(new Date(now.getTime() + DUE_MAX_DAYS * DAY + 60_000), null, now) !== null);
  check('고칠 때 최대 = 요청 시각 + 60일', dueRange(base.createdAt, now).max.getTime() === new Date(base.createdAt).getTime() + DUE_MAX_DAYS * DAY);
  check('날짜가 아니면 거부', dueError(new Date('x'), null, now) !== null);

  // 숫자 짝 — 화면 상수와 마이그레이션의 값이 같아야 화면이 기한을 바르게 말한다
  const sql = readFileSync(new URL('../../supabase/migrations/20261025160000_signature_due_date.sql', import.meta.url), 'utf8');
  check('최대 일수 짝(signature_due_max_days)', sql.includes(`immutable as $$ select ${DUE_MAX_DAYS} $$`));
  check('기본 마감 짝(7 days)', sql.includes(`now() + interval '${PURGE_DAYS} days'`));
  check('최소 여유 짝(1 hour)', sql.includes("p_due_at < now() + interval '1 hour'"));
}

console.log(`${pass} passed, ${fail} failed`);
console.log(fail === 0 ? 'OK' : 'FAILED');
process.exit(fail === 0 ? 0 : 1);
