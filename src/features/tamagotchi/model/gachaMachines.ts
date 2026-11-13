/**
 * 가챠 기계 다섯(2026-10-13 사용자 지시 «각 꾸미기 종류별로도 가챠 · 가격은 전체보다 비싸게 · 기계 디자인도 나오는 것에 따라 다르게»).
 *
 * ⚠️ id · 자리 · 값 · 환급은 서버 `tama_private.gacha_machine`(20261013130000 → 값은 20261013150000) 과 같아야 한다 — 회귀가 대조한다.
 * 값(2026-10-13 사용자 지시 «조금 더 비싸게, 생성(의뢰)보다는 싸게, 10원 단위»): 같은 종류의 의뢰보다 언제나 싸다. 환급 = 값의 4분의 1(반올림).
 * 확률은 기계마다 그 기계의 물건만으로 다시 나눈다(서버 shop_read 의 machines[id].probs 가 정본, 없으면 machineProbability).
 * 3D 기계의 색·간판·꼭대기 장식(theme)은 화면 전용이다. three 를 import 하지 않는다(메뉴·회귀가 그대로 쓴다).
 */
import { BASE_CATALOG, RARITY, RARITY_ORDER, type CatalogItem, type ItemSlot } from './catalog';

export type GachaMachineId = 'all' | 'character' | 'device' | 'shell' | 'deco';

export interface MachineTheme {
  /** 몸통(래커) · 강조(받침·간판·손잡이) · 배출구 안 */
  body: string;
  accent: string;
  inner: string;
  /** 창 안 뒷벽 그라데이션 · 별 무늬 색 · 옆 안벽 */
  back: [string, string];
  backStar: string;
  innerWall: string;
  /** 간판 그라데이션 · 글씨 외곽선 */
  header: [string, string, string];
  headerStroke: string;
  /** 간판 큰 글씨 · 작은 영문 */
  title: string;
  subtitle: string;
  /** 옆면 인쇄 바탕 · 글씨 색 */
  side: [string, string];
  label: string;
  /** 창 안 캡슐 색 */
  capsules: string[];
  /** 꼭대기 장식 — 나오는 것을 말한다 */
  topper: 'star' | 'ears' | 'antenna' | 'bow' | 'roof';
  topperColor: string;
}

export interface GachaMachine {
  id: GachaMachineId;
  /** 메뉴 배너 제목 */
  name: string;
  /** 무엇이 나오는가(한 줄) */
  blurb: string;
  /** null = 전부 */
  slots: ItemSlot[] | null;
  price: number;
  refund: number;
  /** 메뉴 배너 그림(public) */
  banner: string;
  theme: MachineTheme;
}

