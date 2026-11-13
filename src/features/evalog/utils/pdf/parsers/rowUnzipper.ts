import { jeonjuGijeonGirls2022 } from '../../../data/curriculum/jeonju_gijeon_girls_2022';

// Manual dictionary for subjects known to be missing or problematic
const MANUAL_SUBJECTS = [
    '종교학',
    '종교학(@)',
    '생활과 종교',
    '기술・가정', // If it appears as a subject
    '제2외국어',
    '한문',
    '교양'
];

// Helper to normalize strings for matching (remove spaces)
const normalize = (s: string) => s.replace(/\s+/g, '');

// Build the dictionary
const SUBJECT_DICTIONARY = new Set<string>();

jeonjuGijeonGirls2022.subjects.forEach(s => {
    SUBJECT_DICTIONARY.add(normalize(s.subject));
});

MANUAL_SUBJECTS.forEach(s => {
    SUBJECT_DICTIONARY.add(normalize(s));
});

/**
 * Attempts to unzip a merged row where multiple subjects are concatenated in the 'subject' column.
 * e.g. subject: "독서 승마 영어 독해와 작문 종교학"
 *      subject_group: "국어 체육 영어 기술・가정/제2외국어/한문/교양"
 * 
 * Returns an array of unzipped rows (as string arrays) if successful.
 * Returns null if unzipping is not possible or not needed.
 */
