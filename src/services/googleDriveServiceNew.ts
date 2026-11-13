// Modern Google Drive API service using Supabase provider tokens

import { getValidGoogleToken, getGoogleTokensFromSupabase } from './googleAuthService';

declare global {
  interface Window {
    gapi: any;
    google: any;
    gapi_loaded?: boolean;
    picker_loaded?: boolean;
  }
}

export interface GoogleDriveConfig {
  clientId: string;
  apiKey?: string;
  sharedFolderId?: string; // 공유 폴더 ID (선택사항)
}

/** 학교 Workspace 도메인 — Drive 파일 공유 범위를 이 도메인 구성원으로 한정 (전 계정 @myschool.hs.kr 실측) */
const WORKSPACE_DOMAIN = 'myschool.hs.kr';

export interface GoogleDriveFile {
  id: string;
  name: string;
  webViewLink: string;
  webContentLink?: string;
  mimeType: string;
  size?: number;
  createdTime: string;
  modifiedTime: string;
}

export interface CreateFileOptions {
  name: string;
  type: 'document' | 'spreadsheet' | 'presentation' | 'folder';
  parentFolderId?: string;
  uploadContext?: GoogleDriveUploadContext;
}

export interface UploadFileOptions {
  name: string;
  file: File;
  parentFolderId?: string;
  uploadContext?: GoogleDriveUploadContext;
}

export interface GoogleDriveUploadContext {
  feature: '업무 관리' | '스케줄' | '협업 보드' | '서류함' | '전자서명';
  year: number;
  // Task Management specific
  department?: string;
  eventName?: string;
  taskName?: string;
  // Schedule specific
  month?: number;
  scheduleName?: string;
  // Collaboration Board specific
  boardName?: string;
  noteName?: string;
  // Document Cabinet specific
  category?: string;
}

export class GoogleDriveServiceNew {
  private static instance: GoogleDriveServiceNew | null = null;
  private isInitialized = false;
  /** 동시에 여러 업로드가 초기화를 부르면 같은 약속을 기다리게 한다(스크립트·gapi.load 를 두 번 돌리지 않게) */
  private initPromise: Promise<void> | null = null;
  private config: GoogleDriveConfig;

  private constructor(config: GoogleDriveConfig) {
    this.config = config;
  }

  public static getInstance(config?: GoogleDriveConfig): GoogleDriveServiceNew {
    if (!GoogleDriveServiceNew.instance && config) {
      GoogleDriveServiceNew.instance = new GoogleDriveServiceNew(config);
    }
    return GoogleDriveServiceNew.instance!;
  }

  /**
   * Get current access token from Supabase session
   * Throws error if token is expired or missing
   */
  private async getAccessToken(skipEventDispatch = false): Promise<string> {
    try {
      return await getValidGoogleToken();
    } catch (error: any) {
      if (!skipEventDispatch && (error.message === 'GOOGLE_TOKEN_EXPIRED' || error.message === 'GOOGLE_TOKEN_MISSING')) {
        window.dispatchEvent(new CustomEvent('google-auth-expired'));
      }
      throw error;
    }
  }

  /**
   * Initialize Google API
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (!this.initPromise) {
      // 실패하면 약속을 비워 다음 호출이 다시 시도하게 한다
      this.initPromise = this.doInitialize().catch((error) => {
        this.initPromise = null;
        throw error;
      });
    }
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      // Load Google API
      await this.loadScript('https://apis.google.com/js/api.js');

      // Wait for gapi to be available
      await this.waitForGapi();

      // Initialize Google API client
      await this.initializeGapi();

      // Try to set token from Supabase if available
      // Token expiration should not prevent API initialization
      try {
        const token = await this.getAccessToken(true);
        if (token) {
          window.gapi.client.setToken({
            access_token: token
          });
          console.log('Google Drive token from Supabase set in GAPI client');
        }
      } catch (tokenError: any) {
        // Token expired or missing - this is OK during initialization
        console.warn('⚠️ Could not get Google token during initialization:', tokenError.message);
        // Continue initialization without token
      }

      this.isInitialized = true;
      console.log('Google Drive API initialized successfully');
    } catch (error) {
      console.error('Google API initialization error:', error);
      throw new Error('Google Drive API 초기화에 실패했습니다.');
    }
  }

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  private async waitForGapi(): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max wait (50 * 100ms)

      const checkGapi = () => {
        if (window.gapi) {
          resolve();
          return;
        }

        attempts++;
        if (attempts >= maxAttempts) {
          reject(new Error('Timeout waiting for gapi to load'));
          return;
        }

        setTimeout(checkGapi, 100);
      };

      checkGapi();
    });
  }

  private async initializeGapi(): Promise<void> {
    return new Promise((resolve, reject) => {
      window.gapi.load('client', {
        callback: async () => {
          try {
            await window.gapi.client.init({
              discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
            });
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        onerror: () => reject(new Error('Failed to load GAPI client'))
      });
    });
  }

  /**
   * Sign in - Now uses Supabase token automatically
   */
  public async signIn(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Supabase 로그인이 필요합니다. Google 권한이 없습니다.');
    }

