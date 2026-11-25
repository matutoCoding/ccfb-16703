import { createContext, useContext } from 'react';
import type { Scheme, SchemeVersion, VenueKind } from '../model/types';

export interface StoreState {
  schemes: Scheme[];
  current: Scheme | null;
  versions: SchemeVersion[];
  ready: boolean;
  newScheme: (name: string, kind: VenueKind) => Promise<string>;
  loadDemo: (which: 'fb40k' | 'bb10k') => Promise<string>;
  duplicate: (id: string) => Promise<string>;
  remove: (id: string) => Promise<void>;
  open: (id: string) => Promise<void>;
  /** 局部更新方案;debounce 后落库并记录历史版本 */
  update: (mutator: (draft: Scheme) => void, label?: string) => void;
  refreshVersions: () => Promise<void>;
  restoreVersion: (versionId: string) => Promise<void>;
  deleteVersion: (versionId: string) => Promise<void>;
  saveSnapshot: (label: string) => Promise<void>;
}

export const StoreContext = createContext<StoreState | null>(null);

export function useStore(): StoreState {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用');
  return ctx;
}
