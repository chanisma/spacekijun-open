import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Ban, Check, CheckCircle2, Clock, KeyRound, LayoutGrid, Loader2, Monitor, Plus, Presentation, QrCode,
  Settings2, ShieldCheck, TimerOff, UserX,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SectionLabel } from '@/components/tasks/dialogDesign';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUnifiedAuth } from '@/services/unifiedAuth';
import { useTodayTimetable } from '@/hooks/useTodayTimetable';
import { preloadGoogleIdentity } from '@/services/googleIdentityPopup';
import { cn } from '@/lib/utils';
import { requestClassroomDriveToken } from './driveToken';
import { toast } from '@/lib/toast';
import { PRESETS_KEY, approveLink, inspectLink, listPresets, stopLink, type LinkInfo } from './classroomLinkService';
import { itemLabel, needsDrive, orderPresets, suggestedPresetId, type ClassroomPreset } from './presetItems';
import { FixedDockIcon, ItemIcon } from './components/ItemIcon';
import { useAutoCloseTab, useSupersededTab } from './phoneTab';
import { CloseTabNote } from './components/CloseTabNote';

type Icon = ComponentType<{ className?: string }>;

const CLOSED: Partial<Record<LinkInfo['status'], { icon: Icon; title: string; text: string }>> = {
  expired: { icon: TimerOff, title: 'QR 이 만료됐습니다', text: '교실 화면에 새로 뜬 QR 을 다시 찍어 주세요.' },
  cancelled: { icon: Ban, title: '취소된 QR 입니다', text: '교실 화면에 새로 뜬 QR 을 다시 찍어 주세요.' },
  taken: { icon: UserX, title: '이미 연결된 QR 입니다', text: '다른 선생님이 이 QR 로 먼저 연결했습니다.' },
  unknown: { icon: QrCode, title: 'QR 을 알아보지 못했습니다', text: '교실 화면의 QR 을 다시 찍어 주세요.' },
  ended: { icon: CheckCircle2, title: '수업이 끝났습니다', text: '교실 기기가 열린 창과 받은 파일, 로그인을 정리합니다.' },
};

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

/** 1초마다 다시 그린다 — QR 남은 시간 */
function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return now;
}

/**
 * 교실 기기 QR 을 찍으면 열리는 승인 화면 — /classroom/link/:code
 * 휴대폰에서 쓰는 화면이라 한 줄 흐름: 기기 확인 → 세팅 고르기 → 옵션 → 아래에 붙은 [이 기기에 펼치기].
 * 단추 높이 48px(휴대폰), 세팅 카드는 교실 독 미리 보기(실제 아이콘)로 보여 준다.
 */
