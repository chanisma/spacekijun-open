/**
 * 가챠 물건 목록 · 확률 · 천장 · 외상 — Phase 3 (2026-10-07). 그림 사양(색·무늬)까지 여기 한 곳.
 *
 * 값·환급·치료제·외상은 2026-10-08 아카데미 코인 규모에 맞춰 올렸다(`20261008100000_tamagotchi_economy_rebalance.sql`).
 * ⚠️ 서버 `20261007120000_tamagotchi_gacha.sql` 의 `tama_item` 시드(id·자리·등급)와 `rarity_weight`·값·천장·외상 숫자가
 * 이것과 같아야 한다 — 회귀(`scripts/tamagotchi-test/run.mts`)가 대조한다. 뽑기는 서버가 하고 화면은 결과를 연출만 한다.
 */

import type { DeviceStyle } from '../three/dims';

/**
 * 'device' = 기기 종류(2026-10-07) — 컬러 기기는 물건이 아니라 «기본»(장착 없음)이다.
 * 'character' = 펫 캐릭터(2026-10-13 — 의뢰로 만든 캐릭터를 가챠에도). 컬러 화면에서 펫을 이 그림으로 그린다.
 */
export type ItemSlot = 'device' | 'character' | 'shell' | 'wallpaper' | 'rug' | 'floor' | 'shelf' | 'wall';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const RARITY: Record<Rarity, { label: string; weight: number; color: string; glow: string }> = {
  common: { label: '보통', weight: 60, color: '#7fb6d9', glow: '#d7f0ff' },
  rare: { label: '희귀', weight: 28, color: '#4f7dff', glow: '#bcd0ff' },
  epic: { label: '특별', weight: 10, color: '#b45cff', glow: '#ead2ff' },
  legendary: { label: '전설', weight: 2, color: '#ffb321', glow: '#fff1b8' },
};
export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** 2026-10-08 규모 맞추기 때의 단일 가챠 값(기록 — 회귀가 그 마이그레이션과 대조). 지금 값은 기계마다 = model/gachaMachines.ts */
export const GACHA_PRICE = 20;
export const DUPLICATE_REFUND = 5;
/** 새 것 없이 (PITY_AT − 1)번 연속이면 다음은 아직 없는 것에서만 */
export const PITY_AT = 5;
/** 치료제는 무료(2026-10-10 — 종전 5코인 · `20261010130000_tamagotchi_medicine_free.sql`) */
export const MEDICINE_PRICE = 0;
/** 옛 외상 상한(서버 CHECK `debt between 0 and 25`). 치료제가 무료라 새 외상은 생기지 않는다 */
export const MAX_DEBT = 25;

export const SLOT_LABEL: Record<ItemSlot, string> = {
  device: '기기 종류', character: '캐릭터', shell: '기기 디자인', wallpaper: '벽지', rug: '러그', floor: '바닥 소품', shelf: '선반 소품', wall: '벽 장식',
};
export const SLOTS: ItemSlot[] = ['device', 'character', 'shell', 'wallpaper', 'rug', 'floor', 'shelf', 'wall'];

/** 기기 껍데기 — 두 기종 모두에 입힌다(모델은 그대로, 색·무늬만) */
export interface ShellSpec {
  base: [string, string, string];
  blobs: [string, string, string];
  /** circuit = 네온 회로 + 글리치 띠(2026-11-11 의뢰 «글리치») — 코드 껍데기 전용이라 관리자 색·무늬 고르기(SHELL_PATTERNS)엔 없다 */
  motif: 'heart' | 'star' | 'dot' | 'flower' | 'diamond' | 'circuit';
  motifColors: [string, string, string];
  ring: string;
  print: string;
  bezel: string;
  button: string;
  socket: string;
  sheen: string;
  trim: string;
  iridescence: number;
  label: string;
  /** 뒷면 가운데 큰 그림 — 배터리 덮개를 피해 보이는 뒷면의 한가운데(three/shellArt.ts backEmblemSpot) */
  back?: 'planet';
  /** 바탕 거칠기·투명 코트 — 크롬처럼 매끈하게. 없으면 기종 기본 */
  roughness?: number;
  clearcoat?: number;
}
export interface WallpaperSpec {
  day: [string, string];
  evening: [string, string];
  night: [string, string];
  pattern: 'stripes' | 'checks' | 'leaves' | 'stars';
  ink: { day: string; night: string };
}
export interface RugSpec { outer: { day: string; night: string }; inner: { day: string; night: string }; rainbow?: boolean }
export type DecoSprite = 'ball' | 'teddy' | 'fish' | 'scope' | 'globe' | 'lamp' | 'crown' | 'clock' | 'garland' | 'pumpkin' | 'snowman' | 'bunting' | 'robot' | 'plant';

