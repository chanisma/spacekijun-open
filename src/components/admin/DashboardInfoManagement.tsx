import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Image, FileText, Cake, List, Layers, File } from 'lucide-react';
import {
  useDashboardInfoList,
  useDeleteDashboardInfo,
  useUpdateDashboardInfo,
  useAllCardItems,
} from '@/hooks/useDashboardInfo';
import { DashboardInfoBox } from '@/types/dashboardInfo';
import { DashboardInfoDialog } from './DashboardInfoDialog';
import { CardItemsDialog } from './CardItemsDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function DashboardInfoManagement() {
  const { data: infoBoxes = [], isLoading } = useDashboardInfoList();
  const { data: allItems = {} } = useAllCardItems();
  const deleteInfoBox = useDeleteDashboardInfo();
  const updateInfoBox = useUpdateDashboardInfo();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInfoBox, setEditingInfoBox] = useState<DashboardInfoBox | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [itemsDialogOpen, setItemsDialogOpen] = useState(false);
  const [managingItemsCard, setManagingItemsCard] = useState<DashboardInfoBox | null>(null);

  const handleCreate = () => {
    setEditingInfoBox(null);
    setDialogOpen(true);
  };

  const handleEdit = (infoBox: DashboardInfoBox) => {
    setEditingInfoBox(infoBox);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deletingId) {
      deleteInfoBox.mutate(deletingId);
      setDeleteDialogOpen(false);
      setDeletingId(null);
    }
  };

  const handleManageItems = (infoBox: DashboardInfoBox) => {
    setManagingItemsCard(infoBox);
    setItemsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>대시보드 정보 관리</CardTitle>
          <CardDescription>홈 대시보드에 표시될 정보를 관리합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
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
            <div>
              <CardTitle>대시보드 정보 관리</CardTitle>
              <CardDescription>홈 대시보드에 표시될 정보를 관리합니다.</CardDescription>
            </div>
            <Button onClick={handleCreate} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              정보 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {infoBoxes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>등록된 대시보드 정보가 없습니다.</p>
              <p className="text-sm mt-2">정보를 추가하여 홈 화면에 표시하세요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {infoBoxes
                .sort((a, b) => b.display_order - a.display_order)
                .map((infoBox, index) => (
                <Card key={infoBox.id} className="relative hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      {/* Card Icon */}
                      <div className="flex-shrink-0">
                        <div className="p-2 rounded-lg bg-indigo-100">
                          <Layers className="h-5 w-5 text-indigo-600" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base mb-2">{infoBox.title}</CardTitle>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={infoBox.is_active ? 'default' : 'secondary'} className="text-xs">
                            {infoBox.is_active ? '활성' : '비활성'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            카드
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            우선순위 {infoBox.display_order}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    {/* Content Preview */}
                    <div className="mb-4 min-h-[100px]">
                      {(() => {
                        const cardItems = allItems[infoBox.id] || [];
                        return (
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground mb-2">
                              {cardItems.length}개 아이템
                            </p>
                            {cardItems.length > 0 ? (
                              <div className="space-y-2">
                                {cardItems.slice(0, 3).map((item) => (
                                  <div key={item.id} className="p-2 bg-gray-50 rounded text-xs border">
                                    <div className="flex items-center gap-2 mb-1">
                                      {item.content_type === 'text' ? (
                                        <FileText className="h-3 w-3 text-blue-600" />
                                      ) : item.content_type === 'image' ? (
                                        <Image className="h-3 w-3 text-purple-600" />
                                      ) : (
                                        <Cake className="h-3 w-3 text-pink-600" />
                                      )}
                                      {item.title && (
                                        <span className="font-medium text-gray-700">{item.title}</span>
                                      )}
                                    </div>
                                    {item.content_type === 'text' && (
                                      <p className="text-gray-600 line-clamp-1">{item.content}</p>
                                    )}
                                    {item.content_type === 'image' && (
                                      <p className="text-gray-600 line-clamp-1 text-xs">{item.content}</p>
                                    )}
                                    {item.content_type === 'birthday' && (
                                      <p className="text-gray-600 text-xs">학생 생일 표시</p>
                                    )}
                                  </div>
                                ))}
                                {cardItems.length > 3 && (
                                  <p className="text-xs text-center text-muted-foreground">
                                    +{cardItems.length - 3}개 더 보기
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">아이템이 없습니다</p>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground border-t pt-3 mb-3">
                      <span>생성: {new Date(infoBox.created_at).toLocaleDateString('ko-KR')}</span>
                      <span>수정: {new Date(infoBox.updated_at).toLocaleDateString('ko-KR')}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleManageItems(infoBox)}
                        className="flex-1"
                      >
                        <List className="h-4 w-4 mr-1" />
                        아이템
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(infoBox)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(infoBox.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <DashboardInfoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        infoBox={editingInfoBox}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정보 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 대시보드 정보를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Card Items Management Dialog */}
      <CardItemsDialog
        open={itemsDialogOpen}
        onOpenChange={setItemsDialogOpen}
        card={managingItemsCard}
      />
    </>
  );
}
