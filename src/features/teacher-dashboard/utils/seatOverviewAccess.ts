const RESPONSIBILITY_TAG_PATTERNS = [
  /^학교관리자$/,
  /부장$/,
  /(자습|열람실|생활지도|기숙사).*(담당|관리|지도)?/,
];

export function getSeatOverviewTagReason(tagNames: string[]): string | null {
  const matchedTag = tagNames.find((tagName) => (
    RESPONSIBILITY_TAG_PATTERNS.some((pattern) => pattern.test(tagName.trim()))
  ));

  return matchedTag ? `${matchedTag} 역할` : null;
}
