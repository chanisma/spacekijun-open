import { render as pretextRender, inlineText as pretextInline } from '@/lib/pretext';
import DOMPurify from 'dompurify';

interface Props {
  content: string;
  className?: string;
}

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

/**
 * 전체 블록 렌더링: 문단, 제목, 목록, 인용문 등 block-level 요소 포함.
 * 노트 본문처럼 긴 텍스트에 사용.
 */
export function PretextContent({ content, className }: Props) {
  return (
    <div
      className={[
        'prose prose-sm prose-slate max-w-none',
        'prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      // pretext가 HTML escape 처리 후 DOMPurify로 2차 sanitize
      dangerouslySetInnerHTML={{ __html: sanitize(pretextRender(content)) }}
    />
  );
}

/**
 * 인라인 렌더링: *굵게*, /기울임/, `코드`, 링크만 처리. 블록 요소 없음.
 * 댓글, 설문 옵션, 체크리스트 항목 등 한 줄 텍스트에 사용.
 */
export function PretextInline({ content, className }: Props) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitize(pretextInline(content)) }}
    />
  );
}
