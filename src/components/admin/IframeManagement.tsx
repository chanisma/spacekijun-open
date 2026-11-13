import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit2, Trash2, ExternalLink, Eye, EyeOff, Monitor, LinkIcon, Smartphone, ArrowUp, ArrowDown, Image, LayoutList } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIframeMenus, type ExternalMenu } from '@/hooks/useIframeMenus';
import {
  DEFAULT_NAV_PLACEMENT,
  navPlacementLabel,
  studentNavPlacements,
  teacherNavPlacements,
} from '@/config/navigation';

interface IframeMenuForm {
  name: string;
  url: string;
  mobileUrl: string;
  iconUrl: string;
  show: boolean;
  showStudent: boolean;
  menuType: 'iframe' | 'link';
  displayOrder: number;
  /** 교사 사이드바 배치 (기본 = 별도 [외부 연결] 서랍) */
  placement: string;
  /** 학생 사이드바 배치 (showStudent가 켜졌을 때만 의미 있음) */
  studentPlacement: string;
}

const EMPTY_FORM: IframeMenuForm = {
  name: '',
  url: '',
  mobileUrl: '',
  iconUrl: '',
  show: true,
  showStudent: false,
  menuType: 'iframe',
  displayOrder: 0,
  placement: DEFAULT_NAV_PLACEMENT,
  studentPlacement: DEFAULT_NAV_PLACEMENT,
};

// ----------------------------------------
// 메뉴 폼 (추가·수정 공용)
// ----------------------------------------
//
// 추가/수정 다이얼로그가 같은 필드 집합을 쓰므로 한 곳에서만 정의한다.
// (구 구현은 폼을 두 번 복붙해, 필드를 추가할 때 한쪽만 고치기 쉬웠다.)

interface MenuFormFieldsProps {
  /** input id 충돌 방지용 접두사 ('create' | 'edit') */
  idPrefix: string;
  value: IframeMenuForm;
  onChange: (updater: (prev: IframeMenuForm) => IframeMenuForm) => void;
}

