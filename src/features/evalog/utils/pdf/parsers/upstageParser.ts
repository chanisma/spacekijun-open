import { Student, SubjectGrade, AttendanceRecord, VolunteerActivity, ExtracurricularActivity, BehaviorRecord } from '../../../types/student';
import { PdfSections } from '../../../types/pdfTypes';
import { v4 as uuidv4 } from 'uuid';
import { unzipMergedRow } from './rowUnzipper';

interface UpstageContent {
    html: string;
    markdown: string;
    text: string;
}

interface UpstageResponse {
    content: UpstageContent;
}

// Helper to parse markdown table | key | value |
const parseMarkdownTable = (lines: string[]): string[][] => {
    return lines
        .map(line => {
            const cells = line.split('|').map(c => c.trim());
            // Remove first and last if empty (standard markdown table format)
            if (cells.length > 0 && cells[0] === '') cells.shift();
            if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
            return cells;
        })
        .filter(row => row.length > 0);
};

export function parseUpstageJson(json: UpstageResponse): Student {
    const markdown = json.content.markdown || '';
    const lines = markdown.split('\n');

    const sections: PdfSections = {
        header: { documentTitle: '', gradeInfo: [] },
        section1_personal_info: { name: '', middleSchool: '' },
        section2_attendance: [],
        section5_creative_activities: [],
        volunteer_activities: [],
        section6_academic_development: [],
        section8_behavior_characteristics: []
    };

    let currentSection = '';
    let currentGrade = 0;
    let currentSubjectGroup = '공통과목'; // Default for Section 6
    let forceCategory: 'career' | 'pe_arts' | null = null; // New: Enforce category context from headers
    let tableBuffer: string[] = [];

    // Helper to process a buffered table based on current section
    const processTable = (grid: string[][]) => {
        if (!grid || grid.length === 0) return;

        // Auto-detect Volunteer Section if header was missing
        // Check if any row in the table contains '봉사활동실적'
        const isVolunteerHeader = grid.some(row => row.join('').replace(/\s+/g, '').includes('봉사활동실적'));
        if (isVolunteerHeader) {
            currentSection = '봉사활동실적';
        }

        // 0. Header Info
        // Check if this is the Grade Info table (often appears before the first section header)
        // Headers: 구분 학년 | 학과 | 반 | 번호 | 담임성명
        const isGradeInfoTable = grid.some(row =>
            row.some(cell => cell.includes('구분 학년') || cell.includes('담임성명'))
        );

        if (currentSection === '인적·학적사항' || isGradeInfoTable) {
            // Find row containing '성명' in any cell
            const studentInfoRow = grid.find(row => row.some(cell => cell.includes('성명')));

            if (studentInfoRow) {
                // 1. Standard format: | 성명 | 강서윤 |
                const nameIdx = studentInfoRow.findIndex(cell => cell.trim() === '성명');
                if (nameIdx > -1 && studentInfoRow[nameIdx + 1]) {
                    sections.section1_personal_info.name = studentInfoRow[nameIdx + 1];
                } else {
                    // 2. Combined format: | 학생정보 | 성명 : 강서윤 ... |
                    const combinedCell = studentInfoRow.find(cell => cell.includes('성명'));
                    if (combinedCell) {
                        const nameMatch = combinedCell.match(/성명\s*[:]?\s*([가-힣]+)/);
                        if (nameMatch) {
                            sections.section1_personal_info.name = nameMatch[1];
                        }
                    }
                }
            }

            // Extract Grade/Class/Number
            grid.forEach(row => {
                // Case 1: Year | Grade | Class | Number (Standard)
                if (/^\d{4}$/.test(row[0]) && row[1] && row[2]) {
                    const grade = parseInt(row[1]);
                    const classNum = parseInt(row[2]);
                    const studentNum = parseInt(row[3]);
                    sections.header.gradeInfo.push({
                        grade,
                        class: classNum,
                        number: studentNum,
                        teacher: ''
                    });
                }
                // Case 2: Grade | Department | Class | Number (Observed in sample)
                // e.g. | 1 |  | 1 | 1 | 황소율 |
                else if (/^[1-3]$/.test(row[0].trim()) && row[2] && row[3]) {
                    const gradeStr = row[0].trim();
                    const classStr = row[2].trim();
                    const numStr = row[3].trim();

                    if (/^\d+$/.test(classStr) && /^\d+$/.test(numStr)) {
                        const grade = parseInt(gradeStr);
                        const classNum = parseInt(classStr);
                        const studentNum = parseInt(numStr);

                        // Avoid duplicates if multiple rows match or same grade appears
                        const exists = sections.header.gradeInfo.some(g => g.grade === grade);
                        if (!exists) {
                            sections.header.gradeInfo.push({
                                grade,
                                class: classNum,
                                number: studentNum,
                                teacher: ''
                            });
                        }
                    }
                }
            });
        }

        // 1. Personal Info details (Middle School)
        if (currentSection === '인적·학적사항') {
            const gradRow = grid.find(row => row.some(c => c.includes('졸업') && c.includes('중학교')));
            if (gradRow) {
                const text = gradRow.join(' ');
                const match = text.match(/([^\s]+중학교)/);
                if (match) sections.section1_personal_info.middleSchool = match[1];
            }
        }

        // 2. Attendance
        if (currentSection === '출결상황') {
            grid.forEach(row => {
                if (/^[1-3]$/.test(row[0])) {
                    // Safety check: Filter out rows that are likely NOT attendance (e.g., Year data in columns)
                    // If 'days' or 'late' is > 365, it's probably a Year (2022, etc.)
                    const days = parseInt(row[1]) || 0;
                    const late = parseInt(row[3]) || 0;

                    // Also reject if row length is suspicious or contains non-numeric data where numbers are expected
                    if (days > 365 || late > 365) return;

                    sections.section2_attendance.push({
                        grade: parseInt(row[0]),
                        schoolDays: days,
                        days,
                        absent: parseInt(row[2]) || 0,
                        late,
                        early: parseInt(row[4]) || 0,
                        outing: parseInt(row[5]) || 0,
                        special: row[6] || ''
                    });
                }
            });
        }

        // 4. Volunteer Activities
        if (currentSection.includes('봉사활동')) {
            // Relaxed detection: Any table in this section, or check for data rows
            const isVolunteerTable = grid.some(row => {
                const joined = row.join('');
                return joined.includes('학년') || joined.includes('활동') || row.some(c => /^[1-3]$/.test(c));
            });

            if (isVolunteerTable) {
                grid.forEach(row => {
                    const grade = parseInt(row[0]);
                    if (!isNaN(grade)) {

                        let dateOrPeriod = '';
                        let hours = 0;
                        let cumulativeHours = 0;

                        // Strategy: Locate known numeric anchors (Grade, Hours, Cumulative)
                        const numericCols = row.map((c, i) => ({ val: c, idx: i }))
                            .filter(c => /^\d+$/.test(c.val) && c.idx > 0);

                        if (numericCols.length >= 2) {
                            cumulativeHours = parseInt(numericCols[numericCols.length - 1].val);
                            hours = parseInt(numericCols[numericCols.length - 2].val);
                        } else if (numericCols.length === 1) {
                            hours = parseInt(numericCols[0].val);
                        }

                        // Text content is everything between Grade and Hours columns
                        const startIdx = 1;
                        const endIdx = numericCols.length >= 1 ? numericCols[0].idx : row.length;

                        // Join all potential text columns
                        const combinedText = row.slice(startIdx, endIdx).join(' ');

                        // Extract Date/Period: YYYY.MM.DD. (allow spaces)
                        const dateRegex = /(\d{4}\.\s*\d{2}\.\s*\d{2}\.)(\s*[-~]\s*(\d{4}\.\s*\d{2}\.\s*\d{2}\.)?)?/;
                        const dateMatch = combinedText.match(dateRegex);

                        let remainingText = combinedText;

                        if (dateMatch) {
                            dateOrPeriod = dateMatch[0].trim();
                            // Fix fragmented range "YYYY.MM.DD. - YYYY.MM.DD."
                            remainingText = remainingText.replace(dateMatch[0], ' ').trim();
                        }

                        // Extract Institution: (학교)Name
                        // Regex: look for (학교) followed by non-space
                        const instMatch = remainingText.match(/(\(학교\)[^\s]+)/);
                        let institution = '';

                        if (instMatch) {
                            institution = instMatch[1];
                            remainingText = remainingText.replace(institution, ' ').trim();
                        }

                        const activity = remainingText.replace(/\s+/g, ' ').trim();

                        sections.volunteer_activities.push({
                            grade,
                            dateOrPeriod,
                            institution,
                            activity,
                            hours,
                            cumulativeHours
                        });
                    }
                });
                return;
            }
        }

        // 5. Creative Activities
        if (currentSection.includes('창의적 체험활동상황')) {
            grid.forEach(row => {
                const typeIdx = row.findIndex(c => ['자율활동', '동아리활동', '진로활동'].includes(c.replace(/\s+/g, '')));

                if (typeIdx > -1) {
                    let grade = currentGrade;
                    if (typeIdx > 0 && /^[1-3]$/.test(row[0])) {
                        grade = parseInt(row[0]);
                    }

                    const type = row[typeIdx].replace(/\s+/g, '') as '자율활동' | '동아리활동' | '진로활동';
                    const hours = parseInt(row[typeIdx + 1]) || 0;
                    const content = ''; // Legacy text extraction will populate this

                    const exists = sections.section5_creative_activities.some(
                        a => a.grade === grade && a.type === type
                    );

                    if (!exists) {
                        sections.section5_creative_activities.push({
                            grade,
                            type,
                            hours,
                            field: null,
                            content
                        });
                    }
                }
            });
            return;
        }

        // 7. Academic Development (Section 6)
        if (currentSection.includes('교과학습발달상황')) {
            const isGradeTable = grid.some(row => {
                const joined = row.join('');
                return joined.includes('학기') && joined.includes('교과') && joined.includes('과목');
            });

            if (isGradeTable) {
                grid.forEach((row, index) => {
                    if (/^[1-2]$/.test(row[0]) && row[2]) {

                        // Check for merged row candidates
                        const potentialUnzipped = unzipMergedRow(row);
                        const rowsToProcess = potentialUnzipped || [row];

                        rowsToProcess.forEach((pRow) => {
                            const semester = parseInt(pRow[0]);

                            // Helper to normalize subject group names corrupted by multiline splitting
                            const normalizeSubjectGroup = (group: string): string => {
                                const cleanGroup = group.replace(/\s+/g, '');

                                // [Fix] "예술" and "기술・가정..." often merge in OCR
                                // e.g. "예술 기술・가정/제" -> Split and take based on logic, or just handle known fragments
                                if (cleanGroup.includes('예술') && (cleanGroup.includes('기술') || cleanGroup.includes('가정') || cleanGroup.includes('2외국어'))) {
                                    // If this row has valid Art subjects? Hard to know without looking at subject name.
                                    // But typically, if it's merged, the FIRST part is usually the intended one for the top rows,
                                    // or it might be a header row that got confused.
                                    // However, simpler heuristic:
                                    // If subject seems to be Art -> '예술'
                                    // If subject seems to be Tech/Language -> '기술・가정/제2외국어/한문/교양'
                                    // But here we only have the group string.
                                    // Let's rely on strict matching of the "start".
                                    if (group.trim().startsWith('예술')) return '예술';
                                }

                                if (cleanGroup.includes('체육') || cleanGroup.includes('예술')) {
                                    if (cleanGroup.includes('체육')) return '체육';
                                    if (cleanGroup.includes('예술')) return '예술';
                                    return '체육ㆍ예술';
                                }

                                // [Fix] Complex Group: "기술・가정/제2외국어/한문/교양"
                                // Fragments: "기술・가정/제", "2외국어/한문/교양", "기술・가정/제2외국어/한문/교양"
                                if (
                                    cleanGroup.includes('기술') ||
                                    cleanGroup.includes('가정') ||
                                    cleanGroup.includes('2외국어') ||
                                    cleanGroup.includes('한문') ||
                                    cleanGroup.includes('교양')
                                ) {
                                    // Be careful not to match random things, but these keywords are specific enough in this context
                                    return '기술・가정/제2외국어/한문/교양';
                                }

                                if (cleanGroup.includes('국어')) return '국어';
                                if (cleanGroup.includes('수학')) return '수학';
                                if (cleanGroup.includes('영어')) return '영어';
                                if (cleanGroup.includes('한국사')) return '한국사';
                                if (cleanGroup.includes('사회') || cleanGroup.includes('역사') || cleanGroup.includes('도덕')) return '사회(역사/도덕포함)';
                                if (cleanGroup.includes('과학')) return '과학';

                                return group;
                            };

                            let subjectGroup = '';
                            if (pRow.length >= 8) {
                                subjectGroup = pRow[1];
                            } else {
                                if (pRow[1] && !/^\d/.test(pRow[1]) && pRow[1].length > 1) {
                                    subjectGroup = pRow[1];
                                }
                            }

                            // If empty, inherit
                            if (!subjectGroup || subjectGroup.trim() === '' || subjectGroup.trim() === '.') {
                                subjectGroup = currentSubjectGroup;
                            } else {
                                subjectGroup = normalizeSubjectGroup(subjectGroup);
                                currentSubjectGroup = subjectGroup;
                            }

                            const subject = pRow[2];
                            const units = parseInt(pRow[3]) || 0;

                            // Determine Category
                            const groupToCheck = subjectGroup || currentSubjectGroup;
                            let category: 'regular' | 'career' | 'pf' | 'pe_arts' | 'other' = 'regular';

                            if (forceCategory) {
                                category = forceCategory;
                            } else {
                                if (groupToCheck.includes('진로')) category = 'career';
                                else if (groupToCheck.includes('체육') || groupToCheck.includes('예술')) category = 'pe_arts';
                            }

                            // Score Parsing
                            let score = 0;
                            let average = 0;
                            let stdDev = 0;
                            let achievement = '';
                            let students = 0;
                            let rank: number | null = null;

                            const scoreCol = pRow.find(c => c.includes('/') && c.includes('(') && /^\d/.test(c.trim()));
                            // Career subject alternative: Score/Avg followed by Achievement(Students) in same token?
                            // Or Score/Avg with NO StdDev (Career subjects often lack StdDev, just Score/Avg)
                            // e.g. "95/91.5"
                            const simpleScoreCol = !scoreCol && pRow.find(c => /^\d+\.?\d*\/\d+\.?\d*$/.test(c.trim()));

                            if (scoreCol) {
                                // Standard: "90/85.5(12.3)"
                                const parts = scoreCol.split('/');
                                score = parseFloat(parts[0]);
                                if (parts[1]) {
                                    const [a, d] = parts[1].split('(');
                                    average = parseFloat(a);
                                    stdDev = parseFloat(d?.replace(')', '') || '0');
                                }
                            } else if (simpleScoreCol) {
                                // Career: "95/91.5" (mixed in col 4 usually)
                                const [s, a] = simpleScoreCol.split('/');
                                score = parseFloat(s);
                                average = parseFloat(a);
                            } else if (pRow[4]) {
                                // Fallback: extract numbers
                                const matches = pRow[4].match(/\d+(\.\d+)?/g);
                                if (matches) {
                                    if (matches.length >= 1) score = parseFloat(matches[0]);
                                    if (matches.length >= 2) average = parseFloat(matches[1]);
                                    if (matches.length >= 3) stdDev = parseFloat(matches[2]);
                                }
                            }

                            // Achievement & Students Parsing
                            // Standard: "A(237)" -> Ach: A, Stud: 237
                            // Look for pattern [A-E|P](number)
                            const achievementMatch = pRow.find(c => /^[A-E|P](\(\d+\))?$/.test(c.trim()) || c.trim() === 'P');

                            // If merged with score column (e.g. "95/91.5 A(237)")
                            // We might have missed it. Check the score column source again or neighbors.

                            let rawAchievement = achievementMatch;
                            if (!rawAchievement && pRow[4]) {
                                // Check if pRow[4] has achievement info
                                const match = pRow[4].match(/[A-E|P]\(\d+\)/);
                                if (match) rawAchievement = match[0];
                            }

                            if (rawAchievement) {
                                const parts = rawAchievement.split('(');
                                achievement = parts[0];
                                if (parts[1]) {
                                    students = parseInt(parts[1].replace(')', ''));
                                }
                            }

                            // Rank Parsing (Standard subjects only)
                            // Usually in column 6 for 7-column tables
                            // Check for single digit 1-9
                            if (pRow[6] && /^[1-9]$/.test(pRow[6].trim())) {
                                rank = parseInt(pRow[6].trim());
                            } else if (pRow[5] && /^[1-9]$/.test(pRow[5].trim())) {
                                // Sometimes shifted?
                                rank = parseInt(pRow[5].trim());
                            }

                            // Distribution (Career subjects) - e.g. "A(92.0) B(6.8) C(1.3)"
                            let distribution: { A: number, B: number, C: number } | null = null;
                            const distCol = pRow.find(c => c.includes('A(') && c.includes('B(') && c.includes('C('));
                            if (distCol) {
                                // Extract numbers from "A(91.9) B(8.1) C(0.0)"
                                const aMatch = distCol.match(/A\((\d+(\.\d+)?)\)/);
                                const bMatch = distCol.match(/B\((\d+(\.\d+)?)\)/);
                                const cMatch = distCol.match(/C\((\d+(\.\d+)?)\)/);

                                if (aMatch && bMatch && cMatch) {
                                    distribution = {
                                        A: parseFloat(aMatch[1]),
                                        B: parseFloat(bMatch[1]),
                                        C: parseFloat(cMatch[1])
                                    };
                                }
                            }

                            sections.section6_academic_development.push({
                                grade: currentGrade || 0,
                                semester: semester as 1 | 2,
                                category: category,
                                subject_group: subjectGroup,
                                subject: subject.trim(),
                                units,
                                score,
                                average,
                                stdDev,
                                achievement,
                                students,
                                rank,
                                distribution: distribution || null,
                                remarks: '',
                                content: ''
                            });
                        });
                    }
                });
            }
        }

        // 8. Behavior Characteristics
        if (currentSection.includes('행동특성') || grid.some(row => row.includes('행동특성'))) {
            grid.forEach(row => {
                if (/^[1-3]$/.test(row[0]) && row.length >= 2) {
                    sections.section8_behavior_characteristics.push({
                        grade: parseInt(row[0]),
                        content: row[1]
                    });
                }
            });
        }
    };

    // Linear Scan
    let inTable = false;
    for (const line of lines) {
        const trimmed = line.trim();

        // 1. Detect Header
        // Support standard markdown headers (#) or lines starting with a number and containing section keywords
        const isHeader = trimmed.startsWith('#') || /^\d+\.\s+[\w가-힣]+/.test(trimmed);

        if (isHeader) {
            if (inTable) {
                processTable(parseMarkdownTable(tableBuffer));
                tableBuffer = [];
                inTable = false;
            }

            const headerText = trimmed.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, '').trim();

            const gradeMatch = headerText.match(/^\[?(\d)학년\]?$/);
            if (gradeMatch) {
                currentGrade = parseInt(gradeMatch[1]);
                forceCategory = null; // Reset on grade change
            }

            if (headerText.includes('인적') || headerText.includes('학적')) {
                currentSection = '인적·학적사항';
                console.log(`[ParserDebug] Section set to: ${currentSection}`);
            }
            else if (headerText.includes('출결')) currentSection = '출결상황';
            else if (headerText.includes('창의적')) currentSection = '창의적 체험활동상황';
            else if (headerText.includes('수상경력')) currentSection = '수상경력';
            else if (headerText.includes('자격증')) currentSection = '자격증';
            else if (headerText.includes('교과학습')) {
                currentSection = '교과학습발달상황';
                currentSubjectGroup = '공통과목';
                forceCategory = null;
            }
            else if (headerText.replace(/\s+/g, '').includes('봉사활동')) currentSection = '봉사활동실적';
            else if (headerText.includes('독서활동')) currentSection = '독서활동상황';
            else if (headerText.includes('행동특성')) currentSection = '행동특성 및 종합의견';

            // Fix: Detect Subject Group Headers (e.g. # <진로 선택 과목>)
            if (headerText.includes('진로')) {
                currentSubjectGroup = '진로 선택 과목';
                forceCategory = 'career';
            } else if (headerText.includes('체육') || headerText.includes('예술')) {
                currentSubjectGroup = '체육ㆍ예술 과목';
                forceCategory = 'pe_arts';
            }

            continue;
        }

        // 2. Detect Grade in Text
        if (/^\[?(\d)학년\]?$/.test(trimmed)) {
            if (inTable) {
                processTable(parseMarkdownTable(tableBuffer));
                tableBuffer = [];
                inTable = false;
            }
            currentGrade = parseInt(RegExp.$1);
            continue;
        }

        // 3. Detect Table Line
        if (trimmed.startsWith('|')) {
            inTable = true;
            tableBuffer.push(trimmed);
        } else {
            if (inTable) {
                // End of table
                processTable(parseMarkdownTable(tableBuffer));
                tableBuffer = [];
                inTable = false;
            }

            // 4. Detect Subject Group Markers
            if (trimmed.includes('진로 선택 과목')) {
                currentSubjectGroup = '진로 선택 과목';
                forceCategory = 'career';
            } else if (trimmed.includes('체육') && trimmed.includes('예술')) {
                currentSubjectGroup = '체육ㆍ예술 과목';
                forceCategory = 'pe_arts';
            }
        }
    }

    // Flush remaining table
    if (inTable && tableBuffer.length > 0) {
        processTable(parseMarkdownTable(tableBuffer));
    }

    // Deduplicate studentNo logic
    let studentNo = '';
    if (sections.header.gradeInfo.length > 0) {
        const info = sections.header.gradeInfo.length >= 3 ? sections.header.gradeInfo.find(g => g.grade === 3) : sections.header.gradeInfo[sections.header.gradeInfo.length - 1];
        const target = info || sections.header.gradeInfo[0];
        if (target) {
            studentNo = `${target.grade}0${target.class}${target.number.toString().padStart(2, '0')}`;
        }
    }

    console.log(`[ParserDebug] Finished parsing. Name: ${sections.section1_personal_info.name}`);

    return {
        id: uuidv4(),
        studentNo,
        name: sections.section1_personal_info.name,
        status: '미평가',
        totalScore: null,
        majorScore: null,
        attendance: '대기중',
        profileImage: null,
        header: sections.header,
        section1_personal_info: sections.section1_personal_info,
        section2_attendance: sections.section2_attendance,
        section5_creative_activities: sections.section5_creative_activities,
        volunteer_activities: sections.volunteer_activities,
        section6_academic_development: sections.section6_academic_development,
        section8_behavior_characteristics: sections.section8_behavior_characteristics
    };
}

