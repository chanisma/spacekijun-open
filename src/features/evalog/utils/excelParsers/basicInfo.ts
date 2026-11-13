import { norm, findHeaderRow, constructStudentId } from './utils';

export const parseBasicInfoSheet = (data: any[], fileName: string) => {
    const result: any[] = [];
    let headerRowIndex = findHeaderRow(data, ["성명", "번호"]);
    if (headerRowIndex === -1) return [];

    const headerRow = data[headerRowIndex] as any[];
    const nameIdx = headerRow.findIndex((c: any) => norm(c).includes("성명"));
    const numIdx = headerRow.findIndex((c: any) => norm(c).includes("번호"));

    let fileGrade = '3';
    let fileClass = '5';
    const filenameMatch = fileName.match(/Grade(\d+)_Class(\d+)/);
    if (filenameMatch) {
        fileGrade = filenameMatch[1];
        fileClass = filenameMatch[2];
    }

    let currentName = '';
    let currentNo = '';

    // Specialized Logic for 학적사항 headers
    let hakjeokDateIdx = -1;
    let hakjeokContentIdx = -1;
    if (fileName.includes('학적사항')) {
        hakjeokDateIdx = headerRow.findIndex(c => norm(c).includes("일자"));
        hakjeokContentIdx = headerRow.findIndex(c => norm(c).includes("내용"));
    }

    for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row || row.length === 0) continue;

        if (norm(row[nameIdx]) === "성명") continue;
        if (row.some(c => String(c).includes("샘플고등학교"))) {
            if (!fileName.includes('학적사항')) continue;
        }

        if (row[nameIdx]) currentName = String(row[nameIdx]).trim();
        if (row[numIdx]) currentNo = String(row[numIdx]).trim();

        if (currentName && currentNo) {
            // Validate student number (must be > 0 and numeric)
            const num = parseInt(currentNo.replace(/[^0-9]/g, ''));
            if (isNaN(num) || num === 0) continue;

            const id = constructStudentId(fileGrade, fileClass, currentNo);
            let rowData: any = {};

            if (fileName.includes('학적사항')) {
                const content = hakjeokContentIdx !== -1 ? String(row[hakjeokContentIdx] || '') : '';
                const dateVal = hakjeokDateIdx !== -1 ? String(row[hakjeokDateIdx] || '') : '';

                let admissionYear = null;
                let middleSchool = null;

                // "전입학"/"편입학"/"재입학"도 "입학"을 포함하므로 명시적으로 제외.
                // 전입 연도를 입학년도로 오인하면 excelParser의 ID 채번(entryYear)과
                // 2025 학점제 카테고리 분기가 모두 틀어진다 (전입생 한선우 사례).
                if (
                    content.includes("입학") &&
                    !content.includes("전입") &&
                    !content.includes("편입") &&
                    !content.includes("재입")
                ) {
                    const match = dateVal.match(/20\d{2}/);
                    if (match) admissionYear = parseInt(match[0]);
                }

                if (content.includes("중학교") || content.includes("출신")) {
                    const match = content.match(/[가-힣]+중학교/);
                    middleSchool = match ? match[0] : content.trim();
                }

                if (admissionYear) rowData.admissionYear = admissionYear;
                if (middleSchool) rowData.middleSchool = middleSchool;
                rowData.name = currentName;
            } else {
                // Default mapping for other files
                headerRow.forEach((col, idx) => {
                    if (col && row[idx] !== undefined) rowData[String(col).trim()] = row[idx];
                });
            }

            result.push({
                id,
                name: currentName,
                grade: fileGrade,
                classNum: fileClass,
                studentNo: currentNo,
                source: fileName,
                data: rowData
            });

        }
    }
    return result;
};
