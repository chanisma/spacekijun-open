import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { CheckCircle2, KeyRound, Loader2, Lock, Monitor, ShieldCheck, TimerOff, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { ClassroomLinkError, inspectType, submitType, type TypeInfo } from './classroomLinkService';
import { sealForDevice } from './typeCrypto';
import { useAutoCloseTab, useSupersededTab } from './phoneTab';
import { CloseTabNote } from './components/CloseTabNote';

/**
 * 휴대폰으로 구글 비밀번호 입력 — /classroom/type/:code#k=<기기 공개키> (2026-10-14 사용자 결정)
 *
 * 교실 기기에서 구글 웹에 로그인할 때 칠판에서 비밀번호를 치면 학생들에게 보일 수 있어, 수업 중인 선생님 휴대폰에서 입력한다.
 * 비밀번호는 이 휴대폰에서 기기 공개키로 암호화해(typeCrypto.ts) 그 기기만 풀 수 있다. 서버는 암호문만 맡았다 넘기고 지운다.
 * 휴대폰의 비밀번호 관리자가 채울 수 있게 username · current-password 자동 완성을 둔다.
 */
export default function ClassroomTypeBody() {
  const { code = '' } = useParams();
  const { hash } = useLocation();
  const { user } = useAuth();
  const devicePub = useMemo(() => new URLSearchParams(hash.replace(/^#/, '')).get('k') ?? '', [hash]);
  const [info, setInfo] = useState<TypeInfo | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let alive = true;
    inspectType(code)
      .then((value) => { if (alive) setInfo(value); })
      .catch((e: Error) => { if (alive) { setInfo({ status: 'expired' }); setError(e.message); } });
    return () => { alive = false; };
  }, [code]);

  const send = async () => {
    if (!password || !devicePub) return;
    setBusy(true);
    setError('');
    try {
      const sealed = await sealForDevice(devicePub, code, password);
      setPassword('');
      await submitType(code, sealed);
      setSent(true);
    } catch (e) {
      setError(e instanceof ClassroomLinkError || e instanceof Error ? e.message : '보내지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const closed = info && info.status !== 'pending' && !sent;
  // 보냈으면 잠시 뒤 이 탭을 닫는다(만료·다른 선생님은 읽게 두고 [창 닫기]만) · 새 비밀번호 QR 을 찍으면 이 탭은 닫는다
  const tab = useAutoCloseTab(sent, 4000);
  useSupersededTab('type', () => !busy);
  return (
    <>
      <div className="mx-auto w-full max-w-md space-y-4">
        <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-blue-600 to-indigo-600 p-4 text-white shadow-sm sm:p-5">
          <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" aria-hidden />
          <div className="relative flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <Monitor className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-blue-100">구글 로그인할 교실 기기</p>
              <p className="truncate text-lg font-semibold leading-7">{info?.device_name || '교실 기기'}</p>
            </div>
          </div>
        </section>

        {!info ? (
          <div className="flex flex-col items-center gap-3 py-20 text-sm text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />확인하는 중…
          </div>
        ) : sent ? (
          <section className="rounded-2xl border bg-card p-6 text-center shadow-sm">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-slate-800">교실 기기로 보냈습니다</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              곧 교실 화면의 구글 로그인이 이어집니다. 이 휴대폰에 구글 확인 알림이 오면 «예»를 누르세요.
            </p>
            <CloseTabNote closing={tab.closing} failed={tab.failed} onClose={tab.closeNow} />
          </section>
        ) : closed ? (
          <section className="rounded-2xl border bg-card px-5 py-10 text-center shadow-sm">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              {info.status === 'not_session_teacher' ? <UserX className="h-7 w-7" /> : <TimerOff className="h-7 w-7" />}
            </span>
            <h2 className="mt-4 text-base font-semibold text-slate-800">
              {info.status === 'not_session_teacher' ? '수업 중인 선생님만 보낼 수 있습니다' : 'QR 이 만료됐습니다'}
            </h2>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-slate-500">
              {info.status === 'not_session_teacher'
                ? '이 교실 기기에서 수업을 연 선생님의 휴대폰으로 찍어 주세요.'
                : error || '교실 화면에서 «휴대폰으로 입력»을 다시 눌러 새 QR 을 찍어 주세요.'}
            </p>
            <CloseTabNote closing={false} failed onClose={tab.closeNow} text="이 창은 닫아도 됩니다." />
          </section>
        ) : !devicePub ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            QR 주소가 잘렸습니다. 교실 화면의 QR 을 카메라로 다시 찍어 주세요.
          </p>
        ) : (
          <form
            className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm"
            onSubmit={(e) => { e.preventDefault(); void send(); }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <KeyRound className="h-4 w-4 text-blue-600" />구글 비밀번호
            </div>
            {/* 비밀번호 관리자가 알아보게 — 계정은 보이지 않게 둔다 */}
            <input type="email" name="username" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
            <p className="text-sm text-slate-500">{user?.email}</p>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 w-full rounded-xl border bg-white px-4 text-base outline-none ring-blue-500 focus:ring-2"
              placeholder="비밀번호"
              autoFocus
            />
            {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            <Button type="submit" className="h-12 w-full gap-2 bg-blue-600 text-base font-semibold hover:bg-blue-700" disabled={busy || !password}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}교실 기기로 보내기
            </Button>
            <ul className="space-y-1.5 text-xs leading-5 text-slate-500">
              <li className="flex gap-1.5"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                비밀번호는 이 휴대폰에서 암호화되어 그 교실 기기만 풀 수 있습니다. 서버는 내용을 볼 수 없고 바로 지웁니다.</li>
              <li className="flex gap-1.5"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                교실 화면에는 비밀번호가 보이지 않습니다. 수업이 끝나면 그 기기의 구글 로그인도 지웁니다.</li>
            </ul>
          </form>
        )}
      </div>
    </>
  );
}
