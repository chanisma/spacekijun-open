import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SignatureStrokes } from '@/lib/signatureStrokes';

/**
 * 연수 참석 서명 (`training_signature`).
 *
 * 서명은 행 단위로 쌓인다. `meeting.meta`에 넣지 않는 이유는 QR로 여러 명이 동시에
 * 서명할 때 JSONB read-modify-write가 서로를 덮어쓰기 때문. 기존 화면이 보는
 * `meta.assignee[이름].signature` 플래그는 DB 트리거가 서버에서 동기화한다.
 */

export interface TrainingSignature {
  id: string;
  meeting_id: string;
  signer_name: string;
  resource_id: string | null;
  user_id: string;
  /** 검증 전 raw. 렌더 전에 `parseSignatureStrokes()`를 통과시킬 것. */
  strokes: unknown;
  source: 'app' | 'qr';
  signed_at: string;
}

const key = (meetingId: string) => ['training-signatures', meetingId] as const;

export const useTrainingSignatures = (meetingId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: key(meetingId ?? ''),
    enabled: !!meetingId && enabled,
    queryFn: async (): Promise<TrainingSignature[]> => {
      const { data, error } = await supabase
        .from('training_signature')
        .select('id, meeting_id, signer_name, resource_id, user_id, strokes, source, signed_at')
        .eq('meeting_id', meetingId!)
        .order('signed_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as TrainingSignature[];
    },
  });

interface SubmitArgs {
  meetingId: string;
  signerName: string;
  resourceId?: string | null;
  strokes: SignatureStrokes;
  /** 'qr' = QR로 연 모바일 서명 페이지, 'app' = 앱 안 일정 상세 */
  source?: 'app' | 'qr';
}

export const useSubmitTrainingSignature = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ meetingId, signerName, resourceId, strokes, source = 'app' }: SubmitArgs) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error('로그인이 필요합니다.');

      // 다시 서명 = 같은 (meeting, 이름) 행 덮어쓰기. UNIQUE 제약이 중복을 막는다.
      const { data, error } = await supabase
        .from('training_signature')
        .upsert(
          {
            meeting_id: meetingId,
            signer_name: signerName,
            resource_id: resourceId ?? null,
            user_id: userId,
            strokes: strokes as unknown as never,
            source,
          },
          { onConflict: 'meeting_id,signer_name' },
        )
        .select('id')
        .maybeSingle();

      if (error) throw error;
      // RLS가 막으면 오류가 아니라 0행이 온다 — 실제 반영을 반환 행으로 확인한다.
      if (!data) throw new Error('서명을 저장할 권한이 없습니다. 참석자 명단에 있는지 확인해 주세요.');
      return data.id;
    },
    onSuccess: (_id, variables) => {
      queryClient.invalidateQueries({ queryKey: key(variables.meetingId) });
      // 서명 플래그가 meeting.meta에도 반영되므로 일정 쿼리도 갱신한다.
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });
};

export const useDeleteTrainingSignature = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, meetingId }: { id: string; meetingId: string }) => {
      const { data, error } = await supabase
        .from('training_signature')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('서명을 삭제할 권한이 없습니다.');
      return meetingId;
    },
    onSuccess: (meetingId) => {
      queryClient.invalidateQueries({ queryKey: key(meetingId) });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });
};
