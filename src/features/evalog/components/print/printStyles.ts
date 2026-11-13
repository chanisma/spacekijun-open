export function getPrintStyles(): string {
  return `
    @page {
      size: A4;
      margin: 15mm 12mm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Malgun Gothic', '맑은 고딕', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 11px;
      color: #1e293b;
      line-height: 1.5;
      background: white;
    }

    .print-header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid #1e293b;
    }

    .print-header h1 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .print-header .student-info {
      font-size: 13px;
      color: #475569;
    }

    .print-header .print-url {
      font-size: 10px;
      color: #94a3b8;
      margin-top: 2px;
    }

    .print-section {
      margin-bottom: 24px;
      page-break-inside: avoid;
    }

    .print-section-title {
      font-size: 14px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 10px;
      padding-bottom: 4px;
      border-bottom: 1px solid #cbd5e1;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .print-section-title .tab-badge {
      font-size: 10px;
      font-weight: 600;
      color: #64748b;
      background: #f1f5f9;
      padding: 2px 8px;
      border-radius: 4px;
    }

    /* Table styles */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }

    table th {
      background: #f8fafc;
      font-weight: 600;
      color: #475569;
      padding: 6px 8px;
      border: 1px solid #e2e8f0;
      text-align: center;
    }

    table td {
      padding: 5px 8px;
      border: 1px solid #e2e8f0;
      text-align: center;
      color: #334155;
    }

    table td.text-left {
      text-align: left;
    }

    table tr.category-row {
      background: #f8fafc;
      font-weight: 600;
    }

    table tr.total-row {
      background: #f1f5f9;
      font-weight: 700;
    }

    /* Grade badges */
    .grade-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: 700;
      font-size: 10px;
    }

    .grade-1, .grade-2 { background: #ecfdf5; color: #065f46; }
    .grade-3, .grade-4 { background: #eff6ff; color: #1e40af; }
    .grade-5, .grade-6 { background: #fffbeb; color: #92400e; }
    .grade-7, .grade-8 { background: #fff7ed; color: #9a3412; }
    .grade-9 { background: #fef2f2; color: #991b1b; }

    .achievement-A { background: #ecfdf5; color: #065f46; }
    .achievement-B { background: #eff6ff; color: #1e40af; }
    .achievement-C { background: #fffbeb; color: #92400e; }

    /* Gap analysis */
    .gap-type-A { background: #ecfdf5; color: #065f46; }
    .gap-type-B { background: #eff6ff; color: #1e40af; }
    .gap-type-C { background: #fffbeb; color: #92400e; }
    .gap-type-D { background: #fef2f2; color: #991b1b; }

    /* Chart container */
    .chart-container {
      display: flex;
      justify-content: center;
      margin: 8px 0;
    }

    .chart-container svg {
      max-width: 100%;
      height: auto;
    }

    /* Legend */
    .chart-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: center;
      margin-top: 8px;
      font-size: 10px;
    }

    .chart-legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .chart-legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    /* Duplicate badge */
    .duplicate-badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 600;
      color: #92400e;
      background: #fef3c7;
      padding: 1px 5px;
      border-radius: 3px;
      margin-left: 4px;
    }

    /* Print-specific */
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-section { page-break-inside: avoid; }
      .page-break { page-break-before: always; }
    }
  `;
}
