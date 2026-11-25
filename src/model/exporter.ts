// 导出:逐排升起表 / C 值表(CSV)、视线剖面图(SVG),并支持浏览器打印
import type { RowAnalysis, Scheme, StandSection } from './types';
import { analyzeRows, reverseDesign } from './sightline';
import { sectionGeometry } from './geometry';

function download(filename: string, content: string, mime: string) {
  const blob = new Blob(['﻿' + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|\s]+/g, '_');
}

export interface SectionTables {
  section: StandSection;
  rows: RowAnalysis[];
  csvRisers: string;
  csvC: string;
}

export function buildTables(scheme: Scheme): SectionTables[] {
  return scheme.sections.map((section) => {
    const rows = analyzeRows(section, scheme.venue.focuses, scheme.settings);
    const head = ['排号', '踏步面标高(m)', '本排升高(m)', '眼高(m)', '距焦点水平距离(m)'];
    const linesR = [head.join(',')];
    const linesC = [
      ['排号', 'C 值(m)', 'C 值(mm)', '是否达标', '边线遮挡深度(m)'].join(','),
    ];
    rows.forEach((r) => {
      linesR.push(
        [r.row, f3(r.floorY), f3(r.riser), f3(r.eyeY), f3(r.distance)].join(','),
      );
      linesC.push(
        [
          r.row,
          r.cValue === null ? '-' : f4(r.cValue),
          r.cValue === null ? '-' : Math.round(r.cValue * 1000),
          r.cValue === null ? '-' : r.pass ? '达标' : '不达标',
          r.edgeBlockedDepth === null ? '-' : f3(r.edgeBlockedDepth),
        ].join(','),
      );
    });
    return { section, rows, csvRisers: linesR.join('\n'), csvC: linesC.join('\n') };
  });
}

export function exportAllCsv(scheme: Scheme) {
  const tables = buildTables(scheme);
  const parts = tables.map((t) => {
    return `# ${t.section.name} — 逐排升起表\n${t.csvRisers}\n\n# ${t.section.name} — C 值表(最小C=${scheme.settings.minC}m)\n${t.csvC}`;
  });
  download(`${safeName(scheme.name)}_视线计算表.csv`, parts.join('\n\n'), 'text/csv');
}

export function exportSectionCsv(scheme: Scheme, sectionId: string) {
  const t = buildTables(scheme).find((x) => x.section.id === sectionId);
  if (!t) return;
  download(`${safeName(scheme.name)}_${safeName(t.section.name)}.csv`, `${t.csvRisers}\n\n${t.csvC}`, 'text/csv');
}