export interface CatalogItem {
  id: string;
  slot: ItemSlot;
  rarity: Rarity;
  name: string;
  note: string;
  shell?: ShellSpec;
  wallpaper?: WallpaperSpec;
  rug?: RugSpec;
  deco?: DecoSprite;
  /** 기기 종류(자리 'device') — 장착하면 펫이 이 기기에 산다 */
  device?: Exclude<DeviceStyle, 'color'>;
  /** 나만의 꾸미기(꾸미기 의뢰 — 2026-10-08) — 서버가 주면 registerCustomItems 로 목록에 더한다. 가챠·교환 대상이 아니다 */
  custom?: true;
  /** 소품 자리의 나만의 물건 그림(버킷 tama-decor) — 픽셀은 color/customDecor.ts 가 받아 둔다 */
  imagePath?: string;
  /**
   * 공용 그림 파일(public 아래 주소, 2026-10-13) — 캐릭터 = 자세 다섯 시트(customCharacter 규칙), 소품 = 투명 픽셀 PNG.
   * 의뢰로 만든 그림을 가챠에도 넣을 때 쓴다(나만의 꾸미기의 비공개 버킷 그림과 달리 누구나 받는다). 받는 곳 = color/artSprites.ts
   */
  art?: string;
  /** 이벤트 전용(Phase 5) — 관리자가 연 펫 이벤트 기간에만 가챠에 나온다(서버 tama_item.event_only). 한 번 가지면 계속 쓴다. */
  event?: boolean;
}

const shell = (s: ShellSpec) => s;

