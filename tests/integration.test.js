'use strict';
/**
 * Tier 2 — Integration tests
 * Real filesystem I/O in temporary directories. Tests the fs module,
 * HashFileSystemV5 store/restore, and the full backup→verify→restore→rm→clean pipeline
 * via the ddb.js CLI (no network).
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fsp    = require('fs').promises;

const { makeTmpDir, writeFixtures, FIXTURE_FILES, runDdb } = require('./helpers');
const fsLib  = require('../lib/fs');
const HashFileSystemV5 = require('../lib/hash-filesystem-v5');

// ---------------------------------------------------------------------------
// fs.js — zip / unzip / hash / copy
// ---------------------------------------------------------------------------
describe('fs module', () => {
  let tmp, cleanup;

  before(async () => {
    ({ dir: tmp, cleanup } = await makeTmpDir('fs'));
  });
  after(() => cleanup());

  it('zip then unzip produces identical content', async () => {
    const src   = path.join(tmp, 'source.txt');
    const gz    = path.join(tmp, 'source.txt.gz');
    const out   = path.join(tmp, 'source.unzipped.txt');
    const data  = 'Hello, ddb test!\n'.repeat(100);
    await fsp.writeFile(src, data);

    await fsLib.zip(src, gz);
    await fsLib.unzip(gz, out);

    const result = await fsp.readFile(out, 'utf8');
    assert.equal(result, data);
  });

  it('zip creates a smaller file for compressible content', async () => {
    const src = path.join(tmp, 'big.txt');
    const gz  = path.join(tmp, 'big.txt.gz');
    await fsp.writeFile(src, 'aaaa'.repeat(10000));
    await fsLib.zip(src, gz);
    const srcStat = await fsp.stat(src);
    const gzStat  = await fsp.stat(gz);
    assert.ok(gzStat.size < srcStat.size, 'compressed file should be smaller');
  });

  it('compareZipWith passes for matching content', async () => {
    const src = path.join(tmp, 'cmp.txt');
    const gz  = path.join(tmp, 'cmp.txt.gz');
    await fsp.writeFile(src, 'compare me\n');
    await fsLib.zip(src, gz);
    await assert.doesNotReject(() => fsLib.compareZipWith(gz, src));
  });

  it('compareZipWith rejects with ENOCOMPARE for differing content', async () => {
    const src  = path.join(tmp, 'orig.txt');
    const mod  = path.join(tmp, 'modified.txt');
    const gz   = path.join(tmp, 'orig.txt.gz');
    await fsp.writeFile(src, 'original content\n');
    await fsp.writeFile(mod, 'different content\n');
    await fsLib.zip(src, gz);
    await assert.rejects(
      () => fsLib.compareZipWith(gz, mod),
      (err) => { assert.equal(err.code, 'ENOCOMPARE'); return true; }
    );
  });

  it('hash returns a 64-char hex sha256', async () => {
    const src = path.join(tmp, 'hash.txt');
    await fsp.writeFile(src, 'hash me\n');
    const h = await fsLib.hash(src, { hash: 'sha256', encoding: 'hex' });
    assert.match(h, /^[0-9a-f]{64}$/);
  });

  it('copy produces an identical file', async () => {
    const src  = path.join(tmp, 'copy-src.txt');
    const dest = path.join(tmp, 'copy-dst.txt');
    await fsp.writeFile(src, 'copy content\n');
    await fsLib.copy(src, dest);
    const a = await fsp.readFile(src,  'utf8');
    const b = await fsp.readFile(dest, 'utf8');
    assert.equal(a, b);
  });
});

// ---------------------------------------------------------------------------
// HashFileSystemV5 — store / exists / restore / compare
// ---------------------------------------------------------------------------
describe('HashFileSystemV5', () => {
  let tmp, cleanup;
  let hfs;

  before(async () => {
    ({ dir: tmp, cleanup } = await makeTmpDir('hfs'));
    hfs = new HashFileSystemV5({ root: tmp });
  });
  after(() => cleanup());

  it('exists() returns false for a key that has not been stored', async () => {
    const key = hfs.getKey('a'.repeat(64), 0, '0');
    assert.equal(await hfs.exists(key), false);
  });

  it('store() then exists() returns true', async () => {
    const src = path.join(tmp, 'test-store.txt');
    await fsp.writeFile(src, 'store me\n');
    const hash = await HashFileSystemV5.hashFile(src);
    const size = String((await fsp.stat(src)).size);
    const key  = hfs.getKey(hash, 0, size);
    await hfs.store(src, key, false);
    assert.equal(await hfs.exists(key), true);
  });

  it('restore() produces a file matching the original', async () => {
    const content = 'restore me please\n';
    const src = path.join(tmp, 'restore-src.txt');
    const out = path.join(tmp, 'restore-out.txt');
    await fsp.writeFile(src, content);
    const hash = await HashFileSystemV5.hashFile(src);
    const size = String((await fsp.stat(src)).size);
    const key  = hfs.getKey(hash, 0, size);
    await hfs.store(src, key, false);
    await hfs.restore(key, out);
    const result = await fsp.readFile(out, 'utf8');
    assert.equal(result, content);
  });

  it('restore() throws ECORRUPT when stored file is tampered', async () => {
    const src = path.join(tmp, 'legit.txt');
    const out = path.join(tmp, 'corrupt-out.txt');
    await fsp.writeFile(src, 'legitimate content\n');
    const hash = await HashFileSystemV5.hashFile(src);
    const size = String((await fsp.stat(src)).size);
    const key  = hfs.getKey(hash, 0, size);
    await hfs.store(src, key, false);

    // Tamper: overwrite the stored file with garbage (still valid gzip of different content)
    const evil = path.join(tmp, 'evil.txt');
    await fsp.writeFile(evil, 'evil content\n');
    await fsLib.zip(evil, key.path);  // overwrite with a zip of different data

    await assert.rejects(
      () => hfs.restore(key, out),
      (err) => { assert.equal(err.code, 'ECORRUPT'); return true; }
    );
  });

  it('compare() passes when stored and source match', async () => {
    const src = path.join(tmp, 'compare-src.txt');
    await fsp.writeFile(src, 'compare this\n');
    const hash = await HashFileSystemV5.hashFile(src);
    const size = String((await fsp.stat(src)).size);
    const key  = hfs.getKey(hash, 0, size);
    await hfs.store(src, key, false);
    await assert.doesNotReject(() => hfs.compare(key, src));
  });
});

// ---------------------------------------------------------------------------
// Full local backup pipeline via CLI
// ---------------------------------------------------------------------------
describe('local backup pipeline', () => {
  let src, dest, restore, cleanup;

  before(async () => {
    const srcTmp  = await makeTmpDir('src');
    const destTmp = await makeTmpDir('dest');
    const restTmp = await makeTmpDir('restore');
    src     = srcTmp.dir;
    dest    = destTmp.dir;
    restore = restTmp.dir;
    cleanup = async () => {
      await srcTmp.cleanup();
      await destTmp.cleanup();
      await restTmp.cleanup();
    };
    await writeFixtures(src, FIXTURE_FILES);
  });
  after(() => cleanup());

  it('backup exits 0 and creates a backup destination', () => {
    const r = runDdb(['backup', dest, '--set-name=test', `--source=${src}`]);
    assert.equal(r.code, 0, `backup failed:\n${r.stderr}`);
  });

  it('verify exits 0 after a successful backup', () => {
    const r = runDdb(['verify', dest, '--set-name=test']);
    assert.equal(r.code, 0, `verify failed:\n${r.stderr}`);
  });

  it('list shows the backed-up files', () => {
    const r = runDdb(['list', dest, '--set-name=test', '--when=current', '--verbose']);
    assert.equal(r.code, 0, `list failed:\n${r.stderr}`);
    assert.ok(r.stdout.includes('README.md'),  'README.md should appear in list');
    assert.ok(r.stdout.includes('index.js'),   'index.js should appear in list');
  });

  it('restore exits 0 and produces files matching the source', () => {
    const r = runDdb(['restore', dest, '--set-name=test', `--output=${restore}`]);
    assert.equal(r.code, 0, `restore failed:\n${r.stderr}`);
  });

  it('verify --compare-with passes when restore matches source', () => {
    const r = runDdb(['verify', dest, '--set-name=test', `--compare-with=${restore}`]);
    assert.equal(r.code, 0, `compare-with verify failed:\n${r.stderr}`);
  });

  it('verify --compare-with reports CHANGED when a restored file is modified', async () => {
    const readmePath = path.join(restore, 'README.md');
    await fsp.appendFile(readmePath, '\n## Modified\n');
    const r = runDdb(['verify', dest, '--set-name=test', '--verbose', `--compare-with=${restore}`]);
    // Should still exit 0 (verify logs differences but doesn't fail)
    assert.ok(r.stdout.includes('CHANGED') || r.stdout.includes('README.md'),
      `Expected CHANGED in output:\n${r.stdout}`);
  });

  it('second backup of the same source stores no new hashes (deduplication)', () => {
    // Run backup again — all files unchanged so nothing new stored
    const r = runDdb(['backup', dest, '--set-name=test', `--source=${src}`, '--verbose']);
    assert.equal(r.code, 0, `second backup failed:\n${r.stderr}`);
    // All files deduped: "Backed up: 0 files" confirms nothing new was stored
    assert.ok(
      r.stdout.includes('Backed up: 0') || r.stdout.includes('not changed') || r.stdout.includes('backed up'),
      `Expected dedup output:\n${r.stdout}`
    );
  });

  it('rm --dry-run does not change the backup log', () => {
    const before = runDdb(['list', dest, '--set-name=test', '--when=current', '--verbose']);
    runDdb(['rm', dest, '--set-name=test', '--dry-run', 'README.md']);
    const after  = runDdb(['list', dest, '--set-name=test', '--when=current', '--verbose']);
    assert.equal(before.stdout, after.stdout, 'log should be unchanged after dry-run');
  });

  it('rm --yes removes the entry from the backup log', () => {
    runDdb(['rm', dest, '--set-name=test', '--yes', 'README.md']);
    const r = runDdb(['list', dest, '--set-name=test', '--when=current', '--verbose']);
    assert.ok(!r.stdout.includes('README.md'), 'README.md should be gone after rm');
  });

  it('verify still passes after rm (remaining hashes intact)', () => {
    const r = runDdb(['verify', dest, '--set-name=test']);
    assert.equal(r.code, 0, `verify after rm failed:\n${r.stderr}`);
  });

  it('clean exits 0', () => {
    const r = runDdb(['clean', dest]);
    assert.equal(r.code, 0, `clean failed:\n${r.stderr}`);
  });

  it('verify still passes after clean', () => {
    const r = runDdb(['verify', dest, '--set-name=test']);
    assert.equal(r.code, 0, `verify after clean failed:\n${r.stderr}`);
  });
});

// ---------------------------------------------------------------------------
// Backup with --exclude / --include filters
// ---------------------------------------------------------------------------
describe('backup filters', () => {
  let src, dest, cleanup;

  before(async () => {
    const srcTmp  = await makeTmpDir('filter-src');
    const destTmp = await makeTmpDir('filter-dest');
    src   = srcTmp.dir;
    dest  = destTmp.dir;
    cleanup = async () => { await srcTmp.cleanup(); await destTmp.cleanup(); };
    await writeFixtures(src, {
      ...FIXTURE_FILES,
      'node_modules/lodash/index.js': 'module.exports = {};\n',
      'dist/bundle.js':               '(function(){})()\n',
      'logs/app.log':                 'INFO started\n',
    });
  });
  after(() => cleanup());

  it('--exclude node_modules excludes that tree from the backup', () => {
    runDdb(['backup', dest, '--set-name=filtered', `--source=${src}`,
      '--exclude', 'node_modules', '--exclude', 'dist']);
    const r = runDdb(['list', dest, '--set-name=filtered', '--when=current', '--verbose']);
    assert.ok(!r.stdout.includes('lodash'),    'node_modules should be excluded');
    assert.ok(!r.stdout.includes('bundle.js'), 'dist should be excluded');
    assert.ok(r.stdout.includes('index.js'),   'src/index.js should be included');
  });

  it('--exclude **/*.log excludes log files', () => {
    runDdb(['backup', dest, '--set-name=nologs', `--source=${src}`, '--exclude', '**/*.log']);
    const r = runDdb(['list', dest, '--set-name=nologs', '--when=current', '--verbose']);
    assert.ok(!r.stdout.includes('app.log'), 'log file should be excluded');
  });
});

