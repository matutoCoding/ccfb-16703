import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Scheme, SchemeVersion } from '../model/types';
import { cloneScheme, createScheme } from '../model/factory';
import { createBasketball10k, createFootball40k } from '../model/presets';
import { db } from '../db/indexeddb';
import { uid } from '../lib/uid';
import type { VenueKind } from '../model/types';
import { StoreContext, type StoreState } from './context';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [current, setCurrent] = useState<Scheme | null>(null);
  const [versions, setVersions] = useState<SchemeVersion[]>([]);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const lastSnapshot = useRef<number>(0);
  const pendingLabel = useRef<string>('自动保存');

  useEffect(() => {
    db.listSchemes().then((list) => {
      setSchemes(list);
      setReady(true);
    });
  }, []);

  const refreshVersions = useCallback(async () => {
    if (current) setVersions(await db.listVersions(current.id));
  }, [current]);

  const update = useCallback(
    (mutator: (draft: Scheme) => void, label = '自动保存') => {
      if (!current) return;
      const draft = structuredClone(current);
      mutator(draft);
      pendingLabel.current = label;
      setCurrent(draft);
      setSchemes((prev) => [draft, ...prev.filter((s) => s.id !== draft.id)]);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        const now = Date.now();
        const stamped = { ...draft, updatedAt: now };
        void db.putScheme(stamped);
        // 距上次历史快照超过 30 秒才生成新版本,避免版本爆炸
        if (now - lastSnapshot.current > 30_000) {
          lastSnapshot.current = now;
          const version: SchemeVersion = {
            id: uid('ver'),
            schemeId: stamped.id,
            createdAt: now,
            label: pendingLabel.current,
            data: structuredClone(stamped),
          };
          void db.addVersion(version, stamped.settings.maxVersions).then(() => refreshVersions());
        }
      }, 600);
    },
    [current, refreshVersions],
  );

  const newScheme = useCallback(async (name: string, kind: VenueKind) => {
    const s = createScheme(name, kind);
    await db.putScheme(s);
    setSchemes((prev) => [s, ...prev]);
    setCurrent(s);
    lastSnapshot.current = Date.now();
    const v: SchemeVersion = { id: uid('ver'), schemeId: s.id, createdAt: Date.now(), label: '初始版本', data: structuredClone(s) };
    await db.addVersion(v, s.settings.maxVersions);
    await refreshVersions();
    return s.id;
  }, [refreshVersions]);

  const loadDemo = useCallback(async (which: 'fb40k' | 'bb10k') => {
    const s = which === 'fb40k' ? createFootball40k() : createBasketball10k();
    await db.putScheme(s);
    setSchemes((prev) => [s, ...prev]);
    setCurrent(s);
    lastSnapshot.current = Date.now();
    const v: SchemeVersion = { id: uid('ver'), schemeId: s.id, createdAt: Date.now(), label: '测试方案初始版本', data: structuredClone(s) };
    await db.addVersion(v, s.settings.maxVersions);
    await refreshVersions();
    return s.id;
  }, [refreshVersions]);

  const duplicate = useCallback(async (id: string) => {
    const src = await db.getScheme(id);
    if (!src) return '';
    const copy = cloneScheme(src, `${src.name} 副本`);
    await db.putScheme(copy);
    setSchemes((prev) => [copy, ...prev]);
    setCurrent(copy);
    const v: SchemeVersion = { id: uid('ver'), schemeId: copy.id, createdAt: Date.now(), label: '复制初始版本', data: structuredClone(copy) };
    await db.addVersion(v, copy.settings.maxVersions);
    await refreshVersions();
    return copy.id;
  }, [refreshVersions]);

  const remove = useCallback(async (id: string) => {
    await db.deleteScheme(id);
    setSchemes((prev) => prev.filter((s) => s.id !== id));
    setCurrent((cur) => (cur?.id === id ? null : cur));
  }, []);

  const open = useCallback(async (id: string) => {
    const s = await db.getScheme(id);
    if (s) {
      setCurrent(s);
      lastSnapshot.current = Date.now();
      setVersions(await db.listVersions(id));
    }
  }, []);

  const saveSnapshot = useCallback(
    async (label: string) => {
      if (!current) return;
      const now = Date.now();
      const stamped = { ...current, updatedAt: now };
      await db.putScheme(stamped);
      const v: SchemeVersion = { id: uid('ver'), schemeId: stamped.id, createdAt: now, label, data: structuredClone(stamped) };
      await db.addVersion(v, stamped.settings.maxVersions);
      lastSnapshot.current = now;
      await refreshVersions();
    },
    [current, refreshVersions],
  );

  const restoreVersion = useCallback(
    async (versionId: string) => {
      const v = versions.find((x) => x.id === versionId);
      if (!v) return;
      const restored: Scheme = { ...structuredClone(v.data), updatedAt: Date.now() };
      await db.putScheme(restored);
      setCurrent(restored);
      setSchemes((prev) => [restored, ...prev.filter((s) => s.id !== restored.id)]);
      const snap: SchemeVersion = { id: uid('ver'), schemeId: restored.id, createdAt: Date.now(), label: `回滚到:${v.label}`, data: structuredClone(restored) };
      await db.addVersion(snap, restored.settings.maxVersions);
      await refreshVersions();
    },
    [versions, refreshVersions],
  );

  const deleteVersion = useCallback(
    async (versionId: string) => {
      await db.deleteVersion(versionId);
      await refreshVersions();
    },
    [refreshVersions],
  );

  const value = useMemo<StoreState>(
    () => ({
      schemes, current, versions, ready,
      newScheme, loadDemo, duplicate, remove, open, update,
      refreshVersions, restoreVersion, deleteVersion, saveSnapshot,
    }),
    [schemes, current, versions, ready, newScheme, loadDemo, duplicate, remove, open, update, refreshVersions, restoreVersion, deleteVersion, saveSnapshot],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
