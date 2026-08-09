export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export const createWebExtensionStore = (area: {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}): KeyValueStore => ({
  async get<T>(key: string) { return (await area.get(key))[key] as T | undefined; },
  async set<T>(key: string, value: T) { await area.set({[key]: value}); },
  async remove(key: string) { await area.remove(key); },
});

export const createAsyncStorageStore = (storage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}): KeyValueStore => ({
  async get<T>(key: string) { const value = await storage.getItem(key); return value === null ? undefined : JSON.parse(value) as T; },
  async set<T>(key: string, value: T) { await storage.setItem(key, JSON.stringify(value)); },
  async remove(key: string) { await storage.removeItem(key); },
});

export const syncerStorageKeys = (namespace = 'syncer') => ({
  server: `${namespace}_server`,
  activeRoom: `${namespace}_active_room`,
  ownerToken: (roomName: string) => `${namespace}_owner_${roomName}`,
  sessions: `${namespace}_active_sessions`,
});
