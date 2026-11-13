// ========================================
// 공지 본문 렌더러
// plain text 본문에서 글머리·번호 기호 줄을 감지해
// 행잉 인덴트가 적용된 목록 형태로 표시. HTML 미사용(XSS 안전).
// [[type:id|라벨]] 링크 토큰은 클릭 가능한 칩으로 렌더.
// ========================================

import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ClipboardList, FileOutput, ListTodo, ShoppingCart, Sparkles, StickyNote } from 'lucide-react';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { useCurrentResourceId } from '@/hooks/useCurrentResourceId';
import { parseNoticeLines } from '../utils/noticeContent';
import { splitNoticeText, getNoticeLinkNav, type NoticeLinkToken, type NoticeLinkType } from '../utils/noticeLinks';
import { checkCollabBoardAccess } from '../utils/collabAccess';

const INDENT_PX = 16;

const LINK_ICON: Record<NoticeLinkType, typeof Calendar> = {
  schedule: Calendar,
  task: ListTodo,
  purchase: ShoppingCart,
  collab: StickyNote,
  docgen: FileOutput,
  activity: Sparkles,
  survey: ClipboardList,
};

interface NoticeContentViewProps {
  content: string;
  className?: string;
}

export function NoticeContentView({ content, className }: NoticeContentViewProps) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: resourceId } = useCurrentResourceId();
  const lines = useMemo(() => parseNoticeLines(content), [content]);

  const handleLinkClick = async (token: NoticeLinkToken) => {
    const target = getNoticeLinkNav(token);

    // 협업보드는 권한(공개/읽기전용 또는 비공개+멤버/admin)이 있어야 이동
    if (token.type === 'collab') {
      const access = await checkCollabBoardAccess(token.id, resourceId, isAdmin);
      if (access === 'missing') {
        toast.error('협업보드를 찾을 수 없습니다. 삭제되었을 수 있습니다.');
        return;
      }
      if (access === 'denied') {
        toast.error('이 협업보드에 접근할 권한이 없습니다.');
        return;
      }
    }

    navigate(target.to, target.state ? { state: target.state } : undefined);
  };

  // 한 줄 텍스트 → 일반 텍스트 + 링크 칩 조합
  const renderText = (text: string): ReactNode =>
    splitNoticeText(text).map((seg, i) => {
      if (seg.kind === 'text') return <span key={i}>{seg.text}</span>;

      const Icon = LINK_ICON[seg.token.type];
      return (
        <button
          key={i}
          type="button"
          onClick={() => void handleLinkClick(seg.token)}
          className={cn(
            'mx-0.5 inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50/80',
            'px-1.5 py-0.5 align-baseline text-xs font-medium text-blue-700',
            'transition-colors hover:bg-blue-100 hover:border-blue-300'
          )}
        >
          <Icon className="h-3 w-3 shrink-0" />
          {seg.token.label}
        </button>
      );
    });

  return (
    <div className={cn('text-sm leading-relaxed text-slate-700', className)}>
      {lines.map((line, i) => {
        if (line.marker) {
          // 목록 줄 — 마커 고정폭 + 행잉 인덴트 (줄바꿈 시 본문 위치 유지)
          return (
            <div
              key={i}
              className="flex items-start"
              style={{ paddingLeft: line.indent * INDENT_PX }}
            >
              <span className="shrink-0 pr-1.5 text-slate-500 tabular-nums">{line.marker}</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                {renderText(line.text)}
              </span>
            </div>
          );
        }

        // 일반 문단 — 빈 줄은 문단 간격으로
        return (
          <p
            key={i}
            className="min-h-[1.25em] whitespace-pre-wrap break-words"
            style={{ paddingLeft: line.indent * INDENT_PX }}
          >
            {renderText(line.text)}
          </p>
        );
      })}
    </div>
  );
}