export const CATALOG: CatalogItem[] = [
  // 기기 종류(2026-10-07 사용자 지시 «다마고찌의 종류도 가차의 한 영역 · 기본은 컬러 LCD») — 서버 20261007170000
  { id: 'device_classic', slot: 'device', rarity: 'rare', name: '클래식 기기', note: '1996 년 모양 · 흑백 LCD', device: 'classic' },
  { id: 'device_digimon', slot: 'device', rarity: 'epic', name: '디지털 기기', note: '돌벽돌 무늬 · 가로로 긴 컬러 화면', device: 'digimon' },
  // 기기 종류 의뢰(2026-11-06) «교실 밖 세상» — 서버 20261106200000
  { id: 'device_suitcase', slot: 'device', rarity: 'legendary', name: '교실 밖 세상', note: '우표와 스티커를 붙인 빈티지 여행 가방 기기', device: 'suitcase' },
  { id: 'shell_mint', slot: 'shell', rarity: 'common', name: '민트 소다', note: '시원한 민트에 하얀 물방울',
    shell: shell({ base: ['#b8f0e0', '#9fe3d6', '#7fd0cf'], blobs: ['rgba(255,255,255,0.45)', 'rgba(200,255,240,0.35)', 'rgba(160,230,255,0.3)'],
      motif: 'dot', motifColors: ['rgba(255,255,255,0.95)', 'rgba(90,200,190,0.5)', 'rgba(255,255,255,0.6)'], ring: 'rgba(255,255,255,0.85)',
      print: 'rgba(30,110,110,0.9)', bezel: '#123033', button: '#f2fffb', socket: '#5cc8b8', sheen: '#e8fff8', trim: '#7fd8c8', iridescence: 0.18, label: '#1f6e6a' }) },
  { id: 'shell_lemon', slot: 'shell', rarity: 'common', name: '레몬 크림', note: '노란 크림 위 작은 꽃',
    shell: shell({ base: ['#fff4b0', '#ffe88a', '#ffd36b'], blobs: ['rgba(255,255,255,0.5)', 'rgba(255,240,200,0.4)', 'rgba(255,220,160,0.3)'],
      motif: 'flower', motifColors: ['rgba(255,255,255,0.95)', 'rgba(255,170,60,0.55)', 'rgba(120,200,120,0.5)'], ring: 'rgba(255,255,255,0.9)',
      print: 'rgba(150,100,20,0.9)', bezel: '#2b2414', button: '#fffdf2', socket: '#f2b84a', sheen: '#fffbe6', trim: '#f3cf63', iridescence: 0.12, label: '#9a6a12' }) },
  { id: 'shell_cherry', slot: 'shell', rarity: 'rare', name: '벚꽃 우유', note: '연분홍에 벚꽃잎이 흩날려요',
    shell: shell({ base: ['#ffe3ee', '#ffc9dc', '#ffadc9'], blobs: ['rgba(255,255,255,0.5)', 'rgba(255,220,235,0.4)', 'rgba(255,190,215,0.35)'],
      motif: 'flower', motifColors: ['rgba(255,255,255,0.95)', 'rgba(255,120,170,0.6)', 'rgba(255,170,200,0.7)'], ring: 'rgba(255,255,255,0.9)',
      print: 'rgba(170,60,110,0.9)', bezel: '#2a1520', button: '#fff5f9', socket: '#ff8db8', sheen: '#fff0f6', trim: '#ffb3cf', iridescence: 0.3, label: '#a43d72' }) },
  { id: 'shell_aurora', slot: 'shell', rarity: 'rare', name: '오로라 밤', note: '밤하늘에 초록 오로라',
    shell: shell({ base: ['#1b2a5c', '#1d4a6a', '#1f6a6a'], blobs: ['rgba(90,255,190,0.28)', 'rgba(120,160,255,0.3)', 'rgba(180,120,255,0.25)'],
      motif: 'star', motifColors: ['rgba(255,255,255,0.9)', 'rgba(140,255,210,0.8)', 'rgba(200,180,255,0.7)'], ring: 'rgba(140,255,210,0.8)',
      print: 'rgba(200,255,235,0.95)', bezel: '#070b1c', button: '#e6fff6', socket: '#0b1630', sheen: '#9fffe0', trim: '#2a8c86', iridescence: 0.45, label: '#cffff0' }) },
  { id: 'shell_gold', slot: 'shell', rarity: 'epic', name: '황금 별', note: '금빛 광택에 별 각인',
    shell: shell({ base: ['#ffe8a0', '#f5c95a', '#d9a23a'], blobs: ['rgba(255,255,255,0.55)', 'rgba(255,240,180,0.45)', 'rgba(200,140,40,0.25)'],
      motif: 'star', motifColors: ['rgba(255,255,255,0.95)', 'rgba(170,110,20,0.55)', 'rgba(255,250,210,0.9)'], ring: 'rgba(130,80,10,0.7)',
      print: 'rgba(110,60,0,0.9)', bezel: '#2a1a05', button: '#fff7dc', socket: '#c98a1e', sheen: '#fff6c8', trim: '#e9b440', iridescence: 0.2, label: '#7a4a05' }) },
  { id: 'shell_holo', slot: 'shell', rarity: 'legendary', name: '무지개 홀로', note: '보는 각도마다 무지개빛',
    shell: shell({ base: ['#c9f0ff', '#e6d2ff', '#ffd6ec'], blobs: ['rgba(255,240,150,0.45)', 'rgba(150,255,220,0.45)', 'rgba(255,170,220,0.45)'],
      motif: 'diamond', motifColors: ['rgba(255,255,255,0.95)', 'rgba(140,200,255,0.75)', 'rgba(255,170,230,0.75)'], ring: 'rgba(255,255,255,0.95)',
      print: 'rgba(90,70,160,0.9)', bezel: '#14122a', button: '#ffffff', socket: '#a9b8ff', sheen: '#ffffff', trim: '#c8b8ff', iridescence: 1, label: '#5a46a0' }) },

  { id: 'wall_sky', slot: 'wallpaper', rarity: 'common', name: '하늘 줄무늬', note: '하늘색 세로 줄무늬',
    wallpaper: { day: ['#e3f4ff', '#c9e8ff'], evening: ['#6a78c8', '#4f5ea8'], night: ['#2d3f7a', '#1f2c5c'], pattern: 'stripes', ink: { day: '#b3dcff', night: '#3a4f92' } } },
  { id: 'wall_berry', slot: 'wallpaper', rarity: 'common', name: '딸기 체크', note: '분홍 깅엄 체크',
    wallpaper: { day: ['#fff0f4', '#ffe0ea'], evening: ['#9a5c94', '#7a4a80'], night: ['#5a3368', '#40254f'], pattern: 'checks', ink: { day: '#ffc2d6', night: '#6e3f7e' } } },
  { id: 'wall_forest', slot: 'wallpaper', rarity: 'rare', name: '숲속 잎사귀', note: '연두 잎사귀가 가득',
    wallpaper: { day: ['#eefbe6', '#d8f2cf'], evening: ['#5f8a6e', '#4a7058'], night: ['#24463a', '#18352b'], pattern: 'leaves', ink: { day: '#9fd88f', night: '#2f6050' } } },
  { id: 'wall_cosmos', slot: 'wallpaper', rarity: 'epic', name: '은하수 벽지', note: '낮에도 별이 빛나요',
    wallpaper: { day: ['#3b2f7a', '#5a3d9a'], evening: ['#2f2468', '#45307e'], night: ['#120f38', '#1d1650'], pattern: 'stars', ink: { day: '#ffe58a', night: '#fff6c8' } } },

  { id: 'rug_mint', slot: 'rug', rarity: 'common', name: '민트 러그', note: '',
    rug: { outer: { day: '#8fe0c8', night: '#3d8a78' }, inner: { day: '#c6f5e6', night: '#56a894' } } },
  { id: 'rug_sun', slot: 'rug', rarity: 'common', name: '해바라기 러그', note: '',
    rug: { outer: { day: '#ffc94a', night: '#a07a2a' }, inner: { day: '#ffe7a0', night: '#c29a44' } } },
  { id: 'rug_cloud', slot: 'rug', rarity: 'rare', name: '구름 러그', note: '',
    rug: { outer: { day: '#e9f3ff', night: '#8a98c0' }, inner: { day: '#ffffff', night: '#a8b4d8' } } },
  { id: 'rug_rainbow', slot: 'rug', rarity: 'epic', name: '무지개 러그', note: '',
    rug: { outer: { day: '#ff8fb0', night: '#9a4c70' }, inner: { day: '#ffe08a', night: '#a08440' }, rainbow: true } },

  { id: 'floor_ball', slot: 'floor', rarity: 'common', name: '통통 공', note: '', deco: 'ball' },
  { id: 'floor_teddy', slot: 'floor', rarity: 'common', name: '곰 인형', note: '', deco: 'teddy' },
  { id: 'floor_fish', slot: 'floor', rarity: 'rare', name: '금붕어 어항', note: '', deco: 'fish' },
  { id: 'floor_scope', slot: 'floor', rarity: 'epic', name: '별 망원경', note: '', deco: 'scope' },
  { id: 'shelf_globe', slot: 'shelf', rarity: 'common', name: '작은 지구본', note: '', deco: 'globe' },
  { id: 'shelf_lamp', slot: 'shelf', rarity: 'rare', name: '별 무드등', note: '', deco: 'lamp' },
  { id: 'shelf_crown', slot: 'shelf', rarity: 'legendary', name: '별빛 왕관', note: '', deco: 'crown' },
  { id: 'wall_clock', slot: 'wall', rarity: 'common', name: '달 시계', note: '', deco: 'clock' },
  { id: 'wall_garland', slot: 'wall', rarity: 'rare', name: '별 가랜드', note: '', deco: 'garland' },

  // ── 상시 물건 일곱 더(Phase 7, 마이그레이션 20261007160000) ──
  { id: 'shell_mocha', slot: 'shell', rarity: 'common', name: '모카 라테', note: '크림 거품에 하트 라테 아트',
    shell: shell({ base: ['#f3e2cf', '#e2c3a3', '#c99a72'], blobs: ['rgba(255,255,255,0.55)', 'rgba(255,240,220,0.4)', 'rgba(140,90,50,0.22)'],
      motif: 'heart', motifColors: ['rgba(255,255,255,0.95)', 'rgba(150,95,60,0.55)', 'rgba(255,225,200,0.85)'], ring: 'rgba(255,255,255,0.9)',
      print: 'rgba(110,65,35,0.9)', bezel: '#2a1a10', button: '#fff8ef', socket: '#b98457', sheen: '#fff4e6', trim: '#d9ad83', iridescence: 0.1, label: '#7a4a28' }) },
  { id: 'shell_ocean', slot: 'shell', rarity: 'rare', name: '바다 유리', note: '파도에 닳은 푸른 유리 조각',
    shell: shell({ base: ['#b8ecf2', '#7fd3e6', '#4fa8d8'], blobs: ['rgba(255,255,255,0.5)', 'rgba(170,240,255,0.4)', 'rgba(40,120,200,0.25)'],
      motif: 'dot', motifColors: ['rgba(255,255,255,0.95)', 'rgba(30,110,170,0.5)', 'rgba(200,250,255,0.85)'], ring: 'rgba(255,255,255,0.9)',
      print: 'rgba(15,70,120,0.9)', bezel: '#0b1c2c', button: '#f2fdff', socket: '#3a8fc4', sheen: '#e8fbff', trim: '#6cc4e0', iridescence: 0.4, label: '#1f5d8a' }) },
  { id: 'wall_lavender', slot: 'wallpaper', rarity: 'common', name: '라벤더 체크', note: '연보라 체크',
    wallpaper: { day: ['#f4efff', '#e7dcff'], evening: ['#7d6ab8', '#64529c'], night: ['#3a2f66', '#2a2150'], pattern: 'checks', ink: { day: '#cdb8ff', night: '#5a4a92' } } },
  { id: 'wall_rainbow', slot: 'wallpaper', rarity: 'rare', name: '무지개 줄', note: '파스텔 무지개 세로 줄',
    wallpaper: { day: ['#fff3f6', '#f0f4ff'], evening: ['#8a6aa8', '#6a5a9c'], night: ['#3a2f5c', '#2a254c'], pattern: 'stripes', ink: { day: '#ffd1e0', night: '#5a4f88' } } },
  { id: 'rug_star', slot: 'rug', rarity: 'rare', name: '별 러그', note: '',
    rug: { outer: { day: '#6f7cf0', night: '#3a3f86' }, inner: { day: '#ffe58a', night: '#a08a3c' } } },
  { id: 'floor_robot', slot: 'floor', rarity: 'epic', name: '꼬마 로봇', note: '', deco: 'robot' },
  { id: 'shelf_plant', slot: 'shelf', rarity: 'common', name: '작은 화분', note: '', deco: 'plant' },
  // 의뢰로 만든 것(2026-10-13, 사용자 지시 «제작된 내용은 가챠에도») — 서버 20261013110000
  { id: 'char_rockbear', slot: 'character', rarity: 'legendary', name: '멋쟁이 락스타', note: '마이크를 든 턱수염 갈색곰',
    art: '/images/tamagotchi/gacha/char_rockbear.png' },
  { id: 'floor_guitar', slot: 'floor', rarity: 'epic', name: '손 때 묻은 기타', note: '거치대에 세운 낡은 기타',
    art: '/images/tamagotchi/gacha/floor_guitar.png' },
  // 캐릭터 의뢰 세 건(2026-10-27) — 서버 20261027150000
  { id: 'char_scarfpigeon', slot: 'character', rarity: 'legendary', name: '겨울을 기다리는 둘기', note: '빨간 목도리를 두른 분홍 발 비둘기',
    art: '/images/tamagotchi/gacha/char_scarfpigeon.png' },
  { id: 'char_moonmoth', slot: 'character', rarity: 'legendary', name: '은빛 달의 정령', note: '이마에 초승달을 단 나방 날개 정령',
    art: '/images/tamagotchi/gacha/char_moonmoth.png' },
  { id: 'char_maskdog', slot: 'character', rarity: 'legendary', name: '안대 강아지', note: '이마에 분홍 안대를 걸친 갈색 귀 강아지',
    art: '/images/tamagotchi/gacha/char_maskdog.png' },
  // 캐릭터 의뢰 두 건 · 꾸미기 의뢰 한 건(2026-10-29) — 서버 20261029100000
  { id: 'char_summerpenguin', slot: 'character', rarity: 'legendary', name: '여름 피서 펭귄', note: '하와이안 셔츠에 히비스커스 밀짚모자를 쓴 황제펭귄',
    art: '/images/tamagotchi/gacha/char_summerpenguin.png' },
  { id: 'char_azuredragon', slot: 'character', rarity: 'legendary', name: '창룡의 정화', note: '남색 긴 머리에 하늘색 뿔이 솟은 청록 용',
    art: '/images/tamagotchi/gacha/char_azuredragon.png' },
  { id: 'floor_phonograph', slot: 'floor', rarity: 'epic', name: '음악이 흐르는 축음기', note: '나팔꽃 나팔의 고풍스러운 축음기',
    art: '/images/tamagotchi/gacha/floor_phonograph.png' },
  // 캐릭터 의뢰 두 건(2026-10-31) — 서버 20261031122000 · 20261031121000
  { id: 'char_blackcat', slot: 'character', rarity: 'legendary', name: '검은 고양이', note: '노란 방울 목걸이를 건 나른한 눈의 검은 고양이',
    art: '/images/tamagotchi/gacha/char_blackcat.png' },
  { id: 'char_duwon', slot: 'character', rarity: 'legendary', name: '듀원땜', note: '꿀벌 줄무늬 상의를 입은, 눈웃음이 예쁜 앞머리 소년',
    art: '/images/tamagotchi/gacha/char_duwon.png' },
  // 캐릭터 의뢰(2026-11-02) — 서버 20261102100000
  { id: 'char_luckyseal', slot: 'character', rarity: 'legendary', name: '행운 물개', note: '밀짚모자를 쓰고 네잎클로버 목걸이를 건 푸른 물개',
    art: '/images/tamagotchi/gacha/char_luckyseal.png' },
  // 캐릭터 의뢰(2026-11-06) — 서버 20261106200000
  { id: 'char_piglet', slot: 'character', rarity: 'legendary', name: '토실토실아기돼지', note: '꼬불꼬불 꼬리가 달린 연분홍 아기 돼지',
    art: '/images/tamagotchi/gacha/char_piglet.png' },
  { id: 'char_ideal', slot: 'character', rarity: 'legendary', name: '나의 이상형', note: '연파랑 니트 모자와 하늘색 목도리, 하트를 뿅뿅 날리는 소년',
    art: '/images/tamagotchi/gacha/char_ideal.png' },
  { id: 'char_tteungchan', slot: 'character', rarity: 'legendary', name: '뜽찬땜', note: '검정 뿔테 안경에 체크무늬 남방을 걷어 올린 늘 웃는 얼굴',
    art: '/images/tamagotchi/gacha/char_tteungchan.png' },
  // 캐릭터 의뢰(2026-11-09) — 서버 20261109100000
  { id: 'char_bubbleturtle', slot: 'character', rarity: 'legendary', name: '방울 거북이', note: '물방울 위에서 사는, 늘 눈을 감고 있는 초록 거북이',
    art: '/images/tamagotchi/gacha/char_bubbleturtle.png' },
  // 의뢰(2026-11-11) — 서버 20261111235500. 캐릭터 «나의 이상형2» · 기기 디자인 «글리치»(첫 코드 껍데기 의뢰 — 의뢰자는 design = {theme: 'shell_glitch'})
  { id: 'char_ideal2', slot: 'character', rarity: 'legendary', name: '나의 이상형2', note: '웨이브 파마에 눈웃음, 회색 니트 후드 소년과 꼭 붙어 다니는 미니 눈사람',
    art: '/images/tamagotchi/gacha/char_ideal2.png' },
  // 캐릭터 의뢰(2026-11-13) — 서버 20261113100000
  { id: 'char_ideal3', slot: 'character', rarity: 'legendary', name: '나의 이상형3', note: '세이지 그린 투톤 니트 후드에 베이지 스카프, 도도한 올블랙 고양이와 함께하는 시크한 소년',
    art: '/images/tamagotchi/gacha/char_ideal3.png' },
  { id: 'shell_glitch', slot: 'shell', rarity: 'legendary', name: '글리치', note: '블랙 크롬에 네온 회로가 깜빡 — 뒷면 한가운데엔 행성',
    shell: shell({ base: ['#2b2f3d', '#11131c', '#05060b'], blobs: ['rgba(170,80,255,0.22)', 'rgba(40,200,255,0.18)', 'rgba(255,255,255,0.08)'],
      motif: 'circuit', motifColors: ['rgba(190,110,255,0.95)', 'rgba(60,220,255,0.95)', 'rgba(235,225,255,0.9)'], ring: 'rgba(190,110,255,0.9)',
      print: 'rgba(120,235,255,0.95)', bezel: '#030308', button: '#1b1e2a', socket: '#8a3dff', sheen: '#c8b6ff', trim: '#3b4052', iridescence: 0.4, label: '#c9a6ff',
      back: 'planet', roughness: 0.2, clearcoat: 1 }) },

  // ── 이벤트 전용(Phase 5, 마이그레이션 20261007140000) — 이벤트가 열려 있을 때만 뽑힌다 ──
  { id: 'shell_pumpkin', slot: 'shell', rarity: 'epic', name: '호박 등불', note: '주황 호박에 촛불이 반짝', event: true,
    shell: shell({ base: ['#ffb45c', '#ff8a2a', '#e0661a'], blobs: ['rgba(255,240,190,0.45)', 'rgba(255,200,120,0.35)', 'rgba(140,60,10,0.25)'],
      motif: 'star', motifColors: ['rgba(255,247,200,0.95)', 'rgba(60,30,60,0.55)', 'rgba(255,220,120,0.8)'], ring: 'rgba(70,35,60,0.7)',
      print: 'rgba(70,30,40,0.9)', bezel: '#1f1020', button: '#fff3d6', socket: '#5b2c56', sheen: '#fff0c8', trim: '#ff9f43', iridescence: 0.15, label: '#5b2c56' }) },
  { id: 'shell_snow', slot: 'shell', rarity: 'rare', name: '첫눈 우유', note: '하얀 눈송이가 소복소복', event: true,
    shell: shell({ base: ['#f4fbff', '#e2f1ff', '#c9e3ff'], blobs: ['rgba(255,255,255,0.6)', 'rgba(210,235,255,0.45)', 'rgba(170,205,255,0.35)'],
      motif: 'star', motifColors: ['rgba(255,255,255,0.98)', 'rgba(120,170,230,0.55)', 'rgba(200,225,255,0.85)'], ring: 'rgba(255,255,255,0.95)',
      print: 'rgba(60,100,170,0.9)', bezel: '#101a2e', button: '#ffffff', socket: '#8fb8ef', sheen: '#ffffff', trim: '#a9cbf5', iridescence: 0.35, label: '#3c64aa' }) },
  { id: 'wall_sakura', slot: 'wallpaper', rarity: 'rare', name: '벚꽃 비', note: '꽃잎이 흩날리는 분홍 벽', event: true,
    wallpaper: { day: ['#fff3f7', '#ffe1ec'], evening: ['#a46a90', '#82517a'], night: ['#4f2f58', '#3a2245'], pattern: 'leaves', ink: { day: '#ffb3cc', night: '#7d4a7c' } } },
  { id: 'rug_festival', slot: 'rug', rarity: 'rare', name: '축제 러그', note: '', event: true,
    rug: { outer: { day: '#ff6b6b', night: '#8a3a46' }, inner: { day: '#ffd45c', night: '#a0843a' } } },
  { id: 'floor_pumpkin', slot: 'floor', rarity: 'epic', name: '잭오랜턴', note: '', deco: 'pumpkin', event: true },
  { id: 'floor_snowman', slot: 'floor', rarity: 'rare', name: '눈사람', note: '', deco: 'snowman', event: true },
  { id: 'wall_bunting', slot: 'wall', rarity: 'common', name: '만국기', note: '', deco: 'bunting', event: true },
];

