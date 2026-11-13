import React, { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ChevronLeft, Printer } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useProfile } from '../../hooks/useProfile';

interface Student {
  id: string;
  name: string;
  meta: {
    grade: number;
    class: number;
    number: number;
  };
}

interface AbsenceReportData {
  student: Student;
  startDate: string;
  endDate: string;
  reasonType: string;
  reasonDetail?: string;
  parentName?: string;
  doctorCertificate?: boolean;
}

interface CheckboxState {
  // 사유 체크박스
  reasonType: 'illness' | 'recognition';  // 질병 결석 또는 인정 (단일 선택)
  illness2Days: {
    teacherConfirm: boolean;
    parentOpinion: boolean;
    medicalConfirm: boolean;
    prescription: boolean;
    other: boolean;
  };
  illness3Days: {
    doctorOpinion: boolean;
    medicalConfirm: boolean;
    other: boolean;
  };
  regularExam: boolean;
  menstrualPain: {
    absence: boolean;
    late: boolean;
    earlyLeave: boolean;
    classAbsence: boolean;
  };
  recognition: {
    teacherConfirm: boolean;
    parentOpinion: boolean;
  };
  optional: {
    parentOpinion: boolean;
    teacherConfirm: boolean;
  };
}

interface TextInputState {
  reason: string;  // 사유 입력
  period: string;  // 교시 입력
}

interface AbsenceReportPreviewProps {
  open: boolean;
  reports: AbsenceReportData[];
  onBack: () => void;
  onClose: () => void;
}

const getInitialCheckboxState = (report: AbsenceReportData): CheckboxState => {
  const daysCount = differenceInDays(new Date(report.endDate), new Date(report.startDate)) + 1;
  const days = daysCount > 0 ? daysCount : 1;

  return {
    reasonType: report.reasonType === '인정' ? 'recognition' : 'illness',
    illness2Days: {
      teacherConfirm: report.reasonType === '질병' && days <= 2,
      parentOpinion: report.reasonType === '학부모 의견서',
      medicalConfirm: report.reasonType === '진료확인서',
      prescription: report.reasonType === '처방전',
      other: report.reasonType === '기타',
    },
    illness3Days: {
      doctorOpinion: report.doctorCertificate || false,
      medicalConfirm: false,
      other: false,
    },
    regularExam: false,
    menstrualPain: {
      absence: false,
      late: false,
      earlyLeave: false,
      classAbsence: false,
    },
    recognition: {
      teacherConfirm: report.reasonType === '인정',
      parentOpinion: false,
    },
    optional: {
      parentOpinion: false,
      teacherConfirm: false,
    },
  };
};

