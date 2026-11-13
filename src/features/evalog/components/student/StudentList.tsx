import React from 'react';
import { Student } from '../../types';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Edit,
  UserCheck,
  UserX,
  Copy,
  Eye,
  Trash,
  Trash2,
  Send,
  UserPlus,
  RefreshCw,
  Upload
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StudentListProps {
  students: Student[];
  selectedStudentId?: string;
  onSelectStudent: (student: Student) => void;
  onAddStudentClick?: () => void;
  onExcelImport?: (file: File) => void;
  onReset?: () => void;
  /** 현재 목록 학생들의 DB 자료 재조회 (우측 패널 작성 내용은 유지) */
  onReload?: () => void;
  reloading?: boolean;
}

const StudentList: React.FC<StudentListProps> = ({
  students,
  selectedStudentId,
  onSelectStudent,
  onAddStudentClick,
  onExcelImport,
  onReset,
  onReload,
  reloading = false
}) => {
  const handleContextMenuAction = (action: string, student: Student) => {
    // 실제 액션 처리
    switch (action) {
      case 'view':
        onSelectStudent(student);
        break;
      case 'edit':
        console.log('편집:', student.name);
        // TODO: 편집 모달 열기
        break;
      case 'copy':
        navigator.clipboard.writeText(JSON.stringify(student, null, 2));
        console.log('클립보드에 복사됨:', student.name);
        break;
      case 'complete':
        console.log('평가 완료 처리:', student.name);
        // TODO: 평가 완료 처리
        break;
      case 'reset':
        console.log('평가 초기화:', student.name);
        // TODO: 평가 초기화
        break;
      case 'send':
        console.log('결과 전송:', student.name);
        // TODO: 결과 전송
        break;
      case 'delete':
        console.log('삭제:', student.name);
        // TODO: 삭제 확인 다이얼로그
        break;
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* 헤더 */}
      <div className="px-5 py-3 flex items-center justify-between bg-white/50 backdrop-blur-sm border-b border-white/20 shrink-0">
        <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
          학생 목록
        </h2>
        <div className="flex items-center gap-1">
          {onReload && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReload}
              disabled={reloading}
              className="h-7 w-7 p-0 hover:bg-slate-200/50"
              title="학생 자료 다시 불러오기 (작성 중인 평가 내용은 유지)"
            >
              <RefreshCw className={cn('h-3.5 w-3.5 text-slate-500', reloading && 'animate-spin')} />
            </Button>
          )}
          {onReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="h-7 w-7 p-0 hover:bg-slate-200/50"
              title="학생 목록 초기화"
            >
              <Trash2 className="h-3.5 w-3.5 text-slate-500" />
            </Button>
          )}
          {onAddStudentClick && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => document.getElementById('excel-upload-input')?.click()}
                className="h-7 w-7 p-0 hover:bg-slate-200/50"
                title="엑셀 업로드"
              >
                <Upload className="h-3.5 w-3.5 text-slate-500" />
              </Button>
              <input
                id="excel-upload-input"
                type="file"
                className="hidden"
                accept=".xlsx, .xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && onExcelImport) {
                    onExcelImport(file);
                  }
                  e.target.value = '';
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={onAddStudentClick}
                className="h-7 w-7 p-0 hover:bg-slate-200/50"
                title="학생 추가"
              >
                <UserPlus className="h-3.5 w-3.5 text-slate-500" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 학생 목록 - 테이블 형식 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
        <table className="w-full text-xs border-separate border-spacing-y-1 px-4 pt-2">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="p-3 text-center font-medium text-slate-500 bg-slate-50/90 backdrop-blur rounded-l-lg w-[15%]">순번</th>
              <th className="p-3 text-center font-medium text-slate-500 bg-slate-50/90 backdrop-blur w-[15%]">학년</th>
              <th className="p-3 text-center font-medium text-slate-500 bg-slate-50/90 backdrop-blur w-[15%]">반</th>
              <th className="p-3 text-center font-medium text-slate-500 bg-slate-50/90 backdrop-blur w-[15%]">번호</th>
              <th className="p-3 text-center font-medium text-slate-500 bg-slate-50/90 backdrop-blur rounded-r-lg">이름</th>
            </tr>
          </thead>
          <tbody className="space-y-1">
            {students.map((student, index) => {
              // DB 필드 우선 사용, fallback으로 studentNo 파싱
              const grade = student.grade ? String(student.grade) : '-';
              const classNum = student.classNum ? String(student.classNum) : '-';
              const studentNum = student.number ? String(student.number) : '-';

              return (
                <ContextMenu key={student.id}>
                  <ContextMenuTrigger asChild>
                    <tr
                      onClick={() => onSelectStudent(student)}
                      className={cn(
                        "group cursor-pointer transition-all duration-200 border border-transparent",
                        selectedStudentId === student.id
                          ? "bg-brand-50/80 shadow-sm border-brand-100 rounded-lg scale-[1.01]"
                          : "bg-white/40 hover:bg-white/80 hover:shadow-sm hover:scale-[1.005] rounded-lg"
                      )}
                    >
                      <td className="p-3 text-center rounded-l-lg font-medium text-slate-500 group-hover:text-slate-700">{index + 1}</td>
                      <td className="p-3 text-center font-medium text-slate-600">{grade}</td>
                      <td className="p-3 text-center font-medium text-slate-600">{classNum}</td>
                      <td className="p-3 text-center font-medium text-slate-600">{studentNum}</td>
                      <td className={cn(
                        "p-3 text-center rounded-r-lg font-bold transition-colors",
                        student.status === '평가완료' ? "text-green-600" : "text-slate-700 group-hover:text-slate-900"
                      )}>
                        {student.name}
                      </td>
                    </tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-64">
                    <ContextMenuLabel>{student.name} ({student.studentNo || ''})</ContextMenuLabel>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => handleContextMenuAction('view', student)}>
                      <Eye className="mr-2 h-4 w-4" />
                      평가 보기
                      <ContextMenuShortcut>Enter</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleContextMenuAction('edit', student)}>
                      <Edit className="mr-2 h-4 w-4" />
                      정보 수정
                      <ContextMenuShortcut>Ctrl+E</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleContextMenuAction('copy', student)}>
                      <Copy className="mr-2 h-4 w-4" />
                      정보 복사
                      <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleContextMenuAction('complete', student)}>
                      <UserCheck className="mr-2 h-4 w-4" />
                      평가 완료 처리
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleContextMenuAction('reset', student)}>
                      <UserX className="mr-2 h-4 w-4" />
                      평가 초기화
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleContextMenuAction('send', student)}>
                      <Send className="mr-2 h-4 w-4" />
                      결과 전송
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={() => handleContextMenuAction('delete', student)}
                      className="text-destructive"
                    >
                      <Trash className="mr-2 h-4 w-4" />
                      삭제
                      <ContextMenuShortcut>Del</ContextMenuShortcut>
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StudentList;