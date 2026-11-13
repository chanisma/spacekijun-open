/**
 * SVG chart generation utilities for print.
 * Generates static SVG markup strings (no React/Recharts dependency).
 */

interface LineChartOptions {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  yMin: number;
  yMax: number;
  yReversed?: boolean; // true for grade charts (1=top, 9=bottom)
  yTicks?: number[];
  gridLines?: boolean;
}

interface LineData {
  label: string;
  color: string;
  strokeWidth?: number;
  values: (number | null)[];
}

const DEFAULT_OPTIONS: LineChartOptions = {
  width: 700,
  height: 280,
  padding: { top: 20, right: 30, bottom: 35, left: 40 },
  yMin: 1,
  yMax: 9,
  yReversed: true,
  gridLines: true,
};

export function generateLineChart(
  xLabels: string[],
  lines: LineData[],
  opts: Partial<LineChartOptions> = {},
): string {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  const { width, height, padding } = o;
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const xScale = (i: number) => padding.left + (plotW / Math.max(xLabels.length - 1, 1)) * i;
  const yScale = (v: number) => {
    const ratio = (v - o.yMin) / (o.yMax - o.yMin);
    return o.yReversed
      ? padding.top + ratio * plotH
      : padding.top + (1 - ratio) * plotH;
  };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;

  // Grid lines
  if (o.gridLines) {
    const ticks = o.yTicks || generateTicks(o.yMin, o.yMax);
    for (const tick of ticks) {
      const y = yScale(tick);
      svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3,3"/>`;
      svg += `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#64748b">${tick}</text>`;
    }
  }

  // X axis labels
  xLabels.forEach((label, i) => {
    const x = xScale(i);
    svg += `<text x="${x}" y="${height - padding.bottom + 20}" text-anchor="middle" font-size="10" fill="#64748b">${label}</text>`;
  });

  // Lines
  for (const line of lines) {
    const points: { x: number; y: number }[] = [];
    line.values.forEach((v, i) => {
      if (v !== null && v !== undefined) {
        points.push({ x: xScale(i), y: yScale(v) });
      }
    });

    if (points.length < 2) continue;

    // Path
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    svg += `<path d="${pathD}" fill="none" stroke="${line.color}" stroke-width="${line.strokeWidth || 2}" stroke-linecap="round" stroke-linejoin="round"/>`;

    // Dots
    for (const p of points) {
      svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="white" stroke="${line.color}" stroke-width="2"/>`;
    }
  }

  svg += '</svg>';
  return svg;
}

export function generateBarChart(
  data: { label: string; value: number; color: string }[],
  opts: {
    width?: number;
    height?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
    yMax?: number;
  } = {},
): string {
  const width = opts.width || 700;
  const height = opts.height || 220;
  const padding = opts.padding || { top: 20, right: 30, bottom: 40, left: 40 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const yMax = opts.yMax || Math.max(...data.map(d => d.value), 1) * 1.2;

  const barWidth = Math.min(40, plotW / data.length * 0.6);
  const gap = plotW / data.length;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;

  // Horizontal grid
  const ticks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];
  for (const tick of ticks) {
    const y = padding.top + plotH * (1 - tick / yMax);
    svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3,3"/>`;
    svg += `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#64748b">${tick.toFixed(1)}</text>`;
  }

  // Bars + labels
  data.forEach((d, i) => {
    const x = padding.left + gap * i + (gap - barWidth) / 2;
    const barH = (d.value / yMax) * plotH;
    const y = padding.top + plotH - barH;

    svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="4" fill="${d.color}" fill-opacity="0.8"/>`;
    svg += `<text x="${x + barWidth / 2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#475569" font-weight="600">${d.value.toFixed(2)}</text>`;
    svg += `<text x="${padding.left + gap * i + gap / 2}" y="${height - padding.bottom + 16}" text-anchor="middle" font-size="9" fill="#64748b">${d.label}</text>`;
  });

  svg += '</svg>';
  return svg;
}

export function generateLegend(
  items: { label: string; color: string }[],
): string {
  const dots = items.map(item =>
    `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${item.color}"></span>${item.label}</span>`
  ).join('');
  return `<div class="chart-legend">${dots}</div>`;
}

function generateTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  for (let i = min; i <= max; i++) {
    ticks.push(i);
  }
  return ticks;
}
