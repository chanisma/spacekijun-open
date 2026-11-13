/**
 * Sidebar Component - 사이드바
 * evalog 글래스모피즘 디자인 시스템 적용
 */

import React, { useState } from 'react';
import { Users, RotateCcw, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCourseAnalyzeData } from '../context';
import { UploadZone } from './UploadZone';
import { GradeSelector } from './GradeSelector';
import { YearSelector } from './YearSelector';
import { GradeSourceSelector } from './GradeSourceSelector';
import { SearchInput } from './SearchInput';
import { StudentList, StudentDetailPopup } from './StudentList';
import type { Student } from '../types/course.types';
import { SHOW_FILE_LOADING_UI } from '../config';

export function Sidebar() {
  const {
    students,
    currentStudents,
    cacheInfo,
    clearData,
    refreshData,
    isRefreshing,
    lastLoadedAt,
  } = useCourseAnalyzeData();
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const hasData = students.length > 0;

  // 상대 시간("3분 전")은 타이머 없이는 곧 거짓말이 되므로 절대 시각으로 고정 표시한다.
  const loadedAtLabel = lastLoadedAt
    ? new Date(lastLoadedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="relative flex flex-col h-full w-full">
      {/* 사이드바 헤더 - evalog 타이포그래피
          새로고침은 항상 노출, 데이터 초기화는 SHOW_FILE_LOADING_UI=true일 때만 */}
      {(SHOW_FILE_LOADING_UI || hasData) && (
        <div className="px-4 py-2.5 flex items-center justify-between gap-2 bg-white/50 backdrop-blur-sm border-b border-white/20 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse shrink-0"></span>
              <span className="truncate">{SHOW_FILE_LOADING_UI ? '데이터 관리' : '현재 데이터'}</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {isRefreshing
                ? '불러오는 중…'
                : loadedAtLabel
                  ? `${loadedAtLabel} 기준`
                  : ' '}
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {hasData && (
              <button
                onClick={() => { void refreshData(); }}
                disabled={isRefreshing}
                className="p-1.5 rounded-md hover:bg-slate-100/50 text-slate-400 hover:text-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-slate-400"
                title="현재 보고 있는 데이터(학년도·학년·차수)를 DB에서 다시 불러옵니다"
                aria-label="데이터 새로고침"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
              </button>
            )}
            {SHOW_FILE_LOADING_UI && hasData && (
              <button
                onClick={clearData}
                className="p-1.5 rounded-md hover:bg-slate-100/50 text-slate-400 hover:text-slate-600 transition-colors"
                title="데이터 초기화"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Upload Zone — 다른 학교 배포 시에만 표시 */}
      {SHOW_FILE_LOADING_UI && (
        <div className="px-4 py-3 border-b border-white/20 bg-gradient-to-b from-white/30 to-transparent">
          <UploadZone />
        </div>
      )}

      {/* Year Selector - DB 모드에서 "신청 학년도" 단위로 데이터 전환 (내부 값은 수강 연도) */}
      {hasData && (
        <div className="px-4 py-3 border-b border-white/20 bg-white/30">
          <YearSelector />
        </div>
      )}

      {/* Grade Selector */}
      {hasData && (
        <div className="px-4 py-3 border-b border-white/20 bg-white/30">
          <GradeSelector />
        </div>
      )}

      {/* Grade Source Selector — 다른 학교 배포 시에만 표시 */}
      {SHOW_FILE_LOADING_UI && hasData && (
        <div className="px-4 py-3 border-b border-white/20 bg-white/30">
          <GradeSourceSelector />
        </div>
      )}

      {/* Search */}
      {hasData && (
        <div className="px-4 py-3 border-b border-white/20 bg-white/30">
          <SearchInput />
        </div>
      )}

      {/* Student List Header - evalog 타이포그래피 */}
      {hasData && (
        <div className="px-5 py-2.5 border-b border-white/20 bg-white/50 backdrop-blur-sm shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-slate-400" />
              <span className="text-xs text-slate-600 font-medium tracking-tight">학생 목록</span>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="font-bold text-brand-600 text-xs">{currentStudents.length}</span>
              <span className="text-slate-400 text-xs">/</span>
              <span className="text-slate-500 text-xs">{students.length}</span>
              <span className="text-slate-400 text-xs ml-0.5">명</span>
            </div>
          </div>
        </div>
      )}

      {/* Student List - evalog 스크롤 스타일 */}
      <div className={cn(
        'flex-1 overflow-y-auto custom-scrollbar',
        !hasData && 'hidden'
      )}>
        {hasData && (
          <div className="p-3">
            <StudentList
              selectedStudent={selectedStudent}
              onStudentSelect={setSelectedStudent}
            />
          </div>
        )}
      </div>

      {/* Cache Info Footer - evalog 스타일 */}
      {cacheInfo && (
        <div className="px-4 py-2.5 border-t border-white/20 bg-white/40 backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="w-1 h-1 rounded-full bg-brand-400"></span>
              <span>{cacheInfo.grades.join(', ')}학년</span>
            </div>
            <div className="flex items-center gap-1 text-slate-400">
              <span>총</span>
              <span className="font-bold text-brand-500">{cacheInfo.totalStudents}</span>
              <span>명</span>
            </div>
          </div>
        </div>
      )}

      {/* Student Detail Popup */}
      <StudentDetailPopup
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
      />
    </div>
  );
}
