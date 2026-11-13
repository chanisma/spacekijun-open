// ========================================
// Assignee Utilities
// Shared helpers for assignee-related components
// ========================================

// ----------------------------------------
// Types
// ----------------------------------------

export interface AssigneeInfo {
  name: string;
  signature?: number;
  status?: string;
  [key: string]: unknown;
}

export type AssigneeData =
  | string
  | Record<string, AssigneeInfo>
  | AssigneeInfo[]
  | null
  | undefined;

// ----------------------------------------
// Display Functions
// ----------------------------------------

/**
 * Convert assignee data (string, JSONB object, or array) to display text
 * Handles multiple assignee storage formats used in the system
 *
 * @param assignee - Assignee data in various formats
 * @returns Comma-separated string of assignee names
 *
 * @example
 * // String format
 * getAssigneeDisplayText("홍길동") // "홍길동"
 *
 * // JSONB object format (meeting.meta.assignee)
 * getAssigneeDisplayText({ "홍길동": { name: "홍길동", signature: 0 } }) // "홍길동"
 *
 * // Array format
 * getAssigneeDisplayText([{ name: "홍길동" }, { name: "김철수" }]) // "홍길동, 김철수"
 */
export function getAssigneeDisplayText(assignee: AssigneeData): string {
  if (!assignee) return '';

  // String format
  if (typeof assignee === 'string') {
    return assignee;
  }

  // Array format
  if (Array.isArray(assignee)) {
    const names = assignee
      .map((item) => item?.name)
      .filter(Boolean)
      .join(', ');
    return names;
  }

  // JSONB object format { "name": { name: "name", signature: 0 } }
  if (typeof assignee === 'object') {
    const names = Object.values(assignee)
      .map((item) => item?.name)
      .filter(Boolean)
      .join(', ');
    return names;
  }

  return '';
}

/**
 * Get list of assignee names as array
 */
export function getAssigneeNames(assignee: AssigneeData): string[] {
  if (!assignee) return [];

  if (typeof assignee === 'string') {
    return [assignee];
  }

  if (Array.isArray(assignee)) {
    return assignee
      .map((item) => item?.name)
      .filter((name): name is string => Boolean(name));
  }

  if (typeof assignee === 'object') {
    return Object.values(assignee)
      .map((item) => item?.name)
      .filter((name): name is string => Boolean(name));
  }

  return [];
}

/**
 * Get count of assignees
 */
export function getAssigneeCount(assignee: AssigneeData): number {
  return getAssigneeNames(assignee).length;
}

/**
 * Check if a specific user is an assignee
 */
export function isUserAssignee(
  assignee: AssigneeData,
  userName: string
): boolean {
  const names = getAssigneeNames(assignee);
  return names.includes(userName);
}

/**
 * Format assignee display with count
 * e.g., "홍길동 외 2명"
 */
export function getAssigneeDisplayWithCount(
  assignee: AssigneeData,
  maxDisplay: number = 1
): string {
  const names = getAssigneeNames(assignee);

  if (names.length === 0) return '';
  if (names.length <= maxDisplay) return names.join(', ');

  const displayed = names.slice(0, maxDisplay).join(', ');
  const remaining = names.length - maxDisplay;
  return `${displayed} 외 ${remaining}명`;
}

// ----------------------------------------
// Signature Functions
// ----------------------------------------

/**
 * Get signature status for an assignee
 * @returns 0 = unsigned, 1 = signed
 */
export function getSignatureStatus(
  assignee: Record<string, AssigneeInfo>,
  name: string
): number {
  return assignee[name]?.signature ?? 0;
}

/**
 * Check if all assignees have signed
 */
export function areAllSigned(
  assignee: Record<string, AssigneeInfo>
): boolean {
  if (!assignee || Object.keys(assignee).length === 0) return false;
  return Object.values(assignee).every((info) => info.signature === 1);
}

/**
 * Get signed count
 */
export function getSignedCount(
  assignee: Record<string, AssigneeInfo>
): number {
  if (!assignee) return 0;
  return Object.values(assignee).filter((info) => info.signature === 1).length;
}
