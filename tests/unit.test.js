'use strict';
/**
 * Tier 1 — Unit tests
 * Pure logic, no I/O, no subprocesses. Very fast.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Filter    = require('../lib/filter');
const BackupLog = require('../lib/backup-log');
const HashFileSystemV5 = require('../lib/hash-filesystem-v5');

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------
describe('Filter', () => {
  describe('ignores()', () => {
    it('returns falsy for a path that is not excluded', () => {
      const f = new Filter({ filters: ['-node_modules'] });
      assert.ok(!f.ignores('src/index.js'));
    });

    it('returns truthy for an exact-name exclude', () => {
      const f = new Filter({ filters: ['-node_modules'] });
      assert.ok(f.ignores('node_modules'));
    });

    it('excludes using ** glob', () => {
      const f = new Filter({ filters: ['-**/*.log'] });
      assert.ok(f.ignores('logs/app.log'));
      assert.ok(f.ignores('app.log'));
      assert.ok(!f.ignores('app.js'));
    });

    it('last rule wins — include overrides earlier exclude', () => {
      const f = new Filter({ filters: ['-**', '+src/index.js'] });
      assert.ok(!f.ignores('src/index.js'), 'explicit include should pass');
      assert.ok(f.ignores('src/other.js'),  'everything else should be excluded');
    });

    it('include-all then exclude specific', () => {
      const f = new Filter({ filters: ['+**', '-*.secret'] });
      assert.ok(f.ignores('passwords.secret'));
      assert.ok(!f.ignores('README.md'));
    });

    it('handles Windows-style path separators', () => {
      const f = new Filter({ filters: ['-node_modules'] });
      assert.ok(f.ignores('node_modules\\package.json'));
    });

    it('**/ prefix matches at any depth', () => {
      const f = new Filter({ filters: ['-**/.git'] });
      assert.ok(f.ignores('.git'));
      assert.ok(f.ignores('sub/.git'));
      assert.ok(f.ignores('a/b/c/.git'));
      assert.ok(!f.ignores('.gitignore'));
      assert.ok(!f.ignores('a/b/c/.gitignore'));
    });

    it('**/ prefix with glob', () => {
      const f = new Filter({ filters: ['-**/.git*'] });
      assert.ok(f.ignores('.git'));
      assert.ok(f.ignores('sub/.git'));
      assert.ok(f.ignores('a/b/c/.git'));
      assert.ok(f.ignores('.gitignore'));
      assert.ok(f.ignores('a/b/c/.gitignore'));
    });

    it('directory exclude does not match longer names with same prefix', () => {
      const f = new Filter({ filters: ['-**/temp'] });
      assert.ok(f.ignores('temp'),              'exact dir entry');
      assert.ok(f.ignores('temp/foo.txt'),      'file inside temp');
      assert.ok(f.ignores('a/b/temp'),          'nested dir entry');
      assert.ok(f.ignores('a/b/temp/foo.txt'),  'file inside nested temp');
      assert.ok(!f.ignores('templates'),        'should NOT exclude templates');
      assert.ok(!f.ignores('templates/x.html'), 'should NOT exclude inside templates');
      assert.ok(!f.ignores('a/templates'),      'should NOT exclude nested templates');
    });

    it('directory exclude without ** also uses boundary', () => {
      const f = new Filter({ filters: ['-temp'] });
      assert.ok(f.ignores('temp'));
      assert.ok(f.ignores('temp/foo.txt'));
      assert.ok(!f.ignores('templates'));
    });

    it('empty filter list ignores nothing', () => {
      const f = new Filter({ filters: [] });
      assert.ok(!f.ignores('anything'));
    });

    it('filters reset in middle of list by -** (ignore all)', () => {
      const f = new Filter({ filters: [
        "-**/.vs",
        "-**/.svn",
        "-**/.git",
        "-**/logs",
        "-**/Debug",
        "-**/Release",
        "-**/temp",
        "-**/node_modules",
        "-**/dist",
        "-**/obj",
        "-**/bin/Release",
        "-**/bin/Debug",
        // filter is effectively reset here, everything is ignored except for the following explicitly included 
        "-**",
        "+Desktop",
        "+Documents" 
      ]});
      assert.ok(f.ignores('.git'));
      assert.ok(f.ignores('.gitignore'));
      assert.ok(f.ignores('logs/app.log'));
      assert.ok(f.ignores('src/node_modules/package.json'));
      assert.ok(f.ignores('templates/index.html'));
      assert.ok(!f.ignores('Desktop'));
      assert.ok(!f.ignores('Desktop/file.txt'));
      assert.ok(!f.ignores('Documents'));
      assert.ok(!f.ignores('Documents/file.txt'));
      assert.ok(f.ignores('.android'));
      assert.ok(f.ignores('.android/config'));
    });
  });
});

// ---------------------------------------------------------------------------
// BackupLog.parseWhen
// ---------------------------------------------------------------------------
describe('BackupLog.parseWhen', () => {
  it('returns "current" unchanged', () => {
    assert.equal(BackupLog.parseWhen('current'), 'current');
  });

  it('returns "running" unchanged', () => {
    assert.equal(BackupLog.parseWhen('running'), 'running');
  });

  it('strips dashes, colons and dots from ISO string', () => {
    const result = BackupLog.parseWhen('2024-08-15T12:00:00.000Z');
    assert.equal(result, '20240815T120000000Z');
  });

  it('accepts a Date object', () => {
    const d = new Date('2024-08-15T12:00:00.000Z');
    const result = BackupLog.parseWhen(d);
    assert.equal(result, '20240815T120000000Z');
  });

  it('defaults to "current" when called with no args', () => {
    assert.equal(BackupLog.parseWhen(), 'current');
  });
});

