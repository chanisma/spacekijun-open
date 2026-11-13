/**
 * pretext - Markdown-inspired markup language
 * Based on pretext@0.3.0 by Antti Sykäri (BSD license)
 * Fixed for ESM strict mode: implicit global variables declared explicitly.
 */

function untabify(input: string): string {
  let result = '';
  let column = 0;
  for (let i = 0, len = input.length; i < len; i++) {
    const c = input[i];
    if (c === '\t') {
      result += ' ';
      while (++column % 4 !== 0) result += ' ';
      continue;
    } else if (c === '\n') {
      column = 0;
    } else {
      column++;
    }
    result += c;
  }
  return result;
}

function trim(input: string): string {
  const withoutBlankLines = input.replace(/\n[ \f\r\t\v]*$/gm, '\n');
  return withoutBlankLines.replace(/(^\n*)|(\n*$)/g, '');
}

function split(input: string): string[] {
  return input.split(/\n\n+/);
}

function escape(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeCode(input: string): string {
  return escape(input).replace(/\\(.)/g, '$1');
}

function escapeSome(input: string): string {
  const escapedCharRef = /&amp;(#(?:x?[0-9]+)|(?:[a-zA-Z]+?));/gi;
  return escape(input).replace(escapedCharRef, '&$1;');
}

function codify(input: string): string {
  const pattern = /([^\\]|^)`([^\\`]*(?:\\.[^`\\]*)*)`/g;
  return input.replace(pattern, (_m, p1, p2) => p1 + '<code>' + escapeCode(p2) + '</code>');
}

function italicize(input: string): string {
  const pattern = /([^<:\/]|^)\B\/(?!\s)([^]*?[^:\/\s])\/\B/g;
  return input.replace(pattern, '$1<i>$2</i>');
}

function boldify(input: string): string {
  const pattern = /\B\*(?!\s)([^]*?[^\s])\*\B/g;
  return input.replace(pattern, '<b>$1</b>');
}

function linkify(input: string): string {
  const pattern = /\b_(?!\s)([^]*?[^\s])_(?:\s*\(((?:[^\(\)]*\((?:[^\(\)]*\([^\(\)]*\))*[^\(\)]*\))*[^\(\)]*)\)|\b)/g;
  return input.replace(pattern, (_m, p1, p2) => {
    const href = p2 ? " href='" + escapeSome(p2) + "'" : '';
    return '<a' + href + '>' + p1 + '</a>';
  });
}

function dashify(input: string): string {
  const pattern = /(^|[^!-])(---?)([^->]|$)/g;
  return input.replace(pattern, (_m, p1, p2, p3) => p1 + '&' + (p2.length === 2 ? 'n' : 'm') + 'dash;' + p3);
}

function plainText(input: string): string {
  return [escapeSome, italicize, boldify, linkify, dashify].reduce((t, f) => f(t), input);
}

function textWithHtml(input: string): string {
  const betweenPattern = /(^|[^=<>]\s*>)([^]*?)(<\/?\b|$)/g;
  return input.replace(betweenPattern, (_m, p1, p2, p3) => p1 + plainText(p2) + p3);
}

/** Inline text renderer (bold, italic, code, links — no block elements) */
export function inlineText(input: string): string {
  return textWithHtml(codify(input));
}

function li(item: string): string {
  const content = item.replace(/^(- |[0-9]+\. )/, '');
  return '<li>' + inlineText(content);
}

function ul(element: string): string {
  let result = '<ul>\n';
  element.split(/\n- /).forEach((item) => { result += li(item) + '\n'; });
  return result + '</ul>';
}

function ol(element: string): string {
  const first = (element.match(/^([0-9]+)\. /) || ['', '1'])[1];
  let result = first === '1' ? '<ol>\n' : `<ol start=${first}>\n`;
  element.split(/\n(?:[0-9]+)\. /).forEach((item) => { result += li(item) + '\n'; });
  return result + '</ol>';
}

type BlockType = 'heading' | 'codeBlock' | 'ul' | 'ol' | 'blockquote' | 'html' | 'paragraph';

function blockType(element: string): BlockType {
  if (/^#{1,6} /.test(element)) return 'heading';
  if (/^    /.test(element) || /^\*   /.test(element)) return 'codeBlock';
  if (/^- /.test(element)) return 'ul';
  if (/^[0-9]+\. /.test(element)) return 'ol';
  if (/^> /.test(element)) return 'blockquote';
  if (/^\s*</.test(element)) return 'html';
  return 'paragraph';
}

function handleBlock(element: string): string {
  const type = blockType(element);
  if (type === 'paragraph') return '<p>' + inlineText(element);
  if (type === 'heading') {
    const match = element.match(/^(#{1,6}) ([^]*)$/)!;
    const level = match[1].length;
    return `<h${level}>${inlineText(match[2])}</h${level}>`;
  }
  if (type === 'codeBlock') {
    const lines = element.split('\n').map((line) => {
      const m = line.match(/^(\*| )   (.*)$/);
      if (!m) return escape(line);
      return m[1] === '*' ? '<b>' + escape(m[2]) + '</b>' : escape(m[2]);
    });
    return '<pre class=code>' + lines.join('\n') + '</pre>';
  }
  if (type === 'ul') return ul(element);
  if (type === 'ol') return ol(element);
  if (type === 'blockquote') {
    const stripped = element.replace(/^>( |$)/gm, '');
    return '<blockquote>' + render(stripped) + '</blockquote>';
  }
  // html passthrough
  return element;
}

function joinCodeBlocks(parts: string[]): string[] {
  const result: string[] = [];
  for (const part of parts) {
    if (result.length && blockType(part) === 'codeBlock' && blockType(result[result.length - 1]) === 'codeBlock') {
      result[result.length - 1] += '\n    \n' + part;
    } else {
      result.push(part);
    }
  }
  return result;
}

/** Full block renderer: paragraphs, headings, lists, blockquotes, code blocks */
export function render(input: string): string {
  const parts = joinCodeBlocks(split(untabify(trim(input))));
  return parts.map(handleBlock).join('\n') + '\n';
}

export default render;
