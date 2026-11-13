import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Users, MoreVertical, User } from "lucide-react";
import { useMessageThread, Message } from "@/hooks/useMessages";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { ko } from "date-fns/locale";
import { ThreadParticipantsDialog } from "./ThreadParticipantsDialog";

interface MessageViewProps {
  threadId: string | null;
}

interface MessageGroup {
  date: string;
  messages: (Message & { sender_name?: string })[];
}

interface Profile {
  id: string;
  nickname: string | null;
  email: string;
}

export const MessageView = ({ threadId }: MessageViewProps) => {
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useMessageThread(threadId || '');
  const [newMessage, setNewMessage] = useState('');
  const [userProfiles, setUserProfiles] = useState<Record<string, Profile>>({});
  const [threadInfo, setThreadInfo] = useState<any>(null);
  const [participantsDialogOpen, setParticipantsDialogOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<any>(null);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !threadId) return;
    
    await sendMessage(newMessage);
    setNewMessage('');
  };

  const fetchUserProfiles = async (userIds: string[]) => {
    const uniqueUserIds = [...new Set(userIds)];
    const unknownUserIds = uniqueUserIds.filter(id => !userProfiles[id]);
    
    if (unknownUserIds.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nickname, email')
        .in('id', unknownUserIds);

      if (error) throw error;

      const profileMap = data?.reduce((acc, profile) => {
        acc[profile.id] = profile;
        return acc;
      }, {} as Record<string, Profile>) || {};

      setUserProfiles(prev => ({ ...prev, ...profileMap }));
    } catch (error) {
      console.error('사용자 프로필 조회 오류:', error);
    }
  };

  const fetchThreadInfo = async () => {
    if (!threadId) return;

    try {
      const { data, error } = await supabase
        .from('message_threads')
        .select(`
          id,
          title,
          is_group_chat,
          created_by,
          message_participants(
            user_id,
            role,
            profiles(
              id,
              nickname,
              email
            )
          )
        `)
        .eq('id', threadId)
        .single();

      if (error) throw error;
      setThreadInfo(data);
    } catch (error) {
      console.error('스레드 정보 조회 오류:', error);
    }
  };

  const getDisplayName = (userId: string) => {
    const profile = userProfiles[userId];
    if (!profile) return 'Unknown User';
    return profile.nickname || profile.email.split('@')[0];
  };

  const getInitials = (userId: string) => {
    const displayName = getDisplayName(userId);
    return displayName.charAt(0).toUpperCase();
  };

  const formatMessageDate = (date: Date) => {
    if (isToday(date)) {
      return '오늘';
    } else if (isYesterday(date)) {
      return '어제';
    } else {
      return format(date, 'M월 d일 (E)', { locale: ko });
    }
  };

  const groupMessagesByDate = (messages: Message[]): MessageGroup[] => {
    const groups: MessageGroup[] = [];
    let currentGroup: MessageGroup | null = null;

    messages.forEach(message => {
      const messageDate = new Date(message.created_at);
      const dateKey = format(messageDate, 'yyyy-MM-dd');

      if (!currentGroup || currentGroup.date !== dateKey) {
        currentGroup = {
          date: dateKey,
          messages: []
        };
        groups.push(currentGroup);
      }

      const messageWithSender = {
        ...message,
        sender_name: getDisplayName(message.sender_id)
      };

      currentGroup.messages.push(messageWithSender);
    });

    return groups;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length > 0) {
      const userIds = messages.map(m => m.sender_id);
      fetchUserProfiles(userIds);

      // Scroll to bottom when new messages arrive
      const timer = setTimeout(scrollToBottom, 100);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  useEffect(() => {
    if (threadId) {
      fetchThreadInfo();
    }
  }, [threadId]);

  if (!threadId) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">메시지를 시작하세요</h3>
          <p className="text-sm text-muted-foreground">왼쪽에서 대화를 선택하거나 새 메시지를 만드세요.</p>
        </CardContent>
      </Card>
    );
  }

  const messageGroups = groupMessagesByDate(messages);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                {threadInfo?.is_group_chat ? (
                  <Users className="h-4 w-4" />
                ) : (
                  <User className="h-4 w-4" />
                )}
              </div>
              <div>
                <CardTitle className="text-base">
                  {threadInfo?.title || '메시지'}
                </CardTitle>
                {threadInfo?.is_group_chat && (
                  <p className="text-xs text-muted-foreground">
                    {threadInfo.message_participants?.length || 0}명 참여
                  </p>
                )}
              </div>
            </div>
          </div>
          {threadInfo?.is_group_chat && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setParticipantsDialogOpen(true)}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0">
        <ScrollArea ref={scrollAreaRef} className="flex-1 px-4">
          <div className="space-y-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : messageGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>아직 메시지가 없습니다.</p>
                <p className="text-sm mt-1">첫 메시지를 보내보세요!</p>
              </div>
            ) : (
              messageGroups.map((group, groupIndex) => (
                <div key={group.date}>
                  {/* Date separator */}
                  <div className="flex items-center justify-center mb-4">
                    <Badge variant="secondary" className="text-xs px-3 py-1">
                      {formatMessageDate(new Date(group.date))}
                    </Badge>
                  </div>
                  
                  {/* Messages in this date group */}
                  <div className="space-y-4">
                    {group.messages.map((message, messageIndex) => {
                      const isOwnMessage = message.sender_id === user?.id;
                      const showAvatar = !isOwnMessage && (
                        messageIndex === 0 || 
                        group.messages[messageIndex - 1].sender_id !== message.sender_id
                      );
                      const showSenderName = threadInfo?.is_group_chat && !isOwnMessage && showAvatar;
                      
                      return (
                        <div
                          key={message.id}
                          className={`flex gap-3 ${
                            isOwnMessage ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {!isOwnMessage && (
                            <div className="flex-shrink-0">
                              {showAvatar ? (
                                <Avatar className="w-8 h-8">
                                  <AvatarFallback className="text-xs bg-primary/10">
                                    {getInitials(message.sender_id)}
                                  </AvatarFallback>
                                </Avatar>
                              ) : (
                                <div className="w-8" /> // Spacer for alignment
                              )}
                            </div>
                          )}
                          
                          <div className={`max-w-xs lg:max-w-md ${
                            isOwnMessage ? 'ml-auto' : ''
                          }`}>
                            {showSenderName && (
                              <p className="text-xs text-muted-foreground mb-1 ml-3">
                                {message.sender_name}
                              </p>
                            )}
                            
                            <div
                              className={`px-4 py-2 rounded-2xl ${
                                isOwnMessage
                                  ? 'bg-primary text-primary-foreground rounded-br-md'
                                  : 'bg-muted rounded-bl-md'
                              }`}
                            >
                              <p className="text-sm whitespace-pre-wrap break-words">
                                {message.content}
                              </p>
                              <p className={`text-xs mt-1 ${
                                isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'
                              }`}>
                                {format(new Date(message.created_at), 'HH:mm')}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        
        <div className="p-4 border-t bg-background">
          <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="메시지를 입력하세요..."
              className="flex-1"
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={!newMessage.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>

      {/* Participants Dialog */}
      {threadInfo && (
        <ThreadParticipantsDialog
          open={participantsDialogOpen}
          onOpenChange={setParticipantsDialogOpen}
          threadId={threadId!}
          isGroupChat={threadInfo.is_group_chat}
          createdBy={threadInfo.created_by}
        />
      )}
    </Card>
  );
};