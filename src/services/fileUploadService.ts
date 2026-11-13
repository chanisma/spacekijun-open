import { supabase } from '@/integrations/supabase/client';

export interface UploadedFile {
  id: string;
  title: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  upload_status: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface FileUploadProgress {
  progress: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

class FileUploadService {
  /**
   * Upload a file to storage and create document record
   */
  async uploadFile(
    file: File,
    title?: string,
    onProgress?: (progress: FileUploadProgress) => void
  ): Promise<UploadedFile | null> {
    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('사용자 인증이 필요합니다.');
      }

      onProgress?.({ progress: 10, status: 'uploading' });

      // Generate unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      onProgress?.({ progress: 30, status: 'uploading' });

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      onProgress?.({ progress: 70, status: 'processing' });

      // Create document record
      const { data: document, error: docError } = await supabase
        .from('documents')
        .insert({
          title: title || file.name,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          storage_path: filePath,
          upload_status: 'completed',
          user_id: user.id
        })
        .select()
        .single();

      if (docError) {
        // Clean up uploaded file if document creation fails
        await supabase.storage.from('documents').remove([filePath]);
        throw docError;
      }

      onProgress?.({ progress: 100, status: 'completed' });

      return document as UploadedFile;

    } catch (error) {
      console.error('Error uploading file:', error);
      onProgress?.({
        progress: 0,
        status: 'error',
        error: error instanceof Error ? error.message : '파일 업로드 중 오류가 발생했습니다.'
      });
      return null;
    }
  }

  /**
   * Get public URL for a file
   */
  async getFileUrl(storagePath: string): Promise<string | null> {
    try {
      const { data } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Error getting file URL:', error);
      return null;
    }
  }

  /**
   * Download a file
   */
  async downloadFile(storagePath: string, fileName: string): Promise<void> {
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(storagePath);

      if (error) {
        throw error;
      }

      // Create download link
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
  }

  /**
   * Delete a file and document record
   */
  async deleteFile(documentId: string): Promise<boolean> {
    try {
      // Get document info first
      const { data: document, error: fetchError } = await supabase
        .from('documents')
        .select('storage_path')
        .eq('id', documentId)
        .single();

      if (fetchError || !document) {
        throw new Error('문서를 찾을 수 없습니다.');
      }

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([document.storage_path]);

      if (storageError) {
        console.warn('Storage deletion failed:', storageError);
        // Continue with database deletion even if storage fails
      }

      // Delete document record
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (deleteError) {
        throw deleteError;
      }

      return true;

    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  /**
   * Get user's uploaded files
   */
  async getUserFiles(): Promise<UploadedFile[]> {
    try {
      const { data: documents, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return documents as UploadedFile[];

    } catch (error) {
      console.error('Error fetching user files:', error);
      return [];
    }
  }

  /**
   * Get a specific document by ID
   */
  async getDocument(documentId: string): Promise<UploadedFile | null> {
    try {
      const { data: document, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error) {
        throw error;
      }

      return document as UploadedFile;

    } catch (error) {
      console.error('Error fetching document:', error);
      return null;
    }
  }

  /**
   * Check if file type is supported
   */
  isSupportedFileType(file: File): boolean {
    const supportedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'application/x-hwp',
      'application/haansofthwp',
      'application/vnd.hancom.hwpx',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp'
    ];

    const supportedExtensions = [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.txt', '.hwp', '.hwpx', '.jpg', '.jpeg', '.png', '.gif', '.webp'
    ];

    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    return supportedTypes.includes(file.type) || supportedExtensions.includes(fileExtension);
  }

  /**
   * Check if file size is within limits (5MB)
   */
  isValidFileSize(file: File): boolean {
    const maxSize = 5 * 1024 * 1024; // 5MB
    return file.size <= maxSize;
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

export const fileUploadService = new FileUploadService();