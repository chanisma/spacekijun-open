/**
 * 학생 홈의 다마고찌 카드 — 2D 화면만(홈에서 three.js 를 내려받지 않는다). 고른 기기 모양(컬러/클래식)을 따른다.
 *
 * 홈은 이미 시간표·급식 카드를 갖고 있으므로 같은 정보를 두 번 말하지 않는다 — 여기서는 «펫 상태»만 말한다.
 * 메뉴 노출 스위치(`/tamagotchi`)를 그대로 따른다.
 */
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Egg } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useIsMenuVisible } from '@/hooks/useMenuVisibility';
import { readStoredString } from '@/lib/safeLocalStorage';
import { DashboardCardShell } from '@/features/teacher-dashboard/components/DashboardCardShell';
import { useTamagotchi } from '../hooks/useTamagotchi';
import { useShop } from '../hooks/useShop';
import { useCharacterOrders } from '../hooks/useSocial';
import { usePetSchedule } from '../hooks/usePetSchedule';
import { serverPetStore } from '../services/petService';
import { pickPetMessages } from '../model/messages';
import { STAGE_LABEL } from '../model/petModel';
import { loadTamaFonts } from '../color/text';
import { ScreenView } from './ScreenView';
import '../tamagotchi.css';

const noop = () => undefined;

function HomeCardBody() {
  const navigate = useNavigate();
  const style = readStoredString('tamagotchi:style:v1') === 'classic' ? 'classic' : 'color';
  const { schedule, ready } = usePetSchedule('student');
  // 꾸민 방·입힌 캐릭터 스킨도 다마고찌 화면과 같게(2026-11-05 — 홈 카드에는 둘 다 빠져 기본 방·기본 캐릭터로 보였다)
  const shop = useShop(true);
  const equipped = useMemo(() => shop.status.data?.equipped ?? {}, [shop.status.data?.equipped]);
  useCharacterOrders(true, equipped.character ?? null);
  const pet = useTamagotchi({ store: serverPetStore, schedule, scheduleReady: ready, messages: [], beep: noop, equipped });
  useEffect(() => { void loadTamaFonts(); }, []);
  const line = useMemo(() => {
    if (!pet.view) return null;
    const [first] = pickPetMessages({
      nowMs: Date.now(), todayLessons: [], periods: [], meal: null, planner: null, events: [],
      pet: { name: pet.name, attention: pet.view.attention, poop: pet.view.poop, asleep: pet.view.asleep, stage: pet.view.stage },
    });
    if (first) return first.title;
    if (pet.view.stage === 'egg') return '알이 흔들리고 있어요. 곧 깨어날 거예요!';
    if (pet.view.inClass) return '수업을 함께 듣는 중이에요.';
    if (pet.view.asleep) return '쿨쿨 자고 있어요.';
    return '기분이 좋아 보여요.';
  }, [pet.view, pet.name]);

  return (
    <DashboardCardShell title="다마고찌" icon={Egg} accent="indigo" description="하루를 함께하는 별빛 펫이에요."
      onAction={() => navigate('/tamagotchi')} actionLabel="돌보러 가기">
      {pet.status === 'needsEgg' ? (
        <button type="button" onClick={() => navigate('/tamagotchi')}
          className="w-full rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-6 text-center text-sm font-semibold text-indigo-800 hover:bg-indigo-50">
          알이 도착했어요 — 이름을 지어 주세요
        </button>
      ) : pet.status === 'ready' && pet.view ? (
        <button type="button" onClick={() => navigate('/tamagotchi')} className="flex w-full items-center gap-4 rounded-2xl text-left">
          <span className={`block w-32 shrink-0 rounded-2xl p-2 shadow-inner sm:w-36 ${style !== 'classic' ? 'bg-[#16131f]' : 'bg-[#141842]'}`}>
            <span className="block overflow-hidden rounded-lg">
              <ScreenView style={style} subscribe={pet.subscribe} size={style !== 'classic' ? 256 : 0.5} />
            </span>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-slate-800">{pet.name}</span>
            <span className="text-[11px] text-slate-500">{STAGE_LABEL[pet.view.stage]}{pet.view.stage !== 'egg' && ` · ${pet.view.ageYears}살`}</span>
            <span className="mt-2 block break-words text-sm leading-6 text-slate-700">{line}</span>
          </span>
        </button>
      ) : (
        <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      )}
    </DashboardCardShell>
  );
}

export function TamagotchiHomeCard() {
  const { profile, isAdmin, effectiveRole } = useAuth();
  const visible = useIsMenuVisible(isAdmin, effectiveRole)('/tamagotchi');
  // 서버에 펫이 있는 사람 = 학생 본인뿐 (미리보기는 전용 화면의 체험 모드로)
  if (profile?.role !== 'student' || !visible) return null;
  return <section className="min-w-0 md:col-span-2 xl:col-span-6" aria-label="다마고찌"><HomeCardBody /></section>;
}
