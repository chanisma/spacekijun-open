/**
 * Student List Component - 학생 목록
 * evalog 글래스모피즘 + 테이블 스타일 적용
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { useCourseAnalyzeFilter, useCourseAnalyzeData } from '../context';
import type { Student } from '../types/course.types';
import { X, BookOpen, GraduationCap } from 'lucide-react';

interface StudentListProps {
  onStudentSelect?: (student: Student) => void;
  selectedStudent?: Student | null;
}

export function StudentList({ onStudentSelect, selectedStudent }: StudentListProps) {
  const { currentStudents } = useCourseAnalyzeData();
  const { filteredStudents, hasActiveFilters } = useCourseAnalyzeFilter();

  const displayStudents = hasActiveFilters ? filteredStudents : currentStudents;

  if (displayStudents.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100/80 flex items-center justify-center">
          <GraduationCap className="w-6 h-6 text-slate-400" />
        </div>
        <p className="text-sm text-slate-500 font-medium">
          {currentStudents.length === 0
            ? '데이터를 업로드해주세요'
            : '검색 결과가 없습니다'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {displayStudents.map((student, index) => (
        <StudentListItem
          key={`${student.class}-${student.number}`}
          student={student}
          index={index}
          isSelected={selectedStudent?.id === student.id}
          onClick={() => onStudentSelect?.(student)}
        />
      ))}
    </div>
  );
}

interface StudentListItemProps {
  student: Student;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}

function StudentListItem({ student, index, isSelected, onClick }: StudentListItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group cursor-pointer transition-all duration-200 rounded-lg border",
        "flex items-center gap-3 px-3 py-2.5",
        isSelected
          ? "bg-brand-50/80 shadow-sm border-brand-200/60 scale-[1.01]"
          : "bg-white/50 hover:bg-white/80 hover:shadow-sm hover:scale-[1.005] border-white/40 hover:border-brand-100/50"
      )}
    >
      {/* 순번 */}
      <div className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors",
        isSelected
          ? "bg-brand-500 text-white"
          : "bg-slate-100/80 text-slate-500 group-hover:bg-brand-100 group-hover:text-brand-600"
      )}>
        {index + 1}
      </div>

      {/* 학생 정보 - evalog 타이포그래피 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={cn(
            "text-sm font-bold tracking-tight transition-colors truncate",
            isSelected ? "text-brand-700" : "text-slate-800 group-hover:text-slate-900"
          )}>
            {student.name}
          </span>
          <span className={cn(
            "text-xs font-medium font-mono shrink-0",
            isSelected ? "text-brand-500" : "text-slate-400"
          )}>
            {student.class}-{student.number}
          </span>
        </div>
      </div>

      {/* 과목 수 표시 */}
      <div className={cn(
        "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0",
        isSelected
          ? "bg-brand-100/80 text-brand-600"
          : "bg-slate-100/60 text-slate-500"
      )}>
        <BookOpen size={12} />
        <span>{student.semester1.length + student.semester2.length}</span>
      </div>
    </div>
  );
}

// Student Detail Popup - evalog 글래스 패널 스타일
interface StudentDetailPopupProps {
  student: Student | null;
  onClose: () => void;
}

export function StudentDetailPopup({ student, onClose }: StudentDetailPopupProps) {
  if (!student) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white/95 backdrop-blur-xl border border-white/60 rounded-2xl shadow-2xl max-w-md w-[90%] max-h-[85vh] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
      >
        {/* Header - evalog gradient + 타이포그래피 */}
        <div className="px-5 py-4 bg-gradient-to-r from-brand-600 to-brand-500 text-white relative">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <h3 className="text-lg font-bold tracking-tight">{student.name}</h3>
              <p className="text-white/80 text-xs font-medium font-mono">
                {student.year}-{student.class}-{student.number}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          {/* Decorative element */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-white/0 via-white/30 to-white/0" />
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-[calc(85vh-100px)] custom-scrollbar">
          {/* Student Meta Info - evalog 스타일 */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[
              { label: '학년', value: `${student.year}학년` },
              { label: '반', value: `${student.class}반` },
              { label: '번호', value: `${student.number}번` },
            ].map(item => (
              <div
                key={item.label}
                className="bg-slate-50/80 backdrop-blur-sm rounded-xl p-3 text-center border border-slate-100/60"
              >
                <div className="text-xs text-slate-400 font-medium mb-1">{item.label}</div>
                <div className="text-sm font-bold text-slate-700">{item.value}</div>
              </div>
            ))}
          </div>

          {/* Semester 1 Subjects - evalog 타이포그래피 */}
          <div className="mb-4">
            <h4 className="text-xs font-bold text-slate-700 tracking-tight mb-2.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              1학기 선택과목
              <span className="ml-auto flex items-baseline gap-0.5">
                <span className="text-xs font-bold text-blue-600">{student.semester1.length}</span>
                <span className="text-xs font-medium text-slate-400">과목</span>
              </span>
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {student.semester1.length > 0 ? (
                student.semester1.map(subject => (
                  <span
                    key={subject}
                    className="px-2.5 py-1 text-xs font-medium bg-blue-50/80 text-blue-600 rounded-full border border-blue-100/60"
                  >
                    {subject}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-400">선택 과목 없음</span>
              )}
            </div>
          </div>

          {/* Semester 2 Subjects - evalog 타이포그래피 */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 tracking-tight mb-2.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              2학기 선택과목
              <span className="ml-auto flex items-baseline gap-0.5">
                <span className="text-xs font-bold text-green-600">{student.semester2.length}</span>
                <span className="text-xs font-medium text-slate-400">과목</span>
              </span>
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {student.semester2.length > 0 ? (
                student.semester2.map(subject => (
                  <span
                    key={subject}
                    className="px-2.5 py-1 text-xs font-medium bg-green-50/80 text-green-600 rounded-full border border-green-100/60"
                  >
                    {subject}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-400">선택 과목 없음</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
