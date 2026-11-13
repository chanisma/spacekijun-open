import { supabase } from '@/integrations/supabase/client';

export const uploadSignatureToStorage = async (
  userId: string,
  signatureDataUrl: string
): Promise<string | null> => {
  try {
    // Base64 데이터를 Blob으로 변환
    const response = await fetch(signatureDataUrl);
    const blob = await response.blob();

    // 파일명 생성 (UUID + 타임스탬프)
    const fileName = `${userId}_${Date.now()}.png`;
    const filePath = `kijunspace/profile/signature/${fileName}`;

    // Supabase Storage에 업로드
    const { data, error } = await supabase.storage
      .from('kijunspace')
      .upload(`profile/signature/${fileName}`, blob, {
        contentType: 'image/png',
        upsert: true, // 같은 파일명이 있으면 덮어쓰기
      });

    if (error) {
      console.error('서명 업로드 오류:', error);
      return null;
    }

    // 업로드된 파일의 public URL 반환
    const { data: urlData } = supabase.storage
      .from('kijunspace')
      .getPublicUrl(`profile/signature/${fileName}`);

    return urlData.publicUrl;
  } catch (error) {
    console.error('서명 업로드 처리 오류:', error);
    return null;
  }
};

export const deleteSignatureFromStorage = async (signatureUrl: string): Promise<boolean> => {
  try {
    // URL에서 파일 경로 추출
    const url = new URL(signatureUrl);
    const pathParts = url.pathname.split('/');
    const fileName = pathParts[pathParts.length - 1];
    const filePath = `profile/signature/${fileName}`;

    // Supabase Storage에서 삭제
    const { error } = await supabase.storage
      .from('kijunspace')
      .remove([filePath]);

    if (error) {
      console.error('서명 삭제 오류:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('서명 삭제 처리 오류:', error);
    return false;
  }
};

export const getSignatureUrl = (fileName: string): string => {
  const { data } = supabase.storage
    .from('kijunspace')
    .getPublicUrl(`profile/signature/${fileName}`);

  return data.publicUrl;
};

// 인장(Stamp) 관련 함수들
export const uploadStampToStorage = async (
  userId: string,
  stampFile: File
): Promise<string | null> => {
  try {
    // 파일명 생성 (UUID + 타임스탬프)
    const fileName = `${userId}_${Date.now()}.${stampFile.name.split('.').pop()}`;
    const filePath = `kijunspace/profile/stamp/${fileName}`;

    // Supabase Storage에 업로드
    const { data, error } = await supabase.storage
      .from('kijunspace')
      .upload(`profile/stamp/${fileName}`, stampFile, {
        contentType: stampFile.type,
        upsert: true, // 같은 파일명이 있으면 덮어쓰기
      });

    if (error) {
      console.error('인장 업로드 오류:', error);
      return null;
    }

    // 업로드된 파일의 public URL 반환
    const { data: urlData } = supabase.storage
      .from('kijunspace')
      .getPublicUrl(`profile/stamp/${fileName}`);

    return urlData.publicUrl;
  } catch (error) {
    console.error('인장 업로드 처리 오류:', error);
    return null;
  }
};

export const deleteStampFromStorage = async (stampUrl: string): Promise<boolean> => {
  try {
    // URL에서 파일 경로 추출
    const url = new URL(stampUrl);
    const pathParts = url.pathname.split('/');
    const fileName = pathParts[pathParts.length - 1];
    const filePath = `profile/stamp/${fileName}`;

    // Supabase Storage에서 삭제
    const { error } = await supabase.storage
      .from('kijunspace')
      .remove([filePath]);

    if (error) {
      console.error('인장 삭제 오류:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('인장 삭제 처리 오류:', error);
    return false;
  }
};

export const getStampUrl = (fileName: string): string => {
  const { data } = supabase.storage
    .from('kijunspace')
    .getPublicUrl(`profile/stamp/${fileName}`);

  return data.publicUrl;
};