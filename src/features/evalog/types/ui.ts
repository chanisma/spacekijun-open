// 탭 타입
export interface TabItem {
    id: string;
    label: string;
    content?: string;
    type: 'document' | 'worksheet' | 'note' | 'chart';
    active?: boolean;
}

// 형광펜 타입
export interface Highlighter {
    id: number;
    color: string;
    name: string;
    active: boolean;
}

// 컨텍스트 메뉴 아이템 타입
export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: string;
    shortcut?: string;
    action: () => void;
    separator?: boolean;
    disabled?: boolean;
}