export default function ClassroomLinkBody() {
  const { code = '' } = useParams();
  const { user } = useAuth();
  const { user: authUser } = useUnifiedAuth();
  const resourceId = authUser?.primaryResource?.id ?? null;
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ title: string; device_name: string; ends_at: string } | null>(null);
  // 교실 독의 «내 드라이브» — 기본으로 켠다. 끄면 드라이브 항목이 없는 세팅만 펼칠 수 있다.
  const [connectDrive, setConnectDrive] = useState(true);
  // A+ — 이 교실 PC 에 구글 로그인을 암호화해 남겨 다음 수업엔 로그인된 채(열쇠는 서버, QR 승인 때만)
  const [keepGoogle, setKeepGoogle] = useState(true);
  const [driveMissing, setDriveMissing] = useState(false);

  const { data: presets = [], isLoading: presetsLoading } = useQuery({ queryKey: PRESETS_KEY, queryFn: listPresets });
  const { data: today = [] } = useTodayTimetable(resourceId);
  const currentSection = today.find((slot) => slot.isCurrent)?.section_name ?? null;
  const ordered = useMemo(() => orderPresets(presets, currentSection), [presets, currentSection]);

  useEffect(() => {
    let alive = true;
    inspectLink(code)
      .then((value) => { if (alive) setInfo(value); })
      .catch((error: Error) => { if (alive) { setInfo({ status: 'unknown' }); toast.error(error.message); } });
    void preloadGoogleIdentity().catch(() => { /* 승인할 때 다시 시도 */ });
    return () => { alive = false; };
  }, [code]);

  useEffect(() => {
    if (selected === null && ordered.length) setSelected(suggestedPresetId(ordered, currentSection));
  }, [ordered, currentSection, selected]);

  const pending = !done && info?.status === 'pending';
  const now = useNow(pending && !!info?.expires_at);
  const secondsLeft = pending && info?.expires_at ? Math.max(0, Math.floor((Date.parse(info.expires_at) - now) / 1000)) : null;
  // QR 이 다 됐으면 서버에 다시 물어 «만료» 화면으로
  useEffect(() => {
    if (secondsLeft !== 0) return;
    inspectLink(code).then(setInfo).catch(() => {});
  }, [secondsLeft, code]);

  const chosen = presets.find((p) => p.id === selected) ?? null;
  const driveRequired = !!chosen && needsDrive(chosen.items);

  const approve = async () => {
    const preset = presets.find((p) => p.id === selected);
    if (!preset || !user) return;
    setBusy(true);
    try {
      // 늘 새로 받는다(1시간) — 이미 허용했으면 구글 창이 바로 닫힌다. 단추를 누른 직후에 불러야 팝업이 안 막힌다.
      const googleToken = connectDrive || needsDrive(preset.items) ? await requestClassroomDriveToken() : null;
      if (!googleToken && needsDrive(preset.items)) {
        throw new Error('이 세팅에는 드라이브 항목이 있어 구글 허용이 필요합니다. 구글 창이 막혔거나 닫혔으면 다시 눌러 주세요.');
      }
      const result = await approveLink(code, preset.id, googleToken, keepGoogle);
      setDriveMissing(connectDrive && !googleToken);
      setDone(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '승인하지 못했습니다.');
      inspectLink(code).then(setInfo).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  // 수업 중 «드라이브 다시 연결» QR — 세팅을 고르지 않고 구글 토큰만 새로 넘긴다
  const reconnectDrive = async () => {
    setBusy(true);
    try {
      const googleToken = await requestClassroomDriveToken();
      if (!googleToken) throw new Error('구글 허용 창이 막혔거나 닫혔습니다. 다시 눌러 주세요.');
      setDone(await approveLink(code, null, googleToken));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '연결하지 못했습니다.');
      inspectLink(code).then(setInfo).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const stop = async (label: string) => {
    setBusy(true);
    try {
      await stopLink(code);
      toast.success(label);
      setInfo(await inspectLink(code));
      setDone(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const active = !!info && (!!done || info.status === 'approved' || info.status === 'active');
  const endsAt = done?.ends_at ?? info?.ends_at ?? null;
  const isDrive = info?.purpose === 'drive';
  // 로그인 보관은 기기마다(Windows: 수업용 Edge 프로필, 전자칠판: 앱 안 브라우저 — 안드로이드 1.3.0)
  const deviceWord = info?.platform === 'android' ? '칠판' : 'PC';
  const choosing = pending && !isDrive && !presetsLoading && ordered.length > 0;
  // 휴대폰 탭 정리(2026-10-14) — 드라이브 다시 연결을 마쳤거나 끝난·만료된 연결이면 잠시 뒤 닫는다. 수업 중 화면은
  // «여기서 수업 끝내기»가 있어 두고, 다음 QR 을 찍으면(새 승인 화면이 열리면) 닫는다(승인하는 중이 아니면).
  const finished = (isDrive && !!done) || (!!info && !active && info.status !== 'pending' && info.status !== 'unknown');
  const tab = useAutoCloseTab(finished, 4000);
  useSupersededTab(info && info.status !== 'unknown' ? (isDrive ? 'drive' : 'link') : null, () => !busy);

  return (
    <>
      <div className="mx-auto w-full max-w-xl space-y-4 sm:space-y-5">
        {info && info.status !== 'unknown' && (
          <DeviceCard info={info} secondsLeft={secondsLeft} connected={active} />
        )}

        {!info ? (
          <div className="flex flex-col items-center gap-3 py-24 text-sm text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />교실 기기를 확인하는 중…
          </div>
        ) : active ? (
          <ConnectedPanel
            isDrive={isDrive}
            title={done?.title ?? presets.find((p) => p.id === info.preset_id)?.title ?? null}
            endsAt={endsAt}
            driveMissing={driveMissing}
            busy={busy}
            onStop={() => stop('수업을 끝냈습니다. 교실 기기가 곧 정리합니다.')}
            closeNote={<CloseTabNote closing={tab.closing} failed={tab.failed} onClose={tab.closeNow} />}
          />
        ) : info.status !== 'pending' ? (
          <ClosedPanel status={info.status}
            closeNote={<CloseTabNote closing={tab.closing} failed={tab.failed} onClose={tab.closeNow} />} />
        ) : isDrive ? (
          <section className="rounded-2xl border bg-card p-5 text-center shadow-sm sm:p-6">
            <FixedDockIcon kind="drive" size="lg" />
            <h2 className="mt-3 text-base font-semibold text-slate-800 dark:text-slate-100">드라이브를 다시 연결할까요?</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">
              수업 중인 이 기기의 «내 드라이브»를 1시간 더 쓸 수 있게 합니다. 구글 허용 창이 잠깐 뜹니다.
            </p>
            <Button className="mt-5 h-12 w-full gap-2 bg-blue-600 text-base hover:bg-blue-700 sm:h-11 sm:text-sm" disabled={busy} onClick={reconnectDrive}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}드라이브 다시 연결
            </Button>
            <p className="mt-3 text-xs text-slate-400">이 기기에서 수업을 시작한 선생님만 연결할 수 있습니다.</p>
          </section>
        ) : presetsLoading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-sm text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />세팅을 불러오는 중…
          </div>
        ) : ordered.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/50 px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
              <LayoutGrid className="h-7 w-7 text-blue-500" />
            </div>
            <h2 className="text-base font-semibold text-slate-700">아직 교실 세팅이 없습니다</h2>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-slate-500">
              반마다 드라이브 폴더·클래스룸·패들렛 같은 사이트를 묶어 두면, 다음부터 QR 한 번으로 교실 독에 놓입니다.
            </p>
            <Button asChild className="mt-5 h-12 gap-1.5 bg-blue-600 hover:bg-blue-700 sm:h-9">
              <Link to="/classroom"><Plus className="h-4 w-4" />세팅 만들기</Link>
            </Button>
          </div>
        ) : (
          <>
            <section className="space-y-2.5">
              <SectionLabel icon={LayoutGrid} trailing={<Link to="/classroom" className="text-xs text-slate-400 hover:text-blue-600">세팅 관리</Link>}>
                펼칠 세팅
              </SectionLabel>
              <div className="space-y-2.5" role="radiogroup" aria-label="교실 세팅">
                {ordered.map((preset) => (
                  <PresetChoice key={preset.id} preset={preset} checked={selected === preset.id}
                    now={!!currentSection && preset.section_name === currentSection}
                    onSelect={() => setSelected(preset.id)} />
                ))}
              </div>
            </section>

            <section className="space-y-2.5">
              <SectionLabel icon={Settings2}>이번 수업</SectionLabel>
              <div className="divide-y rounded-2xl border bg-card shadow-sm">
                <OptionRow
                  id="cl-drive"
                  icon={<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"><FixedDockIcon kind="drive" size="sm" /></span>}
                  title="내 구글 드라이브 연결"
                  text={driveRequired
                    ? '이 세팅에 드라이브 항목이 있어 켭니다. 독에서 드라이브를 폴더처럼 열고, 저장하면 드라이브에 올라갑니다.'
                    : '독에서 드라이브를 폴더처럼 열고, 저장하면 드라이브에 올라갑니다. 1시간 뒤엔 QR 로 이어 갑니다.'}
                  checked={connectDrive || driveRequired}
                  disabled={driveRequired}
                  onChange={setConnectDrive}
                />
                <OptionRow
                  id="cl-keep"
                  icon={<span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100"><KeyRound className="h-5 w-5" /></span>}
                  title={`이 ${deviceWord}에 로그인 보관`}
                  text={keepGoogle
                    ? `수업이 끝날 때 구글·패들렛 같은 사이트 로그인을 암호화해 이 ${deviceWord}에 남깁니다. 다음에 QR 로 승인하면 로그인된 채 열립니다. 열쇠는 서버에 있습니다.`
                    : `끄면 이 ${deviceWord}에 보관한 로그인을 지웁니다. 다음 수업엔 사이트마다 다시 로그인합니다.`}
                  checked={keepGoogle}
                  onChange={setKeepGoogle}
                />
              </div>
            </section>
          </>
        )}

        {choosing && (
          <div className="sticky bottom-2 z-10 -mx-1 rounded-2xl border bg-white/95 p-2.5 shadow-[0_-6px_20px_-10px_rgba(15,23,42,0.25)] backdrop-blur dark:bg-slate-950/95 sm:mx-0 md:bottom-4">
            <div className="flex gap-2">
              <Button variant="outline" className="h-12 px-5 text-slate-600 sm:h-11" disabled={busy}
                onClick={() => stop('연결을 거절했습니다.')}>
                거절
              </Button>
              <Button className="h-12 flex-1 gap-2 bg-blue-600 text-base font-semibold hover:bg-blue-700 sm:h-11 sm:text-sm"
                disabled={busy || !selected || secondsLeft === 0} onClick={approve}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Monitor className="h-4 w-4" />}
                이 기기에 펼치기
              </Button>
            </div>
            <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5" />교실 화면의 기기 이름이 위와 같은지 확인하고 누르세요
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/** 맨 위 — 어느 기기에 연결하는지(+ QR 남은 시간) */
function DeviceCard({ info, secondsLeft, connected }: { info: LinkInfo; secondsLeft: number | null; connected: boolean }) {
  const board = info.platform === 'android';
  const DeviceIcon = board ? Presentation : Monitor;
  const urgent = secondsLeft !== null && secondsLeft <= 30;
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-blue-600 to-indigo-600 p-4 text-white shadow-sm sm:p-5">
      <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" aria-hidden />
      <div className="relative flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
          <DeviceIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-blue-100">{info.purpose === 'drive' ? '드라이브를 이어 갈 기기' : connected ? '연결된 기기' : '연결할 교실 기기'}</p>
          <p className="truncate text-lg font-semibold leading-7">{info.device_name || '이름 없는 기기'}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium ring-1 ring-white/20">{board ? '전자칠판' : 'Windows PC'}</span>
          {secondsLeft !== null && (
            <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
              urgent ? 'bg-rose-500 text-white' : 'bg-white text-blue-700')} aria-label="QR 남은 시간">
              <Clock className="h-3 w-3" />
              {secondsLeft === 0 ? '만료' : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/** 세팅 하나 — 고르는 카드. 교실 독에 놓일 모습 그대로(구글 · 내 드라이브 | 항목) */
function PresetChoice({ preset, checked, now, onSelect }: {
  preset: ClassroomPreset; checked: boolean; now: boolean; onSelect: () => void;
}) {
  const shown = preset.items.slice(0, 6);
  const more = preset.items.length - shown.length;
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect}
      className={cn('block w-full rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-all active:scale-[0.99] sm:p-4',
        checked ? 'border-blue-500 ring-2 ring-blue-500/20' : 'hover:border-slate-300 hover:shadow-md')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-slate-800 dark:text-slate-100">{preset.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {preset.section_name
              ? <Badge variant="secondary" className="font-normal">{preset.section_name}</Badge>
              : <Badge variant="outline" className="font-normal">공통</Badge>}
            {now && <Badge className="bg-blue-600 hover:bg-blue-600">지금 수업</Badge>}
            <span className="text-[11px] text-slate-400">{preset.auto_end_minutes}분 뒤 정리</span>
          </div>
        </div>
        <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300')} aria-hidden>
          {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </span>
      </div>
      <div className={cn('mt-3 flex items-center gap-1.5 overflow-hidden rounded-xl px-2.5 py-2',
        checked ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'bg-slate-50 dark:bg-slate-900')}>
        <FixedDockIcon kind="google" size="sm" />
        <FixedDockIcon kind="drive" size="sm" />
        <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
        {shown.map((item, i) => <span key={i} title={itemLabel(item)}><ItemIcon item={item} size="sm" /></span>)}
        {more > 0 && <span className="text-xs text-slate-500">+{more}</span>}
      </div>
      <p className="mt-2 line-clamp-1 text-xs text-slate-500">{preset.items.map(itemLabel).join(' · ') || '구글 · 내 드라이브만'}</p>
    </button>
  );
}

function OptionRow({ id, icon, title, text, checked, disabled, onChange }: {
  id: string; icon: React.ReactNode; title: string; text: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void;
}) {
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-3 p-3.5 sm:p-4', disabled && 'cursor-default')}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{text}</span>
      </span>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-2.5 data-[state=checked]:bg-blue-600" />
    </label>
  );
}

/** 승인 뒤 — 펼쳤다는 확인 + 끝낼 시각 + 여기서 끝내기 */
function ConnectedPanel({ isDrive, title, endsAt, driveMissing, busy, onStop, closeNote }: {
  isDrive: boolean; title: string | null; endsAt: string | null; driveMissing: boolean; busy: boolean; onStop: () => void;
  closeNote?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50 dark:bg-emerald-950">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-slate-800 dark:text-slate-100">
          {isDrive ? '드라이브를 다시 연결했습니다' : '교실 화면에 펼쳤습니다'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isDrive ? '앞으로 1시간 더 «내 드라이브»를 쓸 수 있습니다.'
            : title ? <>«{title}» — 교실 화면 아래 독에서 여세요.</> : '교실 화면 아래 독에서 여세요.'}
        </p>
      </div>

      {driveMissing && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          구글 허용 창이 막혀 드라이브 없이 펼쳤습니다. 교실 독의 «내 드라이브»에서 QR 로 다시 연결할 수 있습니다.
        </p>
      )}

      {!isDrive && (
        <>
          {endsAt && (
            <div className="mt-5 flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
              <Clock className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-slate-700 dark:text-slate-200">{hhmm(endsAt)}에 자동으로 정리</p>
                <p className="text-xs text-slate-500">더 쓰려면 교실 화면에서 연장하세요.</p>
              </div>
            </div>
          )}
          <Button variant="outline" className="mt-4 h-12 w-full border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 sm:h-11"
            disabled={busy} onClick={onStop}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}여기서 수업 끝내기
          </Button>
          <p className="mt-2 text-center text-[11px] text-slate-400">고친 파일은 드라이브에 올리고, 열린 창과 받은 파일을 지웁니다.</p>
        </>
      )}
      {isDrive && closeNote}
    </section>
  );
}

function ClosedPanel({ status, closeNote }: { status: LinkInfo['status']; closeNote?: React.ReactNode }) {
  const closed = CLOSED[status] ?? CLOSED.unknown!;
  const StatusIcon = closed.icon;
  return (
    <section className="rounded-2xl border bg-card px-5 py-10 text-center shadow-sm">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800">
        <StatusIcon className="h-7 w-7" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-slate-800 dark:text-slate-100">{closed.title}</h2>
      <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-slate-500">{closed.text}</p>
      <Button asChild variant="outline" className="mt-5 h-12 sm:h-9">
        <Link to="/classroom">교실 세팅 관리</Link>
      </Button>
      {closeNote}
    </section>
  );
}
