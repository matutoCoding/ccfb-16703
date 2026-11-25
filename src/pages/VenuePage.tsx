import { useMemo } from 'react';
import { useStore } from '../state/context';
import { autoFocuses } from '../model/factory';
import { Viewport3D } from '../components/Viewport3D';
import { useToast } from '../components/useToast';
import type { VenueKind } from '../model/types';

const KIND_LABEL: Record<VenueKind, string> = { football: '足球场', athletics: '田径场', basketball: '篮球馆' };

export function VenuePage() {
  const { current, update } = useStore();
  const { show, node } = useToast();
  const scheme = current!;
  const v = scheme.venue;

  const plan = useMemo(() => drawPlan(scheme), [scheme]);

  const changeKind = (kind: VenueKind) => {
    update((d) => {
      const preset = autoFocuses(kind, d.venue.fieldLength, d.venue.fieldWidth, d.venue.trackWidth);
      // 用规范预设重建,保留用户已手动改过的焦点坐标(按名称匹配)
      d.venue.kind = kind;
      d.venue.focuses = preset.map((f) => {
        const old = d.venue.focuses.find((o) => o.name === f.name && !o.auto);
        return old ? { ...f, x: old.x, z: old.z, auto: false } : f;
      });
    }, '切换场地类型');
  };

  const resetFocus = () => {
    update((d) => {
      d.venue.focuses = autoFocuses(d.venue.kind, d.venue.fieldLength, d.venue.fieldWidth, d.venue.trackWidth);
    }, '焦点恢复规范位置');
    show('焦点已恢复到规范位置(边线/跑道外沿)');
  };

  return (
    <div className="layout">
      <div className="sidebar">
        <div className="card">
          <h3>场地参数</h3>
          <div className="field">
            <label>场地类型</label>
            <select value={v.kind} onChange={(e) => changeKind(e.target.value as VenueKind)}>
              {(Object.keys(KIND_LABEL) as VenueKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div className="field-grid">
            <div className="field">
              <label>场地长度 (m)</label>
              <input type="number" step="0.1" value={v.fieldLength}
                onChange={(e) => update((d) => { d.venue.fieldLength = +e.target.value; }, '场地尺寸')} />
            </div>
            <div className="field">
              <label>场地宽度 (m)</label>
              <input type="number" step="0.1" value={v.fieldWidth}
                onChange={(e) => update((d) => { d.venue.fieldWidth = +e.target.value; }, '场地尺寸')} />
            </div>
            {v.kind === 'athletics' && (
              <div className="field">
                <label>跑道宽度 (m)</label>
                <input type="number" step="0.01" value={v.trackWidth}
                  onChange={(e) => update((d) => { d.venue.trackWidth = +e.target.value; }, '跑道宽度')} />
              </div>
            )}
            <div className="field">
              <label>地面标高 (m)</label>
              <input type="number" step="0.05" value={v.floorY}
                onChange={(e) => update((d) => { d.venue.floorY = +e.target.value; }, '地面标高')} />
            </div>
            <div className="field">
              <label>焦点高度 (m)</label>
              <input type="number" step="0.01" value={v.focusHeight}
                onChange={(e) => update((d) => { d.venue.focusHeight = +e.target.value; }, '焦点高度')} />
            </div>
          </div>
          <p className="muted">
            规范焦点:{v.kind === 'athletics' ? '自动落在跑道外沿四边中点' : '自动落在比赛场地边线外沿四边中点'}
          </p>
          <button className="btn small" onClick={resetFocus}>恢复规范焦点位置</button>
        </div>

        <div className="card">
          <h3>视点焦点({v.focuses.length})</h3>
          {v.focuses.map((f, i) => (
            <div key={f.id} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: 6 }}>
                <span>{f.name}</span>
                <span className={`badge ${f.auto ? 'ok' : 'warn'}`}>{f.auto ? '规范自动' : '手动'}</span>
              </div>
              <div className="field-grid">
                <div className="field">
                  <label>X (m)</label>
                  <input type="number" step="0.1" value={f.x}
                    onChange={(e) => update((d) => { d.venue.focuses[i].x = +e.target.value; d.venue.focuses[i].auto = false; }, '手动调整焦点')} />
                </div>
                <div className="field">
                  <label>Z (m)</label>
                  <input type="number" step="0.1" value={f.z}
                    onChange={(e) => update((d) => { d.venue.focuses[i].z = +e.target.value; d.venue.focuses[i].auto = false; }, '手动调整焦点')} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="full" style={{ padding: 16, gap: 14 }}>
        <div className="card" style={{ flex: '1 1 55%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h3>三维场地</h3>
          <div className="viewport" style={{ flex: 1 }}>
            <Viewport3D key={scheme.id + scheme.updatedAt} scheme={scheme} />
          </div>
        </div>
        <div className="card" style={{ flex: '1 1 45%' }}>
          <h3>顶视平面图(红锥为视点焦点)</h3>
          <img src={plan} alt="场地顶视平面" style={{ width: '100%', borderRadius: 8, background: '#fff' }} />
        </div>
      </div>
      {node}
    </div>
  );
}

/** 用 SVG dataURL 画顶视平面 */
function drawPlan(scheme: ReturnType<typeof useStore>['current']): string {
  if (!scheme) return '';
  const { fieldLength: L, fieldWidth: W, trackWidth: t, kind, focuses } = scheme.venue;
  const scale = 520 / Math.max(L + 2 * t + 20, W + 2 * t + 20);
  const Wpx = (L + 2 * t + 16) * scale;
  const Hpx = (W + 2 * t + 16) * scale;
  const cx = Wpx / 2;
  const cy = Hpx / 2;
  const X = (x: number) => cx + x * scale;
  const Z = (z: number) => cy + z * scale;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wpx}" height="${Hpx}" viewBox="0 0 ${Wpx} ${Hpx}">
    <rect width="100%" height="100%" fill="#f7f9fc"/>
    ${kind === 'athletics' ? `<rect x="${X(-L / 2 - t)}" y="${Z(-W / 2 - t)}" width="${(L + 2 * t) * scale}" height="${(W + 2 * t) * scale}" fill="#d98a5f" rx="40"/>` : ''}
    <rect x="${X(-L / 2)}" y="${Z(-W / 2)}" width="${L * scale}" height="${W * scale}" fill="#4f9e63" stroke="#fff" stroke-width="2"/>
    <line x1="${cx}" y1="${Z(-W / 2)}" x2="${cx}" y2="${Z(W / 2)}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${cy}" r="${W * 0.13 * scale}" fill="none" stroke="#fff" stroke-width="1.5"/>
    ${focuses.map((f) => `
      <circle cx="${X(f.x)}" cy="${Z(f.z)}" r="6" fill="#ff4d3d" stroke="#fff" stroke-width="1.5"/>
      <text x="${X(f.x) + 9}" y="${Z(f.z) + 4}" font-size="11" fill="#b83226" font-family="sans-serif">${f.name.replace('焦点', '')}${f.auto ? '' : '✎'}</text>
    `).join('')}
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
