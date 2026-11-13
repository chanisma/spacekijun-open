// 'card' = container card, 'text'/'image'/'birthday'/'document' = items within a card
export type ContentType = 'card' | 'text' | 'image' | 'birthday' | 'document';

export interface DashboardInfoBox {
  id: string;
  title: string;
  content_type: ContentType;
  content: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  display_order: number;
  parent_card_id: string | null; // NULL = card, NOT NULL = item within card
}

export interface StudentBirthday {
  displayName: string;
  grade: number;
  class: number;
  number: number;
}

export interface CreateDashboardInfoBoxInput {
  title: string;
  content_type: ContentType;
  content: string;
  is_active?: boolean;
  display_order?: number;
  parent_card_id?: string | null;
}

export interface UpdateDashboardInfoBoxInput {
  title?: string;
  content_type?: ContentType;
  content?: string;
  is_active?: boolean;
  display_order?: number;
  parent_card_id?: string | null;
}
