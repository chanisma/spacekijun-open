import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Puzzle, Plus, Edit2, Trash2, Settings, Power } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Plugin } from '@/types/plugin';

export const PluginManagement: React.FC = () => {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlugin, setEditingPlugin] = useState<Plugin | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    description: '',
    icon: '',
    is_active: true,
  });

  // 플러그인 목록 가져오기 (관리자는 모든 플러그인 볼 수 있음)
  const { data: plugins = [], isLoading } = useQuery({
    queryKey: ['admin-plugins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plugins')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as Plugin[];
    },
  });

  // 플러그인 생성/수정
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<Plugin>) => {
      if (editingPlugin) {
        // 수정
        const { error } = await supabase
          .from('plugins')
          .update({
            name: data.name,
            description: data.description,
            icon: data.icon,
            is_active: data.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPlugin.id);

        if (error) throw error;
      } else {
        // 생성
        const { error } = await supabase
          .from('plugins')
          .insert({
            name: data.name,
            type: data.type,
            description: data.description,
            icon: data.icon,
            is_active: data.is_active,
            config: {},
            permissions: { roles: ['admin', 'teacher'] },
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      toast({
        title: editingPlugin ? '플러그인 수정됨' : '플러그인 생성됨',
        description: '플러그인이 성공적으로 ' + (editingPlugin ? '수정' : '생성') + '되었습니다.',
      });
      closeDialog();
    },
    onError: (error: any) => {
      toast({
        title: '오류',
        description: error.message || '플러그인 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });

  // 플러그인 삭제
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('plugins')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
    onError: (error: any) => {
      toast({
        title: '오류',
        description: error.message || '플러그인 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });

  // 플러그인 활성화/비활성화 토글
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('plugins')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
    onError: (error: any) => {
      toast({
        title: '오류',
        description: error.message || '상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });

  const openDialog = (plugin?: Plugin) => {
    if (plugin) {
      setEditingPlugin(plugin);
      setFormData({
        name: plugin.name,
        type: plugin.type,
        description: plugin.description || '',
        icon: plugin.icon || '',
        is_active: plugin.is_active,
      });
    } else {
      setEditingPlugin(null);
      setFormData({
        name: '',
        type: '',
        description: '',
        icon: '',
        is_active: true,
      });
    }
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingPlugin(null);
    setFormData({
      name: '',
      type: '',
      description: '',
      icon: '',
      is_active: true,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            플러그인 목록을 불러오는 중...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Puzzle className="h-5 w-5" />
              플러그인 관리
            </CardTitle>
            <Button onClick={() => openDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              새 플러그인
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {plugins.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              등록된 플러그인이 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>타입</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-center">상태</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plugins.map((plugin) => (
                  <TableRow key={plugin.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {plugin.icon && (
                          <Puzzle className="h-4 w-4 text-muted-foreground" />
                        )}
                        {plugin.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{plugin.type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {plugin.description || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={plugin.is_active}
                        onCheckedChange={(checked) =>
                          toggleActiveMutation.mutate({
                            id: plugin.id,
                            is_active: checked,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog(plugin)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (window.confirm('이 플러그인을 삭제하시겠습니까? 관련된 모든 데이터가 삭제됩니다.')) {
                              deleteMutation.mutate(plugin.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 플러그인 생성/수정 다이얼로그 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPlugin ? '플러그인 수정' : '새 플러그인 추가'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">플러그인 이름</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="예: 투표"
                required
              />
            </div>

            {!editingPlugin && (
              <div>
                <Label htmlFor="type">플러그인 타입</Label>
                <Input
                  id="type"
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                  placeholder="예: poll"
                  required
                  disabled={!!editingPlugin}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  타입은 생성 후 변경할 수 없습니다.
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="description">설명</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="플러그인 기능 설명"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="icon">아이콘 (선택)</Label>
              <Input
                id="icon"
                value={formData.icon}
                onChange={(e) =>
                  setFormData({ ...formData, icon: e.target.value })
                }
                placeholder="예: Vote"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">활성화 상태</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
            </div>

            <DialogFooter className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={closeDialog}>
                취소
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending
                  ? '저장 중...'
                  : editingPlugin
                  ? '수정'
                  : '생성'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};