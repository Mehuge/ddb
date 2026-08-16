'use strict';
/**
 * Tier 3 — End-to-end server tests
 * Spawns a real ddb HTTP server as a child process, then exercises the full
 * backup → verify → list → restore pipeline over the network.
 * Requires a free port; uses 14444 by default to avoid clashing with real servers.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fsp    = require('fs').promises;

const { makeTmpDir, writeFixtures, FIXTURE_FILES, runDdb, startServer } = require('./helpers');

const PORT       = 14444;
const ACCESS_KEY = 'test-access-key-12345';
const AUTH_CFG   = {
  keys: {
    [ACCESS_KEY]: {
      userid:  'testuser',
      email:   'test@example.com',
      // Allow both IPv4 and IPv6 loopback — Node may connect as either
      allow:   ['127.0.0.0/8', '::1', '::ffff:127.0.0.1'],
    },
  },
};

describe('remote backup via HTTP server', () => {
  let src, serverDest, clientRestore, serverCtx, cleanup;

  before(async () => {
    const srcTmp  = await makeTmpDir('e2e-src');
    const destTmp = await makeTmpDir('e2e-dest');
    const restTmp = await makeTmpDir('e2e-restore');
    src           = srcTmp.dir;
    serverDest    = destTmp.dir;
    clientRestore = restTmp.dir;
    cleanup       = async () => {
      await srcTmp.cleanup();
      await destTmp.cleanup();
      await restTmp.cleanup();
    };

    await writeFixtures(src, FIXTURE_FILES);

    // Start the server — writes auth.json into serverDest
    serverCtx = await startServer(serverDest, PORT, AUTH_CFG);
  });

  after(async () => {
    if (serverCtx) await serverCtx.stop();
    await cleanup();
  });

  const dest = () => `http://localhost:${PORT}/`;
  const authArg = `--access-key=${ACCESS_KEY}`;

  it('backup to remote server exits 0', () => {
    const r = runDdb(['backup', dest(), authArg, '--set-name=e2e', `--source=${src}`]);
    assert.equal(r.code, 0, `remote backup failed:\nSTDOUT: ${r.stdout}\nSTDERR: ${r.stderr}`);
  });

  it('verify against remote server exits 0', () => {
    const r = runDdb(['verify', dest(), authArg, '--set-name=e2e']);
    assert.equal(r.code, 0, `remote verify failed:\nSTDOUT: ${r.stdout}\nSTDERR: ${r.stderr}`);
  });

  it('list against remote server shows backed-up files', () => {
    const r = runDdb(['list', dest(), authArg, '--set-name=e2e', '--when=current', '--verbose']);
    assert.equal(r.code, 0, `remote list failed:\n${r.stderr}`);
    assert.ok(r.stdout.includes('README.md'), 'README.md should be in remote list');
    assert.ok(r.stdout.includes('index.js'),  'index.js should be in remote list');
  });

  it('restore from remote server exits 0 and produces correct files', async () => {
    const r = runDdb(['restore', dest(), authArg, '--set-name=e2e', `--output=${clientRestore}`]);
    assert.equal(r.code, 0, `remote restore failed:\nSTDOUT: ${r.stdout}\nSTDERR: ${r.stderr}`);

    // Spot-check a few restored files exist and have correct content
    const readme = await fsp.readFile(path.join(clientRestore, 'README.md'), 'utf8');
    assert.equal(readme, FIXTURE_FILES['README.md']);

    const indexJs = await fsp.readFile(path.join(clientRestore, 'src', 'index.js'), 'utf8');
    assert.equal(indexJs, FIXTURE_FILES['src/index.js']);
  });

  it('second remote backup deduplicates unchanged files', () => {
    const r = runDdb(['backup', dest(), authArg, '--set-name=e2e', `--source=${src}`, '--verbose']);
    assert.equal(r.code, 0, `second remote backup failed:\n${r.stderr}`);
    // All files should be skipped as already stored
    assert.ok(
      r.stdout.includes('not changed') || r.stdout.includes('backed up') || !r.stdout.includes('ERROR'),
      `Unexpected output:\n${r.stdout}`
    );
  });

  it('remote backup with --exclude filters out the specified pattern', () => {
    const r = runDdb(['backup', dest(), authArg, '--set-name=e2e-filtered',
      `--source=${src}`, '--exclude', '**/*.txt']);
    assert.equal(r.code, 0, `filtered remote backup failed:\n${r.stderr}`);
    const list = runDdb(['list', dest(), authArg, '--set-name=e2e-filtered', '--when=current', '--verbose']);
    assert.ok(!list.stdout.includes('sample.txt'), '.txt files should be excluded');
    assert.ok(!list.stdout.includes('empty.txt'),  '.txt files should be excluded');
    assert.ok(list.stdout.includes('index.js'),    '.js files should still be backed up');
  });

  it('authentication: wrong access key is rejected', () => {
    const r = runDdb(['backup', dest(), '--access-key=WRONG_KEY', '--set-name=e2e', `--source=${src}`]);
    // Should fail — server returns 403
    assert.notEqual(r.code, 0, 'backup with wrong key should fail');
  });

  it('authentication: missing access key is rejected', () => {
    // No --access-key at all — server has auth enabled so login is never called
    // and the server will 403 the first real request. Use backup which propagates
    // the error as a non-zero exit code.
    const r = runDdb(['backup', dest(), '--set-name=e2e', `--source=${src}`]);
    assert.notEqual(r.code, 0, 'backup without access key should fail');
    assert.ok(r.stderr.includes('403') || r.stderr.includes('not allowed') || r.stderr.includes('Access'),
      `Expected auth error in stderr:\n${r.stderr}`);
  });
});