/** 상시 가챠 물건(이벤트 전용을 뺀 것) — 화면의 기본 확률 계산이 이것을 쓴다(서버가 확률을 주면 그것이 우선) */
export const BASE_CATALOG: CatalogItem[] = CATALOG.filter((i) => !i.event);

const REGISTRY = new Map<string, CatalogItem>(CATALOG.map((i) => [i.id, i]));
/** 물건 id → 물건. 고정 목록 + 받아 둔 나만의 꾸미기(registerCustomItems) */
export const ITEM_BY_ID: ReadonlyMap<string, CatalogItem> = REGISTRY;

// 나만의 꾸미기의 «판 번호» — 디자인이 바뀌거나 소품 그림이 막 도착하면 올린다. 방 그림 캐시 열쇠에 들어간다
// (안 넣으면 그림이 오기 전에 그린 빈 방이 캐시에 남아 영영 안 바뀐다 — 오류 없이).
let customVersion = 0;
const versionListeners = new Set<() => void>();
export const customVersionOf = () => customVersion;
/** 멈춰 있는 그림(친구 방 · 미리보기)이 다시 그리도록 알린다 — hooks/useCustomVersion */
export const subscribeCustomVersion = (cb: () => void) => { versionListeners.add(cb); return () => { versionListeners.delete(cb); }; };
export const bumpCustomVersion = () => { customVersion += 1; versionListeners.forEach((f) => f()); };

