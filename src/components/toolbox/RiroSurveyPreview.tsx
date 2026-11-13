import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ChevronLeft, Printer } from 'lucide-react';

interface SurveyItem {
  questionCategory: string;
  questionName: string;
  selected: boolean;
}

interface StudentSurveyData {
  studentId: string;
  studentName: string;
  surveys: {
    surveyName: string;
    items: SurveyItem[];
  }[];
}

interface RiroSurveyPreviewProps {
  open: boolean;
  studentData: StudentSurveyData[];
  onBack: () => void;
  onClose: () => void;
}

const RiroSurveyPreview: React.FC<RiroSurveyPreviewProps> = ({
  open,
  studentData,
  onBack,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const currentStudent = studentData[selectedIndex];

  const generateStudentReportHtml = (student: StudentSurveyData, isFirstPage: boolean = false) => {
    return `
      <div class="report-page two-columns" style="${!isFirstPage ? 'page-break-before: always;' : ''}">
        <div class="report-header">
          <h1>설문조사 결과</h1>
          <div class="student-info">
            <p><strong>학번:</strong> ${student.studentId}</p>
            <p><strong>이름:</strong> ${student.studentName}</p>
          </div>
        </div>

        <div class="surveys-container">
          ${student.surveys.map((survey, surveyIdx) => {
            // Group items by category
            const groupedItems = new Map<string, typeof survey.items>();
            survey.items.forEach(item => {
              const category = item.questionCategory || '기타';
              if (!groupedItems.has(category)) {
                groupedItems.set(category, []);
              }
              groupedItems.get(category)!.push(item);
            });

            return `
              <div class="survey-section">
                <h2 class="survey-title">${surveyIdx + 1}. ${survey.surveyName}</h2>
                <div class="survey-items">
                  ${survey.items.length > 0 ? Array.from(groupedItems.entries()).map(([category, items]) => `
                    <div class="category-group">
                      <h3 class="category-title">${category}</h3>
                      <div class="category-items">
                        ${items.map((item, itemIdx) => `
                          <div class="survey-item">
                            <span class="item-bullet">•</span>
                            <span class="item-text">${item.questionName}</span>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  `).join('') : '<p class="no-items">선택한 항목이 없습니다.</p>'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  };

  const handlePrintAll = () => {
    // Generate all student reports HTML
    const allReportsHtml = studentData.map((student, index) =>
      generateStudentReportHtml(student, index === 0)
    ).join('');

    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>리로스쿨 설문조사 결과</title>
          <style>
            @page {
              size: A4;
              margin: 20mm;
            }

            @media print {
              @page {
                margin: 20mm;
              }
              body {
                margin: 0;
                padding: 0;
              }
            }

            * {
              box-sizing: border-box;
            }

            body {
              font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
              margin: 0;
              padding: 0;
              color: #000;
              background: #fff;
            }

            .report-page {
              width: 100%;
              min-height: 100%;
              padding: 0;
            }

            /* Two-column layout for overflow content */
            .report-page.two-columns .report-header {
              margin-bottom: 15px;
              padding-bottom: 10px;
            }

            .report-page.two-columns .report-header h1 {
              font-size: 20px;
              margin-bottom: 12px;
            }

            .report-page.two-columns .student-info {
              font-size: 12px;
            }

            .report-page.two-columns .surveys-container {
              column-count: 2;
              column-gap: 20px;
              column-fill: auto;
            }

            .report-page.two-columns .survey-section {
              break-inside: avoid;
              page-break-inside: avoid;
              margin-bottom: 15px;
            }

            .report-page.two-columns .survey-title {
              font-size: 13px;
              padding: 6px 10px;
              margin-bottom: 8px;
            }

            .report-page.two-columns .category-group {
              margin-bottom: 10px;
            }

            .report-page.two-columns .category-title {
              font-size: 12px;
              margin-bottom: 6px;
              padding: 3px 0;
            }

            .report-page.two-columns .survey-item {
              font-size: 11px;
              margin-bottom: 4px;
              padding: 3px 0;
              line-height: 1.4;
            }

            .report-page.two-columns .item-bullet {
              min-width: 15px;
            }

            .report-header {
              margin-bottom: 20px;
              padding-bottom: 15px;
              border-bottom: 2px solid #000;
            }

            .report-header h1 {
              font-size: 24px;
              font-weight: bold;
              margin: 0 0 15px 0;
              text-align: center;
            }

            .student-info {
              display: flex;
              gap: 20px;
              justify-content: center;
              font-size: 14px;
            }

            .student-info p {
              margin: 0;
            }

            .student-info strong {
              font-weight: 600;
            }

            .surveys-container {
              margin-top: 20px;
            }

            .survey-section {
              margin-bottom: 25px;
              page-break-inside: avoid;
            }

            .survey-title {
              font-size: 16px;
              font-weight: bold;
              margin: 0 0 12px 0;
              padding: 8px 12px;
              background-color: #f5f5f5;
              border-left: 4px solid #333;
            }

            .survey-items {
              padding-left: 10px;
            }

            .category-group {
              margin-bottom: 15px;
              page-break-inside: avoid;
            }

            .category-title {
              font-size: 14px;
              font-weight: bold;
              margin: 0 0 8px 0;
              padding: 4px 0;
              border-bottom: 1px solid #ccc;
              color: #333;
            }

            .category-items {
              padding-left: 10px;
            }

            .survey-item {
              display: flex;
              align-items: flex-start;
              margin-bottom: 6px;
              padding: 4px 0;
              font-size: 13px;
              line-height: 1.6;
            }

            .item-bullet {
              display: inline-block;
              min-width: 20px;
              font-weight: 600;
              color: #555;
            }

            .item-text {
              flex: 1;
            }

            .no-items {
              padding: 10px;
              color: #999;
              font-style: italic;
              font-size: 13px;
            }

            @media print {
              .report-header {
                border-bottom: 2px solid #000 !important;
              }

              .survey-title {
                background-color: #f5f5f5 !important;
                border-left: 4px solid #333 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              .category-title {
                border-bottom: 1px solid #ccc !important;
              }
            }
          </style>
        </head>
        <body>
          ${allReportsHtml}
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handlePrintCurrent = () => {
    // Generate only current student's report HTML
    const currentReportHtml = generateStudentReportHtml(currentStudent, true);

    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>리로스쿨 설문조사 결과 - ${currentStudent.studentName}</title>
          <style>
            @page {
              size: A4;
              margin: 20mm;
            }

            @media print {
              @page {
                margin: 20mm;
              }
              body {
                margin: 0;
                padding: 0;
              }
            }

            * {
              box-sizing: border-box;
            }

            body {
              font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
              margin: 0;
              padding: 0;
              color: #000;
              background: #fff;
            }

            .report-page {
              width: 100%;
              min-height: 100%;
              padding: 0;
            }

            /* Two-column layout for overflow content */
            .report-page.two-columns .report-header {
              margin-bottom: 15px;
              padding-bottom: 10px;
            }

            .report-page.two-columns .report-header h1 {
              font-size: 20px;
              margin-bottom: 12px;
            }

            .report-page.two-columns .student-info {
              font-size: 12px;
            }

            .report-page.two-columns .surveys-container {
              column-count: 2;
              column-gap: 20px;
              column-fill: auto;
            }

            .report-page.two-columns .survey-section {
              break-inside: avoid;
              page-break-inside: avoid;
              margin-bottom: 15px;
            }

            .report-page.two-columns .survey-title {
              font-size: 13px;
              padding: 6px 10px;
              margin-bottom: 8px;
            }

            .report-page.two-columns .category-group {
              margin-bottom: 10px;
            }

            .report-page.two-columns .category-title {
              font-size: 12px;
              margin-bottom: 6px;
              padding: 3px 0;
            }

            .report-page.two-columns .survey-item {
              font-size: 11px;
              margin-bottom: 4px;
              padding: 3px 0;
              line-height: 1.4;
            }

            .report-page.two-columns .item-bullet {
              min-width: 15px;
            }

            .report-header {
              margin-bottom: 20px;
              padding-bottom: 15px;
              border-bottom: 2px solid #000;
            }

            .report-header h1 {
              font-size: 24px;
              font-weight: bold;
              margin: 0 0 15px 0;
              text-align: center;
            }

            .student-info {
              display: flex;
              gap: 20px;
              justify-content: center;
              font-size: 14px;
            }

            .student-info p {
              margin: 0;
            }

            .student-info strong {
              font-weight: 600;
            }

            .surveys-container {
              margin-top: 20px;
            }

            .survey-section {
              margin-bottom: 25px;
              page-break-inside: avoid;
            }

            .survey-title {
              font-size: 16px;
              font-weight: bold;
              margin: 0 0 12px 0;
              padding: 8px 12px;
              background-color: #f5f5f5;
              border-left: 4px solid #333;
            }

            .survey-items {
              padding-left: 10px;
            }

            .category-group {
              margin-bottom: 15px;
              page-break-inside: avoid;
            }

            .category-title {
              font-size: 14px;
              font-weight: bold;
              margin: 0 0 8px 0;
              padding: 4px 0;
              border-bottom: 1px solid #ccc;
              color: #333;
            }

            .category-items {
              padding-left: 10px;
            }

            .survey-item {
              display: flex;
              align-items: flex-start;
              margin-bottom: 6px;
              padding: 4px 0;
              font-size: 13px;
              line-height: 1.6;
            }

            .item-bullet {
              display: inline-block;
              min-width: 20px;
              font-weight: 600;
              color: #555;
            }

            .item-text {
              flex: 1;
            }

            .no-items {
              padding: 10px;
              color: #999;
              font-style: italic;
              font-size: 13px;
            }

            @media print {
              .report-header {
                border-bottom: 2px solid #000 !important;
              }

              .survey-title {
                background-color: #f5f5f5 !important;
                border-left: 4px solid #333 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              .category-title {
                border-bottom: 1px solid #ccc !important;
              }
            }
          </style>
        </head>
        <body>
          ${currentReportHtml}
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  if (!currentStudent) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle>설문조사 결과 미리보기</DialogTitle>
          {studentData.length > 1 && (
            <Select
              value={selectedIndex.toString()}
              onValueChange={(value) => setSelectedIndex(parseInt(value))}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {studentData.map((student, idx) => (
                  <SelectItem key={idx} value={idx.toString()}>
                    {student.studentId} - {student.studentName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-gray-50 p-4 rounded">
          <div
            className="bg-white p-12 mx-auto shadow-sm"
            style={{ width: '210mm', minHeight: '297mm' }}
          >
            {/* Header */}
            <div className="mb-8 pb-6 border-b-2 border-black">
              <h1 className="text-2xl font-bold text-center mb-6">설문조사 결과</h1>
              <div className="flex justify-center gap-8 text-sm">
                <p>
                  <strong>학번:</strong> {currentStudent.studentId}
                </p>
                <p>
                  <strong>이름:</strong> {currentStudent.studentName}
                </p>
              </div>
            </div>

            {/* Surveys */}
            <div className="space-y-8">
              {currentStudent.surveys.map((survey, surveyIdx) => {
                // Group items by category
                const groupedItems = new Map<string, typeof survey.items>();
                survey.items.forEach(item => {
                  const category = item.questionCategory || '기타';
                  if (!groupedItems.has(category)) {
                    groupedItems.set(category, []);
                  }
                  groupedItems.get(category)!.push(item);
                });

                return (
                  <div key={surveyIdx} className="break-inside-avoid">
                    <h2 className="text-base font-bold mb-3 p-2 pl-3 bg-gray-100 border-l-4 border-gray-800">
                      {surveyIdx + 1}. {survey.surveyName}
                    </h2>
                    <div className="pl-3">
                      {survey.items.length > 0 ? (
                        Array.from(groupedItems.entries()).map(([category, items], catIdx) => (
                          <div key={catIdx} className="mb-4 break-inside-avoid">
                            <h3 className="text-sm font-bold mb-2 pb-1 border-b border-gray-300">
                              {category}
                            </h3>
                            <div className="pl-2">
                              {items.map((item, itemIdx) => (
                                <div
                                  key={itemIdx}
                                  className="flex items-start mb-1.5 py-1 text-sm leading-relaxed"
                                >
                                  <span className="inline-block min-w-[20px] font-semibold text-gray-600">
                                    •
                                  </span>
                                  <span className="flex-1">{item.questionName}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-400 italic py-2">
                          선택한 항목이 없습니다.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            이전
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrintCurrent}>
              <Printer className="h-4 w-4 mr-2" />
              현재 학생 출력
            </Button>
            <Button onClick={handlePrintAll}>
              <Printer className="h-4 w-4 mr-2" />
              전체 출력 ({studentData.length}건)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RiroSurveyPreview;
