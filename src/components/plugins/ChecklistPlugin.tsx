import React, { useState, useEffect } from 'react';
import { PretextInline } from '@/components/ui/PretextContent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, CheckSquare, RotateCcw, Lock, Users, Check, X } from 'lucide-react';
import { PluginComponentProps, ChecklistData } from '@/types/plugin';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';

export const ChecklistPlugin: React.FC<PluginComponentProps> = ({
  instance,
  readonly = false,
  onUpdate,
}) => {
  const { user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');
  const [checklistData, setChecklistData] = useState<ChecklistData>({
    title: '',
    items: [],
  });
  const [editData, setEditData] = useState<ChecklistData>({ title: '', items: [] });

  useEffect(() => {
    if (instance.data && typeof instance.data === 'object') {
      const data = instance.data as Partial<ChecklistData>;
      setChecklistData({
        title: data.title || '',
        items: data.items || [],
        settings: data.settings || {},
      });
    }
  }, [instance.data]);

  const isCreator = instance.created_by === user?.id;
  const canAdd = !readonly && (checklistData.settings?.addPermission === 'creator_only' ? isCreator : true);
  const canCheck = !readonly && (checklistData.settings?.checkPermission === 'creator_only' ? isCreator : true);

  const checkedCount = checklistData.items.filter(i => i.checked).length;
  const totalCount = checklistData.items.length;
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
  const isEmpty = !checklistData.title || checklistData.items.length === 0;

  // ── 핸들러 ──────────────────────────────────────────────────
  const handleToggle = (itemId: string) => {
    if (!canCheck) return;
    const userName = profile?.name || user?.email || '알 수 없음';
    const now = new Date().toISOString();
    const updated: ChecklistData = {
      ...checklistData,
      items: checklistData.items.map(item =>
        item.id === itemId
          ? { ...item, checked: !item.checked, checkedBy: !item.checked ? userName : undefined, checkedAt: !item.checked ? now : undefined }
          : item
      ),
    };
    setChecklistData(updated);
    if (onUpdate) onUpdate(updated);
  };

  const handleQuickAdd = () => {
    const text = quickAddText.trim();
    if (!text) return;
    const updated: ChecklistData = {
      ...checklistData,
      items: [...checklistData.items, { id: Date.now().toString(), text, checked: false }],
    };
    setChecklistData(updated);
    if (onUpdate) onUpdate(updated);
    setQuickAddText('');
    setIsQuickAdding(false);
  };

  const handleReset = () => {
    const updated: ChecklistData = {
      ...checklistData,
      items: checklistData.items.map(item => ({ ...item, checked: false, checkedBy: undefined, checkedAt: undefined })),
    };
    setChecklistData(updated);
    if (onUpdate) onUpdate(updated);
  };

  const openEdit = () => {
    setEditData(JSON.parse(JSON.stringify(checklistData)));
    setIsEditMode(true);
  };

  const handleAddItem = () => {
    setEditData(prev => ({ ...prev, items: [...prev.items, { id: Date.now().toString(), text: '', checked: false }] }));
  };

  const handleRemoveItem = (id: string) => {
    setEditData(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
  };

  const handleItemTextChange = (id: string, text: string) => {
    setEditData(prev => ({ ...prev, items: prev.items.map(i => (i.id === id ? { ...i, text } : i)) }));
  };

  const handleSave = () => {
    setChecklistData(editData);
    if (onUpdate) onUpdate(editData);
    setIsEditMode(false);
  };

  // ── 렌더 ────────────────────────────────────────────────────
  if (isEmpty && readonly) return null;

  return (
    <>
      {/* 빈 상태 or 컴팩트 카드 */}
      {isEmpty ? (
        <Card className="w-full">
          <CardContent className="py-6 px-3 md:px-6 text-center">
            <CheckSquare className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-xs md:text-sm text-muted-foreground mb-3">
              아직 설정된 체크리스트가 없습니다
            </p>
            <Button onClick={openEdit} size="sm" className="h-8 text-xs md:h-9 md:text-sm">
              체크리스트 만들기
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full overflow-hidden border-l-4 border-l-emerald-500">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-sm font-medium truncate">{checklistData.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                    {checkedCount}/{totalCount}
                    {progressPercent === 100 && <span className="ml-1 text-emerald-600">✓</span>}
                  </span>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={e => { e.stopPropagation(); setIsOpen(true); }}
                className="h-7 px-3 text-xs shrink-0"
              >
                열기
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 보기 다이얼로그 */}
      {!isEmpty && (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="max-w-lg w-full max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <CheckSquare className="w-4 h-4 text-emerald-600" />
                {checklistData.title}
                <Badge variant="secondary" className="ml-1 text-[10px]">{checkedCount}/{totalCount}</Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {checklistData.items.filter(i => i.text.trim()).map(item => (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-start gap-2.5 p-2 rounded-lg border transition-colors',
                    item.checked ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-gray-100 hover:bg-gray-50',
                    canCheck && 'cursor-pointer'
                  )}
                  onClick={() => handleToggle(item.id)}
                >
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={() => handleToggle(item.id)}
                    onClick={e => e.stopPropagation()}
                    disabled={!canCheck}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <span className={cn('text-xs md:text-sm', item.checked && 'line-through text-muted-foreground')}>
                      <PretextInline content={item.text} />
                    </span>
                    {item.checked && item.checkedBy && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {item.checkedBy}
                        {item.checkedAt && (
                          <> · {new Date(item.checkedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {canAdd && (
                isQuickAdding ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      autoFocus
                      value={quickAddText}
                      onChange={e => setQuickAddText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleQuickAdd(); }
                        if (e.key === 'Escape') { setIsQuickAdding(false); setQuickAddText(''); }
                      }}
                      placeholder="새 항목 입력 후 Enter"
                      className="h-7 text-xs flex-1"
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleQuickAdd}>
                      <Check className="w-3 h-3 text-emerald-600" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { setIsQuickAdding(false); setQuickAddText(''); }}>
                      <X className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setIsQuickAdding(true)} className="w-full h-7 text-xs border-dashed">
                    <Plus className="w-3 h-3 mr-1" />
                    항목 추가
                  </Button>
                )
              )}
            </div>

            {(checkedCount > 0 || isCreator) && !readonly && (
              <div className="flex gap-2 pt-3 border-t">
                {checkedCount > 0 && isCreator && (
                  <Button variant="outline" size="sm" onClick={handleReset} className="h-7 text-xs">
                    <RotateCcw className="w-3 h-3 mr-1" />
                    초기화
                  </Button>
                )}
                {isCreator && (
                  <Button variant="outline" size="sm" onClick={() => { setIsOpen(false); openEdit(); }} className="h-7 text-xs ml-auto">
                    편집
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* 편집 다이얼로그 — 빈 상태·보기 모두에서 열림 */}
      {!readonly && (
        <Dialog open={isEditMode} onOpenChange={open => { if (!open) setIsEditMode(false); }}>
          <DialogContent className="max-w-lg w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <CheckSquare className="w-4 h-4" />
                체크리스트 설정
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              <div>
                <Label htmlFor="cl-title">제목</Label>
                <Input
                  id="cl-title"
                  value={editData.title}
                  onChange={e => setEditData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="체크리스트 제목"
                />
              </div>

              <div className="space-y-2">
                <Label>항목</Label>
                {editData.items.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Input
                      value={item.text}
                      onChange={e => handleItemTextChange(item.id, e.target.value)}
                      placeholder={`항목 ${index + 1}`}
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={handleAddItem} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  항목 추가
                </Button>
              </div>

              <div className="space-y-2 border-t pt-3">
                <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <Lock className="w-3 h-3" /> 권한 설정
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">항목 추가</Label>
                    <Select
                      value={editData.settings?.addPermission || 'all'}
                      onValueChange={v => setEditData(prev => ({ ...prev, settings: { ...prev.settings, addPermission: v as 'all' | 'creator_only' } }))}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all"><span className="flex items-center gap-1"><Users className="w-3 h-3" />모두</span></SelectItem>
                        <SelectItem value="creator_only"><span className="flex items-center gap-1"><Lock className="w-3 h-3" />생성자만</span></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">체크 수정</Label>
                    <Select
                      value={editData.settings?.checkPermission || 'all'}
                      onValueChange={v => setEditData(prev => ({ ...prev, settings: { ...prev.settings, checkPermission: v as 'all' | 'creator_only' } }))}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all"><span className="flex items-center gap-1"><Users className="w-3 h-3" />모두</span></SelectItem>
                        <SelectItem value="creator_only"><span className="flex items-center gap-1"><Lock className="w-3 h-3" />생성자만</span></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t">
              <Button
                onClick={handleSave}
                disabled={!editData.title || editData.items.filter(i => i.text.trim()).length === 0}
              >
                저장
              </Button>
              <Button variant="outline" onClick={() => setIsEditMode(false)}>
                취소
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
