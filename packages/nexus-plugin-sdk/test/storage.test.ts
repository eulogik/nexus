import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PluginStorageProvider } from '../src/storage.js';

describe('PluginStorageProvider', () => {
  let storage: PluginStorageProvider;

  beforeEach(() => {
    storage = new PluginStorageProvider({ namespace: 'test-ns' });
  });

  afterEach(() => {
    storage.dispose();
  });

  it('set() stores a value', async () => {
    await storage.set('key1', 'value1');
    const result = await storage.get('key1');
    expect(result).toBe('value1');
  });

  it('get() retrieves stored value', async () => {
    await storage.set('foo', { bar: 42 });
    const result = await storage.get('foo');
    expect(result).toEqual({ bar: 42 });
  });

  it('get() returns undefined for missing key', async () => {
    const result = await storage.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('delete() removes a key', async () => {
    await storage.set('temp', 'data');
    const deleted = await storage.delete('temp');
    expect(deleted).toBe(true);
    const result = await storage.get('temp');
    expect(result).toBeUndefined();
  });

  it('delete() returns false for missing key', async () => {
    const deleted = await storage.delete('nope');
    expect(deleted).toBe(false);
  });

  it('clear() removes all keys for the namespace', async () => {
    await storage.set('a', 1);
    await storage.set('b', 2);
    await storage.clear();
    expect(await storage.get('a')).toBeUndefined();
    expect(await storage.get('b')).toBeUndefined();
  });

  it('getAll() returns all key-value pairs', async () => {
    await storage.set('x', 10);
    await storage.set('y', 20);
    const all = await storage.getAll();
    expect(all).toEqual({ x: 10, y: 20 });
  });

  it('Multiple instances have isolated namespaces', async () => {
    const storageA = new PluginStorageProvider({ namespace: 'nsA' });
    const storageB = new PluginStorageProvider({ namespace: 'nsB' });

    await storageA.set('shared-key', 'from-a');
    await storageB.set('shared-key', 'from-b');

    expect(await storageA.get('shared-key')).toBe('from-a');
    expect(await storageB.get('shared-key')).toBe('from-b');

    storageA.dispose();
    storageB.dispose();
  });

  it('dispose() cleans up file watcher', () => {
    const spy = new PluginStorageProvider({ namespace: 'spy', persistencePath: '/tmp/test-storage.json' });
    expect(() => spy.dispose()).not.toThrow();
  });
});
