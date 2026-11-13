import React, { useState, useEffect } from 'react';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { Plus, Users, Search, UserCheck, MessageCircle } from 'lucide-react';

interface Profile {
  id: string;
  nickname: string | null;
  email: string;
  role: string | null;
}

interface CreateThreadDialogProps {
  onSuccess?: () => void;
}

export const CreateThreadDialog: React.FC<CreateThreadDialogProps> = ({ onSuccess }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [isGroupChat, setIsGroupChat] = useState(false);
  const [initialMessage, setInitialMessage] = useState('');

  // Participant selection
  const [searchQuery, setSearchQuery] = useState('');
  const [availableUsers, setAvailableUsers] = useState<Profile[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const fetchUsers = async () => {
    if (!user) return;

    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nickname, email, role')
        .neq('id', user.id) // Exclude current user
        .order('nickname');

      if (error) throw error;
      setAvailableUsers(data || []);
    } catch (error) {
      console.error('사용자 목록 조회 오류:', error);
      toast({
        title: '오류',
        description: '사용자 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleParticipantToggle = (userId: string) => {
    setSelectedParticipants(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleCreateThread = async () => {
    if (!user || !title.trim()) return;

    // For direct chat, require exactly one participant
    if (!isGroupChat && selectedParticipants.length !== 1) {
      toast({
        title: '오류',
        description: '개인 메시지는 한 명의 상대방을 선택해야 합니다.',
        variant: 'destructive',
      });
      return;
    }

    // For group chat, require at least one participant
    if (isGroupChat && selectedParticipants.length === 0) {
      toast({
        title: '오류',
        description: '그룹 채팅은 최소 한 명의 참여자가 필요합니다.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Create thread
      const { data: thread, error: threadError } = await supabase
        .from('message_threads')
        .insert([{
          title: title.trim(),
          is_group_chat: isGroupChat,
          created_by: user.id
        }])
        .select()
        .single();

      if (threadError) throw threadError;

      // Add creator as admin participant
      const participantInserts = [{
        thread_id: thread.id,
        user_id: user.id,
        role: 'admin'
      }];

      // Add selected participants
      selectedParticipants.forEach(userId => {
        participantInserts.push({
          thread_id: thread.id,
          user_id: userId,
          role: isGroupChat ? 'member' : 'member'
        });
      });

      const { error: participantError } = await supabase
        .from('message_participants')
        .insert(participantInserts);

      if (participantError) throw participantError;

      // Send initial message if provided
      if (initialMessage.trim()) {
        const { error: messageError } = await supabase
          .from('messages')
          .insert([{
            thread_id: thread.id,
            sender_id: user.id,
            content: initialMessage.trim(),
            message_type: 'text'
          }]);

        if (messageError) throw messageError;
      }

      toast({
        title: '성공',
        description: `${isGroupChat ? '그룹 채팅' : '개인 메시지'}이 생성되었습니다.`,
      });

      // Reset form
      setTitle('');
      setIsGroupChat(false);
      setInitialMessage('');
      setSelectedParticipants([]);
      setSearchQuery('');
      setOpen(false);

      onSuccess?.();
    } catch (error) {
      console.error('스레드 생성 오류:', error);
      toast({
        title: '오류',
        description: '메시지 스레드를 생성하는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = availableUsers.filter(profile => {
    const searchTerm = searchQuery.toLowerCase();
    return (
      (profile.nickname?.toLowerCase().includes(searchTerm)) ||
      profile.email.toLowerCase().includes(searchTerm) ||
      (profile.role?.toLowerCase().includes(searchTerm))
    );
  });

  const getDisplayName = (profile: Profile) => {
    if (profile.nickname) return profile.nickname;
    return profile.email.split('@')[0];
  };

  const getSubtitle = (profile: Profile) => {
    return profile.role || profile.email;
  };

  useEffect(() => {
    if (open) {
      fetchUsers();
    }
  }, [open, user]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          새 메시지
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            새 메시지 만들기
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Thread Settings */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">제목</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="메시지 제목을 입력하세요"
                className="mt-1"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isGroupChat"
                checked={isGroupChat}
                onCheckedChange={(checked) => setIsGroupChat(!!checked)}
              />
              <Label htmlFor="isGroupChat" className="text-sm font-medium">
                그룹 채팅 (여러 명과 대화)
              </Label>
            </div>
          </div>

          {/* Participant Selection */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">
                {isGroupChat ? '참여자 선택' : '대화 상대 선택'}
              </Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="이름, 이메일 또는 역할로 검색"
                  className="pl-10"
                />
              </div>
            </div>

            {/* Selected Participants */}
            {selectedParticipants.length > 0 && (
              <div>
                <Label className="text-sm font-medium">선택된 참여자</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedParticipants.map(userId => {
                    const profile = availableUsers.find(u => u.id === userId);
                    if (!profile) return null;
                    return (
                      <Badge
                        key={userId}
                        variant="secondary"
                        className="flex items-center gap-1"
                      >
                        {getDisplayName(profile)}
                        <button
                          onClick={() => handleParticipantToggle(userId)}
                          className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                        >
                          ×
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            {/* User List */}
            <div className="border rounded-lg max-h-64 overflow-y-auto">
              {loadingUsers ? (
                <div className="p-4 text-center text-muted-foreground">
                  사용자 목록을 불러오는 중...
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  {searchQuery ? '검색 결과가 없습니다' : '사용할 수 있는 사용자가 없습니다'}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredUsers.map(profile => {
                    const isSelected = selectedParticipants.includes(profile.id);
                    return (
                      <div
                        key={profile.id}
                        className={`p-3 flex items-center justify-between hover:bg-accent cursor-pointer ${
                          isSelected ? 'bg-accent' : ''
                        }`}
                        onClick={() => handleParticipantToggle(profile.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Users className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium">{getDisplayName(profile)}</div>
                            <div className="text-sm text-muted-foreground">
                              {getSubtitle(profile)}
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <UserCheck className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Initial Message */}
          <div>
            <Label htmlFor="initialMessage">첫 메시지 (선택사항)</Label>
            <Textarea
              id="initialMessage"
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              placeholder="대화를 시작할 메시지를 입력하세요"
              rows={3}
              className="mt-1"
            />
          </div>
        </div>

        {/* Actions */}
        <DialogFooter className="flex justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            취소
          </Button>
          <Button
            onClick={handleCreateThread}
            disabled={loading || !title.trim() || (!isGroupChat && selectedParticipants.length !== 1) || (isGroupChat && selectedParticipants.length === 0)}
          >
            {loading ? '생성 중...' : '메시지 만들기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};