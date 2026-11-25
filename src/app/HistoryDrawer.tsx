import { useStore } from '../state/context';

export function HistoryDrawer({ onClose }: { onClose: () => void }) {
  const { versions, restoreVersion, deleteVersion } = useStore();
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{ width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <h3>历史版本(可回到任意一版)</h3>
        <div style={{ overflow: 'auto', flex: 1, border: '1px solid var(--line)', borderRadius: 8 }}>
          {versions.length === 0 && <div className="muted" style={{ padding: 20, textAlign: 'center' }}>暂无历史版本,改动会自动记录</div>}
          {versions.map((v) => (
            <div key={v.id} className="version-item">
              <div>
                <div style={{ fontWeight: 600 }}>{v.label}</div>
                <div className="muted">{new Date(v.createdAt).toLocaleString()}</div>
              </div>
              <div className="btn-row">
                <button className="btn small primary" onClick={() => { void restoreVersion(v.id); onClose(); }}>回滚</button>
                <button className="btn small danger" onClick={() => void deleteVersion(v.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
        <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
