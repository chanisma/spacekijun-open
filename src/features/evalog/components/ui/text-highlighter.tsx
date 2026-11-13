import React, { useState, useRef, useEffect } from 'react';
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './popover';
import { Highlighter, MessageCircle, X } from 'lucide-react';

interface Highlight {
  id: string;
  text: string;
  color: string;
  note?: string;
  startOffset: number;
  endOffset: number;
  timestamp: Date;
}

interface TextHighlighterProps {
  content: string;
  highlights: Highlight[];
  onAddHighlight: (highlight: Omit<Highlight, 'id' | 'timestamp'>) => void;
  onRemoveHighlight: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
  editable?: boolean;
}

const highlightColors = [
  { name: '노란색', value: '#fef3c7' },
  { name: '녹색', value: '#d1fae5' },
  { name: '파란색', value: '#dbeafe' },
  { name: '보라색', value: '#e9d5ff' },
  { name: '분홍색', value: '#fce7f3' },
  { name: '주황색', value: '#fed7aa' },
];

const TextHighlighter: React.FC<TextHighlighterProps> = ({
  content,
  highlights = [],
  onAddHighlight,
  onRemoveHighlight,
  onUpdateNote,
  editable = true,
}) => {
  const [selectedText, setSelectedText] = useState<{
    text: string;
    start: number;
    end: number;
  } | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [, setSelectedHighlight] = useState<Highlight | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  const handleTextSelection = () => {
    if (!editable || !contentRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectedText(null);
      setShowColorPicker(false);
      return;
    }

    const selectedString = selection.toString().trim();
    if (selectedString.length === 0) {
      setSelectedText(null);
      setShowColorPicker(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(contentRef.current);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const start = preSelectionRange.toString().length;

    setSelectedText({
      text: selectedString,
      start,
      end: start + selectedString.length,
    });
    setShowColorPicker(true);
  };

  const handleAddHighlight = (color: string) => {
    if (!selectedText) return;

    onAddHighlight({
      text: selectedText.text,
      color,
      startOffset: selectedText.start,
      endOffset: selectedText.end,
    });

    setSelectedText(null);
    setShowColorPicker(false);
    window.getSelection()?.removeAllRanges();
  };

  const handleRemoveHighlight = (id: string) => {
    onRemoveHighlight(id);
    setSelectedHighlight(null);
  };

  const handleUpdateNote = (id: string) => {
    onUpdateNote(id, noteInput);
    setNoteInput('');
    setSelectedHighlight(null);
  };

  const renderHighlightedContent = () => {
    if (highlights.length === 0) {
      return <span>{content}</span>;
    }

    // Sort highlights by start position
    const sortedHighlights = [...highlights].sort((a, b) => a.startOffset - b.startOffset);

    const elements: React.ReactNode[] = [];
    let lastOffset = 0;

    sortedHighlights.forEach((highlight) => {
      // Add text before highlight
      if (lastOffset < highlight.startOffset) {
        elements.push(
          <span key={`text-${lastOffset}`}>
            {content.substring(lastOffset, highlight.startOffset)}
          </span>
        );
      }

      // Add highlighted text
      elements.push(
        <Popover key={highlight.id}>
          <PopoverTrigger asChild>
            <span
              className="cursor-pointer relative inline-block"
              style={{ backgroundColor: highlight.color }}
              onClick={() => {
                setSelectedHighlight(highlight);
                setNoteInput(highlight.note || '');
              }}
            >
              {content.substring(highlight.startOffset, highlight.endOffset)}
              {highlight.note && (
                <MessageCircle className="inline-block w-3 h-3 ml-1" />
              )}
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">하이라이트</span>
                <button
                  onClick={() => handleRemoveHighlight(highlight.id)}
                  className="text-destructive hover:text-destructive/80"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-2 rounded" style={{ backgroundColor: highlight.color }}>
                {highlight.text}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">메모</label>
                <textarea
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="메모를 입력하세요..."
                  className="w-full p-2 text-sm border rounded resize-none h-20"
                />
                <button
                  onClick={() => handleUpdateNote(highlight.id)}
                  className="w-full py-1 px-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 text-sm"
                >
                  메모 저장
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(highlight.timestamp).toLocaleString('ko-KR')}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      );

      lastOffset = highlight.endOffset;
    });

    // Add remaining text
    if (lastOffset < content.length) {
      elements.push(
        <span key={`text-${lastOffset}`}>
          {content.substring(lastOffset)}
        </span>
      );
    }

    return elements;
  };

  useEffect(() => {
    const handleMouseUp = () => {
      setTimeout(handleTextSelection, 10);
    };

    if (editable && contentRef.current) {
      contentRef.current.addEventListener('mouseup', handleMouseUp);
      return () => {
        contentRef.current?.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [editable]);

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className={cn(
          "text-sm leading-relaxed",
          editable && "select-text"
        )}
      >
        {renderHighlightedContent()}
      </div>

      {/* Color Picker Popover */}
      {showColorPicker && selectedText && (
        <div className="absolute z-50 mt-2 p-2 bg-popover border rounded-lg shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <Highlighter className="h-4 w-4" />
            <span className="text-sm font-medium">하이라이트 색상 선택</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {highlightColors.map((color) => (
              <button
                key={color.value}
                onClick={() => handleAddHighlight(color.value)}
                className="w-12 h-12 rounded border-2 border-border hover:border-primary transition-colors"
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
          <button
            onClick={() => {
              setShowColorPicker(false);
              setSelectedText(null);
            }}
            className="mt-2 w-full py-1 text-sm text-muted-foreground hover:text-foreground"
          >
            취소
          </button>
        </div>
      )}
    </div>
  );
};

export default TextHighlighter;