/** 서버가 준 나만의 꾸미기를 목록에 더한다(같은 것이면 그대로 — 판 번호를 괜히 올리지 않는다) */
export function registerCustomItems(items: CatalogItem[]) {
  let changed = false;
  for (const it of items) {
    if (!it.custom) continue;
    const prev = REGISTRY.get(it.id);
    if (prev && JSON.stringify(prev) === JSON.stringify(it)) continue;
    REGISTRY.set(it.id, it);
    changed = true;
  }
  if (changed) bumpCustomVersion();
}

/** 지금 아는 물건 전부(고정 + 나만의 꾸미기) — 꾸미기 창이 쓴다 */
export const allItems = (): CatalogItem[] => [...REGISTRY.values()];

/** 물건 하나의 확률(%) — 등급 무게 ÷ 그 등급의 물건 수 (서버 tama_shop_read 와 같은 식) */
export function itemProbability(item: CatalogItem, items: CatalogItem[] = BASE_CATALOG): number {
  const total = RARITY_ORDER.filter((r) => items.some((i) => i.rarity === r)).reduce((s, r) => s + RARITY[r].weight, 0);
  const sameTier = items.filter((i) => i.rarity === item.rarity).length;
  return (RARITY[item.rarity].weight / sameTier / total) * 100;
}

