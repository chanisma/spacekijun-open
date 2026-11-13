import type { Student } from '../../../types';

interface BookInfo {
  title: string;
  author: string;
  semester: number;
  related: string;
  isDuplicate: boolean;
  duplicateCount: number;
}

function parseContent(record: any): { title: string; author: string } {
  if (record.title && record.author) {
    return { title: record.title, author: record.author };
  }
  const content = record.content || '';
  const match = content.match(/^(.+?)\(([^)]+)\)$/);
  if (match) {
    return { title: match[1].trim(), author: match[2].trim() };
  }
  return { title: content, author: '' };
}

export function renderReadingList(student: Student, grade: number): string | null {
  const reading = student.reading as any[] | undefined;
  if (!reading) return null;

  const extractedOnly = reading.filter(r => r.source === 'extracted' && r.grade === grade);
  if (extractedOnly.length === 0) return null;

  // Parse and detect duplicates
  const titleCounts = new Map<string, number>();
  const books: BookInfo[] = [];

  for (const record of extractedOnly) {
    const { title, author } = parseContent(record);
    if (!title) continue;

    const normalized = title.trim().toLowerCase();
    titleCounts.set(normalized, (titleCounts.get(normalized) || 0) + 1);

    books.push({
      title,
      author,
      semester: record.semester || 0,
      related: record.related || '',
      isDuplicate: false,
      duplicateCount: 0,
    });
  }

  for (const book of books) {
    const count = titleCounts.get(book.title.trim().toLowerCase()) || 1;
    if (count > 1) {
      book.isDuplicate = true;
      book.duplicateCount = count;
    }
  }

  if (books.length === 0) return null;

  const rows = books.map((book, idx) => {
    const dupBadge = book.isDuplicate
      ? `<span class="duplicate-badge">${book.duplicateCount}회</span>`
      : '';
    return `<tr${book.isDuplicate ? ' style="background:#fffbeb"' : ''}>
      <td>${idx + 1}</td>
      <td class="text-left" style="font-weight:500">${book.title}${dupBadge}</td>
      <td>${book.author || '-'}</td>
      <td>${book.semester > 0 ? `${book.semester}학기` : '-'}</td>
      <td class="text-left">${book.related || '-'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="print-section">
      <div class="print-section-title">
        <span class="tab-badge">독서</span>
        ${grade}학년 독서 목록 (${books.length}권)
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:30px">#</th>
            <th style="text-align:left">도서명</th>
            <th style="width:100px">저자</th>
            <th style="width:60px">학기</th>
            <th style="text-align:left;width:100px">관련 과목</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