function MenuFormFields({ idPrefix, value, onChange }: MenuFormFieldsProps): JSX.Element {
  const id = (field: string): string => `${idPrefix}-${field}`;

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={id('name')}>메뉴명</Label>
        <Input
          id={id('name')}
          value={value.name}
          onChange={(e) => onChange((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="메뉴명을 입력하세요"
        />
      </div>

      <div>
        <Label>메뉴 타입</Label>
        <RadioGroup
          value={value.menuType}
          onValueChange={(next) => onChange((prev) => ({ ...prev, menuType: next as 'iframe' | 'link' }))}
          className="flex space-x-6 mt-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="iframe" id={id('iframe')} />
            <Label htmlFor={id('iframe')} className="flex items-center space-x-2 cursor-pointer">
              <Monitor className="h-4 w-4" />
              <span>Iframe으로 열기</span>
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="link" id={id('link')} />
            <Label htmlFor={id('link')} className="flex items-center space-x-2 cursor-pointer">
              <LinkIcon className="h-4 w-4" />
              <span>새창으로 열기</span>
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div>
        <Label htmlFor={id('url')} className="flex items-center space-x-1">
          <Monitor className="h-3 w-3" />
          <span>데스크톱 URL</span>
        </Label>
        <Input
          id={id('url')}
          value={value.url}
          onChange={(e) => onChange((prev) => ({ ...prev, url: e.target.value }))}
          placeholder="https://example.com"
        />
      </div>

      <div>
        <Label htmlFor={id('mobileUrl')} className="flex items-center space-x-1">
          <Smartphone className="h-3 w-3" />
          <span>모바일 URL (선택사항)</span>
        </Label>
        <Input
          id={id('mobileUrl')}
          value={value.mobileUrl}
          onChange={(e) => onChange((prev) => ({ ...prev, mobileUrl: e.target.value }))}
          placeholder="https://m.example.com (비어있으면 데스크톱 URL 사용)"
        />
      </div>

      <div>
        <Label htmlFor={id('iconUrl')} className="flex items-center space-x-1">
          <Image className="h-3 w-3" />
          <span>아이콘 URL (선택사항)</span>
        </Label>
        <Input
          id={id('iconUrl')}
          value={value.iconUrl}
          onChange={(e) => onChange((prev) => ({ ...prev, iconUrl: e.target.value }))}
          placeholder="https://example.com/icon.png (비어있으면 기본 아이콘 사용)"
        />
      </div>

      {/* 사이드바 배치 — 기본은 별도 [외부 연결] 서랍, 원하면 일반 카테고리/서랍 안으로 */}
      <div className="rounded-md border p-3 space-y-3">
        <div className="flex items-center space-x-2 text-sm font-medium">
          <LayoutList className="h-4 w-4 text-muted-foreground" />
          <span>사이드바 배치</span>
        </div>

        <div>
          <Label htmlFor={id('placement')} className="text-xs text-muted-foreground">
            교사 메뉴
          </Label>
          <Select
            value={value.placement}
            onValueChange={(next) => onChange((prev) => ({ ...prev, placement: next }))}
          >
            <SelectTrigger id={id('placement')} className="mt-1">
              <SelectValue placeholder="배치 위치 선택" />
            </SelectTrigger>
            <SelectContent>
              {teacherNavPlacements.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex flex-col text-left">
                    <span>{option.label}</span>
                    {option.hint && <span className="text-xs text-muted-foreground">{option.hint}</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor={id('studentPlacement')} className="text-xs text-muted-foreground">
            학생 메뉴
          </Label>
          <Select
            value={value.studentPlacement}
            onValueChange={(next) => onChange((prev) => ({ ...prev, studentPlacement: next }))}
            disabled={!value.showStudent}
          >
            <SelectTrigger id={id('studentPlacement')} className="mt-1">
              <SelectValue placeholder="배치 위치 선택" />
            </SelectTrigger>
            <SelectContent>
              {studentNavPlacements.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex flex-col text-left">
                    <span>{option.label}</span>
                    {option.hint && <span className="text-xs text-muted-foreground">{option.hint}</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!value.showStudent && (
            <p className="mt-1 text-xs text-muted-foreground">
              아래 &ldquo;학생 메뉴에 표시&rdquo;를 켜야 설정할 수 있습니다.
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          선택한 카테고리가 해당 사용자에게 없으면 자동으로 기본 &ldquo;외부 메뉴&rdquo; 서랍에 표시됩니다.
        </p>
      </div>

      <div>
        <Label htmlFor={id('displayOrder')}>표시 순서</Label>
        <Input
          id={id('displayOrder')}
          type="number"
          value={value.displayOrder}
          onChange={(e) => onChange((prev) => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))}
          placeholder="0"
        />
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id={id('show')}
          checked={value.show}
          onCheckedChange={(checked) => onChange((prev) => ({ ...prev, show: checked }))}
        />
        <Label htmlFor={id('show')}>메뉴에 표시</Label>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id={id('showStudent')}
          checked={value.showStudent}
          onCheckedChange={(checked) => onChange((prev) => ({ ...prev, showStudent: checked }))}
        />
        <Label htmlFor={id('showStudent')}>학생 메뉴에 표시</Label>
      </div>
    </div>
  );
}

export function IframeManagement() {
  const {
    data: iframeMenus,
    loading,
    createIframeMenu,
    updateIframeMenu,
    updateIframeMenuOrder,
    deleteIframeMenu,
    toggleIframeMenuShow,
  } = useIframeMenus();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ExternalMenu | null>(null);
  const [formData, setFormData] = useState<IframeMenuForm>(EMPTY_FORM);

  /** 폼 → mutation payload (추가·수정 공용) */
  const buildPayload = () => ({
    name: formData.name.trim(),
    url: formData.url.trim(),
    mobileUrl: formData.mobileUrl.trim(),
    iconUrl: formData.iconUrl.trim(),
    show: formData.show,
    showStudent: formData.showStudent,
    type: formData.menuType,
    displayOrder: formData.displayOrder,
    placement: formData.placement,
    // 학생에게 노출하지 않는 메뉴는 학생 배치값을 남기지 않는다 (의미 없는 잔여 설정 방지)
    studentPlacement: formData.showStudent ? formData.studentPlacement : DEFAULT_NAV_PLACEMENT,
  });

  /** 메뉴명·URL 필수값 + URL 형식 검증 */
  const validateForm = (): boolean => {
    if (!formData.name.trim() || !formData.url.trim()) {
      toast({
        title: "오류",
        description: "메뉴명과 데스크톱 URL을 모두 입력해주세요.",
        variant: "destructive",
      });
      return false;
    }

    try {
      new URL(formData.url.trim());
      if (formData.mobileUrl.trim()) {
        new URL(formData.mobileUrl.trim());
      }
    } catch {
      toast({
        title: "오류",
        description: "올바른 URL 형식을 입력해주세요. (예: https://example.com)",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    try {
      await createIframeMenu.mutateAsync(buildPayload());

      setFormData(EMPTY_FORM);
      setIsCreateOpen(false);

      toast({
        title: "성공",
        description: "외부 메뉴가 추가되었습니다.",
      });
    } catch (error: any) {
      console.error('Create iframe menu error:', error);
      toast({
        title: "오류",
        description: error?.message || "외부 메뉴 추가에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleEdit = async () => {
    if (!editingItem || !validateForm()) return;

    try {
      await updateIframeMenu.mutateAsync({
        id: editingItem.id,
        ...buildPayload(),
      });

      setIsEditOpen(false);
      setEditingItem(null);

    } catch (error) {
      toast({
        title: "오류",
        description: "외부 메뉴 수정에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 메뉴를 삭제하시겠습니까?`)) return;

    try {
      await deleteIframeMenu.mutateAsync(id);

    } catch (error) {
      toast({
        title: "오류",
        description: "외부 메뉴 삭제에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleToggleShow = async (id: string, currentShow: boolean) => {
    try {
      await toggleIframeMenuShow.mutateAsync({ id, show: !currentShow });

      toast({
        title: "성공",
        description: `메뉴가 ${!currentShow ? '표시' : '숨김'} 상태로 변경되었습니다.`,
      });
    } catch (error) {
      toast({
        title: "오류",
        description: "메뉴 상태 변경에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  /**
   * 순서만 변경 — meta 병합 mutation을 쓴다.
   * (폼 전체를 넘기는 updateIframeMenu를 쓰면 폼에 없는 meta 키가 지워진다.)
   */
  const changeOrder = async (item: ExternalMenu, delta: number) => {
    const currentOrder = item.meta?.displayOrder ?? 0;
    const newOrder = Math.max(0, currentOrder + delta);

    try {
      await updateIframeMenuOrder.mutateAsync({ id: item.id, displayOrder: newOrder });

      toast({
        title: "성공",
        description: "메뉴 순서가 변경되었습니다.",
      });
    } catch (error) {
      toast({
        title: "오류",
        description: "메뉴 순서 변경에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const handleMoveUp = (item: ExternalMenu) => changeOrder(item, +1);
  const handleMoveDown = (item: ExternalMenu) => changeOrder(item, -1);

  const openEditDialog = (item: ExternalMenu) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      url: item.meta?.url || '',
      mobileUrl: item.meta?.mobileUrl || '',
      iconUrl: item.meta?.iconUrl || '',
      show: item.meta?.show ?? true,
      showStudent: item.meta?.showStudent ?? false,
      menuType: item.type,
      displayOrder: item.meta?.displayOrder ?? 0,
      placement: item.meta?.placement || DEFAULT_NAV_PLACEMENT,
      studentPlacement: item.meta?.studentPlacement || DEFAULT_NAV_PLACEMENT,
    });
    setIsEditOpen(true);
  };

  const openCreateDialog = (open: boolean) => {
    if (open) setFormData(EMPTY_FORM);
    setIsCreateOpen(open);
  };

  if (loading) {
    return <div>로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            외부 메뉴 관리
          </CardTitle>

          <Dialog open={isCreateOpen} onOpenChange={openCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                메뉴 추가
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>새 외부 메뉴 추가</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <MenuFormFields idPrefix="create" value={formData} onChange={setFormData} />
                <DialogFooter className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    취소
                  </Button>
                  <Button onClick={handleCreate} disabled={createIframeMenu.isPending}>
                    {createIframeMenu.isPending ? "추가 중..." : "추가"}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>

        <CardContent>
          {!iframeMenus || iframeMenus.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              등록된 외부 메뉴가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">순서</TableHead>
                    <TableHead className="min-w-[120px]">메뉴명</TableHead>
                    <TableHead className="w-20 text-center">타입</TableHead>
                    <TableHead className="min-w-[140px] hidden md:table-cell">배치</TableHead>
                    <TableHead className="min-w-[120px] hidden lg:table-cell">아이콘</TableHead>
                    <TableHead className="w-16 text-center">상태</TableHead>
                    <TableHead className="w-16 text-center">학생</TableHead>
                    <TableHead className="w-32 text-center">작업</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {iframeMenus
                  .sort((a, b) => (b.meta?.displayOrder ?? 0) - (a.meta?.displayOrder ?? 0))
                  .map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-2">
                        <span className="text-muted-foreground text-sm">
                          {item.meta?.displayOrder ?? 0}
                        </span>
                        <div className="flex flex-col space-y-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => handleMoveUp(item)}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => handleMoveDown(item)}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="flex items-center space-x-1 w-fit">
                              {item.type === 'iframe' ? (
                                <Monitor className="h-3 w-3" />
                              ) : (
                                <LinkIcon className="h-3 w-3" />
                              )}
                              <span className="hidden sm:inline">
                                {item.type === 'iframe' ? 'Iframe' : '새창'}
                              </span>
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-1">
                              <p>{item.type === 'iframe' ? 'Iframe으로 열기' : '새창으로 열기'}</p>
                              <p className="text-xs break-all">데스크톱: {item.meta?.url}</p>
                              {item.meta?.mobileUrl && (
                                <p className="text-xs break-all">모바일: {item.meta.mobileUrl}</p>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span className="text-foreground">
                          {navPlacementLabel(item.meta?.placement, teacherNavPlacements)}
                        </span>
                        {item.meta?.showStudent && (
                          <span className="text-muted-foreground">
                            학생: {navPlacementLabel(item.meta?.studentPlacement, studentNavPlacements)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {item.meta?.iconUrl ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center space-x-2 cursor-pointer">
                                <img
                                  src={item.meta.iconUrl}
                                  alt="아이콘"
                                  className="w-4 h-4 flex-shrink-0"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                                <span className="text-blue-600 text-sm truncate max-w-[80px]">
                                  {item.meta.iconUrl.split('/').pop() || '아이콘'}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <p className="break-all">{item.meta.iconUrl}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted-foreground text-sm">기본</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={item.meta?.show ? "default" : "secondary"} className="text-xs">
                        {item.meta?.show ? "표시" : "숨김"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={item.meta?.showStudent ? "default" : "secondary"} className="text-xs">
                        {item.meta?.showStudent ? "표시" : "숨김"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-1 justify-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleToggleShow(item.id, item.meta?.show)}
                                className="h-8 w-8 p-0"
                              >
                                {item.meta?.show ? (
                                  <EyeOff className="h-3 w-3" />
                                ) : (
                                  <Eye className="h-3 w-3" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {item.meta?.show ? '숨기기' : '표시하기'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditDialog(item)}
                                className="h-8 w-8 p-0"
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              편집
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDelete(item.id, item.name)}
                                className="h-8 w-8 p-0"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              삭제
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>외부 메뉴 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <MenuFormFields idPrefix="edit" value={formData} onChange={setFormData} />
            <DialogFooter className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                취소
              </Button>
              <Button onClick={handleEdit} disabled={updateIframeMenu.isPending}>
                {updateIframeMenu.isPending ? "수정 중..." : "수정"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