/** 꾸민 상태 — 자리 → 물건 id */
export type Equipped = Partial<Record<ItemSlot, string>>;

export const equippedItem = <K extends 'shell' | 'wallpaper' | 'rug'>(eq: Equipped, slot: ItemSlot, key: K) =>
  (eq[slot] ? ITEM_BY_ID.get(eq[slot]!)?.[key] : undefined) as CatalogItem[K] | undefined;

/** 화면 캐시 열쇠 — 방 그림이 꾸미기에 따라 달라진다 */
export function roomKey(eq: Equipped): string {
  return ['wallpaper', 'rug', 'floor', 'shelf', 'wall'].map((s) => eq[s as ItemSlot] ?? '-').join('|');
}

/** 지금 펫이 사는 기기 — 'device' 자리에 장착한 것, 없으면 컬러(기본) */
export function deviceStyleOf(eq: Equipped): DeviceStyle {
  const id = eq.device;
  return (id ? ITEM_BY_ID.get(id)?.device : undefined) ?? 'color';
}

/** 그 기기를 쓰려면 장착할 물건 — 컬러는 장착 없음(null) */
export const deviceItemOf = (style: DeviceStyle): string | null =>
  style === 'color' ? null : CATALOG.find((i) => i.device === style)?.id ?? null;
