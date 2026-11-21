import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/*
 * Node >= 25 ships its own global `localStorage` (undefined without --localstorage-file), which shadows
 * jsdom's Storage in the test environment. Provide a spec-compliant in-memory Storage instead.
 */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  let usable = false;
  try {
    usable = typeof window[name]?.getItem === 'function';
  } catch {
    usable = false;
  }
  if (!usable) {
    Object.defineProperty(window, name, { value: new MemoryStorage(), configurable: true });
    Object.defineProperty(globalThis, name, { value: window[name], configurable: true });
  }
}

afterEach(() => {
  cleanup();
});