/** 生成视线剖面 SVG:踏步轮廓、每排眼点、焦点、相邻排视线 */
export function profileSvg(scheme: Scheme, sectionId: string, width = 900, height = 460): string {
  const section = scheme.sections.find((s) => s.id === sectionId);
  if (!section) return '';
  const rows = analyzeRows(section, scheme.venue.focuses, scheme.settings);
  const geo = sectionGeometry(section);
  const focus = scheme.venue.focuses.find((f) => f.id === section.focusId) ?? scheme.venue.focuses[0];
  const rev =
    section.riseMode === 'variable'
      ? reverseDesign(section, scheme.venue.focuses, scheme.settings)
      : null;

  // 横轴:距焦点水平距离;纵轴:标高
  const dList = rows.map((r) => r.distance);
  const yList = rows.map((r) => r.floorY);
  const dMin = 0;
  const dMax = Math.max(...dList) * 1.05;
  const yMin = Math.min(0, ...yList) - 0.3;
  const yMax = Math.max(...rows.map((r) => r.eyeY)) + 0.6;
  const padL = 64;
  const padB = 56;
  const padT = 28;
  const plotW = width - padL - 24;
  const plotH = height - padB - padT;
  const X = (d: number) => padL + ((d - dMin) / (dMax - dMin)) * plotW;
  const Y = (y: number) => padT + (1 - (y - yMin) / (yMax - yMin)) * plotH;

  const els: string[] = [];
  // 网格与坐标轴
  for (let g = 0; g <= 5; g++) {
    const d = dMin + ((dMax - dMin) * g) / 5;
    els.push(`<line x1="${f1(X(d))}" y1="${padT}" x2="${f1(X(d))}" y2="${height - padB}" stroke="#e3e6eb" stroke-width="1"/>`);
    els.push(`<text x="${f1(X(d))}" y="${height - padB + 18}" font-size="11" fill="#7a838f" text-anchor="middle">${f1(d)}m</text>`);
  }
  for (let g = 0; g <= 4; g++) {
    const y = yMin + ((yMax - yMin) * g) / 4;
    els.push(`<line x1="${padL}" y1="${f1(Y(y))}" x2="${width - 24}" y2="${f1(Y(y))}" stroke="#eef1f5" stroke-width="1"/>`);
    els.push(`<text x="${padL - 8}" y="${f1(Y(y) + 4)}" font-size="11" fill="#7a838f" text-anchor="end">${f1(y)}m</text>`);
  }
  els.push(`<line x1="${padL}" y1="${height - padB}" x2="${width - 24}" y2="${height - padB}" stroke="#98a1ad" stroke-width="1.5"/>`);

  // 地面/场地线
  els.push(`<line x1="${padL}" y1="${f1(Y(0))}" x2="${width - 24}" y2="${f1(Y(0))}" stroke="#57a06a" stroke-width="2"/>`);
  // 焦点
  els.push(`<circle cx="${f1(X(0))}" cy="${f1(Y(focus.y))}" r="5" fill="#e8553e"/>`);
  els.push(`<text x="${f1(X(0) + 8)}" y="${f1(Y(focus.y) - 8)}" font-size="12" fill="#e8553e">视点 F</text>`);

  // 踏步轮廓(用 floorY + 水平排距画阶梯)
  const stepPts = rows.map((r) => `${f1(X(r.distance))},${f1(Y(r.floorY))}`);
  els.push(`<polyline points="${stepPts.join(' ')}" fill="none" stroke="#2f6fb0" stroke-width="2"/>`);

  // 眼点 + 相邻排视线(每 3 排画一条避免过密)
  rows.forEach((r, i) => {
    const ex = X(r.distance);
    const ey = Y(r.eyeY);
    const color = r.cValue === null ? '#8894a2' : r.pass ? '#2f9e5f' : '#d64545';
    els.push(`<circle cx="${f1(ex)}" cy="${f1(ey)}" r="3.2" fill="${color}"/>`);
    if (i > 0 && i % 3 === 0) {
      els.push(`<line x1="${f1(ex)}" y1="${f1(ey)}" x2="${f1(X(0))}" y2="${f1(Y(focus.y))}" stroke="#b9c2cd" stroke-width="0.8" stroke-dasharray="4 3"/>`);
    }
  });

  // 反推连续理论剖面(虚线对照)
  if (rev) {
    const pts = rev.continuousFloors
      .map((fl, i) => `${f1(X(rows[i].distance))},${f1(Y(fl + scheme.settings.eyeHeight))}`)
      .join(' ');
    els.push(`<polyline points="${pts}" fill="none" stroke="#8a5cc0" stroke-width="1.4" stroke-dasharray="6 4"/>`);
  }

  // 标题与图例
  els.push(`<text x="${padL}" y="20" font-size="15" font-weight="700" fill="#1f2733">${scheme.name} · ${section.name} 视线剖面</text>`);
  const legend = [
    ['#2f9e5f', '达标排'],
    ['#d64545', '不达标排'],
    ['#2f6fb0', '踏步轮廓'],
    ['#8a5cc0', '连续理论眼高'],
  ];
  legend.forEach(([c, label], i) => {
    const lx = width - 260 + i * 62;
    els.push(`<rect x="${lx}" y="12" width="10" height="10" fill="${c}" rx="2"/>`);
    els.push(`<text x="${lx + 14}" y="21" font-size="11" fill="#4a5460">${label}</text>`);
  });
  void geo;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Microsoft YaHei, sans-serif">
  <rect width="100%" height="100%" fill="white"/>
  ${els.join('\n  ')}
  <text x="${padL}" y="${height - 14}" font-size="11" fill="#7a838f">横轴:距视点水平距离(m)　纵轴:标高(m)　最小 C=${scheme.settings.minC}m　生成:${new Date().toLocaleString()}</text>
</svg>`;
}

export function downloadSvg(scheme: Scheme, sectionId: string) {
  const svg = profileSvg(scheme, sectionId);
  const section = scheme.sections.find((s) => s.id === sectionId);
  download(`${safeName(scheme.name)}_${safeName(section?.name ?? 'profile')}_剖面.svg`, svg, 'image/svg+xml');
}

/** 打印当前页面(window.print 由调用方触发,这里准备一份可打印的报告窗口) */
export function openPrintReport(scheme: Scheme) {
  const tables = buildTables(scheme);
  const svgs = scheme.sections.map((s) => profileSvg(scheme, s.id, 820, 420)).join('<hr/>');
  const tableHtml = tables
    .map((t) => {
      const body = t.rows
        .map(
          (r) => `<tr><td>${r.row}</td><td>${f3(r.floorY)}</td><td>${f3(r.riser)}</td><td>${
            r.cValue === null ? '-' : f4(r.cValue)
          }</td><td>${r.cValue === null ? '-' : Math.round(r.cValue * 1000)}</td><td style="color:${
            r.cValue === null ? '#888' : r.pass ? '#2f9e5f' : '#d64545'
          }">${r.cValue === null ? '-' : r.pass ? '达标' : '不达标'}</td></tr>`,
        )
        .join('');
      return `<h3>${t.section.name}</h3><table><thead><tr><th>排号</th><th>踏步标高(m)</th><th>升高(m)</th><th>C值(m)</th><th>C值(mm)</th><th>判定</th></tr></thead><tbody>${body}</tbody></table>`;
    })
    .join('');
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${scheme.name} 视线分析报告</title>
  <style>
    body{font-family:"Microsoft YaHei",sans-serif;padding:24px;color:#1f2733}
    h1{font-size:20px} h3{margin:18px 0 6px}
    table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:12px}
    th,td{border:1px solid #c8ced6;padding:4px 8px;text-align:center}
    th{background:#f2f5f9} hr{border:none;border-top:1px dashed #ccc;margin:18px 0}
    svg{max-width:100%;height:auto;border:1px solid #e3e6eb}
    @media print{button{display:none}}
  </style></head><body>
  <button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer">打印 / 另存 PDF</button>
  <h1>${scheme.name} 视线分析报告</h1>
  <p>最小 C 值:${scheme.settings.minC}m　坐姿眼高:${scheme.settings.eyeHeight}m　分区数:${scheme.sections.length}</p>
  ${tableHtml}
  <h2>视线剖面图</h2>
  ${svgs}
  </body></html>`);
  w.document.close();
}

function f1(v: number) {
  return Math.round(v * 10) / 10;
}
function f3(v: number) {
  return (Math.round(v * 1000) / 1000).toFixed(3);
}
function f4(v: number) {
  return (Math.round(v * 10000) / 10000).toFixed(4);
}
