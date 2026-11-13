import { supabase } from '@/integrations/supabase/client';

/**
 * Supabase Storage에서 공개 URL을 생성합니다.
 * @param bucket 버킷 이름
 * @param path 파일 경로
 * @returns 공개 URL
 */
export function getStoragePublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * 로고 이미지의 공개 URL을 반환합니다.
 * @returns 로고 이미지 URL
 */
export function getLogoUrl(): string {
  return getStoragePublicUrl('kijunspace', 'dev/logo.png');
}

/**
 * 파일을 Supabase Storage에 업로드합니다.
 * @param bucket 버킷 이름
 * @param path 저장할 파일 경로
 * @param file 업로드할 파일
 * @param options 업로드 옵션
 * @returns 업로드 결과
 */
export async function uploadToStorage(
  bucket: string,
  path: string,
  file: File | Blob,
  options?: {
    contentType?: string;
    upsert?: boolean;
  }
) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType: options?.contentType,
      upsert: options?.upsert ?? false,
    });

  if (error) {
    throw error;
  }

  return data;
}