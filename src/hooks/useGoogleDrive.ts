import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  getGoogleDriveService,
  GoogleDriveFile,
  CreateFileOptions,
  UploadFileOptions
} from '@/services/googleDriveServiceNew';

export interface GoogleDriveState {
  isAuthenticated: boolean;
  isLoading: boolean;
  files: GoogleDriveFile[];
  error: string | null;
}

export const useGoogleDrive = () => {
  const { toast } = useToast();
  const [state, setState] = useState<GoogleDriveState>({
    isAuthenticated: false,
    isLoading: false,
    files: [],
    error: null
  });

  // Google Drive 서비스 인스턴스
  const [driveService, setDriveService] = useState<any>(null);

  // 초기화
  useEffect(() => {
    const initializeService = async () => {
      try {
        const service = getGoogleDriveService();
        setDriveService(service);

        setState(prev => ({ ...prev, isLoading: true }));

        // Google API 초기화
        await service.initialize();

        // 현재 로그인 상태 확인
        const isAuthenticated = await service.isAuthenticated();
        setState(prev => ({
          ...prev,
          isAuthenticated,
          isLoading: false,
          error: null
        }));
      } catch (error: any) {
        console.error('Google Drive 서비스 초기화 실패:', error);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: error.message || 'Google Drive 설정이 필요합니다. 환경변수를 확인해주세요.'
        }));
      }
    };

    initializeService();
  }, []);

  // 주기적으로 토큰 상태 확인 (5분마다)
  useEffect(() => {
    if (!driveService || !state.isAuthenticated) return;

    const checkTokenValidity = async () => {
      const isStillAuthenticated = await driveService.isAuthenticated();
      if (!isStillAuthenticated && state.isAuthenticated) {
        // 토큰이 만료되어 자동으로 로그아웃됨
        setState(prev => ({
          ...prev,
          isAuthenticated: false,
          files: [],
          error: '세션이 만료되었습니다. 다시 로그인해주세요.'
        }));
      }
    };

    // 즉시 확인
    checkTokenValidity();

    // 5분마다 확인
    const intervalId = setInterval(checkTokenValidity, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [driveService, state.isAuthenticated]);

  // OAuth callback handling not needed for popup-based authentication

  // 인증 시작 (popup 방식)
  const authenticate = useCallback(async () => {
    if (!driveService) {
      toast({
        title: '오류',
        description: 'Google Drive 서비스가 초기화되지 않았습니다.',
        variant: 'destructive'
      });
      return;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      await driveService.signIn();
      setState(prev => ({
        ...prev,
        isAuthenticated: true,
        isLoading: false,
        error: null
      }));

      toast({
        title: '성공',
        description: 'Google Drive 연동이 완료되었습니다.'
      });
    } catch (error: any) {
      console.error('Google Drive 인증 오류:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Google Drive 인증에 실패했습니다.'
      }));

      // CORP 에러인 경우 사용자에게 팝업 허용 안내
      let errorMessage = error.message || 'Google Drive 인증에 실패했습니다.';
      if (error.message && error.message.includes('popup')) {
        errorMessage = '팝업이 차단되었습니다. 브라우저에서 팝업을 허용하고 다시 시도해주세요.';
      }

      toast({
        title: '오류',
        description: errorMessage,
        variant: 'destructive'
      });
    }
  }, [driveService, toast]);

  // 인증 콜백 처리
  const handleAuthCallback = useCallback(async (code: string) => {
    if (!driveService) return;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      await driveService.setCredentials(code);
      setState(prev => ({
        ...prev,
        isAuthenticated: true,
        isLoading: false,
        error: null
      }));

      toast({
        title: '성공',
        description: 'Google Drive 연동이 완료되었습니다.'
      });
    } catch (error) {
      console.error('Google Drive 인증 처리 오류:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: '인증 처리에 실패했습니다.'
      }));

      toast({
        title: '오류',
        description: 'Google Drive 인증 처리에 실패했습니다.',
        variant: 'destructive'
      });
    }
  }, [driveService, toast]);

  // 새 파일 생성
  const createFile = useCallback(async (options: CreateFileOptions): Promise<GoogleDriveFile | null> => {
    if (!driveService || !state.isAuthenticated) {
      toast({
        title: '오류',
        description: 'Google Drive 인증이 필요합니다.',
        variant: 'destructive'
      });
      return null;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const file = await driveService.createNewFile(options);

      setState(prev => ({
        ...prev,
        isLoading: false,
        files: [file, ...prev.files]
      }));

      toast({
        title: '성공',
        description: `${file.name} 파일이 생성되었습니다.`
      });

      return file;
    } catch (error: any) {
      console.error('Google Drive 파일 생성 오류:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || '파일 생성에 실패했습니다.'
      }));

      toast({
        title: '오류',
        description: error.message || '파일 생성에 실패했습니다.',
        variant: 'destructive'
      });

      return null;
    }
  }, [driveService, state.isAuthenticated, toast]);

  // 파일 업로드
  const uploadFile = useCallback(async (options: UploadFileOptions): Promise<GoogleDriveFile | null> => {
    if (!driveService || !state.isAuthenticated) {
      toast({
        title: '오류',
        description: 'Google Drive 인증이 필요합니다.',
        variant: 'destructive'
      });
      return null;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const file = await driveService.uploadFile(options);

      setState(prev => ({
        ...prev,
        isLoading: false,
        files: [file, ...prev.files]
      }));

      toast({
        title: '성공',
        description: `${file.name} 파일이 업로드되었습니다.`
      });

      return file;
    } catch (error: any) {
      console.error('Google Drive 파일 업로드 오류:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || '파일 업로드에 실패했습니다.'
      }));

      toast({
        title: '오류',
        description: error.message || '파일 업로드에 실패했습니다.',
        variant: 'destructive'
      });

      return null;
    }
  }, [driveService, state.isAuthenticated, toast]);

  // 파일 목록 조회
  const loadFiles = useCallback(async () => {
    if (!driveService || !state.isAuthenticated) return;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const files = await driveService.listFiles(20);
      setState(prev => ({ ...prev, files, isLoading: false }));
    } catch (error: any) {
      console.error('Google Drive 파일 목록 조회 오류:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || '파일 목록 조회에 실패했습니다.'
      }));
    }
  }, [driveService, state.isAuthenticated]);

  // 로그아웃
  const logout = useCallback(async () => {
    if (driveService) {
      await driveService.signOut();
      setState({
        isAuthenticated: false,
        isLoading: false,
        files: [],
        error: null
      });

      toast({
        title: '알림',
        description: 'Google Drive 연동이 해제되었습니다.'
      });
    }
  }, [driveService, toast]);

  // 에러 클리어
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    authenticate,
    handleAuthCallback,
    createFile,
    uploadFile,
    loadFiles,
    logout,
    clearError
  };
};