    // Set the access token for gapi client
    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({
        access_token: token
      });
    }

    console.log('Google Drive authentication successful using Supabase token');
  }

  /**
   * Sign out - Clear gapi token only
   */
  public async signOut(): Promise<void> {
    // Clear gapi token
    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken(null);
    }

    console.log('Google Drive token cleared');
  }

  /**
   * Check if user is authenticated (has valid Supabase token)
   */
  public async isAuthenticated(): Promise<boolean> {
    const tokens = await getGoogleTokensFromSupabase();
    return tokens !== null && tokens.accessToken !== null;
  }

  /**
   * 토큰이 «있고 아직 유효한가» — 화면을 열 때 미리 묻는 용도.
   * `isAuthenticated()` 는 토큰이 있기만 하면 참이라, 로그인 한 시간 뒤(구글 토큰 만료)에도
   * «연결됨»으로 보이고 업로드 순간에야 실패한다. 이 함수는 재인증 이벤트를 쏘지 않는다
   * (화면이 [드라이브 연결] 버튼으로 직접 권한다).
   */
  public async hasValidToken(): Promise<boolean> {
    try {
      await getValidGoogleToken();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find or create the Spacekijun folder in Google Drive
   * If sharedFolderId is configured, use that instead
   */
  private async getOrCreateSpacekijunFolder(): Promise<string> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Drive 인증이 필요합니다.');
    }

    // Ensure valid token before API call
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('유효한 Google Drive 토큰이 없습니다.');
    }

    // Update gapi token
    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: token });
    }

    // If shared folder ID is configured, use it directly
    if (this.config.sharedFolderId) {
      console.log('Using configured shared folder:', this.config.sharedFolderId);
      return this.config.sharedFolderId;
    }

    try {
      // First, search for existing Spacekijun folder
      const searchResponse = await window.gapi.client.drive.files.list({
        q: "name='Spacekijun' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: 'files(id, name)'
      });

      if (searchResponse.result.files && searchResponse.result.files.length > 0) {
        // Folder already exists
        const folderId = searchResponse.result.files[0].id;
        console.log('Spacekijun folder found:', folderId);
        return folderId;
      }

      // Folder doesn't exist, create it
      const createResponse = await window.gapi.client.drive.files.create({
        resource: {
          name: 'Spacekijun',
          mimeType: 'application/vnd.google-apps.folder'
        },
        fields: 'id'
      });

      const folderId = createResponse.result.id;
      console.log('Spacekijun folder created:', folderId);
      return folderId;

    } catch (error: any) {
      console.error('Error finding/creating Spacekijun folder:', error);
      throw new Error(`폴더 생성 실패: ${error.message}`);
    }
  }

  /**
   * Build folder path based on upload context
   */
  private buildContextFolderPath(context: GoogleDriveUploadContext): string[] {
    const path: string[] = [];

    // Year first
    path.push(context.year.toString());

    // Feature name
    path.push(context.feature);

    // Feature-specific structure
    switch (context.feature) {
      case '업무 관리':
        if (context.taskName) {
          // Task level: 2025/업무 관리/부서명/이벤트명/업무명
          if (context.department) path.push(context.department);
          if (context.eventName) path.push(context.eventName);
          path.push(context.taskName);
        } else if (context.eventName) {
          // Event level: 2025/업무 관리/부서명/이벤트명
          if (context.department) path.push(context.department);
          path.push(context.eventName);
        }
        break;

      case '스케줄':
        // 2025/스케줄/8/중간고사
        if (context.month) path.push(context.month.toString());
        if (context.scheduleName) path.push(context.scheduleName);
        break;

      case '협업 보드':
        // 2025/협업 보드/보드명/노트명
        if (context.boardName) path.push(context.boardName);
        if (context.noteName) path.push(context.noteName);
        break;

      case '서류함':
        // 2025/서류함/분류/부서명
        if (context.category) path.push(context.category);
        if (context.department) path.push(context.department);
        break;
    }

    return path;
  }

  /**
   * Find or create a folder by name within a parent folder
   */
  private async findOrCreateFolder(name: string, parentId: string): Promise<string> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('유효한 Google Drive 토큰이 없습니다.');
    }

    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: token });
    }

    try {
      // Search for existing folder
      const searchResponse = await window.gapi.client.drive.files.list({
        q: `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)'
      });

      if (searchResponse.result.files && searchResponse.result.files.length > 0) {
        const folderId = searchResponse.result.files[0].id;
        console.log(`Folder '${name}' found:`, folderId);
        return folderId;
      }

      // Folder doesn't exist, create it
      const createResponse = await window.gapi.client.drive.files.create({
        resource: {
          name: name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId]
        },
        fields: 'id'
      });

      const folderId = createResponse.result.id;
      console.log(`Folder '${name}' created:`, folderId);
      return folderId;
    } catch (error: any) {
      console.error(`Error finding/creating folder '${name}':`, error);
      throw new Error(`폴더 생성 실패: ${error.message}`);
    }
  }

  /**
   * Get or create nested folder structure based on upload context
   */
  private async getOrCreateContextFolder(context: GoogleDriveUploadContext): Promise<string> {
    // Start with Spacekijun root folder
    let currentFolderId = await this.getOrCreateSpacekijunFolder();

    // Build path array
    const folderPath = this.buildContextFolderPath(context);
    console.log('Creating folder structure:', folderPath.join('/'));

    // Create nested folders
    for (const folderName of folderPath) {
      currentFolderId = await this.findOrCreateFolder(folderName, currentFolderId);
    }

    return currentFolderId;
  }

  /**
   * Create a new Google file in the Spacekijun folder
   */
  public async createNewFile(options: CreateFileOptions): Promise<GoogleDriveFile> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Drive 인증이 필요합니다.');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Google Drive 토큰을 가져올 수 없습니다.');
    }

    // uploadFile 과 같은 이유 — 이 함수도 gapi 클라이언트로 파일을 만든다
    await this.initialize();
    window.gapi.client.setToken({ access_token: token });

    const mimeTypes = {
      document: 'application/vnd.google-apps.document',
      spreadsheet: 'application/vnd.google-apps.spreadsheet',
      presentation: 'application/vnd.google-apps.presentation',
      folder: 'application/vnd.google-apps.folder'
    };

    // Determine parent folder based on context
    let parentFolderId: string;
    if (options.uploadContext) {
      // Use context-aware folder structure
      parentFolderId = await this.getOrCreateContextFolder(options.uploadContext);
    } else if (options.parentFolderId) {
      // Use explicit parent folder
      parentFolderId = options.parentFolderId;
    } else {
      // Fallback to Spacekijun root folder
      parentFolderId = await this.getOrCreateSpacekijunFolder();
    }

    const fileMetadata: any = {
      name: options.name,
      mimeType: mimeTypes[options.type],
      parents: [parentFolderId]
    };

    console.log('📝 Google Drive 파일 생성 API 호출 시작:', {
      name: options.name,
      type: options.type,
      mimeType: mimeTypes[options.type],
      parentFolderId
    });

    let response;
    try {
      response = await window.gapi.client.drive.files.create({
        resource: fileMetadata,
        fields: 'id,name,webViewLink,mimeType,createdTime,modifiedTime'
      });
    } catch (apiError: any) {
      console.error('❌ Google Drive 파일 생성 API 호출 실패:', apiError);
      console.error('에러 상세:', {
        message: apiError.message,
        status: apiError.status,
        result: apiError.result,
        body: apiError.body
      });
      throw new Error(`Google Drive 파일 생성 실패: ${apiError.message || '알 수 없는 오류'}`);
    }

    const file = response.result;

    console.log('🔐 파일 권한 설정 시작:', file.id);
    // Set permissions (학교 도메인 구성원만 편집 가능)
    await this.setFilePermissions(file.id);
    console.log('✅ 파일 권한 설정 완료:', file.id);

    const result = {
      id: file.id,
      name: file.name,
      webViewLink: file.webViewLink,
      mimeType: file.mimeType,
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime
    };

    return result;
  }

  /**
   * Upload file to Google Drive
   */
  public async uploadFile(options: UploadFileOptions): Promise<GoogleDriveFile> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Drive 인증이 필요합니다.');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Google Drive 토큰을 가져올 수 없습니다.');
    }

    // 폴더 찾기·만들기와 권한 설정은 gapi 클라이언트를 쓴다. 호출부가 initialize() 를 잊으면
    // `window.gapi.client.drive` 가 없어 «폴더 생성 실패»로 죽는다 — 2026-10-01 제출 받기 양식 업로드가
    // 그랬다(다른 화면이 우연히 gapi 를 띄워 둔 경우에만 성공했다). 그래서 여기서 스스로 준비한다.
    await this.initialize();
    window.gapi.client.setToken({ access_token: token });

    // Determine parent folder based on context
    let parentFolderId: string;
    if (options.uploadContext) {
      // Use context-aware folder structure
      parentFolderId = await this.getOrCreateContextFolder(options.uploadContext);
    } else if (options.parentFolderId) {
      // Use explicit parent folder
      parentFolderId = options.parentFolderId;
    } else {
      // Fallback to Spacekijun root folder
      parentFolderId = await this.getOrCreateSpacekijunFolder();
    }

    const fileMetadata: any = {
      name: options.name,
      parents: [parentFolderId]
    };

    // Create multipart form data
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    form.append('file', options.file);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink,mimeType,size,createdTime,modifiedTime', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: form
    });

    if (!response.ok) {
      throw new Error('파일 업로드에 실패했습니다.');
    }

    const file = await response.json();

    // Set permissions (학교 도메인 구성원만 편집 가능)
    await this.setFilePermissions(file.id);

    return {
      id: file.id,
      name: file.name,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink,
      mimeType: file.mimeType,
      size: parseInt(file.size || '0'),
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime
    };
  }

  /**
   * Set file permissions — 학교 Workspace 도메인 구성원만 편집 가능 (2026-08-11 사용자 결정).
   * 구 설정은 type 'anyone'(링크만 알면 외부인도 편집 가능)이었다 — 도메인으로 한정.
   */
  private async setFilePermissions(fileId: string): Promise<void> {
    await window.gapi.client.drive.permissions.create({
      fileId: fileId,
      resource: {
        role: 'writer',
        type: 'domain',
        domain: WORKSPACE_DOMAIN
      }
    });
  }

  /**
   * List files from Google Drive (Spacekijun folder only)
   */
  public async listFiles(pageSize: number = 10): Promise<GoogleDriveFile[]> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Drive 인증이 필요합니다.');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Google Drive 토큰을 가져올 수 없습니다.');
    }

    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: token });
    }

    // Get or create Spacekijun folder
    const spacekijunFolderId = await this.getOrCreateSpacekijunFolder();

    const response = await window.gapi.client.drive.files.list({
      q: `'${spacekijunFolderId}' in parents and trashed=false`,
      pageSize: pageSize,
      fields: 'files(id,name,webViewLink,webContentLink,mimeType,size,createdTime,modifiedTime)',
      orderBy: 'modifiedTime desc'
    });

    return response.result.files.map((file: any) => ({
      id: file.id,
      name: file.name,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink,
      mimeType: file.mimeType,
      size: parseInt(file.size || '0'),
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime
    }));
  }

  /**
   * Delete file from Google Drive
   */
  public async deleteFile(fileId: string): Promise<void> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Drive 인증이 필요합니다.');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Google Drive 토큰을 가져올 수 없습니다.');
    }

    // uploadFile 과 같은 이유 — 호출부가 initialize() 를 잊어도 스스로 준비한다
    await this.initialize();
    window.gapi.client.setToken({ access_token: token });

    await window.gapi.client.drive.files.delete({
      fileId: fileId
    });
  }

  /**
   * Delete a file and clean up empty parent folders up to (but not including) the Spacekijun root folder.
   * After deleting the file, checks if the parent folder is empty and deletes it if so,
   * then repeats for the grandparent, etc.
   */
  public async deleteFileAndCleanupFolders(fileId: string): Promise<void> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Drive 인증이 필요합니다.');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Google Drive 토큰을 가져올 수 없습니다.');
    }

    // uploadFile 과 같은 이유. 이게 없으면 아래 files.get 이 gapi 가 없어 던지고, 그 예외를
    // «이미 지워짐»으로 삼켜 **아무것도 지우지 않은 채 성공처럼** 끝났다(2026-10-01 확인).
    await this.initialize();
    window.gapi.client.setToken({ access_token: token });

    // Get the file's parent folder before deleting
    let parentIds: string[] = [];
    try {
      const fileResponse = await window.gapi.client.drive.files.get({
        fileId: fileId,
        fields: 'parents'
      });
      parentIds = fileResponse.result.parents || [];
    } catch (error: unknown) {
      // 이미 지워진 파일(404)만 «할 일 없음»으로 끝낸다 — 권한 없음(403) 등은 호출부가 알아야 한다
      const status = (error as { status?: number; result?: { error?: { code?: number } } })?.status
        ?? (error as { result?: { error?: { code?: number } } })?.result?.error?.code;
      if (status === 404) {
        console.warn('파일이 이미 없습니다:', fileId);
        return;
      }
      throw error;
    }

    // Delete the file itself
    await window.gapi.client.drive.files.delete({ fileId });

    // Get the Spacekijun root folder ID to know where to stop
    const rootFolderId = await this.getOrCreateSpacekijunFolder();

    // Walk up parent folders and delete empty ones
    for (const parentId of parentIds) {
      await this.cleanupEmptyFoldersUpward(parentId, rootFolderId);
    }
  }

  /**
   * Recursively delete empty folders upward, stopping before the stop folder.
   */
  private async cleanupEmptyFoldersUpward(folderId: string, stopFolderId: string): Promise<void> {
    // Never delete the root Spacekijun folder or above
    if (folderId === stopFolderId) return;

    try {
      // Check if this folder is empty
      const contents = await window.gapi.client.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id)',
        pageSize: 1
      });

      if (contents.result.files && contents.result.files.length > 0) {
        // Folder is not empty, stop
        return;
      }

      // Get this folder's parent before deleting
      const folderInfo = await window.gapi.client.drive.files.get({
        fileId: folderId,
        fields: 'parents,name'
      });
      const folderParents: string[] = folderInfo.result.parents || [];

      // Delete the empty folder
      await window.gapi.client.drive.files.delete({ fileId: folderId });
      console.log(`빈 폴더 삭제: ${folderInfo.result.name} (${folderId})`);

      // Continue upward
      for (const parentId of folderParents) {
        await this.cleanupEmptyFoldersUpward(parentId, stopFolderId);
      }
    } catch (error) {
      // Non-critical: log and continue
      console.warn('빈 폴더 정리 중 오류 (무시됨):', error);
    }
  }

  /**
   * Create folder in Google Drive
   */
  public async createFolder(name: string, parentFolderId?: string): Promise<GoogleDriveFile> {
    return this.createNewFile({
      name,
      type: 'folder',
      parentFolderId
    });
  }

  /**
   * Copy file to Spacekijun folder and make it downloadable
   * @param fileId - Source file ID to copy
   * @param newName - Optional new name for the copied file
   * @param uploadContext - Optional upload context for folder structure
   * @returns Copied file info
   */
  public async copyFileToSpacekijun(fileId: string, newName?: string, uploadContext?: GoogleDriveUploadContext): Promise<GoogleDriveFile> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Drive 인증이 필요합니다.');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('유효한 Google Drive 토큰이 없습니다.');
    }

    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: token });
    }

    // Determine parent folder based on context
    let parentFolderId: string;
    if (uploadContext) {
      parentFolderId = await this.getOrCreateContextFolder(uploadContext);
    } else {
      parentFolderId = await this.getOrCreateSpacekijunFolder();
    }

    try {
      // Get original file info for name
      const originalFile = await window.gapi.client.drive.files.get({
        fileId: fileId,
        fields: 'name,mimeType'
      });

      // Copy file to target folder
      const copyResponse = await window.gapi.client.drive.files.copy({
        fileId: fileId,
        resource: {
          name: newName || originalFile.result.name,
          parents: [parentFolderId]
        },
        fields: 'id,name,webViewLink,webContentLink,mimeType,size,createdTime,modifiedTime'
      });

      const copiedFile = copyResponse.result;

      // Set permissions (학교 도메인 구성원만 편집 가능)
      await this.setFilePermissions(copiedFile.id);

      return {
        id: copiedFile.id,
        name: copiedFile.name,
        webViewLink: copiedFile.webViewLink,
        webContentLink: copiedFile.webContentLink,
        mimeType: copiedFile.mimeType,
        size: parseInt(copiedFile.size || '0'),
        createdTime: copiedFile.createdTime,
        modifiedTime: copiedFile.modifiedTime
      };
    } catch (error: any) {
      console.error('File copy error:', error);
      throw new Error(`파일 복사 실패: ${error.message}`);
    }
  }

  /**
   * Move file to a different folder in Google Drive
   * @param fileId - Google Drive file ID to move
   * @param newDirectoryPath - New directory path (e.g., "2025/서류함/교무운영부")
   * @returns Updated file info
   */
  public async moveFile(fileId: string, newDirectoryPath: string): Promise<GoogleDriveFile> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Drive 인증이 필요합니다.');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('유효한 Google Drive 토큰이 없습니다.');
    }

    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: token });
    }

    try {
      // Get current file info to retrieve current parents
      const fileResponse = await window.gapi.client.drive.files.get({
        fileId: fileId,
        fields: 'parents,name,mimeType'
      });

      const currentParents = fileResponse.result.parents || [];

      // Parse new directory path and create folder structure
      let targetFolderId = await this.getOrCreateSpacekijunFolder();

      // Split path and create nested folders
      const pathParts = newDirectoryPath.split('/').filter(p => p.trim());
      for (const folderName of pathParts) {
        targetFolderId = await this.findOrCreateFolder(folderName, targetFolderId);
      }

      // Move file by updating parents
      const updateResponse = await window.gapi.client.drive.files.update({
        fileId: fileId,
        addParents: targetFolderId,
        removeParents: currentParents.join(','),
        fields: 'id,name,webViewLink,webContentLink,mimeType,size,createdTime,modifiedTime'
      });

      const updatedFile = updateResponse.result;

      return {
        id: updatedFile.id,
        name: updatedFile.name,
        webViewLink: updatedFile.webViewLink,
        webContentLink: updatedFile.webContentLink,
        mimeType: updatedFile.mimeType,
        size: parseInt(updatedFile.size || '0'),
        createdTime: updatedFile.createdTime,
        modifiedTime: updatedFile.modifiedTime
      };
    } catch (error: any) {
      console.error('File move error:', error);
      throw new Error(`파일 이동 실패: ${error.message}`);
    }
  }

  /**
   * Download Google Drive file (for non-exportable files like HWP, PDF, etc.)
   * @param fileId - Google Drive file ID
   * @returns Blob of downloaded file
   */
  public async downloadFile(fileId: string): Promise<Blob> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Google Drive 인증이 필요합니다. 로그인해주세요.');
    }

    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Drive 파일 다운로드 실패: ${response.status} ${errorText}`);
    }

    return await response.blob();
  }

  /**
   * Download Google Drive file and convert to Base64
   * @param fileId - Google Drive file ID
   * @returns Base64 encoded string with MIME type
   */
  public async downloadFileAsBase64(fileId: string, originalMimeType: string): Promise<{ data: string; mimeType: string }> {
    const blob = await this.downloadFile(fileId);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        // Remove "data:...;base64," prefix
        const base64 = base64data.split(',')[1];
        resolve({ data: base64, mimeType: originalMimeType });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Export Google Drive file (Docs/Sheets/Slides) to specified format
   * @param fileId - Google Drive file ID
   * @param exportMimeType - Target MIME type (e.g., 'application/pdf', 'text/plain')
   * @returns Blob of exported file
   */
  public async exportFile(fileId: string, exportMimeType: string = 'application/pdf'): Promise<Blob> {
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('Google Drive 인증이 필요합니다. 로그인해주세요.');
    }

    const url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Drive 파일 export 실패: ${response.status} ${errorText}`);
    }

    return await response.blob();
  }

  /**
   * Export Google Drive file and convert to Base64
   * @param fileId - Google Drive file ID
   * @param exportMimeType - Target MIME type
   * @returns Base64 encoded string
   */
  public async exportFileAsBase64(fileId: string, exportMimeType: string = 'application/pdf'): Promise<{ data: string; mimeType: string }> {
    const blob = await this.exportFile(fileId, exportMimeType);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        // Remove "data:...;base64," prefix
        const base64 = base64data.split(',')[1];
        resolve({ data: base64, mimeType: exportMimeType });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Check if file is a Google native file (Docs, Sheets, Slides)
   * These files support export API
   */
  public static isGoogleNativeFile(mimeType: string): boolean {
    const nativeTypes = [
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.spreadsheet',
      'application/vnd.google-apps.presentation',
    ];
    return nativeTypes.includes(mimeType);
  }

  /**
   * Get appropriate export MIME type for Google Drive file type
   */
  public static getExportMimeType(googleMimeType: string): string {
    const exportMap: Record<string, string> = {
      'application/vnd.google-apps.document': 'application/pdf',
      'application/vnd.google-apps.spreadsheet': 'application/pdf',
      'application/vnd.google-apps.presentation': 'application/pdf',
    };

    return exportMap[googleMimeType] || 'application/pdf';
  }

  /**
   * Load Google Picker API script
   */
  private async loadPickerScript(): Promise<void> {
    if (window.picker_loaded) return;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        window.gapi.load('picker', {
          callback: () => {
            window.picker_loaded = true;
            console.log('Google Picker API loaded');
            resolve();
          },
          onerror: () => reject(new Error('Failed to load Google Picker'))
        });
      };
      script.onerror = () => reject(new Error('Failed to load Google API script'));

      // Only append if not already present
      if (!document.querySelector('script[src="https://apis.google.com/js/api.js"]')) {
        document.head.appendChild(script);
      } else {
        // Script already loaded
        window.gapi.load('picker', {
          callback: () => {
            window.picker_loaded = true;
            console.log('Google Picker API loaded');
            resolve();
          },
          onerror: () => reject(new Error('Failed to load Google Picker'))
        });
      }
    });
  }

  /**
   * Show Google Picker to select files from entire Google Drive
   * @param onFilesSelected - Callback function to handle selected files
   * @param options - Picker options (multiselect, file types, etc.)
   */
  public async showPicker(
    onFilesSelected: (files: GoogleDriveFile[]) => void,
    options?: {
      multiselect?: boolean;
      mimeTypes?: string[];
      enableFolderSelect?: boolean;
    }
  ): Promise<void> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Drive 인증이 필요합니다.');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('유효한 Google Drive 토큰이 없습니다.');
    }

    // Load picker script if not loaded
    await this.loadPickerScript();

    // Create My Drive view with folder hierarchy (starts from root)
    const docsView = new window.google.picker.DocsView()
      .setParent('root')  // Start from My Drive root, enables folder navigation
      .setIncludeFolders(true)
      .setSelectFolderEnabled(options?.enableFolderSelect || false);

    // Apply MIME type filters if specified
    if (options?.mimeTypes && options.mimeTypes.length > 0) {
      docsView.setMimeTypes(options.mimeTypes.join(','));
    }

    // Add recent files view as a second tab
    const recentView = new window.google.picker.DocsView(window.google.picker.ViewId.RECENTLY_PICKED)
      .setIncludeFolders(false);

    const pickerBuilder = new window.google.picker.PickerBuilder()
      .addView(docsView)
      .addView(recentView)
      .setOAuthToken(token)
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          // Use picker data directly (no additional API calls for speed)
          const selectedFiles: GoogleDriveFile[] = data.docs.map((doc: any) => {
            return {
              id: doc.id,
              name: doc.name,
              webViewLink: doc.url || `https://drive.google.com/file/d/${doc.id}/view`,
              webContentLink: doc.downloadUrl,
              mimeType: doc.mimeType,
              size: doc.sizeBytes ? parseInt(doc.sizeBytes) : 0,
              createdTime: doc.lastEditedUtc || new Date().toISOString(),
              modifiedTime: doc.lastEditedUtc || new Date().toISOString()
            };
          });

          onFilesSelected(selectedFiles);
        }
      });

    // Enable multi-select if specified
    if (options?.multiselect) {
      pickerBuilder.enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED);
    }

    // Add API key if available
    if (this.config.apiKey) {
      pickerBuilder.setDeveloperKey(this.config.apiKey);
    }

    const picker = pickerBuilder.build();
    picker.setVisible(true);
  }

  /**
   * Get file or folder metadata by ID
   * @param fileId - File or folder ID
   * @returns File metadata
   */
  public async getFileMetadata(fileId: string): Promise<{ id: string; name: string; mimeType: string }> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Drive 인증이 필요합니다.');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('유효한 Google Drive 토큰이 없습니다.');
    }

    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: token });
    }

    try {
      const response = await window.gapi.client.drive.files.get({
        fileId: fileId,
        fields: 'id,name,mimeType'
      });

      return {
        id: response.result.id,
        name: response.result.name,
        mimeType: response.result.mimeType
      };
    } catch (error: any) {
      console.error('Error getting file metadata:', error);
      throw new Error(`파일 정보 조회 실패: ${error.message}`);
    }
  }

  /**
   * Get folder path from root to specific folder
   * @param folderId - Folder ID to get path for
   * @returns Array of folder names from root to target folder
   */
  public async getFolderPath(folderId: string): Promise<string[]> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Drive 인증이 필요합니다.');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('유효한 Google Drive 토큰이 없습니다.');
    }

    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: token });
    }

    const path: string[] = [];
    let currentFolderId: string | null = folderId;

    try {
      while (currentFolderId) {
        const response = await window.gapi.client.drive.files.get({
          fileId: currentFolderId,
          fields: 'name,parents'
        });

        const folder = response.result;
        path.unshift(folder.name); // Add to beginning of path

        // Move to parent folder
        if (folder.parents && folder.parents.length > 0) {
          currentFolderId = folder.parents[0];
        } else {
          // Reached root
          currentFolderId = null;
        }
      }

      return path;
    } catch (error: any) {
      console.error('Error getting folder path:', error);
      throw new Error(`폴더 경로 조회 실패: ${error.message}`);
    }
  }

  /**
   * List all files and folders in a specific folder
   * @param folderId - Folder ID to list contents of
   * @returns Array of files and folders
   */
  public async listFolderContents(folderId: string): Promise<GoogleDriveFile[]> {
    if (!(await this.isAuthenticated())) {
      throw new Error('Google Drive 인증이 필요합니다.');
    }

    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('유효한 Google Drive 토큰이 없습니다.');
    }

    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: token });
    }

    try {
      const response = await window.gapi.client.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id,name,webViewLink,webContentLink,mimeType,size,createdTime,modifiedTime)',
        pageSize: 1000 // Get all files
      });

      return response.result.files.map((file: any) => ({
        id: file.id,
        name: file.name,
        webViewLink: file.webViewLink,
        webContentLink: file.webContentLink,
        mimeType: file.mimeType,
        size: parseInt(file.size || '0'),
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime
      }));
    } catch (error: any) {
      console.error('Error listing folder contents:', error);
      throw new Error(`폴더 내용 조회 실패: ${error.message}`);
    }
  }

  /**
   * Recursively get all files in a folder and its subfolders
   * @param folderId - Root folder ID
   * @param basePath - Base path for relative paths (internal use)
   * @returns Array of files with their relative paths
   */
  public async getAllFilesInFolder(
    folderId: string,
    basePath: string = ''
  ): Promise<Array<GoogleDriveFile & { relativePath: string }>> {
    const contents = await this.listFolderContents(folderId);
    const results: Array<GoogleDriveFile & { relativePath: string }> = [];

    for (const item of contents) {
      const itemPath = basePath ? `${basePath}/${item.name}` : item.name;

      if (item.mimeType === 'application/vnd.google-apps.folder') {
        // Recursively get files from subfolder
        const subfolderFiles = await this.getAllFilesInFolder(item.id, itemPath);
        results.push(...subfolderFiles);
      } else {
        // Add file with its relative path
        results.push({
          ...item,
          relativePath: itemPath
        });
      }
    }

    return results;
  }
}

// Configuration helper
export const getGoogleDriveConfig = (): GoogleDriveConfig => {
  return {
    clientId: import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID || '',
    apiKey: import.meta.env.VITE_GOOGLE_DRIVE_API_KEY || '',
    sharedFolderId: import.meta.env.VITE_GOOGLE_DRIVE_SHARED_FOLDER_ID || undefined
  };
};

// Default instance
let defaultInstance: GoogleDriveServiceNew | null = null;

export const getGoogleDriveService = (): GoogleDriveServiceNew => {
  if (!defaultInstance) {
    const config = getGoogleDriveConfig();
    if (!config.clientId) {
      throw new Error('VITE_GOOGLE_DRIVE_CLIENT_ID 환경변수가 설정되지 않았습니다. .env 파일을 확인해주세요.');
    }
    defaultInstance = GoogleDriveServiceNew.getInstance(config);
  }
  return defaultInstance;
};