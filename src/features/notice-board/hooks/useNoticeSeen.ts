// ========================================
// 공지 확인(seen) 상태 관리 — 사용자별 localStorage 저장
// "새 공지" 뱃지 = 아직 확인하지 않은 활성 공지 존재 여부
// ========================================

import { useCallback, useEffect, useState } from 'react';
import type { DepartmentNotice } from '../types';

const STORAGE_KEY = 'notice-board-seen-v1';

function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // storage 불가 환경(시크릿 모드 등)은 조용히 무시 — 뱃지가 항상 보일 뿐
  }
}

export interface UseNoticeSeenResult {
  /** 해당 공지를 아직 확인하지 않았는지 */
  isUnseen: (noticeId: string) => boolean;
  /** 공지들을 확인 처리 */
  markSeen: (noticeIds: string[]) => void;
}

/**
 * @param notices 현재 존재하는 전체 공지 — 삭제된 공지 id를 저장소에서 정리(prune)하는 기준
 */
export function useNoticeSeen(notices: DepartmentNotice[] | undefined): UseNoticeSeenResult {
  const [seenIds, setSeenIds] = useState<Set<string>>(() => loadSeenIds());

  // 삭제된 공지 id 정리 — 저장소 무한 증가 방지
  useEffect(() => {
    if (!notices || notices.length === 0) return;
    const existing = new Set(notices.map((n) => n.id));
    setSeenIds((prev) => {
      const pruned = new Set([...prev].filter((id) => existing.has(id)));
      if (pruned.size !== prev.size) {
        saveSeenIds(pruned);
        return pruned;
      }
      return prev;
    });
  }, [notices]);

  const isUnseen = useCallback((noticeId: string) => !seenIds.has(noticeId), [seenIds]);

  const markSeen = useCallback((noticeIds: string[]) => {
    if (noticeIds.length === 0) return;
    setSeenIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      noticeIds.forEach((id) => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      if (!changed) return prev;
      saveSeenIds(next);
      return next;
    });
  }, []);

  return { isUnseen, markSeen };
}
