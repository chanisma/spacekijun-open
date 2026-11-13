/**
 * 전체 화면 다마고찌의 바깥 조각 — 기기 밖에서 꼭 필요한 것만, 다마고찌 말투·도트 글꼴로.
 *
 *  · ClassicSlip — 클래식 기기는 32×16 이라 한글을 못 쓴다. 종 메뉴에서 고른 알림을 기기 옆에 «감열지 쪽지»로 뽑아 준다.
 *    (컬러 기기는 화면 안에서 다 보여 준다 — 이 쪽지가 뜨지 않는다.) 링크는 없다 — 표시만 한다.
 *  · AdoptCard — 알 받기(이름 짓기) · 별이 된 펫 자리에 새 알 · 모드 고르기(2026-10-19)
 *  · HelpDialog — 버튼·아이콘 설명. 화면 위에 뜨는 대화상자(2026-10-07 사용자 요청 — 옆 자리 카드가 아니라).
 *    앱 공용 Dialog 를 쓰므로 Esc·바깥 누르기·휴대폰 뒤로가기로 닫힌다. 안쪽은 기기 모양의 배경(.tama-app)을 다시 입힌다 —
 *    포털이 페이지 밖에 그려져 페이지의 .is-classic/.is-color 테마를 물려받지 못하기 때문.
 */
import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { MESSAGE_KIND_LABEL, josa, type PetMessage } from '../model/messages';
import { MODE_INFO, PET_MODES, deathCauseOf, type DeathCause, type PetMode } from '../model/petModes';
import { MENU_ICONS, MENU_LABELS, type Sprite } from '../lcd/sprites';
import type { DeviceStyle } from '../three/dims';
import type { CharacterArt } from '../color/characters';
import { PushCallSection } from './PushCallSection';
import { SpeciesPicker } from './SpeciesPicker';
import type { Species } from '../model/species';

export function ClassicSlip({ messages, index, open }: { messages: PetMessage[]; index: number; open: boolean }) {
  if (!messages.length) {
    return (
      <div className="tama-slip tama-slip-print w-full px-5 py-6 text-center text-[13px]">새 알림이 없어요</div>
    );
  }
  const m = messages[index % messages.length];
  return (
    <div key={`${m.id}-${open}`} className="tama-slip tama-slip-print w-full px-5 py-6 text-[13px] leading-[19px]">
      <div className="flex items-center justify-between text-[11px] text-stone-500">
        <span>★ 별빛 알림 · {MESSAGE_KIND_LABEL[m.kind]}</span>
        <span>{(index % messages.length) + 1}/{messages.length}</span>
      </div>
      <div className="my-2 border-t border-dashed border-stone-400" />
      <p className="break-words text-[14px] font-bold">{m.title}</p>
      {open ? (
        <>
          <div className="my-2 border-t border-dashed border-stone-400" />
          <div className="space-y-0.5">
            {m.lines.map((line, i) => (line ? <p key={i} className="break-words">{line}</p> : <div key={i} className="h-2" />))}
          </div>
          <div className="my-2 border-t border-dashed border-stone-400" />
          <p className="text-[11px] text-stone-500">B 다음 알림 · C 목록으로</p>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-stone-500">A 다음 · B 자세히 · C 닫기</p>
      )}
    </div>
  );
}

