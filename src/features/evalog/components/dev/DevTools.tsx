import { Bug } from 'lucide-react';
import { Student } from '../../types';

interface DevToolsProps {
    onOpenDebug: () => void;
    onAddStudent?: (student: Student) => void;
}

export function DevTools({ onOpenDebug, onAddStudent }: DevToolsProps) {
    return (
        <div className="p-3 border-t border-gray-200 bg-gray-50 flex flex-col gap-2">
            <button
                onClick={onOpenDebug}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors bg-white border border-gray-200 text-slate-600 hover:text-amber-600 hover:border-amber-200 hover:bg-amber-50 shadow-sm w-full justify-center"
                title="PDF 데이터 구조 디버깅"
            >
                <Bug className="w-3.5 h-3.5" />
                PDF 디버그
            </button>
        </div>
    );
}