export const GACHA_MACHINES: GachaMachine[] = [
  {
    id: 'all', name: '별빛 가챠', blurb: '모든 물건이 나와요', slots: null, price: 30, refund: 8,
    banner: '/images/tamagotchi/gacha/banner-all.jpg',
    theme: {
      body: '#fbf7ff', accent: '#8b68f2', inner: '#3a2e66', back: ['#f3ecff', '#e2d6ff'], backStar: '160,130,255', innerWall: '#e6dcff',
      header: ['#ff8fc4', '#b98cff', '#7c8cff'], headerStroke: '#5b3aa8', title: '별빛 가챠', subtitle: 'STARLIGHT  CAPSULE',
      side: ['#f4ecff', '#ffe3f1'], label: '#7b5cf0',
      capsules: ['#ff7b9c', '#7cc8ff', '#ffd34d', '#8fe3a0', '#b79bff', '#ff9f43', '#ffffff', '#4f7dff'],
      topper: 'star', topperColor: '#ffd34d',
    },
  },
  {
    id: 'character', name: '캐릭터 가챠', blurb: '펫이 입는 캐릭터만', slots: ['character'], price: 120, refund: 30,
    banner: '/images/tamagotchi/gacha/banner-character.jpg',
    theme: {
      body: '#fff6ee', accent: '#e8693e', inner: '#5a2a1e', back: ['#fff1e4', '#ffd9c4'], backStar: '240,140,100', innerWall: '#ffe2d0',
      header: ['#ffb37a', '#ff7f6e', '#e8558a'], headerStroke: '#8a2f2a', title: '캐릭터 가챠', subtitle: 'CHARACTER  CAPSULE',
      side: ['#fff1e4', '#ffe0ea'], label: '#d4532e',
      capsules: ['#ff9f6e', '#ffd34d', '#ff7b9c', '#e8693e', '#ffffff', '#c97b4a', '#ffc4a8'],
      topper: 'ears', topperColor: '#c97b4a',
    },
  },
  {
    id: 'device', name: '기기 가챠', blurb: '펫이 사는 기기 종류만', slots: ['device'], price: 80, refund: 20,
    banner: '/images/tamagotchi/gacha/banner-device.jpg',
    theme: {
      body: '#f2fffb', accent: '#1d9e98', inner: '#103c40', back: ['#e8fffa', '#cdf3f0'], backStar: '60,190,180', innerWall: '#d6f6f2',
      header: ['#6ee7d6', '#3cc4e8', '#4f7dff'], headerStroke: '#0f5560', title: '기기 가챠', subtitle: 'DEVICE  CAPSULE',
      side: ['#e8fffa', '#dff2ff'], label: '#138a85',
      capsules: ['#5fe0cf', '#7cc8ff', '#4f7dff', '#b7f5ec', '#ffffff', '#2fb3a8'],
      topper: 'antenna', topperColor: '#ff6b8a',
    },
  },
  {
    id: 'shell', name: '디자인 가챠', blurb: '기기 디자인(껍데기)만', slots: ['shell'], price: 100, refund: 25,
    banner: '/images/tamagotchi/gacha/banner-shell.jpg',
    theme: {
      body: '#fff7fb', accent: '#e86aa8', inner: '#4a2140', back: ['#fff0f7', '#f1e6ff'], backStar: '230,120,180', innerWall: '#fde6f3',
      header: ['#ffc4e1', '#c9b6ff', '#8fd8ff'], headerStroke: '#a43d72', title: '디자인 가챠', subtitle: 'SHELL  CAPSULE',
      side: ['#fff0f7', '#e8f6ff'], label: '#c2478a',
      capsules: ['#ffadc9', '#c9b6ff', '#9fe3ff', '#fff4b0', '#b8f0e0', '#ffffff'],
      topper: 'bow', topperColor: '#ff8fc4',
    },
  },
  {
    id: 'deco', name: '소품 가챠', blurb: '벽지 · 러그 · 방 소품만', slots: ['wallpaper', 'rug', 'floor', 'shelf', 'wall'], price: 60, refund: 15,
    banner: '/images/tamagotchi/gacha/banner-deco.jpg',
    theme: {
      body: '#fffaf0', accent: '#c4823f', inner: '#4a2e18', back: ['#fff6e6', '#f6e2c4'], backStar: '210,150,80', innerWall: '#f7e7cf',
      header: ['#ffe0a3', '#f4b860', '#d9844a'], headerStroke: '#6b3f1d', title: '소품 가챠', subtitle: 'ROOM  CAPSULE',
      side: ['#fff6e6', '#fde9d6'], label: '#a3602b',
      capsules: ['#ffd34d', '#8fe3a0', '#f4b860', '#ff9f43', '#ffffff', '#c98a4b'],
      topper: 'roof', topperColor: '#d9844a',
    },
  },
];

/** 꾸미기 자리 → 그 자리가 나오는 기계(꾸미기 창의 «가챠 하러 가기») */
export const machineForSlot = (slot: ItemSlot): GachaMachineId =>
  GACHA_MACHINES.find((m) => m.id !== 'all' && m.slots?.includes(slot))?.id ?? 'all';

export const MACHINE_BY_ID = new Map(GACHA_MACHINES.map((m) => [m.id, m]));
export const machineOf = (id: string | null | undefined): GachaMachine => MACHINE_BY_ID.get(id as GachaMachineId) ?? GACHA_MACHINES[0];

/** 이 기계에서 나올 수 있는 물건(상시 목록 기준 — 이벤트 물건은 서버 확률이 0 보다 크면 화면이 더한다) */
export const machineItems = (m: GachaMachine, items: CatalogItem[] = BASE_CATALOG) =>
  items.filter((i) => !m.slots || m.slots.includes(i.slot));

/** 서버 확률이 없을 때의 대체 — 서버와 같은 식(그 기계의 물건만으로 등급 무게를 나눈다) */
export function machineProbability(m: GachaMachine, item: CatalogItem, items: CatalogItem[] = BASE_CATALOG): number {
  const pool = machineItems(m, items);
  if (!pool.some((i) => i.id === item.id)) return 0;
  const total = RARITY_ORDER.filter((r) => pool.some((i) => i.rarity === r)).reduce((s, r) => s + RARITY[r].weight, 0);
  const sameTier = pool.filter((i) => i.rarity === item.rarity).length;
  return (RARITY[item.rarity].weight / sameTier / total) * 100;
}