export function AdoptCard({ onAdopt, demo, style, departed, unlocked }: {
  onAdopt: (name: string, mode: PetMode, species: Species) => Promise<void>; demo: boolean; style: DeviceStyle;
  /** 별이 된 펫 — 있으면 «그 자리에 새 알»로 말하고, 모드는 그 펫의 것을 먼저 고른다 */
  departed?: { name: string; mode: PetMode; cause: DeathCause | null };
  /** 해금한 종(2026-10-26 — 서버 tama_species_read). 주면 종을 고른다(체험 모드는 별 가족만) */
  unlocked?: Partial<Record<Species, boolean>>;
}) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<PetMode>(departed?.mode ?? 'easy');
  const [species, setSpecies] = useState<Species>('star');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    if (mode !== 'easy' && mode !== departed?.mode && !window.confirm(modeConfirm(mode))) return;
    try { await onAdopt(trimmed, mode, species); } catch (err) { setError(err instanceof Error ? err.message : '알을 받지 못했어요.'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} data-tama-adopt={departed ? 'rebirth' : 'first'}
      className={cn('tama-chip tama-pop w-full rounded-3xl p-5', style === 'classic' ? 'text-indigo-50' : 'text-violet-950')}>
      <p className="text-[15px] font-bold">{departed ? `${departed.name}${josa(departed.name, '이', '가')} 별이 되었어요` : '별빛 아카데미에서 알이 도착했어요'}</p>
      <p className={cn('mt-1.5 text-[13px] leading-5', style === 'classic' ? 'text-indigo-200' : 'text-violet-700')}>
        {departed
          ? <>{deathCauseOf(departed.cause).phrase}… 앨범에 {departed.name}의 기록이 남아 있어요. 이 자리에 새 알을 받을 수 있어요.</>
          : '이름을 지어 주면 몇 분 뒤에 깨어나요. 하루가 지나면 한 살, 사흘이면 어른이 돼요.'}
      </p>
      {unlocked && !demo && <SpeciesPicker value={species} onChange={setSpecies} unlocked={unlocked} classic={style === 'classic'} className="mt-3" />}
      <ModePicker value={mode} onChange={setMode} classic={style === 'classic'} className="mt-3" />
      <label htmlFor="tama-name" className="mt-4 block text-[12px]">이름 (1~8글자)</label>
      <div className="mt-1.5 flex gap-2">
        <input id="tama-name" value={name} maxLength={8} autoComplete="off" placeholder="예: 별이" onChange={(e) => setName(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-xl border border-white/40 bg-white/90 px-3 text-base text-violet-950 outline-none placeholder:text-violet-300 focus:ring-4 focus:ring-pink-300/60" />
        <button type="submit" disabled={!trimmed || busy}
          className="h-11 shrink-0 rounded-xl bg-pink-500 px-4 text-[14px] font-bold text-white shadow-[0_3px_0_#b8357a] transition active:translate-y-0.5 active:shadow-none disabled:opacity-40">
          {busy ? '받는 중…' : '알 받기'}
        </button>
      </div>
      {error && <p className="mt-2 text-[13px] text-rose-300">{error}</p>}
      {demo && <p className={cn('mt-3 text-[11px]', style === 'classic' ? 'text-indigo-300' : 'text-violet-500')}>체험 모드 — 이 기기에만 저장돼요</p>}
    </form>
  );
}

function PixelIcon({ sprite }: { sprite: Sprite }) {
  const size = sprite.length;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-6 w-6 shrink-0" aria-hidden="true" shapeRendering="crispEdges">
      {sprite.flatMap((row, y) => [...row].map((ch, x) => (ch === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill="currentColor" /> : null)))}
    </svg>
  );
}

const ICON_HELP = ['밥 · 간식', '불 켜기 · 끄기', '좌우 · 높낮이 · 순서 기억 · 산책', '아플 때 1~2번', '똥 치우기', '나이 · 몸무게 · 하트', '수업 · 급식 · 계획 · 일정', '돌봐 달라는 신호'];

/**
 * 다마고찌의 대화상자 껍데기 — 앱 공용 Dialog(Esc·바깥 누르기·휴대폰 뒤로가기) 위에 기기 모양의 배경을 다시 입힌다.
 * 포털은 페이지 밖에 그려져 .is-classic/.is-color 를 물려받지 못하므로 안쪽에 .tama-app 을 둔다.
 */
