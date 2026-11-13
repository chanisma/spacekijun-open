import React, { useState, useEffect } from 'react';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { 
  Users, 
  Search, 
  UserPlus, 
  UserMinus, 
  Crown, 
  User,
  Mail,
  Phone,
  Shield
} from 'lucide-react';

interface Profile {
  id: string;
  nickname: string | null;
  email: string;
  role: string | null;
}

interface Participant {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  left_at: string | null;
  profile: Profile;
}

interface ThreadParticipantsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string;
  isGroupChat: boolean;
  createdBy: string;
}

export const ThreadParticipantsDialog: React.FC<ThreadParticipantsDialogProps> = ({
  open,
  onOpenChange,
  threadId,
  isGroupChat,
  createdBy
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  // Participants
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  
  // Add participants
  const [showAddParticipants, setShowAddParticipants] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableUsers, setAvailableUsers] = useState<Profile[]>([]);
  const [selectedNewParticipants, setSelectedNewParticipants] = useState<string[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const fetchParticipants = async () => {
    setLoadingParticipants(true);
    try {
      const { data, error } = await supabase
        .from('message_participants')
        .select(`
          id,
          user_id,
          role,
          joined_at,
          left_at
        `)
        .eq('thread_id', threadId)
        .is('left_at', null)
        .order('joined_at');

      if (error) throw error;

      // Fetch profiles separately
      if (data && data.length > 0) {
        const userIds = data.map(p => p.user_id);
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, nickname, email, role')
          .in('id', userIds);

        if (profilesError) throw profilesError;

        const participantsWithProfiles = data.map(participant => ({
          ...participant,
          profile: profiles?.find(p => p.id === participant.user_id) || {
            id: participant.user_id,
            nickname: null,
            email: 'Unknown',
            role: null
          }
        }));

        setParticipants(participantsWithProfiles);
      } else {
        setParticipants([]);
      }
    } catch (error) {
      console.error('참여자 조회 오류:', error);
      toast({
        title: '오류',
        description: '참여자 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoadingParticipants(false);
    }
  };

  const fetchAvailableUsers = async () => {
    if (!user) return;

    setLoadingUsers(true);
    try {
      // Get current participant user IDs
      const participantUserIds = participants.map(p => p.user_id);

      const { data, error } = await supabase
        .from('profiles')
        .select('id, nickname, email, role')
        .not('id', 'in', `(${participantUserIds.join(',')})`)
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

  const addParticipants = async () => {
    if (selectedNewParticipants.length === 0) return;

    setLoading(true);
    try {
      const inserts = selectedNewParticipants.map(userId => ({
        thread_id: threadId,
        user_id: userId,
        role: 'member'
      }));

      const { error } = await supabase
        .from('message_participants')
        .insert(inserts);

      if (error) throw error;

      toast({
        title: '성공',
        description: `${selectedNewParticipants.length}명의 참여자가 추가되었습니다.`,
      });

      setSelectedNewParticipants([]);
      setShowAddParticipants(false);
      fetchParticipants();
      fetchAvailableUsers();
    } catch (error) {
      console.error('참여자 추가 오류:', error);
      toast({
        title: '오류',
        description: '참여자를 추가하는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const removeParticipant = async (participantId: string, participantUserId: string) => {
    if (!user) return;

    // Only admin or the creator can remove participants
    const isAdmin = user.id === createdBy;
    const isSelf = user.id === participantUserId;

    if (!isAdmin && !isSelf) {
      toast({
        title: '권한 없음',
        description: '참여자를 제거할 권한이 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('message_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('id', participantId);

      if (error) throw error;


      fetchParticipants();
      fetchAvailableUsers();
    } catch (error) {
      console.error('참여자 제거 오류:', error);
      toast({
        title: '오류',
        description: '참여자를 제거하는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const changeParticipantRole = async (participantId: string, newRole: string) => {
    if (!user || user.id !== createdBy) {
      toast({
        title: '권한 없음',
        description: '역할을 변경할 권한이 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('message_participants')
        .update({ role: newRole })
        .eq('id', participantId);

      if (error) throw error;


      fetchParticipants();
    } catch (error) {
      console.error('역할 변경 오류:', error);
      toast({
        title: '오류',
        description: '역할을 변경하는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const getDisplayName = (profile: Profile) => {
    return profile.nickname || profile.email.split('@')[0];
  };

  const getSubtitle = (profile: Profile) => {
    return profile.role || profile.email;
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Crown className="h-3 w-3 text-yellow-600" />;
      case 'moderator':
        return <Shield className="h-3 w-3 text-blue-600" />;
      default:
        return <User className="h-3 w-3 text-gray-600" />;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge variant="default" className="text-xs">관리자</Badge>;
      case 'moderator':
        return <Badge variant="secondary" className="text-xs">모더레이터</Badge>;
      default:
        return null;
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

  useEffect(() => {
    if (open) {
      fetchParticipants();
    }
  }, [open, threadId]);

  useEffect(() => {
    if (showAddParticipants && participants.length > 0) {
      fetchAvailableUsers();
    }
  }, [showAddParticipants, participants]);

  if (!isGroupChat) {
    return null; // Don't show participants dialog for direct messages
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            참여자 관리
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {!showAddParticipants ? (
            <>
              {/* Current Participants */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    참여자 ({participants.length}명)
                  </Label>
                  {user?.id === createdBy && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddParticipants(true)}
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      추가
                    </Button>
                  )}
                </div>

                <ScrollArea className="max-h-64">
                  {loadingParticipants ? (
                    <div className="text-center py-4 text-muted-foreground">
                      로딩 중...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {participants.map((participant) => {
                        const isCreator = participant.user_id === createdBy;
                        const isSelf = participant.user_id === user?.id;
                        const canRemove = user?.id === createdBy || isSelf;
                        const canChangeRole = user?.id === createdBy && !isCreator;

                        return (
                          <Card key={participant.id}>
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <Avatar className="w-8 h-8">
                                    <AvatarFallback className="text-xs">
                                      {getDisplayName(participant.profile).charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      {getRoleIcon(participant.role)}
                                      <span className="font-medium text-sm">
                                        {getDisplayName(participant.profile)}
                                        {isSelf && ' (나)'}
                                        {isCreator && ' (생성자)'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {getSubtitle(participant.profile)}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {getRoleBadge(participant.role)}
                                  
                                  {canChangeRole && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const newRole = participant.role === 'admin' ? 'member' : 'admin';
                                        changeParticipantRole(participant.id, newRole);
                                      }}
                                    >
                                      {participant.role === 'admin' ? '일반' : '관리자'}
                                    </Button>
                                  )}

                                  {canRemove && !isCreator && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeParticipant(participant.id, participant.user_id)}
                                    >
                                      <UserMinus className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </>
          ) : (
            <>
              {/* Add Participants */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">참여자 추가</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddParticipants(false);
                      setSelectedNewParticipants([]);
                      setSearchQuery('');
                    }}
                  >
                    취소
                  </Button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="이름, 이메일 또는 역할로 검색"
                    className="pl-10"
                  />
                </div>

                {selectedNewParticipants.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium">선택된 사용자</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedNewParticipants.map(userId => {
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
                              onClick={() => setSelectedNewParticipants(prev => 
                                prev.filter(id => id !== userId)
                              )}
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

                <ScrollArea className="max-h-48 border rounded-lg">
                  {loadingUsers ? (
                    <div className="p-4 text-center text-muted-foreground">
                      사용자 목록을 불러오는 중...
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      {searchQuery ? '검색 결과가 없습니다' : '추가할 수 있는 사용자가 없습니다'}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredUsers.map(profile => {
                        const isSelected = selectedNewParticipants.includes(profile.id);
                        return (
                          <div
                            key={profile.id}
                            className={`p-3 flex items-center justify-between hover:bg-accent cursor-pointer ${
                              isSelected ? 'bg-accent' : ''
                            }`}
                            onClick={() => {
                              setSelectedNewParticipants(prev =>
                                prev.includes(profile.id)
                                  ? prev.filter(id => id !== profile.id)
                                  : [...prev, profile.id]
                              );
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className="text-xs">
                                  {getDisplayName(profile).charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium text-sm">
                                  {getDisplayName(profile)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {getSubtitle(profile)}
                                </div>
                              </div>
                            </div>
                            <Checkbox checked={isSelected} disabled={true} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        {showAddParticipants && (
          <DialogFooter className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddParticipants(false);
                setSelectedNewParticipants([]);
                setSearchQuery('');
              }}
              disabled={loading}
            >
              취소
            </Button>
            <Button
              onClick={addParticipants}
              disabled={loading || selectedNewParticipants.length === 0}
            >
              {loading ? '추가 중...' : `${selectedNewParticipants.length}명 추가`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};