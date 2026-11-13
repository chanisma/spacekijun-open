import { norm, findHeaderRow, constructStudentId } from './utils';
import { StudentBasicInfo, StudentActivity } from '../../types/excelTypes';

export const parseSeTeukSheet = (data: any[], fileName: string, studentsMap: Map<string, StudentBasicInfo>, studentSubjects?: Map<string, Map<string, { grade: number, category: string }>>): StudentActivity[] => {
    // Note: findHeaderRow normalizes the row data but not the keywords. 
    // We must pass normalized keywords (no spaces).
    let headerRowIndex = findHeaderRow(data, ["세부능력및특기사항"]);
    if (headerRowIndex === -1) return;

    // Helper to get indices
    const getIdx = (row: any[]) => {
        const find = (keywords: string[]) => {
            let idx = row.findIndex((c: any) => keywords.includes(norm(c)));
            if (idx !== -1) return idx;
            return row.findIndex((c: any) => keywords.some(k => norm(c).includes(k)));
        };
        return {
            name: find(["성명", "이름"]),
            num: find(["번호"]),
            grade: find(["학년"]),
            content: find(["세부능력", "특기사항", "세부능력 및 특기사항"]),
            subject: find(["과목"]) // Added explicit subject detection
        };
    };

    let idx = getIdx(data[headerRowIndex] as any[]);

    // Check prev row for name/num if not found
    if (idx.name === -1 && headerRowIndex > 0) {
        const prev = data[headerRowIndex - 1] as any[];
        if (prev) {
            const pIdx = getIdx(prev);
            if (pIdx.name !== -1) idx.name = pIdx.name;
            if (pIdx.num !== -1) idx.num = pIdx.num;
        }
    }

    let fileGrade = '3'
    let fileClass = '5';
    const filenameMatch = fileName.match(/Grade(\d+)_Class(\d+)/);
    if (filenameMatch) {
        fileGrade = filenameMatch[1];
        fileClass = filenameMatch[2];
    }

    let currentName = '';
    let currentNo = '';
    let currentGrade = parseInt(fileGrade);

    // Map: StudentID -> { info, blocks: { grade: number, lines: string[] }[] }
    // Map: StudentID -> { info, blocks: { grade: number, lines: string[], explicitSubject?: string }[] }
    const studentContent = new Map<string, { info: any, blocks: { grade: number, lines: string[], explicitSubject?: string }[] }>();

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row || row.length === 0) continue;

        const rowNorm = row.map(norm);

        // 2025-12-13: Extract Explicit Subject if column exists
        let explicitSubjectVar: string | undefined = undefined;
        const val = (idx: number) => (idx !== -1 && row[idx] !== undefined && row[idx] !== null) ? row[idx] : null;
        let subjectCol = idx.subject !== -1 ? String(val(idx.subject) || '').trim() : '';

        // 1. Dynamic Header/Section Check
        if (rowNorm.some(s => s.includes('세부능력') && s.includes('특기사항'))) {
            const newIdx = getIdx(row);
            if (newIdx.content !== -1) {
                idx = newIdx;
                // Reset section if new header found? Usually implies new page or table.
                // But keep isCareerSection if page break? Typically new table means reset.
                // FIX: NEIS files have Title -> Header. Resetting here kills the flag set by the Title just before.
                // We should NOT reset here. We rely on the Titles to switch modes.
            }
            continue;
        }

        if (rowNorm.some(s => s.includes('샘플고등학교'))) continue;
        // Skip class/grade header rows (e.g., "1학년 1반")
        if (rowNorm.some(s => /^\d+학년\d+반$/.test(s))) continue;

        // Identity
        let rowName = '';
        let rowNo = '';
        if (idx.name !== -1 && row[idx.name]) rowName = String(row[idx.name]).trim();
        if (idx.num !== -1 && row[idx.num]) rowNo = String(row[idx.num]).trim();
        // Reject rowNo containing Korean characters (e.g., "1학년 1반" misread as number)
        if (rowNo && /[가-힣]/.test(rowNo)) rowNo = '';

        if (rowName) currentName = rowName;
        if (rowNo) currentNo = rowNo;

        if (!currentNo) continue;
        const num = parseInt(currentNo.replace(/[^0-9]/g, ''));
        if (isNaN(num) || num === 0) continue;

        const id = constructStudentId(fileGrade, fileClass, currentNo);

        let subjectsMap = undefined;
        let normalizedSubjectsMap = new Map<string, string>(); // NormSubject -> OriginalSubject

        if (studentSubjects && studentSubjects.has(id)) {
            subjectsMap = studentSubjects.get(id);
            if (subjectsMap) {
                subjectsMap.forEach((_, key) => {
                    normalizedSubjectsMap.set(norm(key), key);
                });
            }
        }

        if (!studentContent.has(id)) {
            studentContent.set(id, {
                info: {
                    id,
                    name: currentName,
                    grade: currentGrade,
                    classNum: parseInt(fileClass),
                    studentNo: currentNo,
                    source: fileName
                },
                blocks: []
            });
        }

        const entry = studentContent.get(id)!;
        if (rowName) entry.info.name = rowName;

        // val declared at top

        // Extract Grade from Row
        // Sticky Grade Logic: Update currentGrade if explicit grade is found
        if (idx.grade !== -1 && row[idx.grade]) {
            const g = parseInt(String(row[idx.grade]).replace(/[^0-9]/g, ''));
            if (!isNaN(g) && g > 0) {
                currentGrade = g;
            }
        }
        let rowGrade = currentGrade;

        let content = val(idx.content) ? String(val(idx.content)).trim() : '';
        // Extract Subject Column if present
        // (subjectCol and explicitSubjectVar declared at top)

        if (subjectCol) {
            // FIRST: Check if subject column contains merged content (subject:content)
            // NEIS 체육·예술/과학탐구실험 section has 5-column header but 4-column data,
            // so col[3] contains "과학탐구실험1·과학탐구실험2: content..." instead of just a subject name.
            // Detect this BEFORE combined subject pre-processing to avoid false explicit subject assignment.
            if (subjectCol.includes(':') && subjectCol.length > 30) {
                if (!content) {
                    content = subjectCol;
                }
                explicitSubjectVar = undefined;
            } else {
                // Normal subject column: contains only a subject name
                let cleanSubjectName = subjectCol;
                // Handle combined subjects for specific subjects only
                // (e.g., 공통국어1·공통국어2 → 공통국어1)
                if (cleanSubjectName.includes('·') || cleanSubjectName.includes('・')) {
                    const combinablePrefixes = ['공통국어', '공통영어', '공통수학', '통합사회', '통합과학', '한국사', '과학탐구실험'];
                    const firstPart = cleanSubjectName.split(/[·・]/)[0].trim();
                    if (combinablePrefixes.some(p => firstPart.startsWith(p))) {
                        cleanSubjectName = firstPart;
                    }
                }
                const normCol = norm(cleanSubjectName);

                if (normalizedSubjectsMap.has(normCol)) {
                    cleanSubjectName = normalizedSubjectsMap.get(normCol)!;
                    explicitSubjectVar = cleanSubjectName;
                } else {
                    if (subjectCol.includes(':') || subjectCol.length > 30) {
                        if (!content) {
                            content = subjectCol;
                        }
                        explicitSubjectVar = undefined;
                    } else {
                        explicitSubjectVar = cleanSubjectName;
                    }
                }
            }
        }

        if (content || explicitSubjectVar) {
            const blocks = entry.blocks;

            // Logic to determine if we should start a new block
            // 1. First block
            // 2. Grade change
            // 3. Explicit Subject change (or presence of new explicit subject)

            let shouldStartNewBlock = false;

            if (blocks.length === 0) {
                shouldStartNewBlock = true;
            } else {
                const lastBlock = blocks[blocks.length - 1];
                if (lastBlock.grade !== rowGrade) {
                    shouldStartNewBlock = true;
                } else if (explicitSubjectVar) {
                    // If there IS an explicit subject in this row, checks if it matches the last block's explicit subject.
                    // If it's different, or the last block had no explicit subject, start new.
                    if (lastBlock.explicitSubject !== explicitSubjectVar) {
                        shouldStartNewBlock = true;
                    }
                }
            }

            if (shouldStartNewBlock) {
                blocks.push({
                    grade: rowGrade,
                    lines: content ? [content] : [],
                    explicitSubject: explicitSubjectVar
                });
            } else {
                // Merge into last block
                const lastBlock = blocks[blocks.length - 1];
                if (content) lastBlock.lines.push(content);
            }
        }
    }

    // Capture escapeRegex helper
    const escapeRegex = (string: string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    const parsedActivities: StudentActivity[] = [];

    // Post-process: Split by Subject per Block and Direct Merge
    studentContent.forEach((entry) => {
        const { info, blocks } = entry;
        const student = studentsMap.get(info.id);

        if (!student || !student.academic_development) return; // Cannot merge if no student or no headers

        // let subjectsMap = studentSubjects?.get(info.id); // Already retrieved in loop?
        // Wait, the loop above was 'for row in data'. studentContent is aggregated.
        // This post-processing is OUTSIDE the row loop.
        // So we need to retrieve subjectsMap again here for the processed student content.
        let subjectsMap = studentSubjects?.get(info.id);
        const normalizedMap = new Map<string, string>();
        if (subjectsMap) {
            subjectsMap.forEach((_, key) => normalizedMap.set(norm(key), key));
        }

        // Track which subjects are found for debugging
        const foundSubjects = new Set<string>();

        // Process each BLOCK independently (a block is a contiguous set of rows for the SAME GRADE)
        blocks.forEach(block => {
            const rawContent = block.lines.join('');
            const thisGrade = block.grade;

            if (!rawContent) return;

            // 2025-12-13 Explicit Subject Support
            if (block.explicitSubject) {
                // Check if content contains other subject delimiters (embedded subjects)
                let hasEmbeddedSubjects = false;
                if (subjectsMap && subjectsMap.size > 0) {
                    for (const [subjName] of subjectsMap) {
                        if (subjName !== block.explicitSubject && rawContent.includes(`${subjName}:`)) {
                            hasEmbeddedSubjects = true;
                            break;
                        }
                    }
                }

                if (!hasEmbeddedSubjects) {
                    // No embedded subjects: all content goes to explicit subject
                    const text = rawContent;
                    const subj = block.explicitSubject;
                    const grade = thisGrade;
                    const semester: number | undefined = undefined;

                    const subjInfo = subjectsMap?.get(subj);
                    const category = (subjInfo && subjInfo.category) ? subjInfo.category : 'regular';

                    foundSubjects.add(subj);
                    parsedActivities.push({
                        id: info.id,
                        studentId: info.id,
                        name: info.name,
                        category: category,
                        subject_name: subj,
                        content: text,
                        grade: grade,
                        semester: semester,
                        source: fileName,
                        classNum: info.classNum,
                        studentNo: info.studentNo
                    });

                    // Direct Merge Logic
                    if (student.academic_development) {
                        let target = student.academic_development.find((rec: any) =>
                            rec.subject === subj &&
                            (grade ? rec.grade === grade : true)
                        );
                        if (target) {
                            target.content = text;
                        }
                    }
                    return;
                }
                // Embedded subjects found: prepend explicit subject as delimiter,
                // then fall through to regex split below
            }

            let chunks: string[] = [];

            // If falling through from explicit subject with embedded subjects,
            // prepend the explicit subject name as a delimiter
            const contentForSplit = block.explicitSubject
                ? `${block.explicitSubject}:${rawContent}`
                : rawContent;

            // Pre-process: Replace combined subjects with first subject only
            const combinablePrefixes = ['공통국어', '공통영어', '공통수학', '통합사회', '통합과학', '한국사', '과학탐구실험'];
            let processedContent = contentForSplit;
            for (const prefix of combinablePrefixes) {
                const combineRegex = new RegExp(
                    `(${escapeRegex(prefix)}\\d+)\\s*[·・]\\s*${escapeRegex(prefix)}\\d+`,
                    'g'
                );
                processedContent = processedContent.replace(combineRegex, '$1');
            }

            if (subjectsMap && subjectsMap.size > 0) {
                const sortedSubjects = Array.from(subjectsMap.keys()).sort((a, b) => b.length - a.length);
                // Create flexible regex pattern: replace spaces in subject name with \s* to match any spacing
                const subjectPattern = sortedSubjects.map(s => escapeRegex(s).replace(/\s+/g, '\\s*')).join('|');

                // 2026-08-31: 과목명 앞이 마침표·개행·공백일 때만 경계로 보던 제약을 없앴다.
                // 원문이 문장 부호 없이 바로 이어지거나(`…배려도 보임인간과 철학:`)
                // 이물질 문자가 끼면(`…생임. ㄹ정보:`, `ㄴㅇㄻㄴㅇㄹ체육1:`) 경계를 놓쳐
                // 그 과목 세특이 **앞 과목에 통째로 흡수**됐다(라이브 실측 10건/8명).
                // subjectPattern 은 이미 "그 학생이 수강한 과목명"으로 좁혀져 있어
                // 본문 중 우연한 일치 위험이 낮다 — 전수 재파싱으로 회귀 검증함.
                const regex = new RegExp(`\\s*((?:\\(\\d+학기\\))?\\s*(?:${subjectPattern})):(?![\\d])`, 'g');
                chunks = processedContent.split(regex);
            } else {
                const regex = /(?:(?<=[\.\n])|^)\s*([^:\.\n]*[^\d:\.\n][^:\.\n]*):(?!\d)/;
                chunks = processedContent.split(regex);
            }

            // Iterate chunks and find matches in student.academic_development
            for (let k = 1; k < chunks.length; k += 2) {
                let fullSubj = chunks[k].trim();
                let semester: number | undefined = undefined;

                // Extract semester if present
                const semMatch = fullSubj.match(/^\((\d+)학기\)/);
                if (semMatch) {
                    semester = parseInt(semMatch[1]);
                    fullSubj = fullSubj.replace(/^\(\d+학기\)\s*/, '');
                }

                const text = (chunks[k + 1] || '').trim();

                const rawSubj = fullSubj.trim();
                let subj = rawSubj;
                if (normalizedMap.has(norm(rawSubj))) {
                    subj = normalizedMap.get(norm(rawSubj))!;
                }

                if (subj && text) {
                    foundSubjects.add(subj);
                    const grade = thisGrade;

                    // Use category from Academic Record if available, otherwise default to 'regular'
                    const subjInfo = subjectsMap?.get(subj);
                    const category = (subjInfo && subjInfo.category) ? subjInfo.category : 'regular';

                    parsedActivities.push({
                        id: info.id,
                        studentId: info.id,
                        name: info.name,
                        category: category,
                        subject_name: subj,
                        content: text,
                        grade: grade,
                        semester: semester,
                        source: fileName,
                        classNum: info.classNum,
                        studentNo: info.studentNo
                    });

                    // Direct Merge Logic
                    // 기본적으로는 subject와 grade만 맞으면 Merge. 간혹 semester가 등록된 과목의 경우 semester까지 고려해서 Merge
                    let target = student.academic_development?.find((rec: any) =>
                        rec.subject === subj &&
                        (grade ? rec.grade === grade : true) &&
                        (semester ? rec.semester === semester : true)
                    );

                    // Fallback: Relax matching if strict semester match fails
                    // (e.g., Academic Record has semester=1 default, but SeTeuk says semester=2)
                    if (!target && semester) {
                        target = student.academic_development?.find((rec: any) =>
                            rec.subject === subj &&
                            (grade ? rec.grade === grade : true)
                        );
                    }

                    if (target) {
                        target.content = text;
                        // User request: "academic의 category를 바꾸면 안됨"
                        // So we strictly DO NOT update category here.
                    }
                }
            }
        });

        // Debug: Log subjects in studentSubjects but not found in SeTeuk
        if (subjectsMap && subjectsMap.size > 0) {
            const missingSubjects: string[] = [];
            subjectsMap.forEach((subjInfo, subject) => {
                if (!foundSubjects.has(subject)) {
                    // Check which block contains this subject
                    let blockInfo = '없음';
                    for (let bi = 0; bi < blocks.length; bi++) {
                        const blockContent = blocks[bi].lines.join('');
                        if (blockContent.includes(subject)) {
                            const ctx = blockContent.substring(
                                Math.max(0, blockContent.indexOf(subject) - 20),
                                blockContent.indexOf(subject) + subject.length + 30
                            );
                            blockInfo = `블록${bi}(explicit=${blocks[bi].explicitSubject || 'none'}) "...${ctx}..."`;
                            break;
                        }
                    }
                    missingSubjects.push(`${subject} (${subjInfo.category}) → ${blockInfo}`);
                }
            });
            if (missingSubjects.length > 0) {
                console.log(`[SeTeuk] ${info.name} - 미발견 과목:`, missingSubjects);
                console.log(`[SeTeuk] ${info.name} - 블록 구조:`, blocks.map((b, i) =>
                    `블록${i}: explicit=${b.explicitSubject || 'none'}, grade=${b.grade}, lines=${b.lines.length}, 길이=${b.lines.join('').length}`
                ));
            }
        }
    });

    return parsedActivities;
};
