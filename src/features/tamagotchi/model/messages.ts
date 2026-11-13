/**
 * 펫이 알려 주는 것 — 순수 함수, 단일 출처.
 *
 * 2026-10-06 사용자 결정: 알림은 **다마고찌 안에서** 본다. 기기의 알림(종) 메뉴에서 목록을 넘기고, 고르면 그 일정의
 * 자세한 내용이 따로 표시된다(컬러 = 기기 화면, 클래식 = 기기 옆 쪽지). **다른 화면으로 가는 링크는 두지 않는다** —
 * 정보를 표시만 한다. 그래서 알림 하나 = 제목 한 줄(`title`) + 자세한 줄(`lines`).
 *
 * 우선순위가 높은 것부터 돌려준다.
 */
import { kstParts, type PeriodWindow } from './clock';
import type { AttentionReason } from './petModel';
import { deathCauseOf, type DeathCause, type PetMode } from './petModes';

export type PetMessageKind = 'class' | 'meal' | 'planner' | 'schedule' | 'pet';

export const MESSAGE_KIND_LABEL: Record<PetMessageKind, string> = {
  class: '수업', meal: '급식', planner: '계획', schedule: '일정', pet: '돌봄',
};

export interface PetMessage {
  id: string;
  kind: PetMessageKind;
  /** 목록에 보이는 한 줄 */
  title: string;
  /** 고르면 보이는 자세한 내용(한 줄씩) */
  lines: string[];
  priority: number;
}

export interface MessageInputs {
  nowMs: number;
  /** 오늘 수업 (교시 순) */
  todayLessons: { period: number; subject: string; teacher?: string }[];
  periods: PeriodWindow[];
  meal: { lunch?: string[]; dinner?: string[]; lunchCalories?: string; dinnerCalories?: string } | null;
  planner: { tasks: { title: string; done: boolean; time?: string | null }[] } | null;
  /** 학교 일정 — 시작·끝(ms) */
  events: { id: string; title: string; startsAt: number; endsAt: number }[];
  pet?: { name: string; attention: AttentionReason | null; poop: number; asleep: boolean; stage: string; critical?: boolean; hoursLeft?: number | null; dead?: boolean; deathCause?: DeathCause | null; mode?: PetMode } | null;
}

/** 받침 유무로 조사를 고른다: 별이 → «가», 달 → «이» */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return withoutFinal;
  return (code - 0xac00) % 28 === 0 ? withoutFinal : withFinal;
}

export const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** «돈까스(1.5.6)» · «쌀밥()» 같은 알레르기 꼬리를 걷어 낸다 */
export function cleanMenuItem(item: string): string {
  return item.replace(/\([\d.\s]*\)/g, '').replace(/[\d.]+$/g, '').replace(/\s+/g, ' ').trim();
}

const EVENT_NOISE = /(토요휴업일|휴업일|토요 휴업)/;
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

function eventWhen(e: { startsAt: number; endsAt: number }): string {
  const s = kstParts(e.startsAt);
  const t = kstParts(e.endsAt - 1);
  const day = (p: ReturnType<typeof kstParts>) => `${Number(p.date.slice(5, 7))}/${Number(p.date.slice(8))}`;
  const allDay = s.minutes === 0 && (t.minutes === 1439 || e.endsAt - e.startsAt >= 86400000 - 60000);
  if (s.date !== t.date) return `${day(s)} ~ ${day(t)}`;
  return allDay ? `${day(s)} 하루 종일` : `${day(s)} ${hhmm(s.minutes)} ~ ${hhmm(t.minutes + 1)}`;
}

