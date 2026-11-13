import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DialogFooter, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DocumentDepartmentSelect } from '@/components/ui/department-select';
import {
  AlertCircle,
  CheckCircle,
  FileSpreadsheet,
  FileText,
  FolderSearch,
  FolderTree,
  HardDrive,
  Link as LinkIcon,
  Loader2,
  LogIn,
  Monitor,
  Plus,
  Presentation,
  Upload,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { getGoogleDriveService } from '@/services/googleDriveServiceNew';
import { GoogleDriveIntegrationService, type IntegrationOptions } from '@/services/googleDriveIntegrationService';
import { useUploadDocument } from '@/features/documents/hooks/useDocumentsQuery';

/**
 * 문서 추가 통합 다이얼로그 (2026-08-11).
 *
 * 구 진입점 3개(문서 업로드/Drive/Link)가 "저장 방식" 기준으로 갈라져 있던 것을
 * "문서를 추가한다" 한 흐름으로 통합 — 방식(파일/Drive 가져오기/새 Google 문서)은
 * 다이얼로그 안에서 고르고, **부서·분류·키워드는 모든 방식에 공통 적용**된다
 * (구 구현은 로컬 업로드만 메타를 받아 Drive 등록분이 검색에 걸리지 않았다).
 */

type AddMethod = 'file' | 'drive' | 'create';
type FileDestination = 'server' | 'drive';

interface AddDocumentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** 등록 성공 시 호출 (모든 방식 공통) — 구 DocumentUpload 계약 유지 */
  onFileUploaded?: () => void;
  /** 현재 선택된 가상 폴더 — 지정 시 그 폴더로 등록 */
  defaultDirectoryPath?: string | null;
  isAdmin?: boolean;
}

