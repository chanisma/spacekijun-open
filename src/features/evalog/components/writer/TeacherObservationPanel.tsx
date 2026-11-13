import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, User, Calendar, MessageSquare, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';

interface Observation {
    id: string;
    student_id: string;
    student_name: string;
    observer_name: string;
    content: string;
    created_at: string;
    created_by: string;
}

interface TeacherObservationPanelProps {
    studentId: string;
    studentName: string;
    readonly?: boolean;
}

const TeacherObservationPanel: React.FC<TeacherObservationPanelProps> = ({ studentId, studentName, readonly = false }) => {
    const { profile, user } = useAuth();
    const [observations, setObservations] = useState<Observation[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [content, setContent] = useState('');

    const observerName = profile?.name;
    // Fallback if profile name is missing (should be handled by strict check below, but for safety)
    const displayObserverName = observerName || profile?.nickname || (user?.email ? user.email.split('@')[0] : 'Unknown');

    useEffect(() => {
        if (studentId || studentName) {
            fetchObservations();
        } else {
            setObservations([]);
        }
    }, [studentId, studentName]);

    const fetchObservations = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('teacher_observations')
                .select('*')
                .eq('student_id', studentId)
                .eq('student_name', studentName)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setObservations(data || []);
        } catch (error) {
            console.error('Error fetching observations:', error);
            // toast.error('관찰 기록을 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!content.trim()) {
            toast.warning('관찰 내용을 입력해주세요.');
            return;
        }
        if (!user) {
            toast.error('로그인이 필요합니다.');
            return;
        }

        if (!observerName) {
            toast.error('프로필 이름이 설정되지 않았습니다. 마이페이지에서 이름을 설정해주세요.');
            return;
        }

        setSubmitting(true);
        try {
            const { error } = await supabase
                .from('teacher_observations')
                .insert({
                    student_id: studentId,
                    student_name: studentName,
                    observer_name: displayObserverName,
                    content: content.trim(),
                    created_by: user.id
                });

            if (error) throw error;

            setContent('');
            fetchObservations();
        } catch (error) {
            console.error('Error saving observation:', error);
            toast.error('저장에 실패했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('이 관찰 기록을 삭제하시겠습니까?')) return;

        try {
            const { error } = await supabase
                .from('teacher_observations')
                .delete()
                .eq('id', id);

            if (error) throw error;

            fetchObservations();
        } catch (error) {
            console.error('Error deleting observation:', error);
            toast.error('삭제에 실패했습니다.');
        }
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-50 rounded-lg">
                        <MessageSquare className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800">교사 관찰 기록</h3>
                        <p className="text-xs text-slate-500">
                            {studentName} 학생에 대한 관찰 내용을 기록합니다.
                        </p>
                    </div>
                </div>
                <div className="text-xs text-slate-400 font-mono">
                    ID: {studentId || 'None'}
                </div>
            </div>

            <ScrollArea className="flex-1 p-4 bg-slate-50/50">
                {loading ? (
                    <div className="flex justify-center items-center h-40">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                    </div>
                ) : observations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                        <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-sm">등록된 관찰 기록이 없습니다.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {observations.map((obs) => (
                            <div key={obs.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative group hover:border-indigo-200 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                                            <User className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <span className="text-sm font-semibold text-slate-800 block">
                                                {obs.observer_name}
                                            </span>
                                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {format(new Date(obs.created_at), 'yyyy-MM-dd HH:mm')}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Delete Button for Owner */}
                                    {user && obs.created_by === user.id && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                                            onClick={() => handleDelete(obs.id)}
                                            title="삭제"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                                <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap pl-10">
                                    {obs.content}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>

            {!readonly && (
                <div className="p-4 border-t bg-white">
                    <div className="space-y-3">
                        <Textarea
                            placeholder={
                                !observerName
                                    ? "관찰 내용을 기록하려면 마이페이지에서 프로필 이름을 설정해주세요."
                                    : "학생의 학습 태도, 특이사항, 면담 내용 등을 자유롭게 기록하세요..."
                            }
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="min-h-[80px] resize-none focus-visible:ring-indigo-500"
                            disabled={submitting || !observerName}
                        />
                        <div className="flex justify-end items-center gap-2">
                            {!observerName && (
                                <span className="text-xs text-red-500 mr-auto">
                                    * 프로필 이름 설정 필요
                                </span>
                            )}
                            <Button
                                size="sm"
                                onClick={handleSubmit}
                                disabled={submitting || !content.trim() || !observerName}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        저장 중...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-4 h-4 mr-2" />
                                        기록하기
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeacherObservationPanel;
