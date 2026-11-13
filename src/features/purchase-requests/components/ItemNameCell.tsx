import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Check, Loader2, Pencil, X } from 'lucide-react';

interface ItemNameCellProps {
  value: unknown;
  /** 매니저(페이지 작성자·공동 작업자)만 true */
  canEdit: boolean;
  saving?: boolean;
  onSave: (next: string) => void;
}

/**
 * 물품명 셀 — 매니저는 그 자리에서 고쳐 쓴다 (2026-09-02).
 *
 * 왜 인라인인가: 관리자가 발주 직전에 하는 교정은 "화이트보드마카 → 보드마카(검정)"
 * 같은 표기 통일이라, 모달을 열었다 닫는 왕복이 작업량의 대부분이 된다.
 *
 * 주의: 이 셀이 있는 행 전체가 '클릭하면 상세'라서, 편집 진입은 **연필 버튼**으로만 한다
 * (셀 클릭을 편집으로 쓰면 상세 열기와 충돌한다). 버튼·입력은 `isInteractiveTarget`
 * 판정에 걸려 행 클릭으로 전파되지 않는다.
 */
export function ItemNameCell({ value, canEdit, saving = false, onSave }: ItemNameCellProps) {
  const original = value === null || value === undefined ? '' : String(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(original);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(original);
  }, [original, editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next === original.trim()) return;
    onSave(next);
  };

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <Input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(original);
              setEditing(false);
            }
          }}
          className="h-7 min-w-[120px] px-1.5 text-xs"
        />
        <button
          type="button"
          onClick={commit}
          className="rounded p-0.5 text-emerald-600 hover:bg-emerald-50"
          title="저장 (Enter)"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(original);
            setEditing(false);
          }}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
          title="취소 (Esc)"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className="group/name inline-flex items-center gap-1">
      <span className={original ? 'whitespace-pre-wrap' : 'text-slate-400'}>{original || '—'}</span>
      {saving && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-slate-400" />}
      {/* 터치 기기에는 hover가 없어 연필이 영영 안 나온다 → 그때는 상시 노출 */}
      {canEdit && !saving && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded p-0.5 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 focus:opacity-100 group-hover/name:opacity-100 [@media(hover:none)]:opacity-100"
          title="물품명 수정"
          aria-label="물품명 수정"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