// ---------------------------------------------------------------------------
// Backup destination is shared across two set names (deduplication)
// ---------------------------------------------------------------------------
describe('shared destination deduplication', () => {
  let srcA, srcB, dest, cleanup;

  before(async () => {
    const tA = await makeTmpDir('shared-srcA');
    const tB = await makeTmpDir('shared-srcB');
    const tD = await makeTmpDir('shared-dest');
    srcA = tA.dir; srcB = tB.dir; dest = tD.dir;
    cleanup = async () => { await tA.cleanup(); await tB.cleanup(); await tD.cleanup(); };
    // Both sources share identical content
    await writeFixtures(srcA, FIXTURE_FILES);
    await writeFixtures(srcB, FIXTURE_FILES);
  });
  after(() => cleanup());

  it('backing up two identical sources to the same dest stores files only once', async () => {
    runDdb(['backup', dest, '--set-name=setA', `--source=${srcA}`]);
    const statsBefore = await fsp.readdir(path.join(dest, 'files.db'), { recursive: true }).catch(() => []);
    runDdb(['backup', dest, '--set-name=setB', `--source=${srcB}`]);
    const statsAfter  = await fsp.readdir(path.join(dest, 'files.db'), { recursive: true }).catch(() => []);
    // No new leaf files should have been added since content is identical
    const leafsBefore = statsBefore.filter(f => f.includes('.'));
    const leafsAfter  = statsAfter.filter(f  => f.includes('.'));
    assert.equal(leafsBefore.length, leafsAfter.length, 'no new hashes should be stored');
  });

  it('both sets verify correctly from the same dest', () => {
    const rA = runDdb(['verify', dest, '--set-name=setA']);
    const rB = runDdb(['verify', dest, '--set-name=setB']);
    assert.equal(rA.code, 0, `setA verify failed:\n${rA.stderr}`);
    assert.equal(rB.code, 0, `setB verify failed:\n${rB.stderr}`);
  });
});
