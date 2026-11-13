import { uploadToStorage } from '@/lib/storage';

/**
 * 로고 파일을 Supabase Storage에 업로드하는 함수
 * 브라우저에서 실행하여 로컬 파일을 업로드할 수 있습니다.
 */
export async function uploadLogoToStorage() {
  try {
    // 파일 input 요소 생성
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/jpg';

    // 파일 선택 프로미스 생성
    const filePromise = new Promise<File>((resolve, reject) => {
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          resolve(file);
        } else {
          reject(new Error('파일이 선택되지 않았습니다.'));
        }
      };

      input.oncancel = () => {
        reject(new Error('파일 선택이 취소되었습니다.'));
      };
    });

    // 파일 선택 대화상자 열기
    input.click();

    // 파일 대기
    const file = await filePromise;

    console.log('선택된 파일:', file.name, file.size, 'bytes');

    // Storage에 업로드
    console.log('업로드 시작...');
    const result = await uploadToStorage('kijunspace', 'dev/logo.png', file, {
      contentType: file.type,
      upsert: true // 기존 파일 덮어쓰기
    });

    console.log('업로드 완료:', result);
    console.log('로고 URL:', `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/kijunspace/dev/logo.png`);

    return result;

  } catch (error) {
    console.error('업로드 오류:', error);
    throw error;
  }
}

// 전역 함수로 등록 (브라우저 콘솔에서 사용 가능)
if (typeof window !== 'undefined') {
  (window as any).uploadLogoToStorage = uploadLogoToStorage;
}