export function pickPetMessages(input: MessageInputs): PetMessage[] {
  const out: PetMessage[] = [];
  const now = kstParts(input.nowMs);
  const { minutes, date: today } = now;
  const tomorrow = kstParts(input.nowMs + 86400000).date;

  // ── 수업 ──
  const windowOf = (period: number) => input.periods.find((p) => p.period === period);
  const lessons = input.todayLessons
    .map((l) => ({ ...l, window: windowOf(l.period) }))
    .filter((l): l is typeof l & { window: PeriodWindow } => !!l.window);
  const current = lessons.find((l) => minutes >= l.window.start && minutes < l.window.end);
  const upcoming = lessons.find((l) => l.window.start > minutes);
  const lessonLine = (l: (typeof lessons)[number]) =>
    `${l.period}교시 ${l.subject} ${hhmm(l.window.start)}${l.teacher ? ` · ${l.teacher}` : ''}`;
  const rest = (after: number) => lessons.filter((l) => l.window.start > after);
  if (current) {
    const later = rest(current.window.start);
    out.push({
      id: `class-now-${current.period}`, kind: 'class', priority: 100,
      title: `지금 ${current.period}교시 ${current.subject}`,
      lines: [
        `${hhmm(current.window.start)} ~ ${hhmm(current.window.end)}${current.teacher ? ` · ${current.teacher} 선생님` : ''}`,
        '수업이 끝나면 다시 만나요.',
        ...(later.length ? ['', '오늘 남은 수업', ...later.map(lessonLine)] : ['', '오늘의 마지막 수업이에요.']),
      ],
    });
  } else if (upcoming) {
    const soon = upcoming.window.start - minutes <= 20;
    out.push({
      id: `class-next-${upcoming.period}`, kind: 'class', priority: soon ? 90 : 40,
      title: soon ? `곧 ${upcoming.period}교시 ${upcoming.subject}` : `다음 수업 ${upcoming.period}교시 ${upcoming.subject}`,
      lines: [
        `${hhmm(upcoming.window.start)} 시작 · ${upcoming.window.start - minutes}분 남았어요${upcoming.teacher ? ` · ${upcoming.teacher} 선생님` : ''}`,
        ...(soon ? ['준비물을 챙겼나요?'] : []),
        '', '오늘 남은 수업', ...rest(minutes).map(lessonLine),
      ],
    });
  }

  // ── 급식 ──
  const menu = (items?: string[]) => (items ?? []).map(cleanMenuItem).filter(Boolean);
  const lunch = menu(input.meal?.lunch);
  const dinner = menu(input.meal?.dinner);
  if (lunch.length && minutes < 13 * 60 + 30) {
    const lunchTime = minutes >= 11 * 60 + 50;
    out.push({
      id: 'meal-lunch', kind: 'meal', priority: lunchTime ? 88 : minutes >= 10 * 60 + 30 ? 60 : 30,
      title: `오늘 점심 ${lunch[0]}${lunch.length > 1 ? ` 외 ${lunch.length - 1}가지` : ''}`,
      lines: [...lunch.map((m) => `· ${m}`), ...(input.meal?.lunchCalories ? ['', input.meal.lunchCalories] : [])],
    });
  } else if (dinner.length && minutes >= 16 * 60 && minutes < 19 * 60) {
    out.push({
      id: 'meal-dinner', kind: 'meal', priority: 70,
      title: `저녁 ${dinner[0]}${dinner.length > 1 ? ` 외 ${dinner.length - 1}가지` : ''}`,
      lines: [...dinner.map((m) => `· ${m}`), ...(input.meal?.dinnerCalories ? ['', input.meal.dinnerCalories] : [])],
    });
  }

  // ── 플래너 ──
  if (input.planner) {
    const tasks = [...input.planner.tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.time ?? '99').localeCompare(b.time ?? '99'));
    const left = tasks.filter((t) => !t.done).length;
    const list = tasks.map((t) => `${t.done ? '■' : '□'} ${t.time ? `${t.time} ` : ''}${t.title}`);
    if (tasks.length > 0 && left > 0) {
      out.push({
        id: 'planner-left', kind: 'planner', priority: minutes >= 15 * 60 ? 75 : 50,
        title: `오늘 계획 ${left}개 남았어요`, lines: [`${tasks.length}개 중 ${tasks.length - left}개 했어요`, '', ...list],
      });
    } else if (tasks.length > 0) {
      out.push({ id: 'planner-done', kind: 'planner', priority: 45, title: `오늘 계획을 다 마쳤어요!`, lines: [`${tasks.length}개 모두 해냈어요. 최고예요!`, '', ...list] });
    } else if (minutes >= 18 * 60) {
      out.push({ id: 'planner-empty', kind: 'planner', priority: 20, title: '내일 할 일을 적어 볼까요?', lines: ['플래너에 내일 할 일을 하나 적어 두면', '아침에 펫이 알려 줄게요.'] });
    }
  }

  // ── 학교 일정 ──
  const dayOf = (ms: number) => kstParts(ms).date;
  const visible = input.events.filter((e) => !EVENT_NOISE.test(e.title));
  const todayEvents = visible.filter((e) => dayOf(e.startsAt) <= today && dayOf(e.endsAt - 1) >= today);
  if (todayEvents.length > 0) {
    const first = todayEvents[0];
    out.push({
      id: `schedule-today-${first.id}`, kind: 'schedule', priority: 65,
      title: `오늘 «${first.title}»${todayEvents.length > 1 ? ` 외 ${todayEvents.length - 1}건` : ''}`,
      lines: todayEvents.flatMap((e, i) => [...(i ? [''] : []), e.title, eventWhen(e)]),
    });
  }
  if (minutes >= 15 * 60) {
    const tomorrowEvents = visible.filter((e) => dayOf(e.startsAt) === tomorrow);
    if (tomorrowEvents.length > 0) {
      const tp = kstParts(input.nowMs + 86400000);
      out.push({
        id: `schedule-tomorrow-${tomorrowEvents[0].id}`, kind: 'schedule', priority: 55,
        title: `내일 «${tomorrowEvents[0].title}»`,
        lines: [`내일(${WEEKDAY[tp.weekday % 7]}) 일정`, '', ...tomorrowEvents.flatMap((e, i) => [...(i ? [''] : []), e.title, eventWhen(e)])],
      });
    }
  }

  // ── 펫 자신 ──
  const pet = input.pet;
  if (pet && pet.stage !== 'egg') {
    const name = pet.name;
    const ga = josa(name, '이', '가');
    const say = (id: string, title: string, lines: string[], priority: number) => out.push({ id, kind: 'pet', title, lines, priority });
    if (pet.dead) {
      const cause = deathCauseOf(pet.deathCause);
      say('pet-dead', `${name}${ga} 별이 되었어요`, [`${cause.phrase}…`, cause.tip, '', '기기 옆 카드에서 새 알을 받을 수 있어요.', '새 알도 지금 모드를 이어받아요(도움말 ?에서 바꾸기).'], 90);
    }
    else if (pet.attention === 'sick' && pet.critical) say('pet-critical', `${name}${ga} 위독해요`, ['지금 주사를 놓아 주세요.', pet.hoursLeft ? `깨어 있는 시간으로 약 ${pet.hoursLeft}시간 뒤에는 별이 돼요.` : '곧 별이 돼요.', '', '수업·잠 시간은 세지 않아요.'], 92);
    else if (pet.attention === 'sick') say('pet-sick', `${name}${ga} 아파요`, ['주사 아이콘을 골라 주세요.', '한두 번 맞으면 나아요.', '', '똥을 오래 두거나 오래 굶으면 아파요.'], 86);
    else if (pet.attention === 'lights') say('pet-lights', `${name}${ga} 잠들었어요`, ['불 아이콘에서 «끄기»를 골라 주세요.', '불을 켠 채로 두면 잠을 설쳐요.'], 84);
    else if (pet.attention === 'hungry') say('pet-hungry', `${name}${ga} 배고파해요`, ['밥 아이콘 → 밥을 골라 주세요.', '하트가 4칸이 되면 배불러 해요.'], 85);
    else if (pet.attention === 'unhappy') say('pet-unhappy', `${name}${ga} 심심해해요`, ['놀이·산책을 하거나 간식을 주세요.', 'D 를 길게 누르면 쓰다듬어요.'], 82);
    else if (pet.poop > 0 && !pet.asleep) say('pet-poop', `${name} 옆을 치워 주세요`, ['씻기(오리) 아이콘을 골라 주세요.', '오래 두면 아플 수 있어요.'], 35);
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, 8);
}