const AbsenceReportPreview: React.FC<AbsenceReportPreviewProps> = ({
  open,
  reports,
  onBack,
  onClose
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [checkboxStates, setCheckboxStates] = useState<CheckboxState[]>(() =>
    reports.map(getInitialCheckboxState)
  );
  const [textInputs, setTextInputs] = useState<TextInputState[]>(() =>
    reports.map(() => ({ reason: '', period: '' }))
  );
  const { profile } = useProfile();

  const currentReport = reports[selectedIndex];
  const currentCheckboxState = checkboxStates[selectedIndex] || getInitialCheckboxState(currentReport);
  const currentTextInput = textInputs[selectedIndex] || { reason: '', period: '' };

  // 담임교사 확인서 체크박스 중 하나라도 체크되었는지 확인
  const isTeacherConfirmChecked = currentCheckboxState.illness2Days.teacherConfirm ||
                                   currentCheckboxState.recognition.teacherConfirm;
  const teacherName = isTeacherConfirmChecked ? (profile?.name || '') : '';

  const updateCheckboxState = (updates: Partial<CheckboxState>) => {
    setCheckboxStates(prev => {
      const newStates = [...prev];
      newStates[selectedIndex] = { ...newStates[selectedIndex], ...updates };
      return newStates;
    });
  };

  const updateTextInput = (field: keyof TextInputState, value: string) => {
    setTextInputs(prev => {
      const newStates = [...prev];
      newStates[selectedIndex] = { ...newStates[selectedIndex], [field]: value };
      return newStates;
    });
  };

  const toggleCheckbox = (section: keyof CheckboxState, field?: string) => {
    const currentState = currentCheckboxState[section];

    if (section === 'reasonType') {
      // 질병/인정은 라디오 버튼처럼 동작
      const newValue = currentCheckboxState.reasonType === 'illness' ? 'recognition' : 'illness';
      updateCheckboxState({ reasonType: newValue });
    } else if (typeof currentState === 'boolean') {
      updateCheckboxState({ [section]: !currentState } as Partial<CheckboxState>);
    } else if (field && typeof currentState === 'object') {
      updateCheckboxState({
        [section]: { ...currentState, [field]: !currentState[field as keyof typeof currentState] }
      } as Partial<CheckboxState>);
    }
  };

  const toggleReasonType = (type: 'illness' | 'recognition') => {
    updateCheckboxState({ reasonType: type });
  };

  const handlePrint = () => {
    // 모든 학생의 결석 신고서를 생성
    const allReportsHtml = reports.map((report, index) => {
      const checkboxState = checkboxStates[index] || getInitialCheckboxState(report);
      const textInput = textInputs[index] || { reason: '', period: '' };
      const isTeacherConfirmChecked = checkboxState.illness2Days.teacherConfirm || checkboxState.recognition.teacherConfirm;
      const teacherName = isTeacherConfirmChecked ? (profile?.name || '') : '';
      const days = getDaysCount(report.startDate, report.endDate);

      return `
        <div class="report-container" style="${index > 0 ? 'page-break-before: always;' : ''}">
          <table>
            <tbody>
              <!-- 행 1: 제목 + 결재 -->
              <tr>
                <td colspan="4" rowspan="2" style="font-size: 22px; font-weight: bold; text-align: center; letter-spacing: 8px; padding: 20px;">
                  결　석　신　고　서
                </td>
                <td rowspan="2" class="label-cell" style="writing-mode: vertical-rl; letter-spacing: 2px; width: 30px; padding: 4px;">결재</td>
                <td class="label-cell" style="width: 70px;">담당</td>
                <td class="label-cell" style="width: 70px;">부장</td>
                <td class="label-cell" style="width: 70px;">교감</td>
              </tr>
              <!-- 행 2: 결재 도장 -->
              <tr>
                <td style="height: 60px;"></td>
                <td style="height: 60px;"></td>
                <td style="height: 60px;"></td>
              </tr>
              <!-- 행 3: 인적사항 -->
              <tr>
                <td colspan="2" class="label-cell">인적 사항</td>
                <td colspan="6" style="padding-left: 15px;">
                  ${report.student.meta.grade}학년　${report.student.meta.class}반　${report.student.meta.number}번　성명　${report.student.name}
                </td>
              </tr>
              <!-- 행 4: 기간 -->
              <tr>
                <td colspan="2" class="label-cell">기　간</td>
                <td colspan="6" style="padding-left: 15px;">
                  ${formatDateRange(report.startDate, report.endDate)}
                  ${textInput.period ? textInput.period : '　　'}　교시
                </td>
              </tr>
              <!-- 행 5: 구분 헤더 -->
              <tr>
                <td class="label-cell" style="width: 50px;">구　분</td>
                <td colspan="3" class="label-cell">사유</td>
                <td colspan="4" class="label-cell">증빙(해당 칸 ∨ 표시)</td>
              </tr>
              <!-- 행 6-7: 질병결석 -->
              <tr>
                <td rowspan="4" class="label-cell" style="writing-mode: vertical-rl; letter-spacing: 3px; width: 50px;">구분</td>
                <td rowspan="3" class="label-cell" style="writing-mode: vertical-rl; letter-spacing: 2px; width: 60px; position: relative; padding-top: 30px;">
                  <span class="checkbox ${checkboxState.reasonType === 'illness' ? 'checked' : ''}"></span>
                  질병 결석
                </td>
                <td rowspan="3" colspan="2" style="padding: 8px;">
                  <div style="min-height: 80px; padding: 8px; font-size: 13px; line-height: 1.5;">
                    ${textInput.reason || ''}
                  </div>
                </td>
                <td colspan="2" class="label-cell" style="font-weight: bold; padding: 6px;">2일 이내 결석</td>
                <td colspan="2" class="label-cell" style="font-weight: bold; padding: 6px;">3일 이상 결석</td>
              </tr>
              <tr>
                <td colspan="2" style="padding: 6px 12px; border-right: 1px solid #000;">
                  <div class="checkbox-line" style="margin: 2px 0;">
                    <span class="checkbox-item">
                      <span class="checkbox ${checkboxState.illness2Days.teacherConfirm ? 'checked' : ''}"></span>
                      담임교사 확인서
                    </span>
                  </div>
                  <div class="checkbox-line" style="margin: 2px 0;">
                    <span class="checkbox-item">
                      <span class="checkbox ${checkboxState.illness2Days.parentOpinion ? 'checked' : ''}"></span>
                      학부모 의견서
                    </span>
                  </div>
                  <div class="checkbox-line" style="margin: 2px 0;">
                    <span class="checkbox-item">
                      <span class="checkbox ${checkboxState.illness2Days.medicalConfirm ? 'checked' : ''}"></span>
                      진료확인서
                    </span>
                  </div>
                  <div class="checkbox-line" style="margin: 2px 0;">
                    <span class="checkbox-item">
                      <span class="checkbox ${checkboxState.illness2Days.prescription ? 'checked' : ''}"></span>
                      처방전
                    </span>
                  </div>
                  <div class="checkbox-line" style="margin: 2px 0;">
                    <span class="checkbox-item">
                      <span class="checkbox ${checkboxState.illness2Days.other ? 'checked' : ''}"></span>
                      기타 (${report.reasonDetail || '　　　　　'})
                    </span>
                  </div>
                </td>
                <td colspan="2" style="padding: 6px 12px;">
                  <div class="checkbox-line" style="margin: 2px 0;">
                    <span class="checkbox-item">
                      <span class="checkbox ${checkboxState.illness3Days.doctorOpinion ? 'checked' : ''}"></span>
                      의사소견서
                    </span>
                  </div>
                  <div class="checkbox-line" style="margin: 2px 0;">
                    <span class="checkbox-item">
                      <span class="checkbox ${checkboxState.illness3Days.medicalConfirm ? 'checked' : ''}"></span>
                      진료확인서
                    </span>
                  </div>
                  <div class="checkbox-line" style="margin: 2px 0;">
                    <span class="checkbox-item">
                      <span class="checkbox ${checkboxState.illness3Days.other ? 'checked' : ''}"></span>
                      기타 (　　　　　)
                    </span>
                  </div>
                </td>
              </tr>
              <tr>
                <td colspan="6" style="padding: 8px 12px;">
                  <div class="checkbox-line">
                    <span class="checkbox-item">
                      <span class="checkbox ${checkboxState.regularExam ? 'checked' : ''}"></span>
                      정기고사 (준)종합병원 진단서
                    </span>
                  </div>
                </td>
              </tr>
              <!-- 행 8: 인정 -->
              <tr>
                <td class="label-cell" style="writing-mode: vertical-rl; letter-spacing: 2px; width: 60px; position: relative; padding-top: 30px;">
                  <span class="checkbox ${checkboxState.reasonType === 'recognition' ? 'checked' : ''}"></span>
                  인정
                </td>
                <td colspan="2" style="padding: 8px 12px;">
                  <div style="margin-bottom: 6px; font-size: 13px;">생리통</div>
                  <div class="checkbox-line" style="font-size: 12px;">
                    <span class="checkbox-item" style="margin-right: 8px;">
                      <span class="checkbox ${checkboxState.menstrualPain.absence ? 'checked' : ''}"></span>
                      결석
                    </span>
                    <span class="checkbox-item" style="margin-right: 8px;">
                      <span class="checkbox ${checkboxState.menstrualPain.late ? 'checked' : ''}"></span>
                      지각
                    </span>
                    <span class="checkbox-item" style="margin-right: 8px;">
                      <span class="checkbox ${checkboxState.menstrualPain.earlyLeave ? 'checked' : ''}"></span>
                      조퇴
                    </span>
                    <span class="checkbox-item" style="margin-right: 8px;">
                      <span class="checkbox ${checkboxState.menstrualPain.classAbsence ? 'checked' : ''}"></span>
                      결과
                    </span>
                  </div>
                </td>
                <td colspan="5" style="padding: 6px 12px;">
                  <div class="checkbox-line" style="margin: 2px 0;">
                    <span class="checkbox-item">
                      <span class="checkbox ${checkboxState.recognition.teacherConfirm ? 'checked' : ''}"></span>
                      담임교사 확인서
                    </span>
                  </div>
                  <div class="checkbox-line" style="margin: 2px 0;">
                    <span class="checkbox-item">
                      <span class="checkbox ${checkboxState.recognition.parentOpinion ? 'checked' : ''}"></span>
                      학부모 의견서
                    </span>
                  </div>
                </td>
              </tr>
              <!-- 행 9: 안내사항 -->
              <tr>
                <td colspan="2" class="label-cell">안내 사항</td>
                <td colspan="6" style="padding-left: 15px; line-height: 1.6;">
                  해당 칸에 ☑ 표시를 한 후 결석 신고서와 증빙 서류는 결석한 날로부터 5일 이내에　제출해야 합니다.
                </td>
              </tr>
              <!-- 행 10: 제출 선언 및 서명 -->
              <tr>
                <td colspan="8" style="padding: 12px 15px; text-align: center;">
                  <div style="border: 1px solid #000; padding: 8px; margin-bottom: 10px; line-height: 1.5; font-size: 13px;">
                    본인은 보호자 입회로 위와 같이 결석 신고서를 제출합니다.
                  </div>
                  <div style="margin-bottom: 8px; font-size: 13px;">
                    학생: ${report.student.name} (서명)　　　　　보호자(법정대리인): ${report.parentName || '　　　　　　'} (서명)
                  </div>
                  <div style="margin-bottom: 10px; font-size: 14px;">
                    ${format(new Date(), 'yyyy년　　M월　　d일', { locale: ko })}
                  </div>
                  <div style="font-size: 15px; font-weight: bold; letter-spacing: 6px;">
                    샘플고등학교장
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          ${days <= 2 ? `
            <div class="divider">
              ━━━━━━━━━━━━━━━━━━━━━━ 이하 필요시 기재 ━━━━━━━━━━━━━━━━━━━━━━
            </div>

            <div class="section-box">
              <div class="section-box-title">(선택1)</div>
              <div class="checkbox-line">
                <span class="checkbox-item">
                  <span class="checkbox ${checkboxState.optional.parentOpinion ? 'checked' : ''}"></span>
                  학부모 의견서
                </span>
              </div>
              <div class="section-box-content">
                위 학생의 보호자로서 확인 결과 내용이 사실임을 확인합니다.
              </div>
              <div class="signature-area">
                보호자(법정 대리인)：　　　　　　　　(서명)
              </div>
            </div>

            <div class="section-box">
              <div class="section-box-title">(선택1)</div>
              <div class="checkbox-line">
                <span class="checkbox-item">
                  <span class="checkbox ${checkboxState.optional.teacherConfirm ? 'checked' : ''}"></span>
                  담임교사 확인서
                </span>
              </div>
              <div class="section-box-content">
                위 학생의 담임교사로서 확인 결과 내용이 사실임을 확인합니다.
              </div>
              <div class="signature-area">
                담임교사：${teacherName}　　　　(서명)
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>결석 신고서</title>
          <style>
            @page {
              size: A4;
              margin: 12mm;
            }
            @media print {
              @page {
                margin: 12mm;
              }
              body {
                margin: 0;
                padding: 5mm;
              }
              header, footer {
                display: none !important;
              }
            }
            body {
              font-family: 'Malgun Gothic', sans-serif;
              margin: 0;
              padding: 5mm;
            }
            ${getReportStyles()}
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

  const getReportStyles = () => `
    * {
      box-sizing: border-box;
    }

    .report-container {
      width: 100%;
      padding: 0;
      font-size: 13px;
      line-height: 1.4;
    }

    .report-title {
      font-size: 24px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 20px;
      letter-spacing: 10px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000;
    }

    td {
      border: 1px solid #000;
      padding: 4px 8px;
      vertical-align: middle;
      line-height: 1.4;
    }

    @media print {
      table {
        border: 1px solid #000 !important;
        border-collapse: collapse !important;
      }

      td {
        border: 1px solid #000 !important;
        page-break-inside: avoid;
      }

      .checkbox {
        cursor: default;
        border: 1px solid #000 !important;
      }

      .section-box {
        border: 1px solid #000 !important;
      }

      .note-box {
        border: 1px solid #000 !important;
      }

      .period-input, .reason-textarea {
        border: none !important;
        border-radius: 0 !important;
        background: transparent !important;
        outline: none !important;
        -webkit-appearance: none !important;
        appearance: none !important;
      }

      .period-input::placeholder, .reason-textarea::placeholder {
        color: transparent !important;
      }
    }

    .label-cell {
      font-weight: 600;
      text-align: center;
      white-space: nowrap;
      font-size: 13px;
    }

    .approval-table {
      width: 100%;
      height: 100%;
      border: none;
      margin: 0;
    }

    .approval-table td {
      border: 1px solid #000;
      text-align: center;
      padding: 2px;
      font-size: 12px;
    }

    .approval-header {
      font-weight: 600;
      height: 25px;
      font-size: 12px;
    }

    .approval-stamp {
      height: 50px;
    }

    .checkbox-line {
      margin: 2px 0;
      line-height: 1.6;
    }

    .checkbox-item {
      display: inline-block;
      margin-right: 15px;
      white-space: nowrap;
    }

    .checkbox {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 1px solid #000;
      position: relative;
      vertical-align: middle;
      margin-right: 4px;
      cursor: default;
    }

    .checkbox.checked::after {
      content: '✓';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 14px;
      font-weight: bold;
      line-height: 1;
    }

    .note-box {
      border: 1px solid #000;
      padding: 8px;
      margin: 15px 0;
      text-align: center;
      line-height: 1.5;
      font-size: 13px;
    }

    .footer {
      text-align: center;
      margin-top: 20px;
      line-height: 1.6;
      font-size: 13px;
    }

    .signature-line {
      margin: 15px 0;
      font-size: 13px;
    }

    .school-name {
      font-size: 16px;
      font-weight: bold;
      margin-top: 15px;
      letter-spacing: 6px;
    }

    .divider {
      text-align: center;
      margin: 8px 0;
      color: #666;
      font-size: 11px;
    }

    .section-box {
      border: 1px solid #000;
      padding: 10px;
      margin-bottom: 10px;
    }

    .section-box-title {
      margin-bottom: 6px;
      font-size: 13px;
    }

    .section-box-content {
      margin: 8px 0;
      line-height: 1.5;
      font-size: 13px;
    }

    .signature-area {
      text-align: right;
      margin-top: 12px;
      font-size: 13px;
    }
  `;

  const getDaysCount = (startDate: string, endDate: string) => {
    const days = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
    return days > 0 ? days : 1;
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = getDaysCount(startDate, endDate);
    return `${format(start, 'yyyy년 M월 d일', { locale: ko })} - ${format(end, 'yyyy년 M월 d일', { locale: ko })} (${days}일간)`;
  };

  if (!currentReport) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle>결석 신고서 미리보기</DialogTitle>
          {reports.length > 1 && (
            <Select
              value={selectedIndex.toString()}
              onValueChange={(value) => setSelectedIndex(parseInt(value))}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reports.map((report, idx) => (
                  <SelectItem key={idx} value={idx.toString()}>
                    {report.student.meta.grade}학년 {report.student.meta.class}반 {report.student.meta.number}번 {report.student.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-gray-50 p-4 rounded">
          <style>{getReportStyles()}</style>
          <div
            ref={printRef}
            className="bg-white p-12 mx-auto shadow-sm"
            style={{ width: '210mm', minHeight: '297mm' }}
          >
            <div className="report-container">
              <table>
                <tbody>
                  {/* 행 1: 제목 + 결재 */}
                  <tr>
                    <td colSpan={4} rowSpan={2} style={{ fontSize: '22px', fontWeight: 'bold', textAlign: 'center', letterSpacing: '8px', padding: '20px' }}>
                      결　석　신　고　서
                    </td>
                    <td rowSpan={2} className="label-cell" style={{ writingMode: 'vertical-rl', letterSpacing: '2px', width: '30px', padding: '4px' }}>결재</td>
                    <td className="label-cell" style={{ width: '70px' }}>담당</td>
                    <td className="label-cell" style={{ width: '70px' }}>부장</td>
                    <td className="label-cell" style={{ width: '70px' }}>교감</td>
                  </tr>
                  {/* 행 2: 결재 도장 */}
                  <tr>
                    <td style={{ height: '60px' }}></td>
                    <td style={{ height: '60px' }}></td>
                    <td style={{ height: '60px' }}></td>
                  </tr>
                  {/* 행 3: 인적사항 */}
                  <tr>
                    <td colSpan={2} className="label-cell">인적 사항</td>
                    <td colSpan={6} style={{ paddingLeft: '15px' }}>
                      {currentReport.student.meta.grade}학년　{currentReport.student.meta.class}반　{currentReport.student.meta.number}번　성명　{currentReport.student.name}
                    </td>
                  </tr>
                  {/* 행 4: 기간 */}
                  <tr>
                    <td colSpan={2} className="label-cell">기　간</td>
                    <td colSpan={6} style={{ paddingLeft: '15px' }}>
                      {formatDateRange(currentReport.startDate, currentReport.endDate)}
                      <input
                        type="text"
                        value={currentTextInput.period}
                        onChange={(e) => updateTextInput('period', e.target.value)}
                        placeholder="교시"
                        className="period-input"
                        style={{
                          width: '60px',
                          padding: '2px 6px',
                          border: '1px solid #ccc',
                          borderRadius: '3px',
                          fontSize: '13px',
                          textAlign: 'center',
                          verticalAlign: 'middle'
                        }}
                      />
                      　교시
                    </td>
                  </tr>
                  {/* 행 5: 구분 헤더 */}
                  <tr>
                    <td className="label-cell" style={{ width: '50px' }}>구　분</td>
                    <td colSpan={3} className="label-cell">사유</td>
                    <td colSpan={4} className="label-cell">증빙(해당 칸 ∨ 표시)</td>
                  </tr>
                  {/* 행 6-7: 질병결석 */}
                  <tr>
                    <td rowSpan={4} className="label-cell" style={{ writingMode: 'vertical-rl', letterSpacing: '3px', width: '50px' }}>구분</td>
                    <td rowSpan={3} className="label-cell" style={{ writingMode: 'vertical-rl', letterSpacing: '2px', width: '60px', position: 'relative', paddingTop: '30px' }}>
                      <span
                        className={`checkbox ${currentCheckboxState.reasonType === 'illness' ? 'checked' : ''}`}
                        onClick={() => toggleReasonType('illness')}
                        style={{ cursor: 'pointer' }}
                      ></span>
                      질병 결석
                    </td>
                    <td rowSpan={3} colSpan={2} style={{ padding: '8px' }}>
                      <textarea
                        value={currentTextInput.reason}
                        onChange={(e) => updateTextInput('reason', e.target.value)}
                        placeholder="사유를 입력하세요"
                        className="reason-textarea"
                        style={{
                          width: '100%',
                          height: '100%',
                          minHeight: '80px',
                          padding: '8px',
                          border: '1px solid #e0e0e0',
                          borderRadius: '4px',
                          fontSize: '13px',
                          resize: 'none',
                          fontFamily: 'inherit',
                          lineHeight: '1.5'
                        }}
                      />
                    </td>
                    <td colSpan={2} className="label-cell" style={{ fontWeight: 'bold', padding: '6px' }}>2일 이내 결석</td>
                    <td colSpan={2} className="label-cell" style={{ fontWeight: 'bold', padding: '6px' }}>3일 이상 결석</td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ padding: '6px 12px', borderRight: '1px solid #000' }}>
                      <div className="checkbox-line" style={{ margin: '2px 0' }}>
                        <span className="checkbox-item">
                          <span
                            className={`checkbox ${currentCheckboxState.illness2Days.teacherConfirm ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('illness2Days', 'teacherConfirm')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          담임교사 확인서
                        </span>
                      </div>
                      <div className="checkbox-line" style={{ margin: '2px 0' }}>
                        <span className="checkbox-item">
                          <span
                            className={`checkbox ${currentCheckboxState.illness2Days.parentOpinion ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('illness2Days', 'parentOpinion')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          학부모 의견서
                        </span>
                      </div>
                      <div className="checkbox-line" style={{ margin: '2px 0' }}>
                        <span className="checkbox-item">
                          <span
                            className={`checkbox ${currentCheckboxState.illness2Days.medicalConfirm ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('illness2Days', 'medicalConfirm')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          진료확인서
                        </span>
                      </div>
                      <div className="checkbox-line" style={{ margin: '2px 0' }}>
                        <span className="checkbox-item">
                          <span
                            className={`checkbox ${currentCheckboxState.illness2Days.prescription ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('illness2Days', 'prescription')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          처방전
                        </span>
                      </div>
                      <div className="checkbox-line" style={{ margin: '2px 0' }}>
                        <span className="checkbox-item">
                          <span
                            className={`checkbox ${currentCheckboxState.illness2Days.other ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('illness2Days', 'other')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          기타 ({currentReport.reasonDetail || '　　　　　'})
                        </span>
                      </div>
                    </td>
                    <td colSpan={2} style={{ padding: '6px 12px' }}>
                      <div className="checkbox-line" style={{ margin: '2px 0' }}>
                        <span className="checkbox-item">
                          <span
                            className={`checkbox ${currentCheckboxState.illness3Days.doctorOpinion ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('illness3Days', 'doctorOpinion')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          의사소견서
                        </span>
                      </div>
                      <div className="checkbox-line" style={{ margin: '2px 0' }}>
                        <span className="checkbox-item">
                          <span
                            className={`checkbox ${currentCheckboxState.illness3Days.medicalConfirm ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('illness3Days', 'medicalConfirm')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          진료확인서
                        </span>
                      </div>
                      <div className="checkbox-line" style={{ margin: '2px 0' }}>
                        <span className="checkbox-item">
                          <span
                            className={`checkbox ${currentCheckboxState.illness3Days.other ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('illness3Days', 'other')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          기타 (　　　　　)
                        </span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={6} style={{ padding: '8px 12px' }}>
                      <div className="checkbox-line">
                        <span className="checkbox-item">
                          <span
                            className={`checkbox ${currentCheckboxState.regularExam ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('regularExam')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          정기고사 (준)종합병원 진단서
                        </span>
                      </div>
                    </td>
                  </tr>
                  {/* 행 8: 인정 */}
                  <tr>
                    <td className="label-cell" style={{ writingMode: 'vertical-rl', letterSpacing: '2px', width: '60px', position: 'relative', paddingTop: '30px' }}>
                      <span
                        className={`checkbox ${currentCheckboxState.reasonType === 'recognition' ? 'checked' : ''}`}
                        onClick={() => toggleReasonType('recognition')}
                        style={{ cursor: 'pointer' }}
                      ></span>
                      인정
                    </td>
                    <td colSpan={2} style={{ padding: '8px 12px' }}>
                      <div style={{ marginBottom: '6px', fontSize: '13px' }}>생리통</div>
                      <div className="checkbox-line" style={{ fontSize: '12px' }}>
                        <span className="checkbox-item" style={{ marginRight: '8px' }}>
                          <span
                            className={`checkbox ${currentCheckboxState.menstrualPain.absence ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('menstrualPain', 'absence')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          결석
                        </span>
                        <span className="checkbox-item" style={{ marginRight: '8px' }}>
                          <span
                            className={`checkbox ${currentCheckboxState.menstrualPain.late ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('menstrualPain', 'late')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          지각
                        </span>
                        <span className="checkbox-item" style={{ marginRight: '8px' }}>
                          <span
                            className={`checkbox ${currentCheckboxState.menstrualPain.earlyLeave ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('menstrualPain', 'earlyLeave')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          조퇴
                        </span>
                        <span className="checkbox-item" style={{ marginRight: '8px' }}>
                          <span
                            className={`checkbox ${currentCheckboxState.menstrualPain.classAbsence ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('menstrualPain', 'classAbsence')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          결과
                        </span>
                      </div>
                    </td>
                    <td colSpan={5} style={{ padding: '6px 12px' }}>
                      <div className="checkbox-line" style={{ margin: '2px 0' }}>
                        <span className="checkbox-item">
                          <span
                            className={`checkbox ${currentCheckboxState.recognition.teacherConfirm ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('recognition', 'teacherConfirm')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          담임교사 확인서
                        </span>
                      </div>
                      <div className="checkbox-line" style={{ margin: '2px 0' }}>
                        <span className="checkbox-item">
                          <span
                            className={`checkbox ${currentCheckboxState.recognition.parentOpinion ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox('recognition', 'parentOpinion')}
                            style={{ cursor: 'pointer' }}
                          ></span>
                          학부모 의견서
                        </span>
                      </div>
                    </td>
                  </tr>
                  {/* 행 9: 안내사항 */}
                  <tr>
                    <td colSpan={2} className="label-cell">안내 사항</td>
                    <td colSpan={6} style={{ paddingLeft: '15px', lineHeight: '1.6' }}>
                      해당 칸에 ☑ 표시를 한 후 결석 신고서와 증빙 서류는 결석한 날로부터 5일 이내에　제출해야 합니다.
                    </td>
                  </tr>
                  {/* 행 10: 제출 선언 및 서명 */}
                  <tr>
                    <td colSpan={8} style={{ padding: '12px 15px', textAlign: 'center' }}>
                      <div style={{ border: '1px solid #000', padding: '8px', marginBottom: '10px', lineHeight: '1.5', fontSize: '13px' }}>
                        본인은 보호자 입회로 위와 같이 결석 신고서를 제출합니다.
                      </div>
                      <div style={{ marginBottom: '8px', fontSize: '13px' }}>
                        학생: {currentReport.student.name} (서명)　　　　　보호자(법정대리인): {currentReport.parentName || '　　　　　　'} (서명)
                      </div>
                      <div style={{ marginBottom: '10px', fontSize: '14px' }}>
                        {format(new Date(), 'yyyy년　　M월　　d일', { locale: ko })}
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 'bold', letterSpacing: '6px' }}>
                        샘플고등학교장
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {getDaysCount(currentReport.startDate, currentReport.endDate) <= 2 && (
                <>
                  <div className="divider">
                    ━━━━━━━━━━━━━━━━━━━━━━ 이하 필요시 기재 ━━━━━━━━━━━━━━━━━━━━━━
                  </div>

                  <div className="section-box">
                    <div className="section-box-title">(선택1)</div>
                    <div className="checkbox-line">
                      <span className="checkbox-item">
                        <span
                          className={`checkbox ${currentCheckboxState.optional.parentOpinion ? 'checked' : ''}`}
                          onClick={() => toggleCheckbox('optional', 'parentOpinion')}
                          style={{ cursor: 'pointer' }}
                        ></span>
                        학부모 의견서
                      </span>
                    </div>
                    <div className="section-box-content">
                      위 학생의 보호자로서 확인 결과 내용이 사실임을 확인합니다.
                    </div>
                    <div className="signature-area">
                      보호자(법정 대리인)：　　　　　　　　(서명)
                    </div>
                  </div>

                  <div className="section-box">
                    <div className="section-box-title">(선택1)</div>
                    <div className="checkbox-line">
                      <span className="checkbox-item">
                        <span
                          className={`checkbox ${currentCheckboxState.optional.teacherConfirm ? 'checked' : ''}`}
                          onClick={() => toggleCheckbox('optional', 'teacherConfirm')}
                          style={{ cursor: 'pointer' }}
                        ></span>
                        담임교사 확인서
                      </span>
                    </div>
                    <div className="section-box-content">
                      위 학생의 담임교사로서 확인 결과 내용이 사실임을 확인합니다.
                    </div>
                    <div className="signature-area">
                      담임교사：{teacherName}　　　　(서명)
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            이전
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            출력하기 ({reports.length}건)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AbsenceReportPreview;
