/**
 * 화면 한 장을 그리는 데 필요한 것 — 컨트롤러가 0.1~0.25초마다 만들어 기기(클래식·컬러, 3D·2D)에 넘긴다.
 * 기기는 이것만 보고 그린다(펫 상태를 바꾸지 않는다).
 */
import type { UiState } from '../lcd/deviceUi';
import type { PetMessage } from './messages';
import type { PetState, PetView, RefuseReason } from './petModel';
import type { Equipped } from './catalog';

export interface ScreenNotice {
  /** 기기 밖에 보일 긴 글(클래식) */
  text: string;
  /** 컬러 화면 말풍선의 짧은 말 */
  short: string;
  at: number;
}

export interface ScreenInput {
  ui: UiState;
  state: PetState;
  view: PetView;
  now: number;
  messages: PetMessage[];
  /** 종 메뉴에서 아직 안 본 알림이 있다 */
  unread: boolean;
  notice: ScreenNotice | null;
  /** 컬러 기종의 화면 꺼짐(백라이트) — 오래 안 누르면 꺼지고, 첫 누름은 깨우기만 한다 */
  screenOff: boolean;
  /** 함께 집중이 끝나는 시각(서버 시각 ms) — 집중 중이 아니면 null */
  focusEndsAt?: number | null;
  /** 가챠로 꾸민 방(벽지·러그·소품) — 컬러 화면만 그린다 */
  equipped?: Equipped;
}

/** 거절 이유 → 컬러 화면 말풍선의 짧은 말 */
export const REFUSE_SHORT: Record<RefuseReason, string> = {
  egg: '…', class: '수업 중!', asleep: '쿨쿨…', full: '배불러!', happyFull: '행복해!', notSick: '안 아파!', nothing: '깨끗해!', tooSoon: '헤헤', sick: '아파서…', dead: '…', walked: '다리 아파~',
};
