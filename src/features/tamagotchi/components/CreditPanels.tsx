/**
 * Phase 2 — 코인 · 펫 일기 · 함께 집중 (2026-10-07). 기기 아래 한 줄(CreditBar) + 화면 위 대화상자 셋.
 *
 *  · 코인은 별빛 아카데미 코인과 같은 지갑이다(결정 #2) — 여기서는 «어떻게 받았나»만 보여 주고, 쓰는 곳은 공방·기숙사.
 *  · 펫 일기는 본인만 본다(결정 #6) — 그 사실을 입력칸 위에 글로 적고, 힘들었던 기억 아래에는 상담 연락처를 늘 둔다(§6-3).
 *  · 함께 집중의 시작·끝은 서버 시각이다 — 기기 시계를 돌려도, 탭을 띄워 두고 떠나도(끝난 뒤 15분 안에 돌아와야) 완주가 아니다.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coins, Gift, NotebookPen, Palette, Timer, Trash2, Users, Wand2, Home, Trophy, Medal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { fetchPlanner } from '@/features/planner/plannerService';
import { TamaDialog } from './AppChrome';
import { useDiaryList, type CreditController } from '../hooks/useCredit';
import {
  COUNSEL_CONTACTS, CREDIT_KINDS, CREDIT_RULES, DIARY_KINDS, DIARY_PRIVACY_NOTE, FOCUS_MINUTES, PLANNING_REWARD,
  focusProgress, mmss, type DiaryKind,
} from '../model/credit';
import { kstParts } from '../model/clock';
import { questionOf } from '../model/questions';
import { inviteLines, type FocusInvite } from '../model/focusInvite';
import type { DeviceStyle } from '../three/dims';

const panel = (style: DeviceStyle) => (style === 'classic' ? 'bg-white/10' : 'bg-white/65');
const primary = (style: DeviceStyle) => (style === 'classic' ? 'bg-white/90 text-indigo-950' : 'bg-violet-600 text-white');
const pill = (style: DeviceStyle, on: boolean) => cn('h-11 rounded-full px-4 text-[13px] transition',
  on ? primary(style) : style === 'classic' ? 'bg-white/10' : 'bg-white/60');

/** 1초마다 다시 그린다(켜져 있을 때만) */
function useSecond(on: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setN((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [on]);
}

// ── 기기 아래 한 줄 ────────────────────────────────────────────────────

export type PanelKind = 'coins' | 'diary' | 'focus' | 'gacha' | 'decor' | 'friends' | 'character' | 'pethouse' | 'longest' | 'achievements';

export function CreditBar({ style, credit, onOpen, friendsBadge = 0, eventOn = false, houseBadge = false, showAchievements = false }: {
  style: DeviceStyle; credit: CreditController; onOpen: (which: PanelKind) => void;
  /** 받은 교환 제안 수(Phase 5) */
  friendsBadge?: number;
  /** 펫 이벤트가 열려 있으면 가챠 단추에 표시 */
  eventOn?: boolean;
  /** 펫 자리가 비어 있으면(새 알을 받을 수 있으면) 펫 집 단추에 점(Phase 6) */
  houseBadge?: boolean;
  /** 업적(2026-10-19) — 아직 학생에게 열지 않아 관리자에게만 */
  showAchievements?: boolean;
}) {
  const data = credit.status.data;
  const focus = credit.focus;
  useSecond(!!focus);
  const progress = focus ? focusProgress(focus, credit.serverNow()) : null;
  const diaryLeft = data ? data.rules.diary.taken < data.rules.diary.cap : false;
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-2 text-[13px]" data-tama-credit-bar>
      <button type="button" onClick={() => onOpen('coins')} className="tama-chip flex h-11 items-center gap-1.5 rounded-full px-4">
        <Coins className="h-4 w-4" aria-hidden="true" />
        코인 <b className="tabular-nums">{data ? data.coins : '…'}</b>
      </button>
      <button type="button" onClick={() => onOpen('diary')} className="tama-chip relative flex h-11 items-center gap-1.5 rounded-full px-4">
        <NotebookPen className="h-4 w-4" aria-hidden="true" />
        펫 일기
        {diaryLeft && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-pink-500" aria-label="오늘 아직 안 씀" />}
      </button>
      <button type="button" onClick={() => onOpen('focus')}
        className={cn('tama-chip flex h-11 items-center gap-1.5 rounded-full px-4', progress?.phase === 'done' && 'ring-2 ring-pink-400')}>
        <Timer className="h-4 w-4" aria-hidden="true" />
        {!progress ? '함께 집중' : progress.phase === 'running' ? <>집중 <b className="tabular-nums">{mmss(progress.remainingMs)}</b></>
          : progress.phase === 'done' ? '집중 끝 — 끝내기' : '집중 기록 닫기'}
      </button>
      <button type="button" onClick={() => onOpen('gacha')} className={cn('tama-chip relative flex h-11 items-center gap-1.5 rounded-full px-4', eventOn && 'ring-2 ring-amber-300')}>
        <Gift className="h-4 w-4" aria-hidden="true" />
        가챠
        {eventOn && <span className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">이벤트</span>}
      </button>
      <button type="button" onClick={() => onOpen('decor')} className="tama-chip flex h-11 items-center gap-1.5 rounded-full px-4">
        <Palette className="h-4 w-4" aria-hidden="true" />
        꾸미기
      </button>
      <button type="button" onClick={() => onOpen('friends')} className="tama-chip relative flex h-11 items-center gap-1.5 rounded-full px-4">
        <Users className="h-4 w-4" aria-hidden="true" />
        친구
        {friendsBadge > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-pink-500 px-1 text-[11px] font-bold text-white" aria-label={`받은 교환 ${friendsBadge}건`}>{friendsBadge}</span>}
      </button>
      <button type="button" onClick={() => onOpen('pethouse')} className="tama-chip relative flex h-11 items-center gap-1.5 rounded-full px-4">
        <Home className="h-4 w-4" aria-hidden="true" />
        펫 집
        {houseBadge && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-pink-500" aria-label="빈 자리 있음" />}
      </button>
      {/* 오래 함께한 펫(2026-10-19 — «버튼을 바깥으로 빼고 난이도별로») */}
      <button type="button" onClick={() => onOpen('longest')} className="tama-chip flex h-11 items-center gap-1.5 rounded-full px-4" data-longest-open>
        <Trophy className="h-4 w-4" aria-hidden="true" />
        순위
      </button>
      {showAchievements && (
        <button type="button" onClick={() => onOpen('achievements')} className="tama-chip flex h-11 items-center gap-1.5 rounded-full px-4" data-achievements-open>
          <Medal className="h-4 w-4" aria-hidden="true" />
          업적
        </button>
      )}
      <button type="button" onClick={() => onOpen('character')} className="tama-chip flex h-11 items-center gap-1.5 rounded-full px-4">
        <Wand2 className="h-4 w-4" aria-hidden="true" />
        의뢰
      </button>
    </div>
  );
}

// ── 코인 ─────────────────────────────────────────────────────────────

export function CoinDialog({ open, onOpenChange, style, credit, onPayDebt }: {
  open: boolean; onOpenChange: (open: boolean) => void; style: DeviceStyle; credit: CreditController;
  /** 외상 갚기(Phase 3) */
  onPayDebt?: () => Promise<void>;
}) {
  const data = credit.status.data;
  const debt = data?.debt ?? 0;
  return (
    <TamaDialog open={open} onOpenChange={onOpenChange} style={style} title="코인" description="펫과 함께 받은 코인과 받는 방법" testId="coins">
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-[34px] font-bold leading-none tabular-nums">{data?.coins ?? '…'}<span className="ml-1 text-[14px] font-normal opacity-75">코인</span></p>
        <p className="text-right text-[11px] leading-4 opacity-75">별빛 아카데미 코인과<br />같은 지갑 · 공방·기숙사에서 써요</p>
      </div>
      {debt > 0 && (
        <div className={cn('mt-3 flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-[12px]', panel(style))} data-tama-debt>
          <span><b>외상 {debt}코인</b> <span className="opacity-75">치료제 값 · 코인을 받으면 먼저 갚아요 · 갚기 전엔 가챠를 못 해요</span></span>
          {onPayDebt && <button type="button" onClick={() => { void onPayDebt(); }} disabled={!data?.coins}
            className={cn('h-10 shrink-0 rounded-full px-4 font-bold disabled:opacity-40', primary(style))}>갚기</button>}
        </div>
      )}
      <p className="mt-4 text-[12px] font-bold">오늘 받은 코인</p>
      <ul className="mt-1.5 space-y-1.5 text-[12px]">
        {CREDIT_KINDS.map((k) => {
          const rule = CREDIT_RULES[k];
          const live = data?.rules[k];
          const taken = live?.taken ?? 0;
          const cap = live?.cap ?? rule.cap;
          return (
            <li key={k} className={cn('flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2', panel(style))}>
              <span className="min-w-0 flex-1"><b>{rule.label}</b> <span className="opacity-75">{rule.how} +{live?.amount ?? rule.amount}</span></span>
              <span className="shrink-0 tabular-nums" aria-label={`오늘 ${taken}번 / 하루 ${cap}번`}>
                {Array.from({ length: cap }, (_, i) => (i < taken ? '●' : '○')).join('')}
              </span>
            </li>
          );
        })}
        <li className={cn('flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2 opacity-90', panel(style))}>
          <span className="min-w-0 flex-1"><b>오늘 완료</b> <span className="opacity-75">플래너에서 오늘 계획을 끝내면 +{PLANNING_REWARD}</span></span>
          <span className="shrink-0">{data?.planning_reward_today ? '●' : '○'}</span>
        </li>
      </ul>
      <p className="mt-2 text-[11px] leading-5 opacity-75">
        펫이 있는 동안 받아요. 하루에 받을 수 있는 횟수가 정해져 있어요(●가 다 차면 내일 다시). 같은 일로 두 번 받지 않아요.
      </p>
      {!!data?.recent.length && (
        <>
          <p className="mt-3 text-[12px] font-bold">최근</p>
          <ul className="mt-1 max-h-36 space-y-1 overflow-y-auto text-[12px]">
            {data.recent.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex justify-between gap-2">
                <span className="opacity-75">{r.earned_on.slice(5).replace('-', '/')}</span>
                <span className="min-w-0 flex-1 truncate">{CREDIT_RULES[r.kind]?.label ?? r.kind}</span>
                <span className="tabular-nums">+{r.amount}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </TamaDialog>
  );
}

// ── 펫 일기 ──────────────────────────────────────────────────────────

export function DiaryDialog({ open, onOpenChange, style, credit, onWritten }: {
  open: boolean; onOpenChange: (open: boolean) => void; style: DeviceStyle; credit: CreditController;
  onWritten: (kind: DiaryKind, credit: number) => void;
}) {
  const [kind, setKind] = useState<DiaryKind>('good');
  const [body, setBody] = useState('');
  const list = useDiaryList(open);
  const meta = DIARY_KINDS.find((d) => d.kind === kind)!;
  const todayQuestion = questionOf(kstParts(credit.serverNow()).date);
  const pending = credit.writeDiary.isPending;

  const submit = async () => {
    const text = body.trim();
    if (!text || pending) return;
    try {
      const r = await credit.writeDiary.mutateAsync({ kind, body: text, prompt: kind === 'question' ? todayQuestion : null });
      setBody('');
      onWritten(kind, r.credit);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '일기를 저장하지 못했어요.');
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm('이 일기를 지울까요? 되돌릴 수 없어요.')) return;
    try { await credit.deleteDiary.mutateAsync(id); } catch (e) { toast.error(e instanceof Error ? e.message : '지우지 못했어요.'); }
  };

  return (
    <TamaDialog open={open} onOpenChange={onOpenChange} style={style} title="펫 일기" description="펫에게 들려주는 나만의 일기" testId="diary">
      <div role="radiogroup" aria-label="일기 종류" className={cn('mt-3 grid grid-cols-2 gap-1 rounded-3xl p-1 text-[12px] sm:grid-cols-4 sm:rounded-full', panel(style))}>
        {DIARY_KINDS.map((d) => (
          <button key={d.kind} type="button" role="radio" aria-checked={kind === d.kind} onClick={() => setKind(d.kind)}
            className={cn('h-10 rounded-full px-1', kind === d.kind ? primary(style) : 'opacity-80')}>{d.label}</button>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-5 opacity-80">{DIARY_PRIVACY_NOTE}</p>
      <label className="mt-2 block text-[13px] font-bold" htmlFor="tama-diary-body">{kind === 'question' ? <>오늘의 질문 · <span className="font-normal">{todayQuestion}</span></> : meta.prompt}</label>
      <textarea id="tama-diary-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={3}
        placeholder={meta.placeholder}
        className={cn('mt-1.5 w-full resize-none rounded-2xl border-0 px-3 py-2.5 text-[16px] leading-6 outline-none ring-1 focus:ring-2',
          style === 'classic' ? 'bg-white/10 text-indigo-50 ring-white/20 placeholder:text-indigo-200/60 focus:ring-white/60'
            : 'bg-white/80 text-violet-950 ring-violet-200 placeholder:text-violet-400 focus:ring-violet-500')} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] tabular-nums opacity-60">{body.length}/500</span>
        <button type="button" onClick={submit} disabled={!body.trim() || pending}
          className={cn('h-11 rounded-full px-5 text-[14px] font-bold disabled:opacity-40', primary(style))}>
          {pending ? '들려주는 중…' : '펫에게 들려주기'}
        </button>
      </div>
      {kind === 'hard' && (
        <div className={cn('mt-3 rounded-2xl px-3 py-2.5 text-[12px] leading-5', panel(style))} data-tama-counsel>
          <p className="font-bold">혼자 견디기 어려우면 이야기할 곳이 있어요</p>
          <ul className="mt-1">
            {COUNSEL_CONTACTS.map((c) => <li key={c.name}><b>{c.name}</b> <span className="opacity-80">{c.detail}</span></li>)}
          </ul>
        </div>
      )}
      <p className="mt-4 text-[12px] font-bold">지난 일기</p>
      <ul className="mt-1 max-h-48 space-y-1.5 overflow-y-auto text-[12px]" aria-busy={list.isLoading}>
        {list.data?.length === 0 && <li className="opacity-70">아직 쓴 일기가 없어요.</li>}
        {list.data?.map((d) => (
          <li key={d.id} className={cn('flex min-w-0 items-start gap-2 rounded-2xl px-3 py-2', panel(style))}>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] opacity-70">{d.written_on.slice(5).replace('-', '/')} · {DIARY_KINDS.find((k) => k.kind === d.kind)?.label}</p>
              {d.prompt && <p className="text-[11px] font-bold opacity-80">Q. {d.prompt}</p>}
              <p className="whitespace-pre-wrap break-words">{d.body}</p>
            </div>
            <button type="button" onClick={() => remove(d.id)} aria-label="이 일기 지우기" className="grid h-11 w-11 shrink-0 place-items-center rounded-full opacity-70 hover:opacity-100">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </TamaDialog>
  );
}

// ── 집중 권하기(2026-10-15) — 자습·계획 시간이 되면 기기 아래에 한 장 ─────────────────

export function FocusInviteCard({ style, invite, busy, onAccept, onLater }: {
  style: DeviceStyle; invite: FocusInvite; busy: boolean; onAccept: () => void; onLater: () => void;
}) {
  const lines = inviteLines(invite);
  return (
    <section className={cn('tama-chip tama-pop flex w-full max-w-[520px] flex-col gap-2 rounded-3xl px-4 py-3 sm:flex-row sm:items-center', style === 'classic' ? '' : 'ring-2 ring-violet-300')}
      aria-label="집중 권하기" data-tama-focus-invite={invite.kind}>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Timer className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="min-w-0 text-[13px] leading-5">
          <b>{lines.title}</b> <span className="opacity-80">· 펫이 같이 집중하재요</span>
          <span className="block truncate text-[12px] opacity-75" title={lines.detail}>{lines.detail}</span>
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onLater} disabled={busy} className={cn('h-11 flex-1 rounded-full px-4 text-[13px] sm:flex-none', panel(style))}>나중에</button>
        <button type="button" onClick={onAccept} disabled={busy}
          className={cn('h-11 flex-[2] rounded-full px-4 text-[14px] font-bold disabled:opacity-40 sm:flex-none', primary(style))}>
          함께 집중 {invite.minutes}분
        </button>
      </div>
    </section>
  );
}

// ── 함께 집중 ────────────────────────────────────────────────────────

export function FocusDialog({ open, onOpenChange, style, credit, userId, onFinished }: {
  open: boolean; onOpenChange: (open: boolean) => void; style: DeviceStyle; credit: CreditController; userId: string | null;
  onFinished: (outcome: string, credit: number) => void;
}) {
  const focus = credit.focus;
  useSecond(open && !!focus);
  const [minutes, setMinutes] = useState<number>(25);
  const [taskId, setTaskId] = useState<string | null>(null);
  const today = kstParts(credit.serverNow()).date;
  const planner = useQuery({
    queryKey: ['academy-dormitory', userId, 'tamagotchi', today],
    queryFn: () => fetchPlanner(today, null),
    enabled: open && !!userId && !focus,
    staleTime: 60_000,
  });
  const plans = useMemo(() => (planner.data?.tasks ?? []).filter((t: { completed: boolean }) => !t.completed) as { id: string; title: string }[], [planner.data]);
  const progress = focus ? focusProgress(focus, credit.serverNow()) : null;
  const linked = focus?.task_id ? (planner.data?.tasks ?? []).find((t: { id: string }) => t.id === focus.task_id) as { title: string } | undefined : undefined;
  const busy = credit.startFocus.isPending || credit.finishFocus.isPending;

  const start = async () => {
    try { await credit.startFocus.mutateAsync({ minutes, taskId }); } catch (e) { toast.error(e instanceof Error ? e.message : '시작하지 못했어요.'); }
  };
  const finish = async (giveUp: boolean) => {
    if (!focus) return;
    try {
      const r = await credit.finishFocus.mutateAsync({ id: focus.id, giveUp });
      if (r.outcome === 'running') { toast.info(`아직 ${Math.ceil((r.remaining ?? 0) / 60)}분 남았어요.`); return; }
      onFinished(r.outcome, r.credit);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '끝내지 못했어요.');
    }
  };

  return (
    <TamaDialog open={open} onOpenChange={onOpenChange} style={style} title="함께 집중" description="펫과 함께 정한 시간 동안 집중하기" testId="focus">
      {!focus ? (
        <>
          <p className="mt-2 text-[12px] leading-5 opacity-80">펫도 책상에 앉아 같이 집중해요. 끝까지 하면 코인 +{CREDIT_RULES.focus.amount}(자습실 «집중의 숲»과 합쳐 하루 {CREDIT_RULES.focus.cap}번까지).</p>
          <p className="mt-3 text-[12px] font-bold">얼마나</p>
          <div role="radiogroup" aria-label="집중 시간" className="mt-1.5 flex gap-2">
            {FOCUS_MINUTES.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={minutes === m} onClick={() => setMinutes(m)} className={pill(style, minutes === m)}>{m}분</button>
            ))}
          </div>
          <p className="mt-3 text-[12px] font-bold">무엇을 <span className="font-normal opacity-70">(오늘 계획 — 고르면 플래너 집중 기록에도 남아요)</span></p>
          <div role="radiogroup" aria-label="집중할 계획" className="mt-1.5 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
            <button type="button" role="radio" aria-checked={taskId === null} onClick={() => setTaskId(null)}
              className={cn('min-h-11 rounded-2xl px-3 text-left text-[13px]', taskId === null ? primary(style) : panel(style))}>계획 없이</button>
            {plans.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={taskId === t.id} onClick={() => setTaskId(t.id)}
                className={cn('min-h-11 truncate rounded-2xl px-3 text-left text-[13px]', taskId === t.id ? primary(style) : panel(style))} title={t.title}>{t.title}</button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-5 opacity-70">시작과 끝은 서버 시계로 재요. 시간이 다 되면 15분 안에 [끝내기]를 눌러야 끝까지 한 것으로 쳐요.</p>
          <button type="button" onClick={start} disabled={busy} className={cn('mt-3 h-12 w-full rounded-full text-[15px] font-bold disabled:opacity-40', primary(style))}>
            {minutes}분 시작하기
          </button>
        </>
      ) : (
        <>
          <p className="mt-6 text-center text-[52px] font-bold leading-none tabular-nums" aria-live="off">
            {progress!.phase === 'running' ? mmss(progress!.remainingMs) : '00:00'}
          </p>
          <p className="mt-2 text-center text-[12px] opacity-80">
            {linked ? linked.title : '계획 없이'} · {Math.round(focus.planned_seconds / 60)}분
          </p>
          <p className="mt-3 text-center text-[12px] leading-5">
            {progress!.phase === 'running' ? '휴대폰을 내려놓고 집중해요. 이 창은 닫아도 시간은 흘러요.'
              : progress!.phase === 'done' ? '다 했어요! [끝내기]를 눌러 코인을 받으세요.'
                : '끝난 지 15분이 넘어서 이번 집중은 끝까지 한 것으로 치지 않아요.'}
          </p>
          <div className="mt-4 flex gap-2">
            {progress!.phase === 'running' && (
              <button type="button" onClick={() => finish(true)} disabled={busy} className={cn('h-12 flex-1 rounded-full text-[14px]', panel(style))}>그만두기</button>
            )}
            {progress!.phase !== 'running' && (
              <button type="button" onClick={() => finish(false)} disabled={busy} className={cn('h-12 flex-1 rounded-full text-[15px] font-bold', primary(style))}>
                {progress!.phase === 'done' ? '끝내기' : '기록 닫기'}
              </button>
            )}
          </div>
        </>
      )}
    </TamaDialog>
  );
}
