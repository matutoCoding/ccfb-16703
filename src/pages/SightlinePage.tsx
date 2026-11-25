import { useMemo, useState } from 'react';
import { useStore } from '../state/context';
import { analyzeRows, reverseDesign, summarize } from '../model/sightline';
import { sectionGeometry } from '../model/geometry';
import { seatBlockedRatio } from '../model/occlusion';
import { applyZoneSuggestions, scoreSections, unassignedSeats, zoneStatistics } from '../model/pricing';
import { createObstruction } from '../model/factory';
import { downloadSvg, exportAllCsv, openPrintReport, profileSvg } from '../model/exporter';
import { useToast } from '../components/useToast';
import type { Obstruction, ObstructionType } from '../model/types';

type Tab = 'rows' | 'occlusion' | 'pricing';

export function SightlinePage() {
  const { current, update, saveSnapshot } = useStore();
  const scheme = current!;
  const [sectionId, setSectionId] = useState(scheme.sections[0]?.id ?? '');
  const [tab, setTab] = useState<Tab>('rows');
  const { show, node } = useToast();

  const section = scheme.sections.find((s) => s.id === sectionId) ?? scheme.sections[0];
  const analysis = useMemo(
    () => (section ? analyzeRows(section, scheme.venue.focuses, scheme.settings) : []),
    [section, scheme],
  );
  const stats = useMemo(() => summarize(analysis, scheme.settings.minC), [analysis, scheme.settings.minC]);

  if (!section) {
    return <div className="empty"><div className="big">🏟</div><div>还没有看台分区,请先到「看台建模」页创建。</div></div>;
  }

  const applyReverse = () => {
    const rev = reverseDesign(section, scheme.venue.focuses, scheme.settings);
    update((d) => {
      const s = d.sections.find((x) => x.id === section.id);
      if (!s) return;
      s.riseMode = 'variable';
      s.risers = rev.risers;
    }, `反推升起:${section.name}`);
    void saveSnapshot(`反推应用:${section.name}`);
    const minAchieved = Math.min(...rev.analysis.filter((r) => r.cValue !== null).map((r) => r.cValue as number));
    show(`已应用反推升高,复核最小 C=${(minAchieved * 1000).toFixed(2)}mm ≥ ${(scheme.settings.minC * 1000).toFixed(0)}mm`);
  };

  return (
    <div className="layout">
      <div className="sidebar">
        <div className="card">
          <h3>分析分区</h3>
          <select value={section.id} onChange={(e) => setSectionId(e.target.value)}>
            {scheme.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn primary small" onClick={applyReverse}>⚙ 一键反推并应用升高</button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            反推按规范手册逐排递推,踏步升高按 {scheme.settings.constructionStep * 1000}mm 向上取整,代回每排 C≥{scheme.settings.minC * 1000}mm。
          </p>
        </div>

        <div className="card">
          <h3>总体指标</h3>
          <div className="field"><span className="muted">总排数</span><div style={{ fontSize: 18, fontWeight: 700 }}>{stats.total}</div></div>
          <div className="field">
            <span className="muted">合格排 / 受检排</span>
            <div style={{ fontSize: 18, fontWeight: 700, color: stats.passed === stats.checked ? 'var(--ok)' : 'var(--bad)' }}>
              {stats.passed} / {stats.checked}
            </div>
          </div>
          <div className="field">
            <span className="muted">实测最小 C 值</span>
            <div className="mono" style={{ fontSize: 16 }}>{stats.minCValue === null ? '—' : `${(stats.minCValue * 1000).toFixed(1)} mm`}</div>
          </div>
          <div className="field">
            <span className="muted">边线被挡最大深度</span>
            <div className="mono" style={{ fontSize: 16, color: (stats.maxBlockedDepth ?? 0) > 0 ? 'var(--bad)' : 'var(--ok)' }}>
              {stats.maxBlockedDepth === null ? '—' : `${stats.maxBlockedDepth.toFixed(2)} m`}
            </div>
          </div>
        </div>

        <div className="card">
          <h3>导出与打印</h3>
          <div className="btn-row">
            <button className="btn small" onClick={() => exportAllCsv(scheme)}>导出全部 CSV 表</button>
            <button className="btn small" onClick={() => downloadSvg(scheme, section.id)}>导出本分区剖面 SVG</button>
            <button className="btn small primary" onClick={() => openPrintReport(scheme)}>打印 / 存 PDF 报告</button>
          </div>
        </div>
      </div>

      <div className="content" style={{ flex: 1 }}>
        <div className="tabs">
          <button className={tab === 'rows' ? 'active' : ''} onClick={() => setTab('rows')}>逐排 C 值与升起</button>
          <button className={tab === 'occlusion' ? 'active' : ''} onClick={() => setTab('occlusion')}>障碍物与遮挡热力</button>
          <button className={tab === 'pricing' ? 'active' : ''} onClick={() => setTab('pricing')}>票价分区建议</button>
        </div>

        {tab === 'rows' && <RowsTab sectionId={section.id} analysis={analysis} minC={scheme.settings.minC} />}
        {tab === 'occlusion' && <OcclusionTab sectionId={section.id} />}
        {tab === 'pricing' && <PricingTab />}
      </div>
      {node}
    </div>
  );
}

function RowsTab({ sectionId, analysis, minC }: { sectionId: string; analysis: ReturnType<typeof analyzeRows>; minC: number }) {
  const { current } = useStore();
  const scheme = current!;
  const svg = useMemo(() => profileSvg(scheme, sectionId, 920, 420), [scheme, sectionId]);
  return (
    <>
      <div className="card">
        <h3>视线剖面图</h3>
        <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="视线剖面" style={{ width: '100%', borderRadius: 8 }} />
        <div className="legend-row">
          <span><i className="dot" style={{ background: '#2f9e5f' }} />达标排眼点</span>
          <span><i className="dot" style={{ background: '#d64545' }} />不达标排(红色)</span>
          <span><i className="dot" style={{ background: '#2f6fb0' }} />踏步轮廓</span>
          <span><i className="dot" style={{ background: '#8a5cc0' }} />连续理论眼高(反推对照)</span>
        </div>
      </div>
      <div className="card">
        <h3>逐排计算表(C&lt;{minC * 1000}mm 的排红色标出)</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>排号</th><th>踏步标高(m)</th><th>本排升高(m)</th><th>眼高(m)</th><th>距焦点(m)</th><th>C 值(mm)</th><th>判定</th><th>边线遮挡深度(m)</th></tr>
            </thead>
            <tbody>
              {analysis.map((r) => (
                <tr key={r.row} className={r.cValue === null ? '' : r.pass ? 'good' : 'bad'}>
                  <td>{r.row}</td>
                  <td className="mono">{r.floorY.toFixed(3)}</td>
                  <td className="mono">{r.riser.toFixed(3)}</td>
                  <td className="mono">{r.eyeY.toFixed(3)}</td>
                  <td className="mono">{r.distance.toFixed(2)}</td>
                  <td className="mono">{r.cValue === null ? '—' : (r.cValue * 1000).toFixed(1)}</td>
                  <td>{r.cValue === null ? '首排' : <span className={`badge ${r.pass ? 'ok' : 'bad'}`}>{r.pass ? '达标' : '不达标'}</span>}</td>
                  <td className="mono">{r.edgeBlockedDepth === null ? '—' : r.edgeBlockedDepth < 1e-6 ? '0.000' : r.edgeBlockedDepth >= 900 ? '全场遮挡' : r.edgeBlockedDepth.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function OcclusionTab({ sectionId }: { sectionId: string }) {
  const { current, update } = useStore();
  const scheme = current!;
  const section = scheme.sections.find((s) => s.id === sectionId)!;
  const { show, node } = useToast();
  const geo = sectionGeometry(section);

  // 每排中点的被挡场地比例热力(沿排数纵向条带)
  const heat = useMemo(() => {
    return geo.rows.map((row, i) => {
      // 眼高 = 踏面标高 + 坐姿眼高(与视线分析同口径)
      const src = section.riseMode === 'constant'
        ? new Array(section.rowCount - 1).fill(section.constantRiser)
        : section.risers;
      const floors = [section.firstRowHeight];
      for (let k = 0; k < i; k++) floors.push(floors[k] + (src[k] ?? 0));
      const eye = { x: row.x, z: row.z, y: floors[i] + scheme.settings.eyeHeight };
      const ratio = seatBlockedRatio(eye, scheme.obstructions, scheme.venue, scheme.settings.occlusionGridX, scheme.settings.occlusionGridZ);
      return { row: i + 1, ratio };
    });
  }, [geo, section, scheme]);

  const addObstruction = (type: ObstructionType) => {
    const o = createObstruction({ type, name: type === 'canopy' ? '挑檐' : type === 'column' ? '立柱' : '栏杆' });
    if (type === 'column') { o.radius = 0.5; o.y0 = 0; o.y1 = 9; o.y = 4.5; }
    if (type === 'railing') { o.height = 0.15; o.y = 1.1; o.depth = 0.1; }
    update((d) => d.obstructions.push(o), '新增障碍物');
    show('已新增障碍物,可编辑位置与尺寸');
  };

  const patchObs = (id: string, p: Partial<Obstruction>) => {
    update((d) => { Object.assign(d.obstructions.find((o) => o.id === id)!, p); }, '编辑障碍物');
  };

  const heatColor = (r: number) => {
    // 0 绿 → 0.5 橙 → 1 红
    const hue = 120 * (1 - Math.min(1, r));
    return `hsl(${hue}, 75%, 45%)`;
  };

  return (
    <>
      <div className="card">
        <h3>障碍物管理(挑檐 / 立柱 / 栏杆)</h3>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button className="btn small" onClick={() => addObstruction('canopy')}>＋ 挑檐(盒体)</button>
          <button className="btn small" onClick={() => addObstruction('column')}>＋ 立柱(圆柱)</button>
          <button className="btn small" onClick={() => addObstruction('railing')}>＋ 栏杆(薄盒)</button>
        </div>
        {scheme.obstructions.length === 0 && <div className="muted">暂无障碍物。添加后热力图与座位预览会实时计算遮挡。</div>}
        {scheme.obstructions.map((o) => (
          <div key={o.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>{o.name} <span className="tag">{o.type}</span></strong>
              <div className="btn-row">
                <label className="switch"><input type="checkbox" checked={o.enabled} onChange={(e) => patchObs(o.id, { enabled: e.target.checked })} />启用</label>
                <button className="btn small danger" onClick={() => update((d) => { d.obstructions = d.obstructions.filter((x) => x.id !== o.id); }, '删除障碍物')}>删除</button>
              </div>
            </div>
            <div className="field-grid">
              <div className="field"><label>中心 X (m)</label><input type="number" step="0.5" value={o.x} onChange={(e) => patchObs(o.id, { x: +e.target.value })} /></div>
              <div className="field"><label>中心 Z (m)</label><input type="number" step="0.5" value={o.z} onChange={(e) => patchObs(o.id, { z: +e.target.value })} /></div>
              {o.type === 'column' ? (
                <>
                  <div className="field"><label>半径 (m)</label><input type="number" step="0.05" value={o.radius} onChange={(e) => patchObs(o.id, { radius: +e.target.value })} /></div>
                  <div className="field"><label>柱底/柱顶 Y (m)</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="number" step="0.1" value={o.y0} onChange={(e) => patchObs(o.id, { y0: +e.target.value })} />
                      <input type="number" step="0.1" value={o.y1} onChange={(e) => patchObs(o.id, { y1: +e.target.value })} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="field"><label>中心 Y (m)</label><input type="number" step="0.1" value={o.y} onChange={(e) => patchObs(o.id, { y: +e.target.value })} /></div>
                  <div className="field"><label>宽 X / 深 Z / 高 (m)</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="number" step="0.1" value={o.width} onChange={(e) => patchObs(o.id, { width: +e.target.value })} />
                      <input type="number" step="0.1" value={o.depth} onChange={(e) => patchObs(o.id, { depth: +e.target.value })} />
                      <input type="number" step="0.1" value={o.height} onChange={(e) => patchObs(o.id, { height: +e.target.value })} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>{section.name} · 每排座位被挡场地比例热力图</h3>
        <p className="muted">对每个采样座位,向场地 {scheme.settings.occlusionGridX}×{scheme.settings.occlusionGridZ} 网格投射线,统计被启用障碍物遮挡的比例。</p>
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 200, padding: '10px 4px', borderBottom: '1px solid var(--line)' }}>
          {heat.map((h) => (
            <div key={h.row} title={`第${h.row}排 遮挡 ${(h.ratio * 100).toFixed(1)}%`}
              style={{
                flex: 1, minWidth: 6, height: `${Math.max(3, h.ratio * 100)}%`,
                background: heatColor(h.ratio), borderRadius: '3px 3px 0 0',
              }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          <span>第 1 排(近场)</span><span>第 {section.rowCount} 排(远场)</span>
        </div>
        <div className="legend-row">
          <span><i className="dot" style={{ background: heatColor(0) }} />0% 无遮挡</span>
          <span><i className="dot" style={{ background: heatColor(0.5) }} />50%</span>
          <span><i className="dot" style={{ background: heatColor(1) }} />100% 全场遮挡</span>
          <span>全分区平均遮挡:<b>{(heat.reduce((a, h) => a + h.ratio, 0) / Math.max(1, heat.length) * 100).toFixed(1)}%</b></span>
        </div>
      </div>
      {node}
    </>
  );
}

function PricingTab() {
  const { current, update } = useStore();
  const scheme = current!;
  const { show, node } = useToast();
  const scores = useMemo(() => scoreSections(scheme), [scheme]);
  const stats = zoneStatistics(scheme);
  const unassigned = unassignedSeats(scheme);

  const apply = () => {
    update((d) => applyZoneSuggestions(d), '自动票价分区建议');
    show('已按视线质量生成票价分区建议(人工锁定的分区不受影响)');
  };

  return (
    <>
      <div className="stat-grid">
        {stats.map((st) => (
          <div key={st.zone.id} className="stat">
            <div className="v" style={{ color: st.zone.color }}>{st.seats.toLocaleString()}</div>
            <div className="l">{st.zone.name} · {st.sections} 分区 · {(st.ratio * 100).toFixed(1)}%</div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>票价分区(按视线质量自动建议)</h3>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button className="btn primary small" onClick={apply}>自动建议票价分区</button>
          {unassigned > 0 && <span className="badge warn">未分区座位 {unassigned.toLocaleString()}</span>}
        </div>
        <div className="zone-bar">
          {stats.filter((s) => s.seats > 0).map((s) => (
            <div key={s.zone.id} style={{ background: s.zone.color, flex: s.seats }}>{(s.ratio * 100).toFixed(0)}%</div>
          ))}
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>看台分区</th><th>质量分</th><th>平均 C(mm)</th><th>合格率</th><th>建议票价区</th><th>当前票价区</th><th>操作</th></tr></thead>
            <tbody>
              {scheme.sections.map((s) => {
                const sc = scores.find((x) => x.sectionId === s.id)!;
                const suggested = scheme.priceZones.find((z) => z.id === sc.suggestedZoneId);
                return (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="mono">{sc.score}</td>
                    <td className="mono">{(sc.avgC * 1000).toFixed(1)}</td>
                    <td className="mono">{(sc.passRate * 100).toFixed(0)}%</td>
                    <td><span className="dot" style={{ background: suggested?.color }} />{suggested?.name}</td>
                    <td>
                      <select value={s.priceZoneId ?? ''} onChange={(e) => update((d) => {
                        const t = d.sections.find((x) => x.id === s.id)!;
                        t.priceZoneId = e.target.value || null;
                        t.zoneManual = true;
                      }, '手动调整票价区')}>
                        <option value="">未分区</option>
                        {scheme.priceZones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <label className="switch">
                        <input type="checkbox" checked={s.zoneManual} onChange={(e) => update((d) => {
                          d.sections.find((x) => x.id === s.id)!.zoneManual = e.target.checked;
                        }, '锁定分区')} />锁定
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {node}
    </>
  );
}