export function parseUpstageMultipleJson(json: UpstageResponse): Student[] {
    const markdown = json.content.markdown || '';

    // Split by the main header that appears for each student
    // Pattern: # 학교생활세부사항기록부(학교생활기록부II)
    // We use a lookahead or just split and filter
    const separator = '# 학교생활세부사항기록부(학교생활기록부II)';
    const parts = markdown.split(separator);

    const students: Student[] = [];

    parts.forEach((part, index) => {
        if (!part.trim()) {
            return;
        }

        // Reconstruct the markdown for this student, adding back the header if it was removed by split
        // (Except maybe the first part if it was empty before the first header)
        // Actually, parseUpstageJson expects the full markdown content. 
        // We should prepend the header so the parser can detect the start if needed, 
        // though the parser logic mostly relies on section headers.
        // Let's reconstruct a valid "mini" markdown document.
        const studentMarkdown = `${separator}\n${part}`;

        // Create a temporary JSON object for the single student
        const studentJson: UpstageResponse = {
            content: {
                ...json.content,
                markdown: studentMarkdown
            }
        };

        try {
            const student = parseUpstageJson(studentJson);
            // Only add if we successfully parsed a name (basic validation)
            if (student.name) {
                students.push(student);
            }
        } catch (e) {
            console.error(`Failed to parse student at index ${index}`, e);
        }
    });

    return students;
}
