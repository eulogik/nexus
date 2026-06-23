import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateManifest, loadManifest, getDefaultManifest, ManifestValidationError } from '../src/manifest.js';
import { writeFileSync, unlinkSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function validManifest(): Record<string, unknown> {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    main: 'index.js',
    permissions: ['fs:read'],
  };
}

describe('validateManifest', () => {
  it('accepts a valid manifest', () => {
    const result = validateManifest(validManifest());
    expect(result.name).toBe('test-plugin');
    expect(result.version).toBe('1.0.0');
    expect(result.main).toBe('index.js');
    expect(result.permissions).toEqual(['fs:read']);
  });

  it('rejects missing name', () => {
    const manifest = validManifest();
    delete manifest.name;
    expect(() => validateManifest(manifest)).toThrow(ManifestValidationError);
    expect(() => validateManifest(manifest)).toThrow("non-empty string 'name'");
  });

  it('rejects missing version', () => {
    const manifest = validManifest();
    delete manifest.version;
    expect(() => validateManifest(manifest)).toThrow(ManifestValidationError);
    expect(() => validateManifest(manifest)).toThrow("non-empty string 'version'");
  });

  it('rejects missing main', () => {
    const manifest = validManifest();
    delete manifest.main;
    expect(() => validateManifest(manifest)).toThrow(ManifestValidationError);
    expect(() => validateManifest(manifest)).toThrow("non-empty string 'main'");
  });

  it('rejects invalid permissions', () => {
    const manifest = validManifest();
    manifest.permissions = ['invalid:perm'];
    expect(() => validateManifest(manifest)).toThrow(ManifestValidationError);
    expect(() => validateManifest(manifest)).toThrow('Invalid permission');
  });

  it('rejects missing permissions array', () => {
    const manifest = validManifest();
    delete manifest.permissions;
    expect(() => validateManifest(manifest)).toThrow(ManifestValidationError);
    expect(() => validateManifest(manifest)).toThrow("array 'permissions'");
  });

  it('rejects non-object manifest', () => {
    expect(() => validateManifest(null)).toThrow(ManifestValidationError);
    expect(() => validateManifest('string')).toThrow(ManifestValidationError);
    expect(() => validateManifest(42)).toThrow(ManifestValidationError);
  });

  it('rejects invalid tools array', () => {
    const manifest = validManifest();
    manifest.tools = 'not-array';
    expect(() => validateManifest(manifest)).toThrow(ManifestValidationError);
  });
});

describe('getDefaultManifest', () => {
  it('returns skeleton with name filled in', () => {
    const result = getDefaultManifest('my-plugin');
    expect(result.name).toBe('my-plugin');
    expect(result.version).toBe('1.0.0');
    expect(result.main).toBe('index.js');
    expect(result.permissions).toEqual([]);
    expect(result.tools).toHaveLength(1);
    expect(result.tools![0].name).toBe('hello');
  });
});

describe('loadManifest', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-test-'));
  });

  afterEach(() => {
    try { unlinkSync(join(tmpDir, 'plugin.json')); } catch { /* ignore */ }
    try { unlinkSync(join(tmpDir, 'package.json')); } catch { /* ignore */ }
    try { unlinkSync(join(tmpDir, 'manifest.json')); } catch { /* ignore */ }
    try { unlinkSync(join(tmpDir, 'other.json')); } catch { /* ignore */ }
    try { unlinkSync(tmpDir); } catch { /* ignore */ }
  });

  it('reads and validates plugin.json', async () => {
    const manifest = validManifest();
    writeFileSync(join(tmpDir, 'plugin.json'), JSON.stringify(manifest), 'utf-8');
    const result = await loadManifest(join(tmpDir, 'plugin.json'));
    expect(result.name).toBe('test-plugin');
    expect(result.permissions).toEqual(['fs:read']);
  });

  it('reads from package.json with nexus block', async () => {
    const content = {
      name: 'test-plugin',
      version: '1.0.0',
      description: 'A test plugin',
      nexus: {
        main: 'plugin.js',
        permissions: ['fs:read', 'network:fetch'],
      },
    };
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify(content), 'utf-8');
    const result = await loadManifest(join(tmpDir, 'package.json'));
    expect(result.name).toBe('test-plugin');
    expect(result.main).toBe('plugin.js');
    expect(result.permissions).toEqual(['fs:read', 'network:fetch']);
  });

  it('throws for invalid JSON', async () => {
    writeFileSync(join(tmpDir, 'manifest.json'), 'not-json', 'utf-8');
    await expect(loadManifest(join(tmpDir, 'manifest.json'))).rejects.toThrow();
  });

  it('throws for missing name in loaded file', async () => {
    writeFileSync(join(tmpDir, 'other.json'), JSON.stringify({ version: '1.0.0', main: 'index.js', permissions: [] }), 'utf-8');
    await expect(loadManifest(join(tmpDir, 'other.json'))).rejects.toThrow(ManifestValidationError);
  });
});
