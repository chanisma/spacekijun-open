import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';

export interface MessageThread {
  id: string;
  title: string;
  is_group_chat: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  participants?: MessageParticipant[];
  last_message?: Message;
}

export interface MessageParticipant {
  id: string;
  thread_id: string;
  user_id: string;
  joined_at: string;
  left_at?: string;
  role: string;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  attachment_url?: string;
  created_at: string;
  updated_at: string;
  is_edited: boolean;
}

export const useMessages = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchThreads = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('message_threads')
        .select(`
          id,
          title,
          is_group_chat,
          created_by,
          created_at,
          updated_at
        `)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('메시지 스레드 조회 오류:', error);
        toast({
          title: '오류',
          description: '메시지를 불러오는데 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }

      setThreads(data || []);
    } catch (error) {
      console.error('메시지 스레드 조회 중 오류:', error);
      toast({
        title: '오류',
        description: '메시지를 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const createThread = async (title: string, isGroupChat: boolean = false) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('message_threads')
        .insert([{
          title,
          is_group_chat: isGroupChat,
          created_by: user.id
        }])
        .select()
        .single();

      if (error) {
        console.error('메시지 스레드 생성 오류:', error);
        toast({
          title: '오류',
          description: '메시지 스레드를 생성하는데 실패했습니다.',
          variant: 'destructive',
        });
        return null;
      }

      // Add creator as participant
      await supabase
        .from('message_participants')
        .insert([{
          thread_id: data.id,
          user_id: user.id,
          role: 'admin'
        }]);


      fetchThreads();
      return data;
    } catch (error) {
      console.error('메시지 스레드 생성 중 오류:', error);
      toast({
        title: '오류',
        description: '메시지 스레드를 생성하는데 실패했습니다.',
        variant: 'destructive',
      });
      return null;
    }
  };

  useEffect(() => {
    if (user) {
      fetchThreads();

      // Set up real-time subscription for message threads
      const threadSubscription = supabase
        .channel('message_threads')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'message_threads',
          },
          (payload) => {
            console.log('스레드 실시간 업데이트:', payload);
            
            if (payload.eventType === 'INSERT') {
              setThreads(prev => [payload.new as MessageThread, ...prev]);
            } else if (payload.eventType === 'UPDATE') {
              setThreads(prev => 
                prev.map(thread => 
                  thread.id === payload.new.id ? payload.new as MessageThread : thread
                )
              );
            } else if (payload.eventType === 'DELETE') {
              setThreads(prev => 
                prev.filter(thread => thread.id !== payload.old.id)
              );
            }
          }
        )
        .subscribe();

      return () => {
        threadSubscription.unsubscribe();
      };
    }
  }, [user]);

  return {
    threads,
    loading,
    fetchThreads,
    createThread
  };
};

export const useMessageThread = (threadId: string | null) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<MessageParticipant[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMessages = async () => {
    if (!threadId || !user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('메시지 조회 오류:', error);
        return;
      }

      setMessages(data || []);
    } catch (error) {
      console.error('메시지 조회 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (content: string) => {
    if (!threadId || !user || !content.trim()) return;

    try {
      const { error } = await supabase
        .from('messages')
        .insert([{
          thread_id: threadId,
          sender_id: user.id,
          content: content.trim(),
          message_type: 'text'
        }]);

      if (error) {
        console.error('메시지 전송 오류:', error);
        toast({
          title: '오류',
          description: '메시지를 전송하는데 실패했습니다.',
          variant: 'destructive',
        });
        return;
      }

      // Update thread's updated_at timestamp
      await supabase
        .from('message_threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', threadId);

      // Don't fetch messages here - real-time subscription will handle it
    } catch (error) {
      console.error('메시지 전송 중 오류:', error);
      toast({
        title: '오류',
        description: '메시지를 전송하는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (threadId && user) {
      fetchMessages();

      // Set up real-time subscription for messages
      const messageSubscription = supabase
        .channel(`messages:${threadId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `thread_id=eq.${threadId}`,
          },
          (payload) => {
            console.log('메시지 실시간 업데이트:', payload);
            
            if (payload.eventType === 'INSERT') {
              setMessages(prev => [...prev, payload.new as Message]);
            } else if (payload.eventType === 'UPDATE') {
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === payload.new.id ? payload.new as Message : msg
                )
              );
            } else if (payload.eventType === 'DELETE') {
              setMessages(prev => 
                prev.filter(msg => msg.id !== payload.old.id)
              );
            }
          }
        )
        .subscribe();

      return () => {
        messageSubscription.unsubscribe();
      };
    }
  }, [threadId, user]);

  return {
    messages,
    participants,
    loading,
    sendMessage,
    fetchMessages
  };
};