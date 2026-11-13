/**
 * Calculate byte size of text.
 * English/numbers/special chars/spaces: 1 byte
 * Newlines: 2 bytes
 * Korean characters: 3 bytes
 */
export function calculateByteSize(text: string): number {
    if (!text) return 0;

    let bytes = 0;
    for (const char of text) {
        if (char === '\n') {
            bytes += 2;
        } else if (/[가-힣]/.test(char)) {
            bytes += 3;
        } else {
            bytes += 1;
        }
    }
    return bytes;
}

const CONTENT_FIELDS = ['특기사항', '세부능력 및 특기사항', 'content'] as const;

/**
 * Extract real content from text that may be a JSON string.
 * Handles cases where content is wrapped in JSON objects.
 */
export function extractRealContent(text: string | null | undefined): string {
    if (!text) return '';

    const trimmed = text.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
        return text;
    }

    try {
        const parsed = JSON.parse(trimmed);

        for (const field of CONTENT_FIELDS) {
            if (typeof parsed[field] === 'string') {
                return parsed[field];
            }
        }

        return parsed.특기사항 ?? '';
    } catch {
        return text;
    }
}
