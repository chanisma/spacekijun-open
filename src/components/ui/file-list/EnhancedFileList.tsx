import { useState, useMemo, useEffect } from "react";
import {
  ChevronRight,
  FileText,
  Folder,
  Grid,
  List,
  MoreVertical,
  File,
  FileIcon as FilePdf,
  FileImage,
  FileCode,
  Download,
  Trash2,
  Edit,
  Eye,
  X,
  Search,
  FileSpreadsheet,
  Presentation,
  ExternalLink,
  Pin,
  PinOff,
  Sparkles,
  Cloud,
  FolderInput,
  CalendarDays,
  Briefcase,
  MessageSquare,
  Users,
  Link as LinkIcon,
  Hash,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import { ImprovedCard } from "@/components/ui/improved-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDropdownDialog } from "@/hooks/useDropdownDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { type Document } from "@/features/documents/types";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatDate, getUploadSourceText, getFileType, formatFileSize } from "./file-list-utils";
import { getDocumentKeywordService } from "@/services/DocumentKeywordService";

// Helper function to check if file is Google Drive file
const isGoogleDriveFile = (doc: Document): boolean => {
  return doc.meta?.is_google_drive_file === true ||
         (typeof doc.storage_path === 'string' && doc.storage_path.includes('docs.google.com'));
};

// Helper function to get Google Drive file type
const getGoogleDriveFileType = (mimeType: string): 'document' | 'spreadsheet' | 'presentation' | 'folder' | null => {
  if (mimeType.includes('vnd.google-apps.folder')) return 'folder';
  if (mimeType.includes('vnd.google-apps.document')) return 'document';
  if (mimeType.includes('vnd.google-apps.spreadsheet')) return 'spreadsheet';
  if (mimeType.includes('vnd.google-apps.presentation')) return 'presentation';
  return null;
};

// Helper function to get file icon
const getFileIcon = (type: string, doc?: Document) => {
  // Check if it's a Google Drive file
  if (doc && isGoogleDriveFile(doc)) {
    const gdriveType = getGoogleDriveFileType(doc.file_type);
    switch (gdriveType) {
      case 'folder':
        return <Folder className="h-5 w-5 text-blue-500" />;
      case 'document':
        return <FileText className="h-5 w-5 text-blue-600" />;
      case 'spreadsheet':
        return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
      case 'presentation':
        return <Presentation className="h-5 w-5 text-orange-600" />;
    }
  }

  switch (type) {
    case "folder":
      return <Folder className="h-5 w-5 text-blue-500" />;
    case "pdf":
      return <FilePdf className="h-5 w-5 text-red-500" />;
    case "image":
      return <FileImage className="h-5 w-5 text-green-500" />;
    case "document":
      return <FileText className="h-5 w-5 text-yellow-500" />;
    case "code":
      return <FileCode className="h-5 w-5 text-purple-500" />;
    default:
      return <File className="h-5 w-5 text-gray-500" />;
  }
};

// Helper function to extract directory path from storage_path
const getDirectoryPath = (doc: Document): string => {
  // 1. meta.directory_path가 있으면 우선 사용
  if (doc.meta?.directory_path) {
    return doc.meta.directory_path;
  }

  // 2. Google Drive 파일인 경우 uploadContext에서 경로 재구성
  if (isGoogleDriveFile(doc) && doc.meta?.uploadContext) {
    const ctx = doc.meta.uploadContext;
    const path: string[] = [];

    // Year first
    path.push(ctx.year?.toString() || new Date().getFullYear().toString());

    // Feature name
    if (ctx.feature) path.push(ctx.feature);

    // Feature-specific structure
    switch (ctx.feature) {
      case '업무 관리':
        if (ctx.taskName) {
          if (ctx.department) path.push(ctx.department);
          path.push(ctx.taskName);
        } else if (ctx.eventName) {
          if (ctx.department) path.push(ctx.department);
          path.push(ctx.eventName);
        }
        break;

      case '스케줄':
        if (ctx.month) path.push(ctx.month.toString());
        if (ctx.scheduleName) path.push(ctx.scheduleName);
        break;

      case '협업 보드':
        if (ctx.boardName) path.push(ctx.boardName);
        if (ctx.noteName) path.push(ctx.noteName);
        break;

      case '서류함':
        if (ctx.category) path.push(ctx.category);
        if (ctx.department) path.push(ctx.department);
        break;
    }

    return 'Spacekijun/' + path.join('/');
  }

  // 3. storage_path에서 추출
  if (typeof doc.storage_path === 'string') {
    // Google Drive URL인 경우
    if (doc.storage_path.includes('docs.google.com')) {
      return 'Google Drive';
    }

    const pathParts = doc.storage_path.split('/');
    if (pathParts.length > 1) {
      // Remove the last part (filename) and join the rest
      const dirPath = pathParts.slice(0, -1).join('/');

      // kijunspace/ 접두사 제거 (있는 경우)
      if (dirPath.startsWith('kijunspace/')) {
        return dirPath.substring('kijunspace/'.length) || '/';
      }

      return dirPath || '/';
    }
  }

  return '/';
};

export interface EnhancedFileListProps {
  // 데이터
  documents: Document[];
  sharedDocuments?: Document[];
  loading?: boolean;

  // 액션 핸들러
  onDownload: (doc: Document) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onUpdate: (id: string, data: Partial<Document>) => void | Promise<void>;
  onPreview?: (doc: Document) => void;
  onFolderChange?: (folderPath: string) => void; // 폴더 변경 콜백
  /** 카드 헤더 우측 툴바(검색창 옆)에 렌더할 추가 액션 (예: 문서 추가 버튼) */
  headerActions?: React.ReactNode;

  // UI 옵션
  showSharedDocuments?: boolean;
  enableBulkActions?: boolean;
  enableSearch?: boolean;
  enableViewModeToggle?: boolean;
  defaultViewMode?: "list" | "grid";
  currentPath?: string[];

  // 세밀한 기능 제어
  enableRename?: boolean;        // 이름 변경 활성화/비활성화
  enableDelete?: boolean;        // 삭제 활성화/비활성화
  enableDownload?: boolean;      // 다운로드 활성화/비활성화
  enablePreview?: boolean;       // 프리뷰 활성화/비활성화
  showBreadcrumb?: boolean;      // 경로 표시 활성화/비활성화
  showBadges?: boolean;          // 배지 표시 활성화/비활성화
  showInfoColumn?: boolean;      // 정보 열 표시 여부 (기본값: showBadges와 동일)
  showFileSize?: boolean;        // 파일 크기 표시 활성화/비활성화
  showModifiedDate?: boolean;    // 수정일 표시 활성화/비활성화
  showDirectoryColumn?: boolean; // 디렉토리 열 표시 활성화/비활성화
  compactMode?: boolean;         // 컴팩트 모드 (작은 아이콘, 간단한 레이아웃)
  maxHeight?: string;            // 최대 높이 제한
  emptyStateMessage?: string;    // 빈 상태 메시지 커스터마이징
  enableFolderView?: boolean;    // 폴더 뷰 활성화/비활성화

  // 권한 관련
  isAdmin?: boolean;             // 관리자 여부 (우선 표시 기능 활성화)
}

const DEFAULT_CURRENT_PATH: string[] = ["Home"];

