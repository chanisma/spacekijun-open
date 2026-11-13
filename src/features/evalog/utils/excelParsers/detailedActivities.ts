import { norm, findHeaderRow, constructStudentId } from './utils';
import { StudentActivity } from '../../types/excelTypes';

export const parseDetailedActivitiesSheet = (data: any[], fileName: string): StudentActivity[] => {
    const result: StudentActivity[] = [];
    let mainHeaderIndex = findHeaderRow(data, ["성명", "번호"]);
    if (mainHeaderIndex === -1) return [];

    const mainHeader = data[mainHeaderIndex] as string[];
    const nameIdx = mainHeader.findIndex(c => norm(c).includes("성명"));
    const numIdx = mainHeader.findIndex(c => norm(c).includes("번호"));

    let subHeaderIndex = -1;
    let subHeader: string[] = [];

    for (let i = mainHeaderIndex + 1; i < Math.min(mainHeaderIndex + 5, data.length); i++) {
        const row = data[i] as string[];
        if (!row) continue;

        // Loose check for others
        if (row.some(c => norm(c).includes("특기사항") || norm(c).includes("영역") || norm(c).includes("과목"))) {
            subHeaderIndex = i;
            subHeader = row;
            break;
        }
    }

    if (subHeaderIndex === -1) {
        console.warn(`Sub-header not found in ${fileName}`);
        return [];
    }

    const areaIdx = subHeader.findIndex(c => norm(c).includes("영역"));
    const subjectIdx = subHeader.findIndex(c => norm(c).includes("과목"));
    const contentIdx = subHeader.findIndex(c => norm(c).includes("특기사항"));
    const timeIdx = subHeader.findIndex(c => norm(c).includes("시간"));

    let fileGrade = '3';
    let fileClass = '5';
    const filenameMatch = fileName.match(/Grade(\d+)_Class(\d+)/);
    if (filenameMatch) {
        fileGrade = filenameMatch[1];
        fileClass = filenameMatch[2];
    }

    let currentName = '';
    let currentNo = '';
    let lastRecord: any = null;

    for (let i = subHeaderIndex + 1; i < data.length; i++) {
        const row = data[i] as any[];
        if (!row || row.length === 0) continue;

        // Skip repeated headers
        if (row.some(c => norm(c) === "성명") && row.some(c => norm(c) === "번호")) continue;

        if (norm(row[nameIdx]) === "성명" || (contentIdx !== -1 && norm(row[contentIdx]) === "특기사항")) continue;
        if (row.some(c => String(c).includes("샘플고등학교"))) continue;

        if (row[nameIdx]) currentName = String(row[nameIdx]).trim();
        if (row[numIdx]) currentNo = String(row[numIdx]).trim();

        if (!currentName) continue;

        // Validate student number (must be > 0 and numeric)
        const num = parseInt(currentNo.replace(/[^0-9]/g, ''));
        if (isNaN(num) || num === 0) continue;

        const id = constructStudentId(fileGrade, fileClass, currentNo);

        const area = areaIdx !== -1 ? row[areaIdx] : null;
        const subject = subjectIdx !== -1 ? row[subjectIdx] : null;
        const content = contentIdx !== -1 ? row[contentIdx] : null;
        const time = timeIdx !== -1 ? row[timeIdx] : null;

        if (!content && !area && !subject) continue;

        const isSameStudent = lastRecord && lastRecord.id === id;
        const isSameArea = lastRecord && lastRecord.data['영역'] === area;
        const isSameSubject = lastRecord && lastRecord.data['과목'] === subject;
        const isSameTime = lastRecord && String(lastRecord.data['시간']) === String(time);

        if (isSameStudent && (isSameArea || isSameSubject) && isSameTime) {
            if (content) {
                lastRecord.content += content;
            }
        } else {
            const rowData: any = {};
            if (area) rowData['영역'] = area;
            if (subject) rowData['과목'] = subject;
            if (time) rowData['시간'] = time;

            let category = 'Unknown';
            if (area) {
                category = area;
            } else if (fileName.includes('창의적체험활동')) {
                category = '창의적체험활동';
            }

            lastRecord = {
                id,
                name: currentName,
                category,
                subject_name: subject,
                content: content || '',
                grade: parseInt(fileGrade),
                semester: 1,
                source: fileName,
                data: rowData
            };
            result.push(lastRecord);
        }
    }
    return result;
}
