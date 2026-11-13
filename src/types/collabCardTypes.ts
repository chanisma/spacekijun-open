/**
 * Collaboration Card Type Definitions
 * Date: 2025-10-08
 *
 * Defines card types and data structures for collaboration notes
 */

// Card type enum
export type CardType = 'default' | 'notice';

// Notice card data - 공지 카드 (멤버 확인)
export interface NoticeCardData {
  acknowledgements: {
    [resourceId: string]: {
      acknowledged: boolean;
      acknowledged_at: string | null;
    };
  };
}

// Card data union type
export type CardData = NoticeCardData;

// Helper type guards
export function isNoticeCardData(data: CardData): data is NoticeCardData {
  return 'acknowledgements' in data;
}

// Card type display names
export const CARD_TYPE_LABELS: Record<CardType, string> = {
  default: '기본 노트',
  notice: '공지 카드',
};

// Card type descriptions
export const CARD_TYPE_DESCRIPTIONS: Record<CardType, string> = {
  default: '기본적인 텍스트와 첨부파일을 포함하는 노트',
  notice: '멤버들의 확인 여부를 체크할 수 있는 공지 카드',
};

// Linked item types
export type LinkedItemType = 'event' | 'task' | 'schedule';

export interface LinkedItem {
  type: LinkedItemType;
  id: string;
  name: string;
  status?: string;
  linked_at: string;
}
