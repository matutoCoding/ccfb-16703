import { useStore } from '../state/context';
import { useToast } from '../components/useToast';
import { uid } from '../lib/uid';
import type { Settings } from '../model/types';

export function SettingsPage() {
  const { current, update, saveSnapshot } = useStore();
  const scheme = current!;
  const { show, node } = useToast();
  const st = scheme.settings;

  const patch = (p: Partial<Settings>) => update((d) => Object.assign(d.settings, p), '修改设置');

  return (
    <div className="layout">
      <div className="sidebar">
        <div className="card">
          <h3>视线计算参数</h3>
          <div className="field">
            <label>坐姿眼高(m,眼距踏面)</label>
            <input type="number" step="0.01" value={st.eyeHeight} onChange={(e) => patch({ eyeHeight: +e.target.value })} />
          </div>
          <div className="field">
            <label>站姿眼高(m)</label>
            <input type="number" step="0.01" value={st.standingEyeHeight} onChange={(e) => patch({ standingEyeHeight: +e.target.value })} />
          </div>
          <div className="field">
            <label>规范最小 C 值(m)</label>
            <input type="number" step="0.005" value={st.minC} onChange={(e) => patch({ minC: +e.target.value })} />
            <div className="muted">常用 0.06m(60mm),高标准看台可取 0.09~0.12m</div>
          </div>
          <div className="field">
            <label>施工取整步长(m)</label>
            <input type="number" step="0.001" min={0.001} value={st.constructionStep} onChange={(e) => patch({ constructionStep: Math.max(0.001, +e.target.value) })} />
            <div className="muted">0.001 = 1 毫米;反推升高按此向上取整,误差严格小于一个步长</div>
          </div>
          <button className="btn primary small" onClick={() => { void saveSnapshot('参数调整节点'); show('已保存参数快照到历史版本'); }}>
            保存当前参数为历史节点
          </button>
        </div>

        <div className="card">
          <h3>遮挡热力图采样</h3>
          <div className="field-grid">
            <div className="field">
              <label>场地网格 X 向</label>
              <input type="number" min={4} max={80} value={st.occlusionGridX} onChange={(e) => patch({ occlusionGridX: Math.max(4, +e.target.value) })} />
            </div>
            <div className="field">
              <label>场地网格 Z 向</label>
              <input type="number" min={4} max={80} value={st.occlusionGridZ} onChange={(e) => patch({ occlusionGridZ: Math.max(4, +e.target.value) })} />
            </div>
          </div>
          <div className="field">
            <label>历史版本上限</label>
            <input type="number" min={5} max={200} value={st.maxVersions} onChange={(e) => patch({ maxVersions: Math.max(5, +e.target.value) })} />
          </div>
        </div>
      </div>

      <div className="content">
        <div className="card">
          <h3>票价分区管理</h3>
          <div className="btn-row" style={{ marginBottom: 12 }}>
            <button className="btn small primary" onClick={() => update((d) => d.priceZones.push({
              id: uid('zone'), name: `新票价区 ${d.priceZones.length + 1}`, color: '#888888',
            }), '新增票价区')}>＋ 新增票价区</button>
          </div>
          <table className="data">
            <thead><tr><th style={{ width: 80 }}>颜色</th><th>名称</th><th style={{ width: 120 }}>操作</th></tr></thead>
            <tbody>
              {scheme.priceZones.map((z) => (
                <tr key={z.id}>
                  <td><input type="color" value={z.color} onChange={(e) => update((d) => { d.priceZones.find((x) => x.id === z.id)!.color = e.target.value; }, '票价区颜色')} /></td>
                  <td><input style={{ width: '60%' }} value={z.name} onChange={(e) => update((d) => { d.priceZones.find((x) => x.id === z.id)!.name = e.target.value; }, '票价区名称')} /></td>
                  <td>
                    <button className="btn small danger" disabled={scheme.priceZones.length <= 1}
                      onClick={() => update((d) => {
                        d.priceZones = d.priceZones.filter((x) => x.id !== z.id);
                        d.sections.forEach((s) => { if (s.priceZoneId === z.id) s.priceZoneId = null; });
                      }, '删除票价区')}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>计算口径说明</h3>
          <ol style={{ lineHeight: 2, color: 'var(--muted)', paddingLeft: 20 }}>
            <li>C 值采用规范剖面公式:<span className="mono">C = (Y₂-F)·d₁/d₂ − (Y₁-F)</span>,其中 d 为眼点到视点水平距离,Y 为眼高。</li>
            <li>变升起反推采用手册逐排递推:每排代入前排【实际采用标高】求本排眼高下限,再按施工步长向上取整。</li>
            <li>反推结果结构性保证:代回正向计算每排 C ≥ 设定最小 C,且每级升高与未取整手算公式之差严格小于一个取整步长(1mm)。</li>
            <li>遮挡判定:挑檐/栏杆按轴对齐盒体、立柱按竖直圆柱做线段求交;场地按网格采样统计每座位可见比例。</li>
            <li>弧形转角按同心圆弧逐排展开,法线沿径向指向圆心,排长按弧长计。</li>
          </ol>
        </div>
      </div>
      {node}
    </div>
  );
}
