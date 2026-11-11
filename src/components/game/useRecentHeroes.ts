import { useCallback, useEffect, useState } from 'react';

/** 最近使用：localStorage 只存 id，武将数据始终以 HEROES 为准 */
export const RECENT_HERO_KEY = 'sgs-recent-heroes';
export const RECENT_HERO_LIMIT = 5;

const sanitize = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.length > 0).slice(0, RECENT_HERO_LIMIT)
    : [];

export const readRecentHeroIds = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_HERO_KEY);
    return raw ? sanitize(JSON.parse(raw) as unknown) : [];
  } catch {
    // 隐私模式下 localStorage 可能不可用，或历史数据不是合法 JSON
    return [];
  }
};

const writeRecentHeroIds = (ids: string[]): void => {
  try {
    localStorage.setItem(RECENT_HERO_KEY, JSON.stringify(ids.slice(0, RECENT_HERO_LIMIT)));
  } catch {
    /* 忽略写入失败 */
  }
};

/** 把 id 提到最前并截断到 5 个；返回写入后的完整列表 */
export const pushRecentHero = (id: string): string[] => {
  const next = [id, ...readRecentHeroIds().filter(v => v !== id)].slice(0, RECENT_HERO_LIMIT);
  writeRecentHeroIds(next);
  return next;
};

/** 最近使用列表：初始从 localStorage 读，多标签页改动时同步 */
export const useRecentHeroes = (): { ids: string[]; push: (id: string) => void } => {
  const [ids, setIds] = useState<string[]>(readRecentHeroIds);

  const push = useCallback((id: string) => {
    setIds(pushRecentHero(id));
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === RECENT_HERO_KEY) setIds(readRecentHeroIds());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { ids, push };
};
