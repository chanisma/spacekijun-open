import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, FolderInput, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  VirtualFolder,
  buildFolderTree,
  flattenFolderTree,
  toggleFolderExpansion,
  expandPathToFolder,
} from '@/lib/folderUtils';
import { Document } from '@/features/documents/types';

interface FolderTreeProps {
  documents: Document[];
  /** document_folders registry 경로 — 빈 폴더도 트리에 표시 */
  folderPaths?: string[];
  currentPath: string | null;
  onFolderClick: (path: string) => void;
  onCreateFolder?: (path: string) => Promise<void>;
  onRenameFolder?: (folder: VirtualFolder, newName: string) => Promise<void>;
  onMoveFolder?: (folder: VirtualFolder, newParentPath: string) => Promise<void>;
  isAdmin?: boolean;
}

export const FolderTree = ({
  documents,
  folderPaths = [],
  currentPath,
  onFolderClick,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  isAdmin = false,
}: FolderTreeProps) => {
  // 폴더 트리 빌드
  const rootFolder = useMemo(() => {
    const tree = buildFolderTree(documents, folderPaths);
    // 현재 선택된 경로까지 확장
    if (currentPath) {
      return expandPathToFolder(tree, currentPath);
    }
    // 첫 번째 레벨만 기본 확장
    tree.children.forEach(child => {
      child.isExpanded = true;
    });
    return tree;
  }, [documents, folderPaths, currentPath]);

  const [folderTree, setFolderTree] = useState<VirtualFolder>(rootFolder);

  // rootFolder가 변경되면 state 업데이트
  useMemo(() => {
    setFolderTree(rootFolder);
  }, [rootFolder]);

  // 폴더 이동 다이얼로그 상태
  const [movingFolder, setMovingFolder] = useState<VirtualFolder | null>(null);
  const [moveTargetPath, setMoveTargetPath] = useState<string>('__root__');
  const [isMoving, setIsMoving] = useState(false);

  // 폴더 생성 다이얼로그 상태
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createParentPath, setCreateParentPath] = useState<string>('__root__');
  const [createName, setCreateName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // 폴더 이름변경 다이얼로그 상태
  const [renamingFolder, setRenamingFolder] = useState<VirtualFolder | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // 이동 가능한 목적지 폴더 목록 (이동할 폴더 자신 및 하위 제외)
  const allFolders = useMemo(() => flattenFolderTree(folderTree, true), [folderTree]);
  const availableDestinations = useMemo(() => {
    if (!movingFolder) return [];
    return allFolders.filter(f =>
      f.path !== movingFolder.path &&
      !f.path.startsWith(movingFolder.path + '/')
    );
  }, [movingFolder, allFolders]);

  // 이동 확인
  const handleMoveConfirm = async () => {
    if (!movingFolder || !onMoveFolder) return;
    setIsMoving(true);
    try {
      const newParentPath = moveTargetPath === '__root__' ? '' : moveTargetPath;
      await onMoveFolder(movingFolder, newParentPath);
      setMovingFolder(null);
      setMoveTargetPath('__root__');
    } finally {
      setIsMoving(false);
    }
  };

  // 생성 확인
  const handleCreateConfirm = async () => {
    if (!onCreateFolder) return;
    const name = createName.trim().replace(/\//g, ' ');
    if (!name) return;
    const parent = createParentPath === '__root__' ? '' : createParentPath;
    setIsCreating(true);
    try {
      await onCreateFolder(parent ? `${parent}/${name}` : name);
      setCreateDialogOpen(false);
      setCreateName('');
      setCreateParentPath('__root__');
    } finally {
      setIsCreating(false);
    }
  };

  // 이름변경 확인
  const handleRenameConfirm = async () => {
    if (!renamingFolder || !onRenameFolder) return;
    const name = renameValue.trim().replace(/\//g, ' ');
    if (!name || name === renamingFolder.name) {
      setRenamingFolder(null);
      return;
    }
    setIsRenaming(true);
    try {
      await onRenameFolder(renamingFolder, name);
      setRenamingFolder(null);
      setRenameValue('');
    } finally {
      setIsRenaming(false);
    }
  };

  // 이동 후 새 경로 미리보기
  const movePreviewPath = useMemo(() => {
    if (!movingFolder) return '';
    const parent = moveTargetPath === '__root__' ? '' : moveTargetPath;
    return parent ? `${parent}/${movingFolder.name}` : movingFolder.name;
  }, [movingFolder, moveTargetPath]);

  // 폴더 확장/축소 토글
  const handleToggleExpand = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolderTree(prev => toggleFolderExpansion(prev, path));
  };

  // 폴더 클릭 핸들러
  const handleFolderClick = (folder: VirtualFolder) => {
    onFolderClick(folder.path);
  };

  // 평탄화된 폴더 리스트
  const flatFolders = flattenFolderTree(folderTree);

  return (
    <TooltipProvider delayDuration={500}>
      <div className="flex flex-col h-full">
        {/* 헤더 */}
        <div className="p-3 border-b flex items-center justify-between">
          <h3 className="font-semibold text-sm">폴더</h3>
          {/* 폴더 생성은 교사 전체 개방 (2026-08-11) — 이름변경·이동은 admin 전용 유지 */}
          {onCreateFolder && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setCreateParentPath(currentPath ? currentPath : '__root__');
                setCreateDialogOpen(true);
              }}
              title="새 폴더"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* 루트 폴더 (전체 보기) */}
        <div className="px-2 py-2 border-b">
          <button
            onClick={() => onFolderClick('')}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
              currentPath === '' || currentPath === null
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            )}
          >
            <Folder className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left truncate">전체 문서</span>
            <span className="text-xs opacity-70">{folderTree.totalFileCount}</span>
          </button>
        </div>

        {/* 폴더 트리 */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {flatFolders.map((folder) => (
              <FolderTreeItem
                key={folder.path}
                folder={folder}
                isSelected={currentPath === folder.path}
                onToggleExpand={handleToggleExpand}
                onFolderClick={handleFolderClick}
                onMoveStart={isAdmin && onMoveFolder ? (f) => {
                  setMovingFolder(f);
                  setMoveTargetPath('__root__');
                } : undefined}
                onRenameStart={isAdmin && onRenameFolder ? (f) => {
                  setRenamingFolder(f);
                  setRenameValue(f.name);
                } : undefined}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* 폴더 이동 다이얼로그 */}
      <Dialog open={!!movingFolder} onOpenChange={(open) => !open && setMovingFolder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>폴더 이동</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">"{movingFolder?.name}"</span> 폴더를 이동할 위치를 선택하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">현재 경로</p>
              <p className="text-sm font-mono bg-muted px-3 py-2 rounded-md">{movingFolder?.path || '—'}</p>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">이동할 위치</p>
              <Select value={moveTargetPath} onValueChange={setMoveTargetPath}>
                <SelectTrigger>
                  <SelectValue placeholder="목적지 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__root__">/ (최상위)</SelectItem>
                  {availableDestinations.map(f => (
                    <SelectItem key={f.path} value={f.path}>
                      {f.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">이동 후 경로</p>
              <p className="text-sm font-mono bg-muted px-3 py-2 rounded-md text-primary">{movePreviewPath}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMovingFolder(null)} disabled={isMoving}>
              취소
            </Button>
            <Button
              onClick={handleMoveConfirm}
              disabled={isMoving || movePreviewPath === movingFolder?.path}
            >
              {isMoving ? '이동 중...' : '이동'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 폴더 생성 다이얼로그 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>새 폴더</DialogTitle>
            <DialogDescription>폴더를 만들 위치와 이름을 입력하세요.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">위치</p>
              <Select value={createParentPath} onValueChange={setCreateParentPath}>
                <SelectTrigger>
                  <SelectValue placeholder="위치 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__root__">/ (최상위)</SelectItem>
                  {allFolders.map(f => (
                    <SelectItem key={f.path} value={f.path}>
                      {f.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">폴더 이름</p>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="예: 교무운영부"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateConfirm(); }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={isCreating}>
              취소
            </Button>
            <Button onClick={handleCreateConfirm} disabled={isCreating || !createName.trim()}>
              {isCreating ? '생성 중...' : '생성'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 폴더 이름변경 다이얼로그 */}
      <Dialog open={!!renamingFolder} onOpenChange={(open) => !open && setRenamingFolder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>폴더 이름변경</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">"{renamingFolder?.name}"</span> 폴더의 새 이름을 입력하세요.
              하위 문서의 경로도 함께 갱신됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="새 폴더 이름"
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameConfirm(); }}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingFolder(null)} disabled={isRenaming}>
              취소
            </Button>
            <Button
              onClick={handleRenameConfirm}
              disabled={isRenaming || !renameValue.trim() || renameValue.trim() === renamingFolder?.name}
            >
              {isRenaming ? '변경 중...' : '변경'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

interface FolderTreeItemProps {
  folder: VirtualFolder;
  isSelected: boolean;
  onToggleExpand: (path: string, e: React.MouseEvent) => void;
  onFolderClick: (folder: VirtualFolder) => void;
  onMoveStart?: (folder: VirtualFolder) => void;
  onRenameStart?: (folder: VirtualFolder) => void;
}

const FolderTreeItem = ({
  folder,
  isSelected,
  onToggleExpand,
  onFolderClick,
  onMoveStart,
  onRenameStart,
}: FolderTreeItemProps) => {
  const hasChildren = folder.children.length > 0;
  const paddingLeft = (folder.depth - 1) * 16 + 8; // 깊이에 따른 들여쓰기

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'w-full flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-colors group cursor-pointer',
            isSelected
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted'
          )}
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={() => onFolderClick(folder)}
        >
          {/* 확장/축소 아이콘 */}
          {hasChildren ? (
            <button
              onClick={(e) => onToggleExpand(folder.path, e)}
              className="flex-shrink-0 hover:bg-accent rounded p-0.5"
            >
              {folder.isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <div className="w-4 flex-shrink-0" />
          )}

          {/* 폴더 아이콘 */}
          {folder.isExpanded && hasChildren ? (
            <FolderOpen className="h-4 w-4 flex-shrink-0" />
          ) : (
            <Folder className="h-4 w-4 flex-shrink-0" />
          )}

          {/* 폴더 이름 */}
          <span className="flex-1 text-left truncate">{folder.name}</span>

          {/* 이름변경 버튼 (관리자 전용, hover 시 표시) */}
          {onRenameStart && (
            <button
              onClick={(e) => { e.stopPropagation(); onRenameStart(folder); }}
              className={cn(
                'flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity',
                isSelected
                  ? 'hover:bg-primary-foreground/20'
                  : 'hover:bg-accent'
              )}
              title="이름변경"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}

          {/* 이동 버튼 (관리자 전용, hover 시 표시) */}
          {onMoveStart && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveStart(folder); }}
              className={cn(
                'flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity',
                isSelected
                  ? 'hover:bg-primary-foreground/20'
                  : 'hover:bg-accent'
              )}
              title="폴더 이동"
            >
              <FolderInput className="h-3.5 w-3.5" />
            </button>
          )}

          {/* 파일 개수 */}
          {folder.totalFileCount > 0 && (
            <span className={cn(
              'text-xs flex-shrink-0',
              isSelected ? 'opacity-90' : 'opacity-60'
            )}>
              {folder.totalFileCount}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={10}
        className="max-w-xs"
      >
        <p>{folder.name}</p>
      </TooltipContent>
    </Tooltip>
  );
};
