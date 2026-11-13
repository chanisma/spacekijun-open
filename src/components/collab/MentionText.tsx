import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { StudentMentionPopup } from './StudentMentionPopup';
import { parseMentionContent } from '@/hooks/useStudentMention';
import { PretextInline } from '@/components/ui/PretextContent';

interface Props {
  content: string;
}

// "@[...내용...]" 패턴 파싱
const MENTION_REGEX = /@\[([^\]]+)\]/g;

interface TextSegment { type: 'text'; value: string }
interface MentionSegment { type: 'mention'; bracketContent: string }
type Segment = TextSegment | MentionSegment;

function parseContent(content: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'mention', bracketContent: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments;
}

export function MentionText({ content }: Props) {
  const segments = parseContent(content);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <PretextInline key={i} content={seg.value} />;
        }

        const parsed = parseMentionContent(seg.bracketContent);
        const isStudent = parsed.type === 'student';

        // 표시 텍스트: 학생은 "@G-C-N:이름", 교사는 "@이름"
        const displayLabel = isStudent
          ? `@${parsed.grade}-${parsed.classNum}-${parsed.number}:${parsed.name}`
          : `@${parsed.name}`;

        return (
          <HoverCard key={i} openDelay={300} closeDelay={100}>
            <HoverCardTrigger asChild>
              <span className={cn(
                'font-semibold cursor-pointer',
                isStudent ? 'text-indigo-600 hover:text-indigo-700' : 'text-emerald-600 hover:text-emerald-700'
              )}>
                {displayLabel}
              </span>
            </HoverCardTrigger>
            <HoverCardContent className="w-auto p-3" side="top" align="start">
              <StudentMentionPopup bracketContent={seg.bracketContent} />
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
