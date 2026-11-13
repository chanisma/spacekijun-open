import { useState } from 'react';
import { DialogFooter, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Badge } from '@/components/ui/badge';
import { DashboardInfoBox, ContentType } from '@/types/dashboardInfo';
import { Plus, Trash2, GripVertical, Image, FileText, Cake, MoveUp, MoveDown, Pencil, X, File } from 'lucide-react';
import { useCardItems, useCreateDashboardInfo, useDeleteDashboardInfo, useUpdateDashboardInfo } from '@/hooks/useDashboardInfo';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface CardItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: DashboardInfoBox | null;
}

export function CardItemsDialog({ open, onOpenChange, card }: CardItemsDialogProps) {
  const { data: items = [], isLoading } = useCardItems(card?.id || null);
  const createItem = useCreateDashboardInfo();
  const deleteItem = useDeleteDashboardInfo();
  const updateItem = useUpdateDashboardInfo();

  // Fetch documents for selection
  const { data: documents = [] } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, title, file_name, storage_path')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const [newItemType, setNewItemType] = useState<ContentType>('text');
  const [newItemContent, setNewItemContent] = useState('');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [editingItem, setEditingItem] = useState<DashboardInfoBox | null>(null);

  const handleAddItem = async () => {
    if (!card) return;
    if (!newItemContent.trim() && newItemType !== 'birthday' && newItemType !== 'document') return;
    if (newItemType === 'document' && !selectedDocumentId) return;

    createItem.mutate({
      title: newItemTitle.trim() || `${getItemTypeName(newItemType)} 항목`,
      content_type: newItemType,
      content: newItemType === 'birthday' ? '' :
               newItemType === 'document' ? selectedDocumentId :
               newItemContent.trim(),
      parent_card_id: card.id,
      is_active: true,
      display_order: items.length,
    }, {
      onSuccess: () => {
        setNewItemType('text');
        setNewItemContent('');
        setNewItemTitle('');
        setSelectedDocumentId('');
      },
    });
  };

  const handleDeleteItem = (itemId: string) => {
    deleteItem.mutate(itemId);
  };

  const handleEditItem = (item: DashboardInfoBox) => {
    setEditingItem(item);
    setNewItemType(item.content_type);
    setNewItemContent(item.content);
    setNewItemTitle(item.title);
    if (item.content_type === 'document') {
      setSelectedDocumentId(item.content);
    }
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;
    if (!newItemContent.trim() && newItemType !== 'birthday' && newItemType !== 'document') return;
    if (newItemType === 'document' && !selectedDocumentId) return;

    updateItem.mutate({
      id: editingItem.id,
      input: {
        title: newItemTitle.trim() || `${getItemTypeName(newItemType)} 항목`,
        content_type: newItemType,
        content: newItemType === 'birthday' ? '' :
                 newItemType === 'document' ? selectedDocumentId :
                 newItemContent.trim(),
      },
    }, {
      onSuccess: () => {
        setEditingItem(null);
        setNewItemType('text');
        setNewItemContent('');
        setNewItemTitle('');
        setSelectedDocumentId('');
      },
    });
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setNewItemType('text');
    setNewItemContent('');
    setNewItemTitle('');
    setSelectedDocumentId('');
  };

  const handleMoveItem = (itemId: string, direction: 'up' | 'down') => {
    const index = items.findIndex(item => item.id === itemId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === items.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const currentOrder = items[index].display_order;
    const targetOrder = items[targetIndex].display_order;

    // Swap display orders
    updateItem.mutate({
      id: items[index].id,
      input: { display_order: targetOrder },
    });
    updateItem.mutate({
      id: items[targetIndex].id,
      input: { display_order: currentOrder },
    });
  };

  const getItemTypeIcon = (type: ContentType) => {
    switch (type) {
      case 'image':
        return <Image className="h-4 w-4" />;
      case 'birthday':
        return <Cake className="h-4 w-4" />;
      case 'document':
        return <File className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getItemTypeName = (type: ContentType) => {
    switch (type) {
      case 'text':
        return '텍스트';
      case 'image':
        return '이미지';
      case 'birthday':
        return '학생 생일';
      case 'document':
        return '문서';
      case 'card':
        return '카드';
      default:
        return type;
    }
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>카드 아이템 관리: {card?.title}</DialogTitle>
          <DialogDescription>
            이 카드에 표시될 정보 아이템을 추가하고 순서를 관리하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add/Edit Item Section */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">
                {editingItem ? '아이템 수정' : '새 아이템 추가'}
              </h3>
              {editingItem && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEdit}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>아이템 타입</Label>
                  <Select
                    value={newItemType}
                    onValueChange={(value: ContentType) => setNewItemType(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">텍스트</SelectItem>
                      <SelectItem value="image">이미지</SelectItem>
                      <SelectItem value="birthday">학생 생일</SelectItem>
                      <SelectItem value="document">문서</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>아이템 제목 (선택)</Label>
                  <Input
                    value={newItemTitle}
                    onChange={(e) => setNewItemTitle(e.target.value)}
                    placeholder="예: 공지사항"
                  />
                </div>
              </div>

              {newItemType === 'text' && (
                <div>
                  <Label>내용</Label>
                  <Textarea
                    value={newItemContent}
                    onChange={(e) => setNewItemContent(e.target.value)}
                    placeholder="텍스트 내용을 입력하세요"
                    rows={3}
                  />
                </div>
              )}

              {newItemType === 'image' && (
                <div>
                  <Label>이미지 URL</Label>
                  <Input
                    value={newItemContent}
                    onChange={(e) => setNewItemContent(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
              )}

              {newItemType === 'birthday' && (
                <div className="text-sm text-muted-foreground">
                  오늘 생일인 학생을 자동으로 표시합니다. 별도 내용 입력이 필요 없습니다.
                </div>
              )}

              {newItemType === 'document' && (
                <div>
                  <Label>문서 선택</Label>
                  <SearchableSelect
                    items={documents.map((doc: any) => ({
                      value: doc.id,
                      label: doc.title || doc.file_name,
                      description: doc.file_name !== doc.title ? doc.file_name : undefined
                    }))}
                    selectedValue={selectedDocumentId}
                    onValueChange={(value) => setSelectedDocumentId(value || '')}
                    placeholder="문서를 선택하세요"
                    searchPlaceholder="문서 검색..."
                    emptyText={documents.length === 0 ? "등록된 문서가 없습니다." : "검색 결과가 없습니다."}
                  />
                  {documents.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      문서 페이지에서 먼저 문서를 업로드하세요.
                    </p>
                  )}
                </div>
              )}

              <Button
                onClick={editingItem ? handleUpdateItem : handleAddItem}
                size="sm"
                className="w-full"
                disabled={(editingItem ? updateItem.isPending : createItem.isPending) ||
                         (!newItemContent.trim() && newItemType !== 'birthday' && newItemType !== 'document') ||
                         (newItemType === 'document' && !selectedDocumentId)}
              >
                {editingItem ? (
                  <>
                    <Pencil className="h-4 w-4 mr-2" />
                    {updateItem.isPending ? '수정 중...' : '아이템 수정'}
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    {createItem.isPending ? '추가 중...' : '아이템 추가'}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Existing Items List */}
          <div>
            <h3 className="font-semibold mb-3">카드 아이템 목록 ({items.length}개)</h3>
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>아이템이 없습니다.</p>
                <p className="text-sm mt-1">위에서 아이템을 추가하세요.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items
                  .sort((a, b) => a.display_order - b.display_order)
                  .map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      {/* Drag Handle */}
                      <div className="flex flex-col gap-1 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMoveItem(item.id, 'up')}
                          disabled={index === 0}
                          className="h-6 w-6 p-0"
                        >
                          <MoveUp className="h-3 w-3" />
                        </Button>
                        <GripVertical className="h-4 w-4 text-gray-400" />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMoveItem(item.id, 'down')}
                          disabled={index === items.length - 1}
                          className="h-6 w-6 p-0"
                        >
                          <MoveDown className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Item Icon */}
                      <div className="flex-shrink-0 mt-1">
                        <div className={`p-2 rounded-lg ${
                          item.content_type === 'text' ? 'bg-blue-100' :
                          item.content_type === 'image' ? 'bg-purple-100' :
                          item.content_type === 'document' ? 'bg-green-100' :
                          'bg-pink-100'
                        }`}>
                          {getItemTypeIcon(item.content_type)}
                        </div>
                      </div>

                      {/* Item Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline">{getItemTypeName(item.content_type)}</Badge>
                          {item.title && (
                            <span className="font-semibold text-sm">{item.title}</span>
                          )}
                          <span className="text-xs text-muted-foreground">순서: {item.display_order + 1}</span>
                        </div>
                        {item.content_type === 'text' && (
                          <p className="text-sm text-gray-600 line-clamp-2">{item.content}</p>
                        )}
                        {item.content_type === 'image' && (
                          <p className="text-sm text-gray-600 truncate">{item.content}</p>
                        )}
                        {item.content_type === 'birthday' && (
                          <p className="text-sm text-gray-600">오늘 생일인 학생 표시</p>
                        )}
                        {item.content_type === 'document' && (
                          <p className="text-sm text-gray-600">
                            {documents.find((doc: any) => doc.id === item.content)?.title ||
                             documents.find((doc: any) => doc.id === item.content)?.file_name ||
                             '문서'}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditItem(item)}
                          className="h-8 w-8 p-0"
                          title="수정"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteItem(item.id)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          disabled={deleteItem.isPending}
                          title="삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <DialogFooter className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
