import { useState } from 'react';
import { useStore } from '../state/context';
import { createSection } from '../model/factory';
import { Viewport3D } from '../components/Viewport3D';
import { useToast } from '../components/useToast';
import { sectionSeatCount } from '../model/geometry';
import type { RiseMode, SectionKind, StandSection } from '../model/types';

export function StandPage() {
  const { current, update } = useStore();
  const scheme = current!;
  const [selectedId, setSelectedId] = useState<string | null>(scheme.sections[0]?.id ?? null);
  const { show, node } = useToast();
  const selected = scheme.sections.find((s) => s.id === selectedId) ?? null;

  const patch = (p: Partial<StandSection>, label = '编辑看台') => {
    update((d) => {
      const s = d.sections.find((x) => x.id === selectedId);
      if (s) Object.assign(s, p);
    }, label);
  };

  const addSection = (kind: SectionKind) => {
    const sec = createSection({
      kind,
      name: kind === 'arc' ? '弧形转角看台' : `直线看台 ${scheme.sections.filter((s) => s.kind === 'straight').length + 1}`,
    });
    update((d) => d.sections.push(sec), '新增看台分区');
    setSelectedId(sec.id);
    show('已新增分区,可在左侧编辑参数');
  };

  const removeSection = (id: string) => {
    if (!window.confirm('确定删除该看台分区?')) return;
    update((d) => { d.sections = d.sections.filter((s) => s.id !== id); }, '删除看台分区');
    if (selectedId === id) setSelectedId(null);
  };

  const changeMode = (mode: RiseMode) => {
    update((d) => {
      const s = d.sections.find((x) => x.id === selectedId);
      if (!s) return;
      s.riseMode = mode;
      if (mode === 'variable' && s.risers.length !== s.rowCount - 1) {
        s.risers = new Array(Math.max(0, s.rowCount - 1)).fill(0);
      }
    }, '切换升起方式');
  };

  const changeRowCount = (n: number) => {
    update((d) => {
      const s = d.sections.find((x) => x.id === selectedId);
      if (!s) return;
      s.rowCount = n;
      if (s.risers.length !== n - 1) {
        const next = new Array(Math.max(0, n - 1)).fill(0);
        s.risers.forEach((r, i) => { if (i < next.length) next[i] = r; });
        s.risers = next;
      }
    }, '调整排数');
  };

  return (
    <div className="layout">
      <div className="sidebar">
        <div className="card">
          <h3>看台分区({scheme.sections.length})</h3>
          <div className="btn-row" style={{ marginBottom: 10 }}>
            <button className="btn small primary" onClick={() => addSection('straight')}>＋ 直线看台</button>
            <button className="btn small" onClick={() => addSection('arc')}>＋ 弧形转角</button>
          </div>
          {scheme.sections.map((s) => (
            <div key={s.id} className={`section-list-item ${s.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(s.id)}>
              <div className="row1">
                <span>
                  <span className="dot" style={{ background: scheme.priceZones.find((z) => z.id === s.priceZoneId)?.color ?? '#9aa4b0' }} />
                  {s.name}
                </span>
                <span className="tag">{s.kind === 'arc' ? '弧形' : '直线'} · {s.rowCount}排</span>
              </div>
              <div className="muted" style={{ marginTop: 4 }}>
                {sectionSeatCount(s).toLocaleString()} 座 · 排距 {s.rowSpacing}m · 首排 {s.firstRowHeight}m · {s.riseMode === 'constant' ? `等升起 ${s.constantRiser}m` : '变升起'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="full" style={{ padding: 16, gap: 14, minWidth: 0 }}>
        <div className="card" style={{ flex: '1 1 52%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h3>三维看台模型(点击座位可在「座位预览」页查看视角)</h3>
          <div className="viewport" style={{ flex: 1 }}>
            <Viewport3D key={scheme.id + scheme.updatedAt} scheme={scheme} />
          </div>
        </div>

        <div className="card" style={{ flex: '1 1 48%', overflow: 'auto' }}>
          {!selected ? (
            <div className="muted">请选择或新建一个看台分区进行编辑。</div>
          ) : (
            <>
              <h3>
                分区参数
                <button className="btn small danger" style={{ marginLeft: 'auto' }} onClick={() => removeSection(selected.id)}>删除分区</button>
              </h3>
              <div className="field">
                <label>分区名称</label>
                <input value={selected.name} onChange={(e) => patch({ name: e.target.value })} />
              </div>

              {selected.kind === 'straight' ? (
                <div className="field-grid">
                  <div className="field"><label>基准点 X1 (m)</label><input type="number" step="0.5" value={selected.x1} onChange={(e) => patch({ x1: +e.target.value })} /></div>
                  <div className="field"><label>基准点 Z1 (m)</label><input type="number" step="0.5" value={selected.z1} onChange={(e) => patch({ z1: +e.target.value })} /></div>
                  <div className="field"><label>基准点 X2 (m)</label><input type="number" step="0.5" value={selected.x2} onChange={(e) => patch({ x2: +e.target.value })} /></div>
                  <div className="field"><label>基准点 Z2 (m)</label><input type="number" step="0.5" value={selected.z2} onChange={(e) => patch({ z2: +e.target.value })} /></div>
                  <div className="field">
                    <label>朝向(法线侧)</label>
                    <select value={selected.facing} onChange={(e) => patch({ facing: Number(e.target.value) as 1 | -1 })}>
                      <option value={1}>线段左侧(+法向)</option>
                      <option value={-1}>线段右侧(-法向)</option>
                    </select>
                  </div>
                  <div className="field"><label>首排距基准线 (m)</label><input type="number" step="0.1" value={selected.firstRowDistance} onChange={(e) => patch({ firstRowDistance: +e.target.value })} /></div>
                </div>
              ) : (
                <div className="field-grid">
                  <div className="field"><label>圆心 X (m)</label><input type="number" step="0.5" value={selected.arcCx} onChange={(e) => patch({ arcCx: +e.target.value })} /></div>
                  <div className="field"><label>圆心 Z (m)</label><input type="number" step="0.5" value={selected.arcCz} onChange={(e) => patch({ arcCz: +e.target.value })} /></div>
                  <div className="field"><label>首排半径 (m)</label><input type="number" step="0.1" value={selected.arcR0} onChange={(e) => patch({ arcR0: +e.target.value })} /></div>
                  <div className="field"><label>座椅宽度 (m)</label><input type="number" step="0.02" value={selected.seatWidth} onChange={(e) => patch({ seatWidth: +e.target.value })} /></div>
                  <div className="field"><label>起始角 (°)</label><input type="number" step="1" value={Math.round((selected.arcA0 * 180) / Math.PI)} onChange={(e) => patch({ arcA0: (+e.target.value * Math.PI) / 180 })} /></div>
                  <div className="field"><label>终止角 (°)</label><input type="number" step="1" value={Math.round((selected.arcA1 * 180) / Math.PI)} onChange={(e) => patch({ arcA1: (+e.target.value * Math.PI) / 180 })} /></div>
                </div>
              )}

              <h4>排级参数</h4>
              <div className="field-grid">
                <div className="field"><label>排数</label><input type="number" min={1} max={120} value={selected.rowCount} onChange={(e) => changeRowCount(Math.max(1, +e.target.value))} /></div>
                <div className="field"><label>排距/踏面深 (m)</label><input type="number" step="0.02" value={selected.rowSpacing} onChange={(e) => patch({ rowSpacing: +e.target.value })} /></div>
                <div className="field"><label>首排地面标高 (m)</label><input type="number" step="0.01" value={selected.firstRowHeight} onChange={(e) => patch({ firstRowHeight: +e.target.value })} /></div>
                <div className="field">
                  <label>绑定视点</label>
                  <select value={selected.focusId ?? ''} onChange={(e) => patch({ focusId: e.target.value || null })}>
                    <option value="">自动(取最近焦点)</option>
                    {scheme.venue.focuses.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>

              <h4>升起方式</h4>
              <div className="tabs">
                <button className={selected.riseMode === 'constant' ? 'active' : ''} onClick={() => changeMode('constant')}>等升起</button>
                <button className={selected.riseMode === 'variable' ? 'active' : ''} onClick={() => changeMode('variable')}>变升起</button>
              </div>
              {selected.riseMode === 'constant' ? (
                <div className="field"><label>每排升高 (m)</label><input type="number" step="0.01" value={selected.constantRiser} onChange={(e) => patch({ constantRiser: +e.target.value }, '调整等升起')} /></div>
              ) : (
                <>
                  <p className="muted">变升起升高值可在「视线分析」页一键反推(满足最小 C 值、毫米取整),也可在下表逐排手填。</p>
                  <div className="table-wrap" style={{ maxHeight: 220 }}>
                    <table className="data">
                      <thead><tr><th>排间</th><th>升高 (m)</th></tr></thead>
                      <tbody>
                        {selected.risers.map((r, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1} → {idx + 2}</td>
                            <td>
                              <input
                                style={{ width: 110, padding: '3px 6px', border: '1px solid var(--line)', borderRadius: 5 }}
                                type="number" step="0.001" value={r}
                                onChange={(e) => {
                                  const val = +e.target.value;
                                  update((d) => {
                                    const s = d.sections.find((x) => x.id === selectedId);
                                    if (s) s.risers[idx] = val;
                                  }, '手动调整变升起');
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <div className="muted" style={{ marginTop: 10 }}>当前分区座位数(估算):<b>{sectionSeatCount(selected).toLocaleString()}</b> 座</div>
            </>
          )}
        </div>
      </div>
      {node}
    </div>
  );
}
