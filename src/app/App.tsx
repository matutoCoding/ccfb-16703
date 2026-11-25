import { useState } from 'react';
import { useStore } from '../state/context';
import { SchemeListPage } from '../pages/SchemeListPage';
import { VenuePage } from '../pages/VenuePage';
import { StandPage } from '../pages/StandPage';
import { SightlinePage } from '../pages/SightlinePage';
import { PreviewPage } from '../pages/PreviewPage';
import { SettingsPage } from '../pages/SettingsPage';
import { HistoryDrawer } from './HistoryDrawer';

export type PageKey = 'list' | 'venue' | 'stand' | 'sightline' | 'preview' | 'settings';

const NAV: { key: PageKey; label: string }[] = [
  { key: 'venue', label: '场地与焦点' },
  { key: 'stand', label: '看台建模' },
  { key: 'sightline', label: '视线分析' },
  { key: 'preview', label: '座位预览' },
  { key: 'settings', label: '设置' },
];

export function App() {
  const store = useStore();
  const [page, setPage] = useState<PageKey>('list');
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!store.ready) {
    return <div className="empty"><div className="big">⏳</div><div>正在加载本地数据…</div></div>;
  }
  if (!store.current || page === 'list') {
    return (
      <div className="app">
        <header className="topbar">
          <span className="logo">🏟 看台视线分析与座位视角预览系统</span>
          <span className="spacer" />
        </header>
        <SchemeListPage
          onOpen={() => setPage('venue')}
          hasCurrent={!!store.current}
          onContinue={() => setPage('venue')}
        />
      </div>
    );
  }

  const s = store.current;
  return (
    <div className="app">
      <header className="topbar">
        <span className="logo">🏟 视线分析系统</span>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.key} className={page === n.key ? 'active' : ''} onClick={() => setPage(n.key)}>
              {n.label}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <span className="scheme-name" title={s.name}>{s.name}</span>
        <button className="btn small" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }} onClick={() => setHistoryOpen(true)}>
          历史版本 ({store.versions.length})
        </button>
        <button className="btn small" style={{ background: 'transparent', color: '#fff' }} onClick={() => setPage('list')}>
          方案列表
        </button>
      </header>
      {page === 'venue' && <VenuePage />}
      {page === 'stand' && <StandPage />}
      {page === 'sightline' && <SightlinePage />}
      {page === 'preview' && <PreviewPage />}
      {page === 'settings' && <SettingsPage />}
      {historyOpen && <HistoryDrawer onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}