export function unzipMergedRow(row: string[]): string[][] | null {
    // Expected row used in upstageParser section 6:
    // | Sem | SubjectGroup | Subject | Units | ...

    // Check if unzipping is needed:
    // Heuristic: Subject string contains multiple known subjects?
    const subjectStr = row[2];
    const subjectGroupStr = row[1];

    if (!subjectStr || !subjectGroupStr) return null;

    // 1. Identify valid subjects within the merged string
    // Strategy: Greedy match against dictionary.
    // Normalized string: "독서승마영어독해와작문종교학"
    // Try to match prefixes? Or substrings?
    // Since names are concatenated, we assume sequential order.

    const candidates: string[] = [];
    let remaining = subjectStr.trim();

    // Use the original string with spaces to help?
    // "독서 미적분 영어 독해와 작문 종교학"
    // Tokenize by space first?
    // "독서", "미적분", "영어", "독해와", "작문", "종교학"
    // Try to reconstruct valid subjects.

    const rawTokens = remaining.split(' ');
    const identifiedSubjects: string[] = [];

    let currentBuffer = '';

    for (let i = 0; i < rawTokens.length; i++) {
        const token = rawTokens[i];
        const testPhrase = currentBuffer ? `${currentBuffer} ${token}` : token;

        // Check if testPhrase is a valid subject (normalized)
        const norm = normalize(testPhrase);

        // Problem: "영어" is valid. "영어 독해와 작문" is also valid.
        // Greedy match: Look ahead?
        // If "currentBuffer" is valid, but "currentBuffer + next" is potentially valid?

        // Let's rely on the dictionary containing FULL names.
        // We need to match the LONGEST possible valid subject.

        // Look ahead to see if extending creates a longer match
        let bestMatch = '';
        let bestMatchTokens = 0;

        let tempSequence = '';
        for (let j = i; j < rawTokens.length; j++) {
            tempSequence = tempSequence ? `${tempSequence} ${rawTokens[j]}` : rawTokens[j];
            if (SUBJECT_DICTIONARY.has(normalize(tempSequence))) {
                bestMatch = tempSequence;
                bestMatchTokens = (j - i) + 1;
            }
        }

        if (bestMatch) {
            identifiedSubjects.push(bestMatch);
            i += (bestMatchTokens - 1); // Skip consumed tokens
            currentBuffer = '';
        } else {
            // No match found starting at this token.
            // This suggests it's a gap or unknown subject.
            // Fallback: Just take the token as is?
            // "승마" might not be in dictionary.
            identifiedSubjects.push(token);
        }
    }

    // If we only found 1 subject, and it matches the whole string (or close), no merge happened.
    if (identifiedSubjects.length <= 1) return null;

    // 2. Align Subject Groups
    // We have N identified subjects. We need N subject groups.
    // subjectGroupStr: "국어 수학 영어 기술・가정/제2외 국어/한문/교양"
    // Simple space split: "국어", "수학", "영어", "기술・가정/제2외", "국어/한문/교양" (5 tokens)
    // Target count: 4 (e.g. 독서, 미적분, 영독작, 종교학)

    const targetCount = identifiedSubjects.length;
    const groupTokens = subjectGroupStr.replace(/\s+/g, ' ').trim().split(' ');

    const alignedGroups: string[] = [];

    if (groupTokens.length === targetCount) {
        // Perfect match
        alignedGroups.push(...groupTokens);
    } else if (groupTokens.length > targetCount) {
        // More tokens than subjects. Need to merge some groups.
        // Heuristic: "국어", "수학", "영어" ... usually 1:1.
        // The LAST one might be the complex merged one.
        // Or specific known complex prefixes "기술・가정/..." 

        // Take first N-1 tokens as-is.
        // Merge the rest into the Nth token.
        // This handles "기술・가정/제2외" + "국어/한문/교양" -> "기술・가정/제2외 국어/한문/교양"

        for (let k = 0; k < targetCount - 1; k++) {
            alignedGroups.push(groupTokens[k]);
        }
        const remainder = groupTokens.slice(targetCount - 1).join(' ');
        alignedGroups.push(remainder);
    } else {
        // Fewer groups than subjects?
        // e.g. "탐구" -> "물리", "화학"
        // Duplicate the group?
        // Fallback: replicate the last group.
        for (let k = 0; k < groupTokens.length; k++) {
            alignedGroups.push(groupTokens[k]);
        }
        while (alignedGroups.length < targetCount) {
            alignedGroups.push(alignedGroups[alignedGroups.length - 1]);
        }
    }

    // 3. Construct Rows
    const unzippedRows: string[][] = [];

    // Helper: Split a column string into tokens
    const splitColumn = (col: string | undefined, count: number): string[] => {
        if (!col) return Array(count).fill('');
        // Split by whitespace
        const tokens = col.trim().split(/\s+/);

        // If single token and count > 1, replicate it? No, usually distinct values.
        // Unless it's "1" (Semester). But Semester is col[0], handled separately or typically same for all.
        // If digits, usually distinct. 
        // If tokens match count, perfect.
        if (tokens.length === count) return tokens;

        // If tokens < count, pad with empty strings (e.g. missing scores for P subjects)
        if (tokens.length < count) {
            const padded = [...tokens];
            while (padded.length < count) padded.push('');
            return padded;
        }

        // If tokens > count, this is tricky. Maybe content had spaces?
        // e.g. "A (100)" -> 2 tokens.
        // Heuristic: Try to group if parentheses involved?
        // For now, take first N or join remainder?
        // Let's just return first N for safety, preventing index overflow.
        return tokens.slice(0, count);
    };

    // Pre-split other interesting columns
    // Row indices: 0=Sem, 1=Group, 2=Subject, 3=Units, 4=Score, 5=Achievement, 6=Rank, 7=Remarks
    // We assume 0 is constant for the row.
    // 3, 4, 5, 6 should be split.
    const unitsTokens = splitColumn(row[3], targetCount);
    const scoreTokens = splitColumn(row[4], targetCount);
    const achievementTokens = splitColumn(row[5], targetCount);
    const rankTokens = splitColumn(row[6], targetCount);
    // Remarks (7) usually apply to specific subjects but difficult to align. Leave empty?

    for (let i = 0; i < targetCount; i++) {
        const newRow = [...row];
        newRow[1] = alignedGroups[i];
        newRow[2] = identifiedSubjects[i];

        // Distribute split values
        if (row[3]) newRow[3] = unitsTokens[i] || '';
        if (row[4]) newRow[4] = scoreTokens[i] || '';
        if (row[5]) newRow[5] = achievementTokens[i] || '';
        if (row[6]) newRow[6] = rankTokens[i] || '';
        // Clear remarks to avoid duplicating one remark for all subjects
        if (newRow[7]) newRow[7] = '';

        unzippedRows.push(newRow);
    }

    return unzippedRows;
}
