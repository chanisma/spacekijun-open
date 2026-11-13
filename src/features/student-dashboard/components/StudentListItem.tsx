import React from 'react';
import { cn } from '@/lib/utils';
import { StudentDashboardData } from '@/hooks/useStudentDashboard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface StudentListItemProps {
    student: StudentDashboardData;
    isSelected?: boolean;
    onClick?: () => void;
    /** 검색 결과처럼 여러 반이 섞여 나올 때 학년-반을 함께 표시 */
    showClassBadge?: boolean;
}

export const StudentListItem: React.FC<StudentListItemProps> = ({
    student,
    isSelected = false,
    onClick,
    showClassBadge = false,
}) => {
    const initials = student.name ? student.name.slice(0, 2) : '??';

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "w-full text-left px-2 py-1.5 rounded-lg border transition-all flex items-center gap-2",
                isSelected
                    ? "bg-brand-50 border-brand-200 shadow-sm"
                    : "border-transparent hover:bg-slate-100 hover:border-slate-200"
            )}
        >
            <span className="text-[10px] font-mono text-slate-400 w-4 text-right shrink-0">
                {student.number ?? ''}
            </span>
            <Avatar className="h-6 w-6 shrink-0 border border-slate-200">
                <AvatarImage src={student.picture || undefined} alt={student.name} />
                <AvatarFallback className="bg-brand-50 text-brand-600 text-[10px] font-medium">
                    {initials}
                </AvatarFallback>
            </Avatar>
            <span className={cn(
                "text-sm truncate flex-1",
                isSelected ? "text-brand-700 font-semibold" : "text-slate-700"
            )}>
                {student.name}
            </span>
            {showClassBadge && (
                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {student.grade}-{student.class_num}
                </span>
            )}
        </button>
    );
};