// ---------------------------------------------------------------------------
// BackupLog.ext2iso
// ---------------------------------------------------------------------------
describe('BackupLog.ext2iso', () => {
  it('converts a compact timestamp back to ISO-like string', () => {
    const result = BackupLog.ext2iso('20240815T120000000Z');
    assert.equal(result, '2024-08-15T12:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// BackupLog.parse
// ---------------------------------------------------------------------------
describe('BackupLog.parse', () => {
  it('parses a HEADER line', () => {
    const entry = BackupLog.parse('V2 type mode ctime mtime - size hash variant path');
    assert.equal(entry.type, 'HEADER');
    assert.equal(entry.version, '2');
  });

  it('parses a COMMENT line', () => {
    const entry = BackupLog.parse('# hello world');
    assert.equal(entry.type, 'COMMENT');
    assert.equal(entry.comment, 'hello world');
  });

  it('parses a SOURCE line with spaces in path', () => {
    const entry = BackupLog.parse('SOURCE C:\\My Documents\\project');
    assert.equal(entry.type, 'SOURCE');
    assert.equal(entry.root, 'C:\\My Documents\\project');
  });

  it('parses an F (file) entry', () => {
    const line = 'F 1000:1000:644 2024-01-01T00:00:00.000Z 2024-01-01T00:00:00.000Z - 42 abc123 0 "src/index.js"';
    const entry = BackupLog.parse(line);
    assert.equal(entry.type, 'F');
    assert.equal(entry.uid, 1000);
    assert.equal(entry.gid, 1000);
    assert.equal(entry.ctime, '2024-01-01T00:00:00.000Z');
    assert.equal(entry.mtime, '2024-01-01T00:00:00.000Z');
    assert.equal(entry.size, '42');
    assert.equal(entry.hash, 'abc123');
    assert.equal(entry.variant, '0');
    assert.equal(entry.path, 'src/index.js');
    assert.equal(entry.mode, '644');
  });

  it('parses a D (directory) entry', () => {
    const line = 'D 1000:1000:755 2024-01-01T00:00:00.000Z 2024-01-01T00:00:00.000Z - 0 - 0 "src"';
    const entry = BackupLog.parse(line);
    assert.equal(entry.type, 'D');
    assert.equal(entry.path, 'src');
  });

  it('parses a STATUS line with stats JSON', () => {
    const line = 'V2 STATUS OK {"files":10,"bytes":1024}';
    const entry = BackupLog.parse(line);
    assert.equal(entry.type, 'STATUS');
    assert.equal(entry.status, 'OK');
    assert.equal(entry.stats.files, 10);
    assert.equal(entry.stats.bytes, 1024);
  });

  it('returns UNKNOWN for unrecognised lines', () => {
    const entry = BackupLog.parse('garbage line here');
    assert.equal(entry.type, 'UNKNOWN');
  });
});

// ---------------------------------------------------------------------------
// BackupLog.entryToString (round-trip with parse)
// ---------------------------------------------------------------------------
describe('BackupLog.entryToString', () => {
  it('round-trips an F entry through entryToString → parse', () => {
    const original = {
      type: 'F',
      uid: 1000,
      gid: 1000,
      mode: '644',
      ctime: new Date('2024-01-01T00:00:00.000Z'),
      mtime: new Date('2024-06-01T12:00:00.000Z'),
      size: 42,
      hash: 'aabbccddeeff0011',
      variant: '0',
      path: 'src/index.js',
    };
    const line = BackupLog.entryToString(original);
    const parsed = BackupLog.parse(line);
    assert.equal(parsed.type, 'F');
    assert.equal(parsed.path, original.path);
    assert.equal(parsed.hash, original.hash);
    assert.equal(parsed.size, String(original.size));
    assert.equal(parsed.mode, original.mode);
    assert.equal(parsed.ctime, original.ctime.toISOString());
    assert.equal(parsed.mtime, original.mtime.toISOString());
    assert.equal(parsed.uid, original.uid);
    assert.equal(parsed.gid, original.gid);
  });
});

// ---------------------------------------------------------------------------
// HashFileSystemV5 — pure key logic (no fs I/O)
// ---------------------------------------------------------------------------
describe('HashFileSystemV5 key logic', () => {
  // Construct with a fake root — no I/O in these tests
  const hfs = new HashFileSystemV5({ root: '/fake/root' });

  it('_hash2name splits first 4 hex chars into two folder levels', () => {
    const name = hfs._hash2name('aabbccddeeff');
    // Should be aa/bb/ccddeeff (platform sep may vary)
    const parts = name.split(/[/\\]/);
    assert.equal(parts[0], 'aa');
    assert.equal(parts[1], 'bb');
    assert.equal(parts[2], 'ccddeeff');
  });

  it('getKey returns expected path structure', () => {
    const key = hfs.getKey('aabbccddeeff001122', 0, '512');
    assert.ok(key.path.includes('aa'));
    assert.ok(key.path.endsWith('.512'));
    assert.equal(key.hash, 'aabbccddeeff001122');
    assert.equal(key.size, '512');
  });

  it('keyFromFile reconstructs the hash key from dir+filename', () => {
    // dir = 'aa/bb' (or 'aa\\bb'), name = 'ccddeeff.512'
    const sep = require('path').sep;
    const dir = `aa${sep}bb`;
    const result = hfs.keyFromFile(dir, 'ccddeeff.512');
    assert.equal(result, 'aabbccddeeff.0.512');
  });
});
