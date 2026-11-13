import React, { useMemo } from 'react';
import { Student } from '../../types';
import { ReadingRecord } from '../../types/pdfTypes';
import { BookOpen, AlertTriangle, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReadingTabProps {
  student: Student;
}

interface BookInfo {
  title: string;
  author: string;
  grade: number;
  semester: number;
  related: string;
  source?: string;
  isDuplicate: boolean;
  duplicateCount: number;
}

const ReadingTab: React.FC<ReadingTabProps> = ({ student }) => {
  const reading = student.reading as (ReadingRecord & { source?: string; title?: string; author?: string })[] | undefined;

  // Parse extracted book records and detect duplicates (within extracted only)
  const { books, duplicateMap, stats } = useMemo(() => {
    if (!reading || reading.length === 0) {
      return { books: [] as BookInfo[], duplicateMap: new Map<string, number>(), stats: { total: 0, unique: 0, duplicates: 0 } };
    }

    // 추출된 도서만 필터링
    const extractedOnly = reading.filter(r => r.source === 'extracted');

    if (extractedOnly.length === 0) {
      return { books: [] as BookInfo[], duplicateMap: new Map<string, number>(), stats: { total: 0, unique: 0, duplicates: 0 } };
    }

    // Extract title from content if title/author fields are not present
    const parseContent = (record: any): { title: string; author: string } => {
      if (record.title && record.author) {
        return { title: record.title, author: record.author };
      }
      const content = record.content || '';
      const match = content.match(/^(.+?)\(([^)]+)\)$/);
      if (match) {
        return { title: match[1].trim(), author: match[2].trim() };
      }
      return { title: content, author: '' };
    };

    // Count occurrences of each title (among extracted books only)
    const titleCounts = new Map<string, number>();
    const allBooks: BookInfo[] = [];

    for (const record of extractedOnly) {
      const { title, author } = parseContent(record);
      if (!title) continue;

      const normalizedTitle = title.trim().toLowerCase();
      titleCounts.set(normalizedTitle, (titleCounts.get(normalizedTitle) || 0) + 1);

      allBooks.push({
        title,
        author,
        grade: record.grade || 0,
        semester: record.semester || 0,
        related: record.related || '',
        source: record.source,
        isDuplicate: false,
        duplicateCount: 0,
      });
    }

    // Mark duplicates (within extracted books only)
    for (const book of allBooks) {
      const normalizedTitle = book.title.trim().toLowerCase();
      const count = titleCounts.get(normalizedTitle) || 1;
      if (count > 1) {
        book.isDuplicate = true;
        book.duplicateCount = count;
      }
    }

    const uniqueTitles = new Set(allBooks.map(b => b.title.trim().toLowerCase()));

    return {
      books: allBooks,
      duplicateMap: titleCounts,
      stats: {
        total: allBooks.length,
        unique: uniqueTitles.size,
        duplicates: [...titleCounts.values()].filter(c => c > 1).length,
      },
    };
  }, [reading]);

  // Group by grade
  const booksByGrade = useMemo(() => {
    const groups = new Map<number, BookInfo[]>();
    for (const book of books) {
      const list = groups.get(book.grade) || [];
      list.push(book);
      groups.set(book.grade, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b);
  }, [books]);

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
        <BookOpen size={48} className="text-slate-300" />
        <p className="text-sm font-medium">추출된 독서 기록이 없습니다</p>
        <p className="text-xs text-slate-400">관리자 패널에서 독서 데이터를 추출해 주세요</p>
      </div>
    );
  }

  return (
    <div className="relative isolate">
      <div className="space-y-6">
        {/* 통계 요약 */}
        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100/50">
            <div className="p-1.5 rounded-lg bg-cyan-50 text-cyan-600">
              <BookOpen size={18} />
            </div>
            <h3 className="font-semibold text-slate-800">독서 현황</h3>
          </div>

          <p className="text-[11px] text-slate-400 mb-3">'도서명(저자명)' 형식으로 기재된 도서만 추출됩니다. 다른 형식으로 표기된 도서는 누락될 수 있습니다.</p>

          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-50/50 border border-slate-100/50 text-center">
              <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
              <p className="text-xs text-slate-500 mt-1">전체 도서</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50/50 border border-slate-100/50 text-center">
              <p className="text-2xl font-bold text-slate-800">{stats.unique}</p>
              <p className="text-xs text-slate-500 mt-1">고유 도서</p>
            </div>
            <div className={cn(
              "p-4 rounded-xl border text-center",
              stats.duplicates > 0
                ? "bg-amber-50/50 border-amber-200/50"
                : "bg-slate-50/50 border-slate-100/50"
            )}>
              <p className={cn(
                "text-2xl font-bold",
                stats.duplicates > 0 ? "text-amber-600" : "text-slate-800"
              )}>
                {stats.duplicates}
              </p>
              <p className="text-xs text-slate-500 mt-1">중복 도서</p>
            </div>
          </div>
        </div>

        {/* 학년별 독서 목록 */}
        {booksByGrade.map(([grade, gradeBooks]) => (
          <div key={grade} className="glass-panel p-6">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100/50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600">
                  <BookOpen size={18} />
                </div>
                <h3 className="font-semibold text-slate-800">
                  {grade > 0 ? `${grade}학년` : '기타'} 독서 목록
                </h3>
                <span className="text-xs text-slate-400 ml-1">({gradeBooks.length}권)</span>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-100/60 shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-gray-100 text-slate-500">
                    <th className="py-3 px-4 text-left font-medium w-8">#</th>
                    <th className="py-3 px-4 text-left font-medium">도서명</th>
                    <th className="py-3 px-3 text-left font-medium w-32">저자</th>
                    <th className="py-3 px-3 text-center font-medium w-16">학기</th>
                    <th className="py-3 px-3 text-left font-medium w-24">관련 과목</th>
                    <th className="py-3 px-3 text-center font-medium w-16">중복</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {gradeBooks.map((book, idx) => (
                    <tr
                      key={idx}
                      className={cn(
                        "transition-colors hover:bg-slate-50",
                        book.isDuplicate && "bg-amber-50/30"
                      )}
                    >
                      <td className="py-2.5 px-4 text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">
                        {book.title}
                        {book.isDuplicate && (
                          <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold">
                            <Copy size={10} />
                            {book.duplicateCount}회
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{book.author || '-'}</td>
                      <td className="py-2.5 px-3 text-center text-slate-500">
                        {book.semester > 0 ? `${book.semester}학기` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{book.related || '-'}</td>
                      <td className="py-2.5 px-3 text-center">
                        {book.isDuplicate ? (
                          <AlertTriangle size={14} className="text-amber-500 inline" />
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* 중복 도서 요약 */}
        {stats.duplicates > 0 && (
          <div className="glass-panel p-6">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-amber-100/50">
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                <AlertTriangle size={18} />
              </div>
              <h3 className="font-semibold text-slate-800">중복 도서 목록</h3>
            </div>

            <div className="overflow-hidden rounded-xl border border-amber-100/60 shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-amber-50/50 border-b border-amber-100 text-slate-500">
                    <th className="py-3 px-4 text-left font-medium">도서명</th>
                    <th className="py-3 px-3 text-center font-medium w-20">등장 횟수</th>
                    <th className="py-3 px-3 text-left font-medium">등장 과목</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-50">
                  {[...duplicateMap.entries()]
                    .filter(([, count]) => count > 1)
                    .sort(([, a], [, b]) => b - a)
                    .map(([normalizedTitle, count]) => {
                      const matchingBooks = books.filter(
                        b => b.title.trim().toLowerCase() === normalizedTitle
                      );
                      const subjects = [...new Set(matchingBooks.map(b => b.related).filter(Boolean))];
                      const displayTitle = matchingBooks[0]?.title || normalizedTitle;
                      const displayAuthor = matchingBooks[0]?.author;

                      return (
                        <tr key={normalizedTitle} className="hover:bg-amber-50/30 transition-colors">
                          <td className="py-2.5 px-4 font-medium text-slate-800">
                            {displayTitle}
                            {displayAuthor && <span className="text-slate-400 ml-1">({displayAuthor})</span>}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
                              {count}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {subjects.join(', ') || '-'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReadingTab;
