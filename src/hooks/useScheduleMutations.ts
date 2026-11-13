
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useResourceOperations } from '@/services/hooks/useUnifiedAuth';
import { UploadedFile } from '@/services/fileUploadService';

export const useScheduleMutationOperations = (refetchEvents: () => Promise<any>) => {
    const { toast } = useToast();
    const {
        resourceId,
        createWithCurrentResource,
        deleteOwnedByResource,
        canModify,
        isReady
    } = useResourceOperations();

    // assignee 문자열을 JSONB 형태로 변환하는 함수
    const convertAssigneeToJsonb = useCallback(async (assigneeString: string | any, eventType?: string) => {
        try {
            // assigneeString이 문자열이 아닌 경우 처리
            if (typeof assigneeString !== 'string') {
                if (assigneeString && typeof assigneeString === 'object') {
                    return assigneeString;
                }
                assigneeString = String(assigneeString || '');
            }

            const assigneeItems = assigneeString.split(',').map((item: string) => item.trim()).filter(Boolean);
            const assigneeObject: { [key: string]: { name: string; signature?: number } } = {};

            for (const item of assigneeItems) {
                try {
                    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item);

                    if (isUUID) {
                        const { data: resource } = await supabase
                            .from('resource')
                            .select('id, name')
                            .eq('id', item)
                            .maybeSingle();

                        if (resource) {
                            if (eventType === 'training') {
                                assigneeObject[resource.name] = { name: resource.name, signature: 0 };
                            } else {
                                (assigneeObject as any)[resource.name] = { name: resource.name };
                            }
                        } else {
                            if (eventType === 'training') {
                                assigneeObject[item] = { name: item, signature: 0 };
                            } else {
                                (assigneeObject as any)[item] = { name: item };
                            }
                        }
                    } else {
                        const { data: profileData } = await supabase
                            .from('profiles')
                            .select('id, name')
                            .eq('name', item)
                            .maybeSingle();

                        if (profileData) {
                            const { data: resourceData } = await supabase
                                .from('resource')
                                .select('id, name')
                                .eq('name', profileData.name)
                                .eq('type', 'teacher')
                                .maybeSingle();

                            const name = resourceData ? resourceData.name : item;
                            if (eventType === 'training') {
                                assigneeObject[name] = { name: name, signature: 0 };
                            } else {
                                (assigneeObject as any)[name] = { name: name };
                            }
                        } else {
                            if (eventType === 'training') {
                                assigneeObject[item] = { name: item, signature: 0 };
                            } else {
                                (assigneeObject as any)[item] = { name: item };
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Failed to find user for item: ${item}`, error);
                    if (eventType === 'training') {
                        assigneeObject[item] = { name: item, signature: 0 };
                    } else {
                        (assigneeObject as any)[item] = { name: item };
                    }
                }
            }

            return assigneeObject;
        } catch (error) {
            console.error('Failed to convert assignee to JSONB:', error);
            return assigneeString;
        }
    }, []);

    const createEvent = useCallback(async (eventData: {
        title: string;
        kind: 'schedule' | 'event' | 'duty' | 'training' | 'document_submission' | 'personal';
        starts_at: string;
        ends_at: string;
        source?: string;
        description?: string;
        assignee?: string;
        exchangeable?: boolean;
        date_only?: boolean;
        required_files?: UploadedFile[];
        related_links?: string[];
        target?: string;
    }) => {
        if (!isReady) {
            toast({
                title: '오류',
                description: '사용자 리소스 정보를 확인할 수 없습니다.',
                variant: 'destructive',
            });
            return false;
        }

        try {
            let assigneeData = eventData.assignee;
            if ((eventData.kind === 'event' || eventData.kind === 'training' || eventData.kind === 'duty' || eventData.kind === 'document_submission' || eventData.kind === 'personal') && eventData.assignee) {
                assigneeData = await convertAssigneeToJsonb(eventData.assignee, eventData.kind);
            }

            const meeting = await createWithCurrentResource('meeting', {
                kind: eventData.kind,
                starts_at: eventData.starts_at,
                ends_at: eventData.ends_at,
                status: 'scheduled',
                meta: {
                    title: eventData.title,
                    source: eventData.source,
                    description: eventData.description,
                    assignee: assigneeData,
                    exchangeable: eventData.exchangeable || false,
                    date_only: eventData.date_only,
                    ...(eventData.kind === 'document_submission' && {
                        submission_deadline: eventData.ends_at,
                        required_files: eventData.required_files || [],
                        related_links: eventData.related_links || [],
                        target: eventData.target || undefined
                    })
                }
            });

            if (!meeting) {
                throw new Error('Failed to create meeting');
            }

            toast({
                title: '성공',
                description: '일정이 생성되었습니다.',
            });

            await refetchEvents();
            return meeting.id;
        } catch (error) {
            console.error('일정 생성 오류:', error);
            let errorMessage = '일정 생성 중 오류가 발생했습니다.';
            if (error instanceof Error) {
                if (error.message.includes('document_submission')) {
                    errorMessage = '서류 제출 일정 생성 중 오류가 발생했습니다. 관리자에게 문의하세요.';
                }
            }

            toast({
                title: '오류',
                description: errorMessage,
                variant: 'destructive',
            });
            return false;
        }
    }, [isReady, resourceId, createWithCurrentResource, toast, refetchEvents, convertAssigneeToJsonb]);

    const cleanupDocumentSubmissionFiles = useCallback(async (meetingId: string): Promise<void> => {
        try {
            const { data: meeting, error: fetchError } = await supabase
                .from('meeting')
                .select('kind, meta')
                .eq('id', meetingId)
                .single();

            if (fetchError || !meeting || meeting.kind !== 'document_submission') {
                return;
            }

            const meta = meeting.meta as any;
            const requiredFiles = meta?.required_files || [];

            if (requiredFiles.length === 0) return;

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const deletePromises = requiredFiles.map(async (file: any) => {
                try {
                    const { data: documentCheck } = await supabase
                        .from('documents')
                        .select('user_id, storage_path')
                        .eq('id', file.id)
                        .single();

                    if (!documentCheck || documentCheck.user_id !== user.id) return;

                    await supabase.storage.from('documents').remove([documentCheck.storage_path]);
                    await supabase.from('documents').delete().eq('id', file.id);
                } catch (error) {
                    console.error(`Error cleaning up file ${file.id}:`, error);
                }
            });

            await Promise.all(deletePromises);
        } catch (error) {
            console.error('Error during document cleanup:', error);
        }
    }, []);

    const deleteEvent = useCallback(async (eventId: string): Promise<boolean> => {
        if (!isReady) {
            toast({ title: '오류', description: '사용자 리소스 정보를 확인할 수 없습니다.', variant: 'destructive' });
            return false;
        }

        try {
            const canModifyEvent = await canModify('meeting', eventId);
            if (!canModifyEvent) {
                toast({ title: '권한 없음', description: '본인이 생성한 일정만 삭제할 수 있습니다.', variant: 'destructive' });
                return false;
            }

            await cleanupDocumentSubmissionFiles(eventId);
            await deleteOwnedByResource('meeting', eventId);

            toast({ title: '성공', description: '일정이 삭제되었습니다.' });
            refetchEvents();
            return true;
        } catch (error) {
            console.error('일정 삭제 오류:', error);
            toast({ title: '오류', description: '일정 삭제에 실패했습니다.', variant: 'destructive' });
            return false;
        }
    }, [isReady, canModify, cleanupDocumentSubmissionFiles, deleteOwnedByResource, toast, refetchEvents]);

    const updateEvent = useCallback(async (eventId: string, eventData: any): Promise<boolean> => {
        if (!isReady) {
            toast({ title: '오류', description: '사용자 리소스 정보를 확인할 수 없습니다.', variant: 'destructive' });
            return false;
        }

        try {
            const canModifyEvent = await canModify('meeting', eventId);
            if (!canModifyEvent) {
                toast({ title: '권한 없음', description: '본인이 생성한 일정만 수정할 수 있습니다.', variant: 'destructive' });
                return false;
            }

            const { data: currentMeeting, error: fetchError } = await supabase
                .from('meeting')
                .select('*')
                .eq('id', eventId)
                .single();

            if (fetchError || !currentMeeting) throw new Error('Failed to fetch current meeting data');

            const currentMeta = currentMeeting.meta as any || {};
            const updateData: any = {};
            let metaUpdates: any;

            if (eventData.meta !== undefined) {
                metaUpdates = { ...currentMeta, ...eventData.meta };
                // Logic for cleaning up deleted files (simplified for brevity, assume similar to original)
                if (eventData.meta.files !== undefined) {
                    // Implementation of file cleanup logic...
                    const currentFiles = currentMeta.files || [];
                    const updatedFiles = eventData.meta.files || [];
                    const deletedFiles = currentFiles.filter((c: any) => !updatedFiles.some((u: any) => u.id === c.id));

                    for (const file of deletedFiles) {
                        await supabase.storage.from('kijunspace').remove([`meeting/${eventId}/${file.id}_${file.name}`]);
                        await supabase.from('documents').delete().eq('id', file.id);
                    }
                }

            } else {
                metaUpdates = { ...currentMeta };
                if (eventData.title !== undefined) metaUpdates.title = eventData.title;
                if (eventData.description !== undefined) metaUpdates.description = eventData.description;
                if (eventData.assignee !== undefined) {
                    const eventKind = eventData.kind || currentMeeting.kind;
                    if ((eventKind === 'training' || eventKind === 'duty' || eventKind === 'document_submission') && eventData.assignee) {
                        metaUpdates.assignee = await convertAssigneeToJsonb(eventData.assignee);
                    } else {
                        metaUpdates.assignee = eventData.assignee;
                    }
                }
                // ... mappings for other fields
                if (eventData.date_only !== undefined) metaUpdates.date_only = eventData.date_only;
                if (eventData.event_date !== undefined) metaUpdates.event_date = eventData.event_date;
                if (eventData.required_files !== undefined) metaUpdates.required_files = eventData.required_files;
                if (eventData.related_links !== undefined) metaUpdates.related_links = eventData.related_links;
                if (eventData.target !== undefined) metaUpdates.target = eventData.target;
                if (eventData.kind === 'document_submission' && eventData.ends_at !== undefined) metaUpdates.submission_deadline = eventData.ends_at;

            }

            updateData.meta = metaUpdates;
            if (eventData.kind !== undefined) updateData.kind = eventData.kind;
            if (eventData.starts_at !== undefined) updateData.starts_at = eventData.starts_at;
            if (eventData.ends_at !== undefined) updateData.ends_at = eventData.ends_at;

            const { error: updateError } = await supabase.from('meeting').update(updateData).eq('id', eventId);
            if (updateError) throw updateError;

            toast({ title: '성공', description: '일정이 수정되었습니다.' });
            refetchEvents();
            return true;

        } catch (error) {
            console.error('일정 수정 오류:', error);
            toast({ title: '오류', description: '일정 수정에 실패했습니다.', variant: 'destructive' });
            return false;
        }
    }, [isReady, canModify, toast, refetchEvents, convertAssigneeToJsonb]);

    return {
        createEvent,
        deleteEvent,
        updateEvent,
        convertAssigneeToJsonb
    };
};
