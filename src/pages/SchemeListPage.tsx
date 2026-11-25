import { useState } from 'react';
import { useStore } from '../state/context';
import { useToast } from '../components/useToast';
import type { VenueKind } from '../model/types';
import { totalSeats } from '../model/presets';

const VENUE_LABEL: Record<VenueKind, string> = {
  football: '足球场',
  athletics: '田径场',
  basketball: '篮球馆',
};

export function SchemeListPage({ onOpen, hasCurrent, onContinue }: { onOpen: () => void; hasCurrent: boolean; onContinue: () => void }) {
  const { schemes, newScheme, loadDemo, duplicate, remove, open } = useStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<VenueKind>('football');
  const { show, node } = useToast();

  const handleCreate = async () => {
    if (!name.trim()) { show('请输入方案名称'); return; }
    await newScheme(name.trim(), kind);
    setCreating(false);
    setName('');
    show('方案已创建');
    onOpen();
  };

  return (
    <div className="content">
      <div className="card">
        <h3>方案管理</h3>
        <div className="btn-row">
          <button className="btn primary" onClick={() => setCreating(true)}>＋ 新建方案</button>
          <button className="btn" onClick={async () => { await loadDemo('fb40k'); show('已载入四万座足球场测试方案'); onOpen(); }}>
            载入四万座足球场
          </button>
          <button className="btn" onClick={async () => { await loadDemo('bb10k'); show('已载入一万座篮球馆测试方案'); onOpen(); }}>
            载入一万座篮球馆
          </button>
          {hasCurrent && <button className="btn" onClick={onContinue}>继续编辑当前方案 →</button>}
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          数据保存在浏览器 IndexedDB,改动自动落库并按时间生成历史版本,可随时回滚。
        </p>
      </div>

      <div className="card">
        <h3>全部方案({schemes.length})</h3>
        {schemes.length === 0 && <div className="muted">还没有方案,点击上方按钮新建或载入测试方案。</div>}
        {schemes.map((s) => (
          <div key={s.id} className="scheme-item" onClick={async () => { await open(s.id); onOpen(); }}>
            <div className="name">
              <span>{s.name}</span>
              <span className="tag">{VENUE_LABEL[s.venue.kind]}</span>
            </div>
            <div className="meta">
              {s.sections.length} 个看台分区 · {totalSeats(s).toLocaleString()} 座 · 更新于 {new Date(s.updatedAt).toLocaleString()}
            </div>
            <div className="btn-row" style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
              <button className="btn small" onClick={async () => { await duplicate(s.id); show('已复制方案'); }}>复制</button>
              <button
                className="btn small danger"
                onClick={() => {
                  if (window.confirm(`确定删除方案「${s.name}」?其历史版本将一并删除。`)) {
                    void remove(s.id);
                    show('方案已删除');
                  }
                }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      {creating && (
        <div className="modal-mask" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>新建方案</h3>
            <div className="field">
              <label>方案名称</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如:奥体中心主体育场" autoFocus />
            </div>
            <div className="field">
              <label>场地类型</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as VenueKind)}>
                <option value="football">足球场</option>
                <option value="athletics">田径场(含跑道)</option>
                <option value="basketball">篮球馆</option>
              </select>
            </div>
            <div className="btn-row">
              <button className="btn" onClick={() => setCreating(false)}>取消</button>
              <button className="btn primary" onClick={handleCreate}>创建</button>
            </div>
          </div>
        </div>
      )}
      {node}
    </div>
  );
}