export const EnhancedFileList = ({
  documents,
  sharedDocuments = [],
  loading = false,
  onDownload,
  onDelete,
  onUpdate,
  onPreview,
  onFolderChange,
  headerActions,
  showSharedDocuments = true,
  enableBulkActions = true,
  enableSearch = true,
  enableViewModeToggle = true,
  defaultViewMode = "list",
  currentPath: externalCurrentPath = DEFAULT_CURRENT_PATH,
  // 세밀한 기능 제어
  enableRename = true,
  enableDelete = true,
  enableDownload = true,
  enablePreview = true,
  showBreadcrumb = true,
  showBadges = true,
  showInfoColumn,
  showFileSize = true,
  showModifiedDate = true,
  showDirectoryColumn = true,
  compactMode = false,
  maxHeight,
  emptyStateMessage,
  enableFolderView = false,
  // 권한 관련
  isAdmin = false,
}: EnhancedFileListProps) => {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "grid">(defaultViewMode);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPath, setCurrentPath] = useState<string[]>(externalCurrentPath);

  // externalCurrentPath가 변경되면 내부 state 업데이트 (값 비교로 무한 루프 방지)
  useEffect(() => {
    setCurrentPath(prev => {
      if (prev.length === externalCurrentPath.length && prev.every((v, i) => v === externalCurrentPath[i])) {
        return prev;
      }
      return externalCurrentPath;
    });
  }, [externalCurrentPath]);

  // showInfoColumn 기본값: showBadges와 동일
  const shouldShowInfoColumn = showInfoColumn !== undefined ? showInfoColumn : showBadges;

  // Modals state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const { triggerDialog, dropdownContentProps } = useDropdownDialog();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [keywordEditModalOpen, setKeywordEditModalOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [bulkMoveModalOpen, setBulkMoveModalOpen] = useState(false);
  const [activeFile, setActiveFile] = useState<Document | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [bulkMoveDirectoryPath, setBulkMoveDirectoryPath] = useState<string>("");

  // Edit state
  const [editForm, setEditForm] = useState({
    file_name: "",
    title: "",
    department: "",
    category: "",
    description: "",
    directory_path: "",
  });
  const [editCustomDepartmentInput, setEditCustomDepartmentInput] = useState('');
  const [editIsUsingCustomInput, setEditIsUsingCustomInput] = useState(false);
  const [isGoogleDriveAuthenticated, setIsGoogleDriveAuthenticated] = useState(false);

  // 기본 부서 목록
  const defaultDepartments = [
    '교무운영부',
    '교육과정부',
    '교육연구부',
    '인성인권부',
    '생활선교부',
    '진로상담부',
    '정보화부',
    '국어과',
    '영어과',
    '수학과',
    '과학과',
    '사회과',
    '제3외국어과',
    '체육과',
    '음악과',
    '미술과',
    '정보과',
    '기술가정과'
  ];

  // Keyword extraction state
  const [editingKeywords, setEditingKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");

  const { toast } = useToast();
  const { user } = useAuth();

  // Check Google Drive authentication status
  useEffect(() => {
    const checkGoogleAuth = async () => {
      try {
        const { getGoogleDriveService } = await import('@/services/googleDriveServiceNew');
        const driveService = getGoogleDriveService();
        await driveService.initialize();
        const isAuth = await driveService.isAuthenticated();
        setIsGoogleDriveAuthenticated(isAuth);
      } catch (error) {
        console.error('Google Drive auth check failed:', error);
        setIsGoogleDriveAuthenticated(false);
      }
    };

    checkGoogleAuth();
  }, []);

  // Combine documents and shared documents
  const allDocuments = useMemo(() => {
    const docs = [...documents];
    if (showSharedDocuments) {
      sharedDocuments.forEach(share => {
        docs.push({
          ...share,
          meta: {
            ...share.meta,
            isShared: true,
          }
        });
      });
    }
    return docs;
  }, [documents, sharedDocuments, showSharedDocuments]);

  // Create folder structure from documents
  const folderStructure = useMemo(() => {
    if (!enableFolderView) return [];

    // 디렉토리 경로별로 그룹화
    const folders = new Map<string, { name: string; path: string; files: Document[]; itemCount: number; lastModified: Date }>();

    console.log('Building folder structure from', allDocuments.length, 'documents');

    allDocuments.forEach(doc => {
      const dirPath = getDirectoryPath(doc);

      // '/' 경로는 무시 (루트에 직접 있는 파일)
      if (dirPath === '/' || dirPath === '') return;

      // 모든 상위 경로도 폴더로 추가
      const pathSegments = dirPath.split('/').filter(s => s);
      for (let i = 1; i <= pathSegments.length; i++) {
        const partialPath = pathSegments.slice(0, i).join('/');
        if (!folders.has(partialPath)) {
          const folderName = pathSegments[i - 1];
          folders.set(partialPath, {
            name: folderName,
            path: partialPath,
            files: [],
            itemCount: 0,
            lastModified: new Date(doc.updated_at || doc.created_at)
          });
        }
      }

      if (!folders.has(dirPath)) {
        const folderName = pathSegments[pathSegments.length - 1] || 'Root';
        folders.set(dirPath, {
          name: folderName,
          path: dirPath,
          files: [],
          itemCount: 0,
          lastModified: new Date(doc.updated_at || doc.created_at)
        });
      }

      const folder = folders.get(dirPath)!;
      folder.files.push(doc);
      folder.itemCount++;

      const docDate = new Date(doc.updated_at || doc.created_at);
      if (docDate > folder.lastModified) {
        folder.lastModified = docDate;
      }
    });

    console.log('Folder structure:', Array.from(folders.entries()));
    return Array.from(folders.values());
  }, [allDocuments, enableFolderView]);

  // Filter files based on search query, current path, and sort by pinned status
  const filteredFiles = useMemo(() => {
    let filtered = allDocuments;

    // 폴더 뷰가 활성화되어 있고 검색이 없는 경우, 현재 경로의 파일만 표시
    if (enableFolderView && !searchQuery) {
      // "전체 문서"를 제외한 실제 경로만 사용
      const pathWithoutRoot = currentPath.filter(p => p !== '전체 문서' && p !== 'Home' && p !== '진학자료');
      const currentPathStr = pathWithoutRoot.join('/');

      // 우선 설정된 파일들 먼저 수집
      const pinnedFiles = allDocuments.filter(doc => doc.meta?.is_pinned === true);

      // 현재 경로의 파일들 필터링 (우선 설정 제외)
      const pathFiles = allDocuments.filter(doc => {
        const docPath = getDirectoryPath(doc);
        // 정확히 현재 경로의 파일만 표시 (하위 폴더 제외)
        return docPath === currentPathStr && doc.meta?.is_pinned !== true;
      });

      // 우선 설정 파일 + 현재 경로 파일
      filtered = [...pinnedFiles, ...pathFiles];
    }
    // 검색 필터 적용
    else if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = allDocuments.filter((doc) => {
        // 기본 필드 검색
        const basicMatch =
          doc.file_name.toLowerCase().includes(query) ||
          doc.title?.toLowerCase().includes(query) ||
          doc.meta?.department?.toLowerCase().includes(query) ||
          doc.meta?.category?.toLowerCase().includes(query);

        // 키워드 검색 (meta.keywords 배열)
        const keywordMatch = doc.meta?.keywords && Array.isArray(doc.meta.keywords)
          ? doc.meta.keywords.some((keyword: string) =>
              keyword.toLowerCase().includes(query)
            )
          : false;

        return basicMatch || keywordMatch;
      });
    }

    // 우선 표시된 파일이 먼저 오도록 정렬
    return filtered.sort((a, b) => {
      const aPinned = a.meta?.is_pinned === true;
      const bPinned = b.meta?.is_pinned === true;

      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0; // 우선 표시 상태가 같으면 기존 순서 유지
    });
  }, [allDocuments, searchQuery, enableFolderView, currentPath]);

  // Get folders for current path (only top-level folders)
  const currentFolders = useMemo(() => {
    if (!enableFolderView || searchQuery) return [];

    // "전체 문서", "진학자료"를 제외한 실제 경로만 사용
    const pathWithoutRoot = currentPath.filter(p => p !== '전체 문서' && p !== 'Home' && p !== '진학자료');
    const currentPathStr = pathWithoutRoot.join('/');
    const uniqueFolders = new Map<string, { name: string; path: string; itemCount: number; lastModified: Date }>();

    console.log('Current path string:', currentPathStr);
    console.log('Folder structure count:', folderStructure.length);

    folderStructure.forEach(folder => {
      console.log('Processing folder:', folder.path);

      // 루트 레벨이거나 현재 경로의 하위 폴더인 경우
      if (currentPathStr === '') {
        // 루트 레벨 폴더 표시
        const firstSegment = folder.path.split('/').filter(s => s)[0];
        console.log('Root level - first segment:', firstSegment);

        if (firstSegment && !uniqueFolders.has(firstSegment)) {
          uniqueFolders.set(firstSegment, {
            name: firstSegment,
            path: firstSegment,
            itemCount: 0,
            lastModified: folder.lastModified
          });
        }
        if (firstSegment) {
          const existingFolder = uniqueFolders.get(firstSegment)!;
          existingFolder.itemCount += folder.itemCount;
          if (folder.lastModified > existingFolder.lastModified) {
            existingFolder.lastModified = folder.lastModified;
          }
        }
      } else if (folder.path.startsWith(currentPathStr + '/') || folder.path === currentPathStr) {
        console.log('Sub-folder match for path:', folder.path);

        if (folder.path === currentPathStr) return; // 현재 경로 자체는 제외

        // 하위 폴더 표시
        const relativePath = folder.path.substring(currentPathStr.length).replace(/^\//, '');
        const firstSegment = relativePath.split('/')[0];
        const fullPath = `${currentPathStr}/${firstSegment}`;

        if (!uniqueFolders.has(fullPath)) {
          uniqueFolders.set(fullPath, {
            name: firstSegment,
            path: fullPath,
            itemCount: 0,
            lastModified: folder.lastModified
          });
        }

        const existingFolder = uniqueFolders.get(fullPath)!;
        existingFolder.itemCount += folder.itemCount;
        if (folder.lastModified > existingFolder.lastModified) {
          existingFolder.lastModified = folder.lastModified;
        }
      }
    });

    const result = Array.from(uniqueFolders.values()).sort((a, b) => a.name.localeCompare(b.name));
    console.log('Current folders result:', result);
    return result;
  }, [folderStructure, currentPath, enableFolderView, searchQuery]);

  // Navigate to folder
  const navigateToFolder = (folderPath: string) => {
    const pathSegments = folderPath.split('/').filter(s => s);
    // "전체 문서"를 루트로 유지
    setCurrentPath(['전체 문서', ...pathSegments]);
    setSelectedFiles([]);

    // FolderTree와 동기화
    if (onFolderChange) {
      onFolderChange(folderPath);
    }
  };

  // Navigate via breadcrumb
  const navigateToBreadcrumb = (index: number) => {
    const newPath = currentPath.slice(0, index + 1);
    setCurrentPath(newPath);
    setSelectedFiles([]);

    // FolderTree와 동기화
    if (onFolderChange) {
      const pathWithoutRoot = newPath.filter(p => p !== '전체 문서' && p !== 'Home' && p !== '진학자료');
      onFolderChange(pathWithoutRoot.join('/'));
    }
  };

  // Handle file selection
  const toggleSelection = (id: string) => {
    setSelectedFiles((prev) =>
      prev.includes(id) ? prev.filter((fileId) => fileId !== id) : [...prev, id]
    );
  };

  // Handle select all
  const toggleSelectAll = () => {
    if (selectedFiles.length === filteredFiles.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(filteredFiles.map((file) => file.id));
    }
  };

  // Handle file actions
  const handleFileAction = (action: string, file: Document) => {
    setActiveFile(file);

    switch (action) {
      case "preview":
        handlePreview(file);
        break;
      case "edit":
        setEditForm({
          file_name: file.file_name,
          title: file.title || "",
          department: file.meta?.department || "",
          category: file.meta?.category || "",
          description: file.meta?.description || "",
          directory_path: getDirectoryPath(file),
        });
        // Reset custom department input states
        setEditCustomDepartmentInput('');
        setEditIsUsingCustomInput(false);
        setEditModalOpen(true);
        break;
      case "delete":
        setDeleteModalOpen(true);
        break;
      case "download":
        onDownload(file);
        break;
      case "toggle-pin":
        togglePin(file);
        break;
      case "edit-keywords":
        setEditingKeywords(file.meta?.keywords || []);
        setKeywordInput("");
        setKeywordEditModalOpen(true);
        break;
      default:
        break;
    }
  };

  // Toggle pin status
  const togglePin = async (file: Document) => {
    if (!isAdmin) return;

    const newPinnedStatus = !(file.meta?.is_pinned === true);
    await onUpdate(file.id, {
      meta: {
        ...file.meta,
        is_pinned: newPinnedStatus
      }
    });
  };

  // Save edited keywords
  const saveEditedKeywords = async () => {
    if (!activeFile) return;

    try {
      const keywordService = getDocumentKeywordService();
      await keywordService.updateKeywords(activeFile.id, editingKeywords);

      toast({
        title: "키워드 저장 완료",
        description: `${editingKeywords.length}개의 키워드가 저장되었습니다.`,
      });

      // 파일 목록 새로고침
      await onUpdate(activeFile.id, {
        meta: {
          ...activeFile.meta,
          keywords: editingKeywords,
        }
      });

      setKeywordEditModalOpen(false);
    } catch (error) {
      console.error('키워드 저장 실패:', error);
      toast({
        title: "키워드 저장 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  // Add keyword from input
  const addKeyword = () => {
    const trimmed = keywordInput.trim();
    if (trimmed && !editingKeywords.includes(trimmed)) {
      setEditingKeywords([...editingKeywords, trimmed]);
      setKeywordInput("");
    }
  };

  // Remove keyword
  const removeKeyword = (index: number) => {
    setEditingKeywords(editingKeywords.filter((_, i) => i !== index));
  };

  // Preview file
  const handlePreview = (doc: Document) => {
    // Google Drive 파일은 새 창에서 열기
    if (isGoogleDriveFile(doc)) {
      window.open(doc.storage_path, '_blank', 'noopener,noreferrer');
      return;
    }

    if (onPreview) {
      onPreview(doc);
      return;
    }

    try {
      let fileUrl: string;

      if (doc.storage_path.startsWith('http')) {
        fileUrl = doc.storage_path;
      } else {
        const { data } = supabase.storage
          .from('documents')
          .getPublicUrl(doc.storage_path);

        fileUrl = data.publicUrl;
      }

      setPreviewUrl(fileUrl);
      setPreviewModalOpen(true);
    } catch (error) {
      console.error('파일 미리보기 오류:', error);
      toast({
        title: '오류',
        description: '파일을 열 수 없습니다.',
        variant: 'destructive',
      });
    }
  };

  // Handle bulk actions
  const handleBulkAction = async (action: string) => {
    if (action === "delete") {
      setDeleteModalOpen(true);
    } else if (action === "download") {
      for (const fileId of selectedFiles) {
        const file = filteredFiles.find(f => f.id === fileId);
        // Google Drive 파일은 다운로드에서 제외
        if (file && !isGoogleDriveFile(file)) {
          await onDownload(file);
        }
      }
      setSelectedFiles([]);
    } else if (action === "move-directory") {
      // 공통 디렉토리 경로가 있는지 확인 (힌트로 사용)
      const selectedDocs = filteredFiles.filter(f => selectedFiles.includes(f.id));
      if (selectedDocs.length > 0) {
        const firstDir = getDirectoryPath(selectedDocs[0]);
        setBulkMoveDirectoryPath(firstDir);
      }
      setBulkMoveModalOpen(true);
    }
  };

  // Bulk move files to new directory
  const bulkMoveFiles = async () => {
    if (selectedFiles.length === 0 || !bulkMoveDirectoryPath.trim()) return;

    const newDirectoryPath = bulkMoveDirectoryPath.trim();
    let successCount = 0;
    let failCount = 0;

    toast({
      title: "디렉토리 이동 시작",
      description: `${selectedFiles.length}개 파일의 디렉토리를 변경합니다...`,
    });

    try {
      for (const fileId of selectedFiles) {
        const file = filteredFiles.find(f => f.id === fileId);
        if (!file) continue;

        try {
          const isGDriveFile = isGoogleDriveFile(file);
          const isExternalUrl = file.storage_path.startsWith('http') && !file.storage_path.includes('/storage/v1/object/');
          const canMoveFile = isGDriveFile || !isExternalUrl;

          const newStoragePath = file.storage_path;

          // Google Drive 파일 이동 (링크 연결로 등록된 파일은 제외)
          const isLinkedFile = file.meta?.uploaded_from === 'google_drive_link';
          if (canMoveFile && isGDriveFile && file.meta?.google_drive_id && !isLinkedFile) {
            const { getGoogleDriveService } = await import('@/services/googleDriveServiceNew');
            const driveService = getGoogleDriveService();
            await driveService.initialize();

            if (await driveService.isAuthenticated()) {
              await driveService.moveFile(file.meta.google_drive_id, newDirectoryPath);
            }
          }
          // 폴더는 meta.directory_path 기반 가상 구조 — Storage 물리 이동은 하지 않는다.
          // (구 구현은 객체를 복사·삭제 후 public URL로 storage_path를 덮어썼는데,
          //  2026-08 개편으로 신규 업로드가 비공개 버킷 상대경로라 이 방식이 파일을 망가뜨림)

          // 메타데이터 업데이트
          await onUpdate(file.id, {
            storage_path: newStoragePath,
            meta: {
              ...file.meta,
              directory_path: newDirectoryPath,
            }
          });

          successCount++;
        } catch (error) {
          console.error(`파일 이동 실패 (${file.file_name}):`, error);
          failCount++;
        }
      }

      toast({
        title: "디렉토리 이동 완료",
        description: `성공: ${successCount}개, 실패: ${failCount}개`,
        variant: failCount > 0 ? "destructive" : "default",
      });

      setSelectedFiles([]);
      setBulkMoveModalOpen(false);
      setBulkMoveDirectoryPath("");
    } catch (error) {
      console.error('일괄 디렉토리 이동 오류:', error);
      toast({
        title: "디렉토리 이동 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  // Save edited file
  const saveEdit = async () => {
    if (!activeFile || editForm.file_name.trim() === "") return;

    // 실제 사용할 부서값 결정
    const finalDepartment = editForm.department === 'none' ? '' : editForm.department;

    try {
      // 디렉토리 경로가 변경되었는지 확인
      const oldDirectoryPath = getDirectoryPath(activeFile);
      const newDirectoryPath = editForm.directory_path.trim() || null;
      const directoryChanged = oldDirectoryPath !== newDirectoryPath;

      // 파일명이 변경되었는지 확인
      const fileNameChanged = activeFile.file_name !== editForm.file_name.trim();

      // 파일을 실제로 이동해야 하는지 확인
      const isGDriveFile = isGoogleDriveFile(activeFile);
      const isExternalUrl = activeFile.storage_path.startsWith('http') && !activeFile.storage_path.includes('/storage/v1/object/');
      const canMoveFile = directoryChanged && newDirectoryPath && (isGDriveFile || !isExternalUrl);

      const newStoragePath = activeFile.storage_path;

      // Google Drive 파일명 변경
      if (isGDriveFile && fileNameChanged && activeFile.meta?.google_drive_id) {
        try {
          const { getGoogleDriveService } = await import('@/services/googleDriveServiceNew');
          const driveService = getGoogleDriveService();
          await driveService.initialize();

          if (await driveService.isAuthenticated()) {
            // Google Drive API로 파일명 변경
            const response = await window.gapi.client.drive.files.update({
              fileId: activeFile.meta.google_drive_id,
              resource: {
                name: editForm.file_name.trim()
              }
            });

            console.log('Google Drive 파일명 변경 완료:', response.result);
            toast({
              title: 'Google Drive 파일명 변경 완료',
              description: '파일명이 성공적으로 변경되었습니다.',
            });
          } else {
            toast({
              title: '경고',
              description: 'Google Drive 인증이 필요합니다. 메타데이터만 업데이트됩니다.',
              variant: 'destructive',
            });
          }
        } catch (renameError) {
          console.error('Google Drive 파일명 변경 오류:', renameError);
          toast({
            title: '경고',
            description: 'Google Drive 파일명 변경에 실패했지만 메타데이터는 업데이트됩니다.',
            variant: 'destructive',
          });
        }
      }

      // Google Drive 파일 이동 (링크 연결로 등록된 파일은 제외)
      const isLinkedFile = activeFile.meta?.uploaded_from === 'google_drive_link';
      if (canMoveFile && isGDriveFile && activeFile.meta?.google_drive_id && typeof activeFile.storage_path === 'string' && !isLinkedFile) {
        try {
          const { getGoogleDriveService } = await import('@/services/googleDriveServiceNew');
          const driveService = getGoogleDriveService();

          // 초기화 및 인증 확인
          await driveService.initialize();

          if (await driveService.isAuthenticated()) {
            // Google Drive에서 파일 이동
            const result = await driveService.moveFile(activeFile.meta.google_drive_id, newDirectoryPath);
            console.log('Google Drive 파일 이동 완료:', result);

            toast({
              title: 'Google Drive 파일 이동 완료',
              description: '파일이 새 폴더로 이동되었습니다.',
            });
          } else {
            toast({
              title: '경고',
              description: 'Google Drive 인증이 필요합니다. 메타데이터만 업데이트됩니다.',
              variant: 'destructive',
            });
          }
        } catch (moveError) {
          console.error('Google Drive 파일 이동 오류:', moveError);
          toast({
            title: '경고',
            description: 'Google Drive 파일 이동에 실패했지만 메타데이터는 업데이트됩니다.',
            variant: 'destructive',
          });
        }
      }
      // 폴더는 meta.directory_path 기반 가상 구조 — Storage 물리 이동은 하지 않는다.
      // (구 구현은 객체를 복사·삭제 후 public URL로 storage_path를 덮어썼는데,
      //  2026-08 개편으로 신규 업로드가 비공개 버킷 상대경로라 이 방식이 파일을 망가뜨림)

      // 메타데이터 업데이트
      await onUpdate(activeFile.id, {
        file_name: editForm.file_name.trim(),
        title: editForm.title.trim() || null,
        storage_path: newStoragePath, // 새 storage_path 적용
        meta: {
          ...activeFile.meta,
          department: finalDepartment || null,
          category: editForm.category.trim() || null,
          description: editForm.description.trim() || null,
          directory_path: newDirectoryPath,
        }
      });

      setEditModalOpen(false);
      setActiveFile(null);
      setEditForm({
        file_name: "",
        title: "",
        department: "",
        category: "",
        description: "",
        directory_path: "",
      });
      setEditCustomDepartmentInput('');
      setEditIsUsingCustomInput(false);
    } catch (error) {
      console.error('파일 수정 오류:', error);
      toast({
        title: '오류',
        description: '파일 수정에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  // Delete files
  const deleteFiles = async () => {
    if (selectedFiles.length > 0) {
      // Delete multiple files
      for (const fileId of selectedFiles) {
        await onDelete(fileId);
      }
      setSelectedFiles([]);
    } else if (activeFile) {
      // Delete single file
      await onDelete(activeFile.id);
      setActiveFile(null);
    }

    setDeleteModalOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // 컴팩트 모드일 때 아이콘 크기 조정
  const iconSize = compactMode ? "h-4 w-4" : "h-5 w-5";
  const iconSizeGrid = compactMode ? "text-2xl" : "text-4xl";

  return (
    <ImprovedCard className="w-full min-w-0 max-w-full overflow-hidden shadow-md">
      <CardHeader className={compactMode ? "min-w-0 p-2 border-b" : "min-w-0 p-4 border-b"}>
        <div
          className={
            headerActions
              // headerActions(문서 추가 버튼) 사용 시: 브레드크럼과 액션을 항상 두 줄로 분리
              // (한 줄 배치는 창이 좁을 때 디렉토리 주소가 찌그러짐 — 2026-08-11 사용자 피드백)
              ? "flex flex-col space-y-3"
              : "flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0"
          }
        >
          {showBreadcrumb && (
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              {currentPath.map((path, index) => (
                <div key={index} className="flex items-center">
                  {index > 0 && <ChevronRight className="h-4 w-4 mx-1" />}
                  {enableFolderView ? (
                    <button
                      onClick={() => navigateToBreadcrumb(index)}
                      className={`hover:text-primary ${index === currentPath.length - 1 ? "font-medium text-primary" : ""}`}
                    >
                      {path}
                    </button>
                  ) : (
                    <span
                      className={`${index === currentPath.length - 1 ? "font-medium text-primary" : ""}`}
                    >
                      {path}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center space-x-2">
            {headerActions}
            {enableSearch && (
              <div className="relative w-full md:w-auto">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="파일 검색..."
                  className="w-full pl-8 md:w-[200px] lg:w-[300px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}

            {enableViewModeToggle && (
              <div className="hidden md:flex border rounded-md">
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8 rounded-r-none"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                  <span className="sr-only">리스트 뷰</span>
                </Button>
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8 rounded-l-none"
                  onClick={() => setViewMode("grid")}
                >
                  <Grid className="h-4 w-4" />
                  <span className="sr-only">그리드 뷰</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Bulk Actions Toolbar */}
      {enableBulkActions && selectedFiles.length > 0 && (
        <div className="bg-muted/50 p-2 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedFiles([])}>
              <X className="h-4 w-4 mr-2" />
              선택 해제
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedFiles.length}개 선택됨
            </span>
          </div>
          <div className="flex items-center space-x-2">
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => handleBulkAction("move-directory")}>
                <FolderInput className="h-4 w-4 mr-2" />
                디렉토리 변경
              </Button>
            )}
            {enableDownload && (
              <Button variant="outline" size="sm" onClick={() => handleBulkAction("download")}>
                <Download className="h-4 w-4 mr-2" />
                다운로드
              </Button>
            )}
            {enableDelete && (
              <Button variant="destructive" size="sm" onClick={() => handleBulkAction("delete")}>
                <Trash2 className="h-4 w-4 mr-2" />
                삭제
              </Button>
            )}
          </div>
        </div>
      )}

      <CardContent className="min-w-0 max-w-full overflow-hidden p-0">
        <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "list" | "grid")}>
          <TabsContent value="list" className="m-0">
            {(enableFolderView ? (currentFolders.length > 0 || filteredFiles.length > 0) : filteredFiles.length > 0) ? (
              <div className={compactMode ? "min-w-0 max-w-full overflow-hidden" : "overflow-x-auto"}>
                <Table className={compactMode ? "w-full table-fixed" : undefined}>
                <TableHeader>
                  <TableRow>
                    {enableBulkActions && (
                      <TableHead className="hidden md:table-cell w-[40px]">
                        <Checkbox
                          checked={selectedFiles.length === filteredFiles.length && filteredFiles.length > 0}
                          onCheckedChange={toggleSelectAll}
                          aria-label="전체 선택"
                        />
                      </TableHead>
                    )}
                    <TableHead className={compactMode ? "w-auto" : "w-[350px]"}>파일명</TableHead>
                    {shouldShowInfoColumn && !enableFolderView && <TableHead className="hidden md:table-cell w-[100px]">정보</TableHead>}
                    {showDirectoryColumn && !enableFolderView && (
                      <TableHead className={compactMode ? "hidden w-[120px] md:table-cell" : "hidden w-[150px] md:table-cell"}>
                        디렉토리
                      </TableHead>
                    )}
                    {enableFolderView && <TableHead className="hidden md:table-cell w-[150px]">항목 수</TableHead>}
                    {showModifiedDate && (
                      <TableHead className={compactMode ? "hidden w-[72px] md:table-cell" : "hidden w-[80px] md:table-cell"}>
                        수정일
                      </TableHead>
                    )}
                    <TableHead className={compactMode ? "w-[48px]" : "w-[80px]"}>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Render folders first */}
                  {enableFolderView && currentFolders.map((folder) => (
                    <TableRow key={`folder-${folder.path}`} className="hover:bg-muted/50">
                      {enableBulkActions && <TableCell className="hidden md:table-cell"></TableCell>}
                      <TableCell>
                        <div
                          className="flex items-center space-x-2 cursor-pointer"
                          onClick={() => navigateToFolder(folder.path)}
                        >
                          <Folder className="h-5 w-5 text-blue-500" />
                          <span className="font-medium">{folder.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {folder.itemCount} 항목
                      </TableCell>
                      {showModifiedDate && (
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {formatDate(folder.lastModified?.toISOString?.() ?? String(folder.lastModified ?? ''))}
                        </TableCell>
                      )}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => navigateToFolder(folder.path)}
                        >
                          <ChevronRight className="h-4 w-4" />
                          <span className="sr-only">열기</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Render files */}
                  {filteredFiles.map((file) => {
                    const fileType = getFileType(file.file_type, file.file_name);
                    const isLinkedFile = !!file.meta?.source;
                    const isGDriveFile = isGoogleDriveFile(file);

                    // 서류함이 아닌 곳에서 업로드된 파일 (스케줄, 업무 시스템 등)
                    // 단, Google Drive 파일 중 서류함에서 직접 업로드한 것은 삭제 가능
                    const isExternalUpload = file.meta?.uploaded_from &&
                      !['document_upload', 'google_drive', undefined, null, ''].includes(file.meta.uploaded_from);
                    // 관리자 또는 파일 소유자만 삭제 가능
                    const isOwner = file.user_id === user?.id;
                    const canDelete = (isAdmin || isOwner) && !isLinkedFile && !isExternalUpload;

                    return (
                      <TableRow key={file.id} className={selectedFiles.includes(file.id) ? "bg-muted/50" : ""}>
                        {enableBulkActions && (
                          <TableCell className="hidden md:table-cell">
                            <Checkbox
                              checked={selectedFiles.includes(file.id)}
                              onCheckedChange={() => toggleSelection(file.id)}
                              aria-label={`${file.file_name} 선택`}
                            />
                          </TableCell>
                        )}
                        <TableCell className={compactMode ? "max-w-0 min-w-0" : undefined}>
                          <div
                            className={`flex items-center space-x-2 ${enablePreview ? 'cursor-pointer' : ''} min-w-0`}
                            onClick={() => enablePreview && handleFileAction("preview", file)}
                          >
                            <div className="flex-shrink-0">{getFileIcon(fileType, file)}</div>
                            <span
                              className={compactMode ? "block min-w-0 flex-1 truncate text-sm font-medium" : "block min-w-0 flex-1 truncate font-medium"}
                              title={file.file_name}
                            >
                              {file.file_name}
                            </span>
                            {file.meta?.is_pinned === true && (
                              <Pin className="h-4 w-4 text-blue-600 fill-blue-600 flex-shrink-0" />
                            )}
                          </div>
                        </TableCell>
                        {shouldShowInfoColumn && (
                          <TableCell className="hidden md:table-cell">
                            <div className="flex flex-nowrap gap-1 overflow-x-auto">
                              {/* Google Drive badge - Show Cloud icon if it's a Google Drive file */}
                              {isGDriveFile && (
                                <Badge variant="outline" className="text-xs pointer-events-none flex items-center p-1" title="Google Drive">
                                  <Cloud className="h-3 w-3" />
                                </Badge>
                              )}

                              {/* Upload source - Icon only */}
                              {(() => {
                                const uploadSource = file.meta?.uploaded_from;
                                let icon = null;
                                let title = '';

                                if (uploadSource === 'document_upload' || !uploadSource) {
                                  icon = <FileText className="h-3 w-3" />;
                                  title = '서류함';
                                } else if (uploadSource === 'google_drive' || uploadSource === 'google_drive_integration') {
                                  // Google Drive는 이미 위에 별도로 표시되므로 여기서는 표시하지 않음
                                  return null;
                                } else if (uploadSource === 'google_drive_link') {
                                  icon = <LinkIcon className="h-3 w-3" />;
                                  title = '링크 연결';
                                } else if (uploadSource === 'schedule' || uploadSource === 'meeting') {
                                  icon = <CalendarDays className="h-3 w-3" />;
                                  title = '스케줄';
                                } else if (uploadSource === 'task' || uploadSource === 'task_system') {
                                  icon = <Briefcase className="h-3 w-3" />;
                                  title = '업무 관리';
                                } else if (uploadSource === 'collaboration_board') {
                                  icon = <MessageSquare className="h-3 w-3" />;
                                  title = '협업 보드';
                                }

                                return icon ? (
                                  <Badge variant="outline" className="text-xs pointer-events-none flex items-center p-0.5" title={title}>
                                    {icon}
                                  </Badge>
                                ) : null;
                              })()}

                              {/* Shared status - Icon only */}
                              {file.meta?.isShared && (
                                <Badge variant="outline" className="text-xs pointer-events-none flex items-center p-0.5" title="공유됨">
                                  <Users className="h-3 w-3" />
                                </Badge>
                              )}

                              {/* AI-extracted keywords - Show icon + count */}
                              {file.meta?.keywords && Array.isArray(file.meta.keywords) && file.meta.keywords.length > 0 && (
                                <Badge
                                  variant="default"
                                  className="text-xs bg-purple-100 text-purple-800 cursor-pointer hover:bg-purple-200 whitespace-nowrap px-1.5 py-0.5"
                                  onClick={() => {
                                    setActiveFile(file);
                                    setInfoModalOpen(true);
                                  }}
                                  title={`키워드 ${file.meta.keywords.length}개: ${file.meta.keywords.join(', ')}`}
                                >
                                  <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                                  +{file.meta.keywords.length}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        )}
                        {showDirectoryColumn && (
                          <TableCell className={compactMode ? "hidden max-w-0 md:table-cell" : "hidden md:table-cell"}>
                            <span
                              className="block truncate text-xs text-muted-foreground"
                              title={getDirectoryPath(file)}
                            >
                              {getDirectoryPath(file)}
                            </span>
                          </TableCell>
                        )}
                        {showModifiedDate && (
                          <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                            {formatDate(file.updated_at || file.created_at)}
                          </TableCell>
                        )}
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">작업</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" {...dropdownContentProps}>
                              {enablePreview && (
                                <DropdownMenuItem onClick={() => handleFileAction("preview", file)}>
                                  {isGDriveFile ? (
                                    <>
                                      <ExternalLink className="h-4 w-4 mr-2" />
                                      Google에서 열기
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="h-4 w-4 mr-2" />
                                      미리보기
                                    </>
                                  )}
                                </DropdownMenuItem>
                              )}

                              {enableDownload && !isGDriveFile && (
                                <DropdownMenuItem onClick={() => handleFileAction("download", file)}>
                                  <Download className="h-4 w-4 mr-2" />
                                  다운로드
                                </DropdownMenuItem>
                              )}

                              {isAdmin && file.meta?.keywords && file.meta.keywords.length > 0 && (
                                <>
                                  <DropdownMenuSeparator />

                                  <DropdownMenuItem
                                    onSelect={() => triggerDialog(() => handleFileAction("edit-keywords", file))}
                                  >
                                    <Edit className="h-4 w-4 mr-2" />
                                    키워드 편집
                                  </DropdownMenuItem>
                                </>
                              )}

                              {(isAdmin || enableRename || enableDelete) && <DropdownMenuSeparator />}

                              {isAdmin && (
                                <DropdownMenuItem onClick={() => handleFileAction("toggle-pin", file)}>
                                  {file.meta?.is_pinned === true ? (
                                    <>
                                      <PinOff className="h-4 w-4 mr-2" />
                                      우선 표시 해제
                                    </>
                                  ) : (
                                    <>
                                      <Pin className="h-4 w-4 mr-2" />
                                      우선 표시
                                    </>
                                  )}
                                </DropdownMenuItem>
                              )}

                              {isAdmin && (enableRename || enableDelete) && <DropdownMenuSeparator />}

                              {enableRename && (isAdmin || file.user_id === user?.id) && (
                                <DropdownMenuItem
                                  onSelect={() => triggerDialog(() => handleFileAction("edit", file))}
                                  disabled={isLinkedFile}
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  편집
                                </DropdownMenuItem>
                              )}

                              {enableDelete && enableRename && <DropdownMenuSeparator />}

                              {enableDelete && (
                                <DropdownMenuItem
                                  onSelect={() => triggerDialog(() => handleFileAction("delete", file))}
                                  className="text-destructive focus:text-destructive"
                                  disabled={!canDelete}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  삭제
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="rounded-full bg-muted p-3">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">파일이 없습니다</h3>
                <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
                  {emptyStateMessage || (searchQuery
                    ? `"${searchQuery}"에 대한 검색 결과가 없습니다.`
                    : "업로드된 문서가 없습니다. 새 문서를 업로드하세요.")}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="grid" className="m-0">
            {(enableFolderView ? (currentFolders.length > 0 || filteredFiles.length > 0) : filteredFiles.length > 0) ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
                {/* Render folders first */}
                {enableFolderView && currentFolders.map((folder) => (
                  <div
                    key={`folder-grid-${folder.path}`}
                    className="relative group rounded-lg border bg-card p-2 transition-all hover:shadow-md cursor-pointer"
                    onClick={() => navigateToFolder(folder.path)}
                  >
                    <div className="flex flex-col items-center p-4">
                      <div className="mb-2 text-4xl">
                        <Folder className="h-10 w-10 text-blue-500" />
                      </div>
                      <div className="text-center w-full min-w-0 px-2">
                        <p className="font-medium truncate max-w-full" title={folder.name}>{folder.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{folder.itemCount} 항목</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Render files */}
                {filteredFiles.map((file) => {
                  const fileType = getFileType(file.file_type, file.file_name);
                  const isLinkedFile = !!file.meta?.source;
                  const isGDriveFile = isGoogleDriveFile(file);

                  // 서류함이 아닌 곳에서 업로드된 파일 (스케줄, 업무 시스템 등)
                  // 단, Google Drive 파일 중 서류함에서 직접 업로드한 것은 삭제 가능
                  const isExternalUpload = file.meta?.uploaded_from &&
                    !['document_upload', 'google_drive', undefined, null, ''].includes(file.meta.uploaded_from);
                  // 관리자 또는 파일 소유자만 삭제 가능
                  const isOwner = file.user_id === user?.id;
                  const canDelete = (isAdmin || isOwner) && !isLinkedFile && !isExternalUpload;

                  return (
                    <div
                      key={file.id}
                      className={`relative group rounded-lg border bg-card p-2 transition-all hover:shadow-md ${
                        selectedFiles.includes(file.id) ? "ring-2 ring-primary" : ""
                      }`}
                    >
                      {enableBulkActions && (
                        <div className="hidden md:block absolute top-2 right-2 z-10">
                          <Checkbox
                            checked={selectedFiles.includes(file.id)}
                            onCheckedChange={() => toggleSelection(file.id)}
                            aria-label={`${file.file_name} 선택`}
                          />
                        </div>
                      )}

                      <div
                        className={`flex flex-col items-center ${compactMode ? 'p-2' : 'p-4'} ${enablePreview ? 'cursor-pointer' : ''}`}
                        onClick={() => enablePreview && handleFileAction("preview", file)}
                      >
                        <div className={`mb-2 ${iconSizeGrid} flex-shrink-0`}>{getFileIcon(fileType, file)}</div>
                        <div className="text-center w-full min-w-0 px-2">
                          <div className="flex items-center justify-center gap-1 min-w-0">
                            <p className={`${compactMode ? 'text-sm' : ''} font-medium truncate max-w-full`} title={file.file_name}>{file.file_name}</p>
                            {file.meta?.is_pinned === true && (
                              <Pin className="h-4 w-4 text-blue-600 fill-blue-600 flex-shrink-0" />
                            )}
                          </div>
                          {showFileSize && <p className="text-xs text-muted-foreground mt-1">{formatFileSize(file.file_size)}</p>}
                          {showBadges && (
                            <div className="flex flex-wrap gap-1 mt-2 justify-center">
                              {/* Google Drive badge - Show Cloud icon if it's a Google Drive file */}
                              {isGDriveFile && (
                                <Badge variant="outline" className="text-xs pointer-events-none flex items-center p-1" title="Google Drive">
                                  <Cloud className="h-3 w-3" />
                                </Badge>
                              )}

                              {/* Upload source - Icon only */}
                              {(() => {
                                const uploadSource = file.meta?.uploaded_from;
                                let icon = null;
                                let title = '';

                                if (uploadSource === 'document_upload' || !uploadSource) {
                                  icon = <FileText className="h-3 w-3" />;
                                  title = '서류함';
                                } else if (uploadSource === 'google_drive' || uploadSource === 'google_drive_integration') {
                                  // Google Drive는 이미 위에 별도로 표시되므로 여기서는 표시하지 않음
                                  return null;
                                } else if (uploadSource === 'google_drive_link') {
                                  icon = <LinkIcon className="h-3 w-3" />;
                                  title = '링크 연결';
                                } else if (uploadSource === 'schedule' || uploadSource === 'meeting') {
                                  icon = <CalendarDays className="h-3 w-3" />;
                                  title = '스케줄';
                                } else if (uploadSource === 'task' || uploadSource === 'task_system') {
                                  icon = <Briefcase className="h-3 w-3" />;
                                  title = '업무 관리';
                                } else if (uploadSource === 'collaboration_board') {
                                  icon = <MessageSquare className="h-3 w-3" />;
                                  title = '협업 보드';
                                }

                                return icon ? (
                                  <Badge variant="outline" className="text-xs pointer-events-none flex items-center p-0.5" title={title}>
                                    {icon}
                                  </Badge>
                                ) : null;
                              })()}

                              {/* Shared status - Icon only */}
                              {file.meta?.isShared && (
                                <Badge variant="outline" className="text-xs pointer-events-none flex items-center p-0.5" title="공유됨">
                                  <Users className="h-3 w-3" />
                                </Badge>
                              )}

                              {/* AI-extracted keywords - Show icon + count */}
                              {file.meta?.keywords && Array.isArray(file.meta.keywords) && file.meta.keywords.length > 0 && (
                                <Badge
                                  variant="default"
                                  className="text-xs bg-purple-100 text-purple-800 cursor-pointer hover:bg-purple-200 whitespace-nowrap px-1.5 py-0.5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveFile(file);
                                    setInfoModalOpen(true);
                                  }}
                                  title={`키워드 ${file.meta.keywords.length}개: ${file.meta.keywords.join(', ')}`}
                                >
                                  <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                                  +{file.meta.keywords.length}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">작업</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {enablePreview && (
                              <DropdownMenuItem onClick={() => handleFileAction("preview", file)}>
                                {isGDriveFile ? (
                                  <>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Google에서 열기
                                  </>
                                ) : (
                                  <>
                                    <Eye className="h-4 w-4 mr-2" />
                                    미리보기
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}

                            {enableDownload && !isGDriveFile && (
                              <DropdownMenuItem onClick={() => handleFileAction("download", file)}>
                                <Download className="h-4 w-4 mr-2" />
                                다운로드
                              </DropdownMenuItem>
                            )}

                            {isAdmin && file.meta?.keywords && file.meta.keywords.length > 0 && (
                              <>
                                <DropdownMenuSeparator />

                                <DropdownMenuItem
                                  onClick={() => handleFileAction("edit-keywords", file)}
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  키워드 편집
                                </DropdownMenuItem>
                              </>
                            )}

                            {(isAdmin || enableRename || enableDelete) && <DropdownMenuSeparator />}

                            {isAdmin && (
                              <DropdownMenuItem onClick={() => handleFileAction("toggle-pin", file)}>
                                {file.meta?.is_pinned === true ? (
                                  <>
                                    <PinOff className="h-4 w-4 mr-2" />
                                    우선 표시 해제
                                  </>
                                ) : (
                                  <>
                                    <Pin className="h-4 w-4 mr-2" />
                                    우선 표시
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}

                            {isAdmin && (enableRename || enableDelete) && <DropdownMenuSeparator />}

                            {enableRename && (isAdmin || file.user_id === user?.id) && (
                              <DropdownMenuItem
                                onClick={() => handleFileAction("edit", file)}
                                disabled={isLinkedFile}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                편집
                              </DropdownMenuItem>
                            )}

                            {enableDelete && enableRename && <DropdownMenuSeparator />}

                            {enableDelete && (
                              <DropdownMenuItem
                                onClick={() => handleFileAction("delete", file)}
                                className="text-destructive focus:text-destructive"
                                disabled={!canDelete}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                삭제
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="rounded-full bg-muted p-3">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">파일이 없습니다</h3>
                <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
                  {emptyStateMessage || (searchQuery
                    ? `"${searchQuery}"에 대한 검색 결과가 없습니다.`
                    : "업로드된 문서가 없습니다. 새 문서를 업로드하세요.")}
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Edit Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>파일 편집</DialogTitle>
            <DialogDescription>
              파일 정보를 수정할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 파일명 */}
            <div className="space-y-2">
              <Label htmlFor="file_name">파일명 *</Label>
              <Input
                id="file_name"
                placeholder="파일명을 입력하세요"
                value={editForm.file_name}
                onChange={(e) => setEditForm({ ...editForm, file_name: e.target.value })}
                disabled={activeFile && isGoogleDriveFile(activeFile) && !isGoogleDriveAuthenticated}
              />
              {activeFile && isGoogleDriveFile(activeFile) && !isGoogleDriveAuthenticated && (
                <p className="text-xs text-muted-foreground">
                  Google Drive 인증이 필요합니다. 파일명을 수정하려면 Google Drive에 로그인하세요.
                </p>
              )}
              {activeFile && isGoogleDriveFile(activeFile) && isGoogleDriveAuthenticated && (
                <p className="text-xs text-green-600">
                  ✓ Google Drive 파일명을 수정할 수 있습니다.
                </p>
              )}
            </div>

            {/* 제목 */}
            <div className="space-y-2">
              <Label htmlFor="title">제목</Label>
              <Input
                id="title"
                placeholder="표시할 제목을 입력하세요 (선택사항)"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>

            {/* 부서 */}
            <div className="space-y-2">
              <Label htmlFor="department">부서</Label>
              <Select
                value={editForm.department || "none"}
                onValueChange={(value) => {
                  setEditForm({ ...editForm, department: value === "none" ? "" : value });
                }}
              >
                <SelectTrigger id="department">
                  <SelectValue placeholder="부서를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안 함</SelectItem>
                  {defaultDepartments.map(dept => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 카테고리 */}
            <div className="space-y-2">
              <Label htmlFor="category">카테고리</Label>
              <Input
                id="category"
                placeholder="카테고리를 입력하세요 (선택사항)"
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
              />
            </div>

            {/* 설명 */}
            <div className="space-y-2">
              <Label htmlFor="description">설명</Label>
              <Textarea
                id="description"
                placeholder="파일 설명을 입력하세요 (선택사항)"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
              />
            </div>

            {/* 디렉토리 경로 */}
            <div className="space-y-2">
              <Label htmlFor="directory_path">디렉토리 경로</Label>
              <Input
                id="directory_path"
                placeholder="디렉토리 경로 (예: 년도/기능명/세부경로)"
                value={editForm.directory_path}
                onChange={(e) => setEditForm({ ...editForm, directory_path: e.target.value })}
                disabled={activeFile && activeFile.meta?.uploaded_from && !['document_upload', 'google_drive', undefined, null, ''].includes(activeFile.meta.uploaded_from)}
              />
              {activeFile && activeFile.meta?.uploaded_from && !['document_upload', 'google_drive', undefined, null, ''].includes(activeFile.meta.uploaded_from) && (
                <p className="text-xs text-muted-foreground">
                  다른 위치(스케줄, 업무 관리, 협업 보드)에서 업로드된 파일의 디렉토리는 수정할 수 없습니다.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              취소
            </Button>
            <Button onClick={saveEdit}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>삭제 확인</DialogTitle>
            <DialogDescription className="break-all">
              {selectedFiles.length > 0
                ? `선택한 ${selectedFiles.length}개의 파일을 삭제하시겠습니까?`
                : `"${activeFile?.file_name}" 파일을 삭제하시겠습니까?`}
              이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={deleteFiles}>
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="w-[90vw] max-w-6xl h-[85vh] flex flex-col">
          <DialogHeader>
            {/* 파일명은 제목 한 줄로 자르고 전체는 tooltip으로 — 미리보기 영역을
                제목 줄바꿈이 잠식하지 않게 한다 */}
            <DialogTitle className="truncate" title={activeFile?.file_name}>
              {activeFile?.file_name}
            </DialogTitle>
            <DialogDescription>파일 미리보기</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            {previewUrl && (
              <div className="w-full h-full">
                {activeFile && isGoogleDriveFile(activeFile) ? (
                  <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <FileText className="h-16 w-16 text-muted-foreground" />
                    <p className="text-muted-foreground">Google Drive 파일은 미리보기를 지원하지 않습니다.</p>
                    <p className="text-sm text-muted-foreground">새 창에서 열기 버튼을 클릭하여 파일을 확인하세요.</p>
                    <Button onClick={() => window.open(previewUrl, '_blank')}>
                      Google에서 열기
                    </Button>
                  </div>
                ) : activeFile?.file_type.includes('image') ? (
                  <img
                    src={previewUrl}
                    alt={activeFile?.file_name}
                    className="max-w-full h-auto object-contain mx-auto"
                  />
                ) : activeFile?.file_type.includes('pdf') ? (
                  <iframe
                    src={previewUrl}
                    className="w-full h-full border-0"
                    title={activeFile?.file_name}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <FileText className="h-16 w-16 text-muted-foreground" />
                    <p className="text-muted-foreground">이 파일 형식은 미리보기를 지원하지 않습니다.</p>
                    <Button onClick={() => window.open(previewUrl, '_blank')}>
                      새 창에서 열기
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Keyword Edit Modal */}
      <Dialog open={keywordEditModalOpen} onOpenChange={setKeywordEditModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>키워드 편집</DialogTitle>
            <DialogDescription className="break-all">
              {activeFile?.file_name}의 키워드를 수정할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Keyword Input */}
            <div className="flex gap-2">
              <Input
                placeholder="키워드 입력 후 Enter"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <Button onClick={addKeyword} type="button">추가</Button>
            </div>

            {/* Keyword List */}
            <div className="border rounded-lg p-4 min-h-[200px]">
              {editingKeywords.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">키워드가 없습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {editingKeywords.map((keyword, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="text-sm px-3 py-1 cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => removeKeyword(index)}
                    >
                      {keyword}
                      <X className="h-3 w-3 ml-2" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              💡 키워드를 클릭하면 삭제됩니다.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setKeywordEditModalOpen(false)}>
              취소
            </Button>
            <Button onClick={saveEditedKeywords}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Info Modal */}
      <Dialog open={infoModalOpen} onOpenChange={setInfoModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>파일 정보</DialogTitle>
            <DialogDescription className="break-all">
              {activeFile?.file_name}의 상세 정보
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {activeFile && (() => {
              const isLinkedFile = !!activeFile.meta?.source;
              return (
                <>
                  {/* Task/Event/Meeting info */}
                  {(activeFile.meta?.task_name || activeFile.meta?.event_name || activeFile.meta?.meeting_name) && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">연결된 항목</div>
                      <div className="flex flex-wrap gap-2">
                        {activeFile.meta?.task_name && (
                          <Badge variant="default" className="bg-purple-100 text-purple-800">
                            작업: {activeFile.meta.task_name}
                          </Badge>
                        )}
                        {activeFile.meta?.event_name && (
                          <Badge variant="default" className="bg-blue-100 text-blue-800">
                            이벤트: {activeFile.meta.event_name}
                          </Badge>
                        )}
                        {activeFile.meta?.meeting_name && (
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            일정: {activeFile.meta.meeting_name}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Department, Category, Status */}
                  {(activeFile.meta?.department || activeFile.meta?.category || activeFile.meta?.isShared || isLinkedFile) && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">분류 정보</div>
                      <div className="flex flex-wrap gap-2">
                        {activeFile.meta?.department && (
                          <Badge variant="outline">{activeFile.meta.department}</Badge>
                        )}
                        {activeFile.meta?.category && (
                          <Badge variant="secondary">{activeFile.meta.category}</Badge>
                        )}
                        {activeFile.meta?.isShared && (
                          <Badge variant="default" className="bg-blue-100 text-blue-800">공유됨</Badge>
                        )}
                        {isLinkedFile && (
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            {activeFile.meta.source.type === 'task' ? '작업' : '이벤트'}: {activeFile.meta.source.title}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Upload source */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">업로드 출처</div>
                    <Badge variant="outline" className="flex items-center gap-1 w-fit">
                      {(activeFile.meta?.uploaded_from === 'google_drive' || activeFile.meta?.uploaded_from === 'google_drive_integration') && (
                        <Cloud className="h-3 w-3" />
                      )}
                      {getUploadSourceText(activeFile.meta?.uploaded_from)}
                    </Badge>
                  </div>

                  {/* All keywords */}
                  {activeFile.meta?.keywords && Array.isArray(activeFile.meta.keywords) && activeFile.meta.keywords.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">
                        키워드 ({activeFile.meta.keywords.length}개)
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {activeFile.meta.keywords.map((keyword: string, index: number) => (
                          <Badge key={index} variant="default" className="bg-purple-100 text-purple-800">
                            <Sparkles className="h-3 w-3 mr-1" />
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <DialogFooter>
            <Button onClick={() => setInfoModalOpen(false)}>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Move Directory Modal */}
      <Dialog open={bulkMoveModalOpen} onOpenChange={setBulkMoveModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>디렉토리 일괄 변경</DialogTitle>
            <DialogDescription>
              선택한 {selectedFiles.length}개 파일의 디렉토리를 변경합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bulk_directory_path">새 디렉토리 경로</Label>
              <Input
                id="bulk_directory_path"
                placeholder="디렉토리 경로 (예: 2025/서류함/교무운영부)"
                value={bulkMoveDirectoryPath}
                onChange={(e) => setBulkMoveDirectoryPath(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                💡 경로 형식: 년도/기능명/세부경로 (예: 2025/서류함/교무운영부, 2025/진학/대입자료)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setBulkMoveModalOpen(false);
              setBulkMoveDirectoryPath("");
            }}>
              취소
            </Button>
            <Button
              onClick={bulkMoveFiles}
              disabled={!bulkMoveDirectoryPath.trim()}
            >
              <FolderInput className="h-4 w-4 mr-2" />
              이동
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ImprovedCard>
  );
};