export function TamaDialog({ open, onOpenChange, style, title, description, children, testId }: {
  open: boolean; onOpenChange: (open: boolean) => void; style: DeviceStyle; title: string; description: string;
  children: ReactNode; testId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="max-w-md border-0 bg-transparent p-0 shadow-none">
        <div data-tama-dialog={testId} className={cn('tama-app relative w-full rounded-3xl p-5 shadow-2xl', style === 'classic' ? 'is-classic text-indigo-50' : 'is-color text-violet-950')}>
          <DialogClose aria-label="닫기" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full hover:bg-white/20">
            <X className="h-5 w-5" aria-hidden="true" />
          </DialogClose>
          <DialogTitle className="pr-12 text-[15px] font-bold">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 모드 셋(2026-10-19) — 이지(죽지 않음) · 노멀(오래 아프면 별) · 하드(개복치). 규칙 글 = model/petModes 의 MODE_INFO.
 * **알을 받을 때 그 펫에 대해 정한다**(같은 날 사용자 결정) — 알 받기 카드·펫 집의 새 알에서만 고르고, 도움말은 보여 주기만.
 * 죽을 수 있는 쪽을 고를 때만 묻는다.
 */
export const modeConfirm = (mode: PetMode) => mode === 'hard'
  ? `하드 · 개복치 모드로 할까요?\n\n${MODE_INFO.hard.rule}\n\n별이 된 펫은 되살릴 수 없어요(앨범에는 왜 별이 됐는지까지 남아요). 행운을 빌어요.`
  : `노멀 모드로 할까요?\n\n${MODE_INFO.normal.rule}\n\n별이 된 펫은 되살릴 수 없어요(앨범에는 남아요).`;

export function ModePicker({ value, onChange, classic, disabled, className }: {
  value: PetMode; onChange: (m: PetMode) => void; classic: boolean; disabled?: boolean; className?: string;
}) {
  return (
    <div className={cn('text-[12px]', className)} data-mode-picker={value}>
      <div role="radiogroup" aria-label="모드" className={cn('grid grid-cols-3 gap-1 rounded-2xl p-1', classic ? 'bg-white/15' : 'bg-white/40')}>
        {PET_MODES.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={value === m} disabled={disabled} onClick={() => onChange(m)}
            className={cn('h-11 rounded-xl px-1 font-bold transition disabled:opacity-40',
              value === m ? (m === 'hard' ? 'bg-rose-500 text-white' : m === 'normal' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white') : 'opacity-75')}>
            {MODE_INFO[m].label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 leading-5 opacity-80">{MODE_INFO[value].rule}</p>
    </div>
  );
}

export interface ModeOption {
  mode: PetMode;
  /** 지금 아프다면 별이 될 때까지 남은 깨어 있는 시간 */
  hoursLeft: number | null;
}

/** 도움말 — 지금 펫의 모드를 보여 주기만 한다(바꾸지 않는다 — 알을 받을 때 정한다) */
function ModeSection({ option }: { option: ModeOption }) {
  return (
    <div className="mt-3 rounded-2xl bg-white/25 px-3 py-2.5 text-[12px]" data-mode-option={option.mode}>
      <p><b>이 펫의 모드 · {MODE_INFO[option.mode].label}</b> <span className="opacity-75">— 알을 받을 때 정해요</span></p>
      <p className="mt-1 leading-5 opacity-80">{MODE_INFO[option.mode].rule}</p>
      {option.hoursLeft && <p className="mt-1 leading-5 text-rose-400">지금 아파요 — 약 {option.hoursLeft}시간 남았어요. 주사를 놓아 주세요.</p>}
    </div>
  );
}

export function HelpDialog({ open, onOpenChange, style, art, onArt, onReplayGuide, mode }: {
  open: boolean; onOpenChange: (open: boolean) => void; style: DeviceStyle; art: CharacterArt; onArt: (a: CharacterArt) => void;
  /** 처음 안내 다시 보기(Phase 7) */
  onReplayGuide?: () => void;
  /** 모드(2026-10-19) — 펫이 있을 때만 */
  mode?: ModeOption;
}) {
  return (
    <TamaDialog open={open} onOpenChange={onOpenChange} style={style} title="조작 방법" description="버튼 세 개와 메뉴 아이콘의 뜻" testId="help">
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[12px]">
        {[['A', '메뉴 옮기기 · 길게 = 알림'], ['S', '고르기 · 시계'], ['D', '취소 · 길게 = 쓰다듬기']].map(([k, t]) => (
          <div key={k} className="rounded-2xl bg-white/15 px-2 py-2.5">
            <div className="mx-auto mb-1 grid h-8 w-8 place-items-center rounded-full bg-[#fff3fa] text-[13px] font-bold text-violet-900 shadow-[0_2px_0_#c8a8ff]">{k}</div>
            {t}
          </div>
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        {MENU_ICONS.map((icon, i) => (
          <li key={MENU_LABELS[i]} className="flex min-w-0 items-center gap-2">
            <PixelIcon sprite={icon} />
            <span className="min-w-0"><b>{MENU_LABELS[i]}</b> <span className="opacity-75">{ICON_HELP[i]}</span></span>
          </li>
        ))}
      </ul>
      {style !== 'classic' && (
        <div className="mt-3 flex items-center justify-between gap-2 text-[12px]">
          <span>캐릭터 그림</span>
          <div role="radiogroup" aria-label="캐릭터 그림" className="flex rounded-full bg-white/40 p-1">
            {([['codex', '새 그림'], ['procedural', '기본 도트']] as const).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={art === value} onClick={() => onArt(value)}
                className={cn('h-9 rounded-full px-3', art === value ? 'bg-violet-600 text-white' : 'opacity-75')}>{label}</button>
            ))}
          </div>
        </div>
      )}
      {mode && <ModeSection option={mode} />}
      <PushCallSection classic={style === 'classic'} />
      {onReplayGuide && (
        <button type="button" onClick={onReplayGuide} className="mt-3 h-10 w-full rounded-full bg-white/40 text-[13px] font-bold" data-replay-guide>
          처음 안내 다시 보기
        </button>
      )}
      <p className="mt-3 text-[11px] leading-5 opacity-75">
        알림은 종 메뉴에서 봐요(A 를 길게 누르면 바로) — {style !== 'classic' ? '고르면 화면에 자세히 나와요.' : '고르면 기기 옆에 쪽지로 나와요.'}
        {' '}수업 시간에는 펫도 수업을 들어요(배고파지지 않아요). 키보드 A · S · D 로도 눌러요.
      </p>
    </TamaDialog>
  );
}

// ── 처음 안내(Phase 7 — 학생 공개 준비) ─────────────────────────────────
// 처음 알을 받은 사람에게 한 번, 네 장. 도움말의 [처음 안내 다시 보기]로 다시 연다.
// 기기마다가 아니라 «사람마다» 기억한다(열쇠에 사용자 id) — 공용 기기에서 다음 사람이 안내를 놓치지 않게.
export const ONBOARD_KEY = (userId: string) => `tamagotchi:onboarded:v1:${userId}`;

interface GuideStep { title: string; body: string[]; icons?: number[] }
export const GUIDE_STEPS: GuideStep[] = [
  { title: '버튼은 셋이에요', body: ['A — 메뉴 아이콘을 옮겨요(길게 누르면 알림)', 'S — 고르기 · 아무것도 안 고르면 시계', 'D — 취소 · 길게 누르면 쓰다듬기'] },
  { title: '배고프고 심심해해요', body: ['시간이 지나면 배고픔·행복 하트가 줄어요. 밥·놀이·산책·씻기로 돌봐 주세요.', '수업 시간에는 펫도 수업을 들어요 — 시간이 멈추고 돌보기를 쉬어요.', '오래 내버려 두면 아파요. 주사로 낫게 해 주세요. 이지 모드는 죽지 않아요 — 노멀은 이틀 넘게 아프면, 하드(개복치)는 의외의 이유로 별이 돼요(모드는 알을 받을 때 정해요).'], icons: [0, 2, 4, 3] },
  { title: '코인으로 꾸며요', body: ['플래너에 계획을 세우고 돌아보기를 쓰면, 함께 집중을 마치면, 펫 일기를 쓰면 코인이 와요.', '코인으로 가챠를 돌려 기기와 방을 꾸며요. 습관에 따라 어른이 될 때 모습이 달라져요.'] },
  { title: '알림을 전해 줘요', body: ['오늘 수업·급식·계획·일정을 펫이 알려 줘요 — 종 메뉴(또는 A 길게)에서 봐요.', '앱을 닫아도 펫이 부르게 하려면 도움말(?)에서 켤 수 있어요.'], icons: [6, 7] },
];

export function OnboardingDialog({ open, onOpenChange, style }: { open: boolean; onOpenChange: (o: boolean) => void; style: DeviceStyle }) {
  const [step, setStep] = useState(0);
  const last = step === GUIDE_STEPS.length - 1;
  const g = GUIDE_STEPS[step];
  const close = () => { setStep(0); onOpenChange(false); };
  return (
    <TamaDialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())} style={style} title={g.title}
      description={`다마고찌 처음 안내 ${step + 1}/${GUIDE_STEPS.length}`} testId="onboarding">
      <div className="mt-2 flex gap-1.5" aria-hidden="true">
        {GUIDE_STEPS.map((_, i) => <span key={i} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-violet-500' : 'bg-white/40')} />)}
      </div>
      {g.icons && (
        <div className="mt-3 flex justify-center gap-3">
          {g.icons.map((i) => (
            <span key={i} className="flex flex-col items-center gap-1 text-[11px]">
              <PixelIcon sprite={MENU_ICONS[i]} />{MENU_LABELS[i]}
            </span>
          ))}
        </div>
      )}
      {step === 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[12px]">
          {['A', 'S', 'D'].map((k) => (
            <div key={k} className="rounded-2xl bg-white/15 px-2 py-2.5">
              <div className="mx-auto grid h-8 w-8 place-items-center rounded-full bg-[#fff3fa] text-[13px] font-bold text-violet-900 shadow-[0_2px_0_#c8a8ff]">{k}</div>
            </div>
          ))}
        </div>
      )}
      <ul className="mt-3 space-y-2 text-[13px] leading-6">
        {g.body.map((line) => <li key={line} className="rounded-xl bg-white/25 px-3 py-2">{line}</li>)}
      </ul>
      <div className="mt-4 flex gap-2">
        {step > 0 ? (
          <button type="button" onClick={() => setStep(step - 1)} className="h-11 flex-1 rounded-full bg-white/40 text-[14px]">이전</button>
        ) : (
          <button type="button" onClick={close} className="h-11 flex-1 rounded-full bg-white/40 text-[14px]">건너뛰기</button>
        )}
        <button type="button" onClick={() => (last ? close() : setStep(step + 1))}
          className="h-11 flex-1 rounded-full bg-violet-600 text-[14px] font-bold text-white" data-guide-next>
          {last ? '시작하기' : '다음'}
        </button>
      </div>
    </TamaDialog>
  );
}
