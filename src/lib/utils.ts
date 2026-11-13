import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 한글 초성 추출 함수
export function extractChosung(text: string): string {
  const chosungList = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
    'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
  ];

  let chosung = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charCode = char.charCodeAt(0);

    // 한글 음절 범위 (가-힣)
    if (charCode >= 0xAC00 && charCode <= 0xD7A3) {
      const chosungIndex = Math.floor((charCode - 0xAC00) / 588);
      chosung += chosungList[chosungIndex];
    } else {
      // 한글이 아닌 문자는 그대로 추가
      chosung += char;
    }
  }

  return chosung;
}

// 순수 한글 자음만으로 구성되었는지 판별하는 함수
export function isOnlyKoreanConsonants(text: string): boolean {
  if (!text) return false;

  // 한글 자음의 유니코드 범위: ㄱ(0x3131) ~ ㅎ(0x314E)
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    if (charCode < 0x3131 || charCode > 0x314E) {
      return false;
    }
  }
  return true;
}

// 개선된 초성 검색 매칭 함수
export function isChosungMatch(text: string, searchTerm: string): boolean {
  if (!searchTerm) return true;

  // 검색어가 순수 자음으로만 구성된 경우: 초성 검색만
  if (isOnlyKoreanConsonants(searchTerm)) {
    const textChosung = extractChosung(text);
    return textChosung.includes(searchTerm);
  }

  // 완성된 글자나 다른 문자가 포함된 경우: 직접 텍스트 매치만
  return text.toLowerCase().includes(searchTerm.toLowerCase());
}