const ALLOWED_EXTENSIONS = ['.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.hwp', '.hwpx'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const CATEGORY_OPTIONS = ['공문', '계획서', '보고서', '양식', '회의록', '지침', '자료', '기타'];

export const AddDocumentDialog = ({
  isOpen,
  onOpenChange,
  onFileUploaded,
  defaultDirectoryPath,
  isAdmin = false,
}: AddDocumentDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const uploadMutation = useUploadDocument();
  const { isAuthenticated, isLoading: authLoading, error: authError, authenticate, clearError } = useGoogleDrive();

  const [method, setMethod] = useState<AddMethod>('file');
  const [busy, setBusy] = useState(false);

  // 공통 분류 메타 (모든 방식에 적용)
  const [department, setDepartment] = useState('');
  const [category, setCategory] = useState('');
  const [keywords, setKeywords] = useState('');

  // 방식 1: 파일 업로드 — 기본 저장 위치는 Google Drive, 서버 저장은 admin 전용 (2026-08-11 사용자 결정)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDestination, setFileDestination] = useState<FileDestination>('drive');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // 방식 2: Drive 링크 붙여넣기
  const [linkUrl, setLinkUrl] = useState('');
  const [linkFileName, setLinkFileName] = useState('');
  const [linkStatus, setLinkStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [linkIsFolder, setLinkIsFolder] = useState(false);

  // 방식 3: 새 Google 문서
  const [newFileName, setNewFileName] = useState('');
  const [newFileType, setNewFileType] = useState<'document' | 'spreadsheet' | 'presentation'>('document');

  // 폴더 일괄 진행 표시 (admin)
  const [folderProgress, setFolderProgress] = useState<{ current: number; total: number; fileName: string } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setBusy(false);
      setFolderProgress(null);
    }
  }, [isOpen]);

  const needsDriveAuth = method === 'create' || method === 'drive' || (method === 'file' && fileDestination === 'drive');

  const parseKeywords = () =>
    keywords.split(',').map(kw => kw.trim()).filter(kw => kw.length > 0);

  const buildIntegrationOptions = (): IntegrationOptions => ({
    targetType: 'document',
    targetId: '',
    department: department === 'none' ? '' : department,
    documentMeta: {
      category: category || undefined,
      keywords: parseKeywords(),
      directoryPath: defaultDirectoryPath ?? undefined,
    },
  });

  const finishSuccess = (message: string, closeDialog = true) => {
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    queryClient.invalidateQueries({ queryKey: ['document-folders'] });
    toast({ title: '완료', description: message });
    onFileUploaded?.();
    if (closeDialog) onOpenChange(false);
  };

  // ── 방식 1: 파일 업로드 ─────────────────────────────────────────────
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast({ title: '파일 크기 초과', description: '파일 크기는 50MB 이하로 제한됩니다.', variant: 'destructive' });
      event.target.value = '';
      return;
    }
    const fileExt = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
    if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
      toast({
        title: '지원하지 않는 파일 형식',
        description: `지원 형식: ${ALLOWED_EXTENSIONS.join(', ').replace(/\./g, '').toUpperCase()}`,
        variant: 'destructive',
      });
      event.target.value = '';
      return;
    }
    setSelectedFile(file);
    setTitle(file.name.replace(/\.[^/.]+$/, ''));
  };

  const handleFileUpload = async () => {
    if (!selectedFile || busy) return;
    setBusy(true);
    try {
      const finalDepartment = department === 'none' ? '' : department;
      if (fileDestination === 'server') {
        const kws = parseKeywords();
        await uploadMutation.mutateAsync({
          file: selectedFile,
          metadata: {
            title: title.trim() || selectedFile.name.replace(/\.[^/.]+$/, ''),
            description: description.trim(),
            department: finalDepartment,
            category,
            search_keywords: [
              ...(title.trim() ? [title.trim()] : []),
              ...(finalDepartment ? [finalDepartment] : []),
              ...(category ? [category] : []),
              ...kws,
            ].filter((kw, i, self) => self.indexOf(kw) === i),
          },
          directoryPath: defaultDirectoryPath,
        });
        onFileUploaded?.();
        onOpenChange(false);
      } else {
        // 내 Google Drive에 업로드 후 등록
        await GoogleDriveIntegrationService.uploadAndRegister(selectedFile, buildIntegrationOptions());
        finishSuccess(`${selectedFile.name} 파일이 Google Drive에 업로드되고 등록되었습니다.`);
      }
      setSelectedFile(null);
      setTitle('');
      setDescription('');
    } catch (error) {
      if (fileDestination !== 'server') {
        console.error('Drive 업로드 오류:', error);
        toast({
          title: '오류',
          description: error instanceof Error ? error.message : 'Google Drive 업로드에 실패했습니다.',
          variant: 'destructive',
        });
      }
      // 서버 업로드 오류 토스트는 mutation에서 처리
    } finally {
      setBusy(false);
    }
  };

  // ── 방식 2: Drive에서 가져오기 ──────────────────────────────────────
  const validateLink = async (inputUrl: string) => {
    if (!inputUrl.trim()) {
      setLinkStatus('idle');
      setLinkIsFolder(false);
      return;
    }
    const parsed = GoogleDriveIntegrationService.parseDriveUrl(inputUrl);
    if (!parsed) {
      setLinkStatus('invalid');
      setLinkIsFolder(false);
      return;
    }
    setLinkStatus('valid');
    setLinkIsFolder(parsed.fileType === 'folder');
    try {
      const metadata = await GoogleDriveIntegrationService.getFileMetadata(parsed.fileId);
      setLinkFileName(metadata.name);
    } catch {
      if (!linkFileName) setLinkFileName(parsed.fileType === 'folder' ? 'Google Drive 폴더' : 'Google Drive 파일');
    }
  };

  const handleLinkRegister = async () => {
    if (busy || linkStatus !== 'valid' || !linkFileName.trim()) return;
    setBusy(true);
    try {
      await GoogleDriveIntegrationService.linkAndRegister(linkUrl, linkFileName.trim(), buildIntegrationOptions());
      setLinkUrl('');
      setLinkFileName('');
      setLinkStatus('idle');
      finishSuccess(`Google Drive ${linkIsFolder ? '폴더' : '파일'} 링크가 등록되었습니다.`);
    } catch (error) {
      console.error('링크 등록 오류:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '링크 등록에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDrivePicker = async () => {
    if (busy) return;
    const options = buildIntegrationOptions();
    // Google Picker는 자체 오버레이라 z-index 충돌 방지를 위해 다이얼로그를 먼저 닫는다
    onOpenChange(false);
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      const driveService = getGoogleDriveService();
      await driveService.showPicker(
        async (selectedFiles) => {
          let successCount = 0;
          const errors: string[] = [];
          for (const googleFile of selectedFiles) {
            try {
              await GoogleDriveIntegrationService.selectAndRegister(googleFile, options);
              successCount++;
            } catch (error) {
              errors.push(`${googleFile.name}: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
            }
          }
          if (successCount > 0) {
            finishSuccess(`${successCount}개의 파일이 등록되었습니다.`, false);
          }
          if (errors.length > 0) {
            toast({ title: '일부 실패', description: errors.join('\n'), variant: 'destructive' });
          }
        },
        { multiselect: true },
      );
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : 'Google Drive 탐색기를 열 수 없습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleOpenFolderPicker = async () => {
    if (busy) return;
    const options = buildIntegrationOptions();
    onOpenChange(false);
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      const driveService = getGoogleDriveService();
      await driveService.showPicker(
        async (selectedItems) => {
          const folder = selectedItems[0];
          if (!folder) return;
          if (folder.mimeType !== 'application/vnd.google-apps.folder') {
            toast({ title: '오류', description: '폴더를 선택해주세요.', variant: 'destructive' });
            return;
          }
          setFolderProgress({ current: 0, total: 0, fileName: '폴더 스캔 중...' });
          try {
            const fileCount = await GoogleDriveIntegrationService.selectFolderAndRegister(
              folder.id,
              options,
              (current, total, fileName) => setFolderProgress({ current, total, fileName }),
            );
            finishSuccess(`${folder.name} 폴더의 ${fileCount}개 파일이 등록되었습니다.`, false);
          } catch (error) {
            toast({
              title: '오류',
              description: error instanceof Error ? error.message : '폴더 등록에 실패했습니다.',
              variant: 'destructive',
            });
          } finally {
            setFolderProgress(null);
          }
        },
        { multiselect: false, enableFolderSelect: true },
      );
    } catch (error) {
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : 'Google Drive 탐색기를 열 수 없습니다.',
        variant: 'destructive',
      });
    }
  };

  // ── 방식 3: 새 Google 문서 ──────────────────────────────────────────
  const handleCreateFile = async () => {
    if (busy || !newFileName.trim()) return;
    setBusy(true);
    try {
      await GoogleDriveIntegrationService.createAndRegister(newFileName.trim(), newFileType, buildIntegrationOptions());
      setNewFileName('');
      finishSuccess(`${newFileName.trim()} 파일이 생성되고 등록되었습니다.`);
    } catch (error) {
      console.error('파일 생성 오류:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '파일 생성에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const methodButton = (value: AddMethod, icon: React.ReactNode, label: string, sub: string) => (
    <button
      type="button"
      onClick={() => setMethod(value)}
      className={`flex-1 rounded-lg border p-3 text-left transition-all ${
        method === value
          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className={`flex items-center gap-1.5 text-sm font-semibold ${method === value ? 'text-blue-700' : 'text-slate-700'}`}>
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>문서 추가</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 방식 선택 */}
          <div className="flex gap-2">
            {methodButton('file', <Monitor className="h-4 w-4" />, '파일 업로드', '내 컴퓨터의 파일을 올립니다')}
            {methodButton('drive', <HardDrive className="h-4 w-4" />, 'Drive에서 가져오기', '기존 Drive 파일·링크를 등록합니다')}
            {methodButton('create', <Plus className="h-4 w-4" />, '새 Google 문서', 'Docs·Sheets·Slides를 새로 만듭니다')}
          </div>

          {defaultDirectoryPath && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              등록 위치: <span className="font-mono font-medium">{defaultDirectoryPath}</span> 폴더
            </p>
          )}

          {authError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {authError}
                <Button variant="ghost" size="sm" onClick={clearError} className="ml-2">닫기</Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Drive 인증 게이트 */}
          {needsDriveAuth && !isAuthenticated ? (
            <div className="rounded-lg border bg-muted/40 p-4 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                이 방식은 Google Drive 연동이 필요합니다. 한 번 로그인하면 로그인 상태가 유지됩니다.
              </p>
              <Button onClick={authenticate} disabled={authLoading}>
                <LogIn className="mr-2 h-4 w-4" />
                {authLoading ? '처리중...' : 'Google로 로그인'}
              </Button>
            </div>
          ) : (
            <>
              {/* ── 방식 1: 파일 업로드 ── */}
              {method === 'file' && (
                <div className="space-y-4">
                  {isAdmin && (
                    <div className="space-y-2">
                      <Label>저장 위치 (관리자 전용 선택)</Label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setFileDestination('drive')}
                          className={`flex-1 rounded-md border px-3 py-2 text-sm transition-all ${
                            fileDestination === 'drive' ? 'border-blue-500 bg-blue-50 font-medium text-blue-700' : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Google Drive (기본)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFileDestination('server')}
                          className={`flex-1 rounded-md border px-3 py-2 text-sm transition-all ${
                            fileDestination === 'server' ? 'border-blue-500 bg-blue-50 font-medium text-blue-700' : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          스페이스기전 서버
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="add-doc-file">파일 선택</Label>
                    <Input id="add-doc-file" type="file" onChange={handleFileSelect} accept={ALLOWED_EXTENSIONS.join(',')} />
                    <p className="text-xs text-muted-foreground">
                      지원 형식: PDF, DOC(X), XLS(X), PPT(X), HWP(X), TXT, 이미지 (최대 50MB)
                    </p>
                  </div>

                  {selectedFile && (
                    <div className="rounded-lg border bg-muted/50 p-3">
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">크기: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="add-doc-title">문서 제목</Label>
                      <Input id="add-doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="문서 제목을 입력하세요" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="add-doc-desc">설명</Label>
                      <Textarea
                        id="add-doc-desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="문서에 대한 간단한 설명 (선택)"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── 방식 2: Drive에서 가져오기 ── */}
              {method === 'drive' && (
                <div className="space-y-4">
                  <Button onClick={handleOpenDrivePicker} disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700">
                    <FolderSearch className="mr-2 h-4 w-4" />
                    Google Drive 탐색기 열기 (여러 파일 선택 가능)
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">또는 링크 붙여넣기</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="add-doc-link">Google Drive 링크</Label>
                    <Input
                      id="add-doc-link"
                      type="url"
                      placeholder="https://docs.google.com/document/d/... 또는 drive.google.com/..."
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      onBlur={() => validateLink(linkUrl)}
                    />
                    {linkStatus === 'valid' && (
                      <Alert className={linkIsFolder ? 'bg-purple-50 border-purple-200' : 'bg-green-50 border-green-200'}>
                        {linkIsFolder ? <FolderTree className="h-4 w-4 text-purple-600" /> : <CheckCircle className="h-4 w-4 text-green-600" />}
                        <AlertDescription className={linkIsFolder ? 'text-purple-800' : 'text-green-800'}>
                          {linkIsFolder ? '유효한 폴더 링크입니다 (클릭 시 Drive로 이동하는 링크로 저장)' : '유효한 Google Drive 링크입니다'}
                        </AlertDescription>
                      </Alert>
                    )}
                    {linkStatus === 'invalid' && (
                      <Alert className="bg-red-50 border-red-200">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <AlertDescription className="text-red-800">유효하지 않은 링크입니다. Google Drive 공유 링크인지 확인해주세요.</AlertDescription>
                      </Alert>
                    )}
                  </div>

                  {linkStatus === 'valid' && (
                    <div className="space-y-2">
                      <Label htmlFor="add-doc-link-name">{linkIsFolder ? '폴더 이름' : '파일 이름'}</Label>
                      <Input
                        id="add-doc-link-name"
                        value={linkFileName}
                        onChange={(e) => setLinkFileName(e.target.value)}
                        placeholder="시스템에 표시될 이름"
                      />
                    </div>
                  )}

                  {isAdmin && (
                    <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 space-y-2">
                      <p className="text-sm font-medium text-purple-900">폴더 일괄 등록 (관리자 전용)</p>
                      <p className="text-xs text-purple-800">Drive 폴더를 선택하면 하위 모든 파일을 폴더 구조 그대로 등록합니다.</p>
                      <Button
                        onClick={handleOpenFolderPicker}
                        disabled={busy || !!folderProgress}
                        variant="outline"
                        size="sm"
                        className="w-full border-purple-300 text-purple-800 hover:bg-purple-100"
                      >
                        <FolderTree className="mr-2 h-4 w-4" />
                        {folderProgress ? '처리 중...' : '폴더 선택하기'}
                      </Button>
                      {folderProgress && (
                        <div className="flex items-center gap-2 text-xs text-purple-700">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span className="truncate">
                            {folderProgress.current}/{folderProgress.total} · {folderProgress.fileName}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── 방식 3: 새 Google 문서 ── */}
              {method === 'create' && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Google Drive의 "Spacekijun" 폴더에 새 파일을 만들고 서류함에 등록합니다.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="add-doc-new-name">파일명</Label>
                    <Input
                      id="add-doc-new-name"
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      placeholder="새 파일의 이름을 입력하세요"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>파일 종류</Label>
                    <Select value={newFileType} onValueChange={(value: 'document' | 'spreadsheet' | 'presentation') => setNewFileType(value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="document">
                          <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-blue-600" />Google 문서</div>
                        </SelectItem>
                        <SelectItem value="spreadsheet">
                          <div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-green-600" />Google 스프레드시트</div>
                        </SelectItem>
                        <SelectItem value="presentation">
                          <div className="flex items-center gap-2"><Presentation className="h-4 w-4 text-orange-600" />Google 프레젠테이션</div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* ── 공통 분류 메타 (모든 방식) ── */}
              <div className="space-y-4 rounded-lg border bg-slate-50/60 p-3">
                <p className="text-xs font-semibold text-slate-600">분류 정보 (검색·필터에 사용)</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <DocumentDepartmentSelect value={department} onChange={setDepartment} label="부서/팀" showIcon={false} />
                  <div className="space-y-2">
                    {/* department-select의 라벨(flex 블록)과 박스 높이를 맞춰 두 컬럼 정렬 유지 */}
                    <Label className="flex items-center">문서 분류</Label>
                    <Select value={category || '__none__'} onValueChange={(v) => setCategory(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="분류를 선택하세요" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">선택 안 함</SelectItem>
                        {CATEGORY_OPTIONS.map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="add-doc-keywords">키워드</Label>
                    <Input
                      id="add-doc-keywords"
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      placeholder="쉼표로 구분하여 입력 (예: 학사, 시험, 성적)"
                    />
                  </div>
                </div>
              </div>

              {/* ── 실행 버튼 ── */}
              <DialogFooter className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                  취소
                </Button>
                {method === 'file' && (
                  <Button onClick={handleFileUpload} disabled={busy || !selectedFile}>
                    <Upload className="mr-2 h-4 w-4" />
                    {busy ? '업로드 중...' : fileDestination === 'server' ? '업로드' : 'Drive에 업로드'}
                  </Button>
                )}
                {method === 'drive' && (
                  <Button onClick={handleLinkRegister} disabled={busy || linkStatus !== 'valid' || !linkFileName.trim()}>
                    <LinkIcon className="mr-2 h-4 w-4" />
                    {busy ? '등록 중...' : '링크 등록'}
                  </Button>
                )}
                {method === 'create' && (
                  <Button onClick={handleCreateFile} disabled={busy || !newFileName.trim()}>
                    <Plus className="mr-2 h-4 w-4" />
                    {busy ? '생성 중...' : '만들고 등록'}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
