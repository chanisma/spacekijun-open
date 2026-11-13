import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Plus, MessageCircle, Search, Users, User } from "lucide-react";
import { useMessages } from "@/hooks/useMessages";
import { CreateThreadDialog } from "./CreateThreadDialog";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday } from "date-fns";
import { ko } from "date-fns/locale";

interface MessageThreadListProps {
  onSelectThread: (threadId: string) => void;
  selectedThreadId?: string | null;
}

export const MessageThreadList = ({ onSelectThread, selectedThreadId }: MessageThreadListProps) => {
  const { threads, loading, fetchThreads } = useMessages();
  const [searchQuery, setSearchQuery] = useState('');
  const [threadsWithLastMessage, setThreadsWithLastMessage] = useState<any[]>([]);

  const fetchLastMessages = async () => {
    if (threads.length === 0) return;

    try {
      const threadsWithMessages = await Promise.all(
        threads.map(async (thread) => {
          // Get last message
          const { data: lastMessage } = await supabase
            .from('messages')
            .select('content, created_at, sender_id')
            .eq('thread_id', thread.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          // Get participant count
          const { count: participantCount } = await supabase
            .from('message_participants')
            .select('*', { count: 'exact', head: true })
            .eq('thread_id', thread.id)
            .is('left_at', null);

          return {
            ...thread,
            lastMessage,
            participantCount: participantCount || 0
          };
        })
      );

      setThreadsWithLastMessage(threadsWithMessages);
    } catch (error) {
      console.error('마지막 메시지 조회 오류:', error);
    }
  };

  const formatLastMessageTime = (date: Date) => {
    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isYesterday(date)) {
      return '어제';
    } else {
      return format(date, 'M/d', { locale: ko });
    }
  };

  const filteredThreads = threadsWithLastMessage.filter(thread =>
    thread.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    fetchLastMessages();
  }, [threads]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center mb-3">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            메시지
          </CardTitle>
          <CreateThreadDialog onSuccess={fetchThreads} />
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="대화 검색"
            className="pl-10"
          />
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              {searchQuery ? '검색 결과가 없습니다' : '메시지가 없습니다'}
            </div>
          ) : (
            <div className="divide-y">
              {filteredThreads.map((thread) => {
                const isSelected = selectedThreadId === thread.id;
                const lastMessageTime = thread.lastMessage 
                  ? new Date(thread.lastMessage.created_at)
                  : new Date(thread.updated_at);
                
                return (
                  <div
                    key={thread.id}
                    className={`p-4 hover:bg-accent cursor-pointer transition-colors ${
                      isSelected ? 'bg-accent border-r-2 border-primary' : ''
                    }`}
                    onClick={() => onSelectThread(thread.id)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="flex-shrink-0 mt-1">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          {thread.is_group_chat ? (
                            <Users className="h-5 w-5" />
                          ) : (
                            <User className="h-5 w-5" />
                          )}
                        </div>
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-medium truncate pr-2">
                            {thread.title}
                          </h3>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatLastMessageTime(lastMessageTime)}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground truncate pr-2">
                            {thread.lastMessage 
                              ? thread.lastMessage.content 
                              : '새 대화를 시작하세요'
                            }
                          </p>
                          
                          {thread.is_group_chat && (
                            <Badge variant="secondary" className="text-xs flex-shrink-0">
                              {thread.participantCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};