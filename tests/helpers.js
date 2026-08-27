'use strict';
/**
 * Shared test helpers.
 * Creates an isolated tmpdir per test run under os.tmpdir()/ddb-test-<pid>-<random>
 * and cleans it up afterwards.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeFile, mkdir, rm } = fs.promises;

/**
 * Create a fresh temporary directory. Returns the path and a cleanup function.
 */
async function makeTmpDir(label = 'run') {
  const dir = path.join(os.tmpdir(), `ddb-test-${process.pid}-${label}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

/**
 * Write a small set of test files into a directory tree.
 * Returns a map of relative path → content string.
 */
async function writeFixtures(root, fixtures) {
  for (const [rel, content] of Object.entries(fixtures)) {
    const abs = path.join(root, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
  }
}

/** Standard small fixture set used across integration tests */
const FIXTURE_FILES = {
  'README.md':          '# Test Project\nHello world.\n',
  'src/index.js':       'console.log("hello");\n',
  'src/utils/math.js':  'module.exports = { add: (a,b) => a+b };\n',
  'data/sample.txt':    'line one\nline two\nline three\n',
  'data/empty.txt':     '',
};

/**
 * Spawn ddb.js as a child process and collect stdout/stderr.
 * Resolves with { code, stdout, stderr }.
 */
function runDdb(args, opts = {}) {
  const { spawnSync } = require('child_process');
  const nodeExe = process.execPath;
  const ddbScript = path.join(__dirname, '..', 'ddb.js');
  const result = spawnSync(nodeExe, [ddbScript, ...args], {
    encoding: 'utf8',
    timeout: opts.timeout || 120000,
    cwd: opts.cwd || process.cwd(),
    env: { ...process.env, ...opts.env },
  });
  return {
    code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Start a ddb server as a background child process.
 * Returns { proc, port, stop }.
 * Waits until the server prints "server is running" before resolving.
 */
function startServer(dest, port, authConfig = null) {
  return new Promise(async (resolve, reject) => {
    const { spawn } = require('child_process');
    const nodeExe = process.execPath;
    const ddbScript = path.join(__dirname, '..', 'ddb.js');

    // Write auth config if provided
    if (authConfig) {
      const authFile = path.join(dest, 'auth.json');
      await writeFile(authFile, JSON.stringify(authConfig, null, 2));
    }

    const proc = spawn(nodeExe, [ddbScript, 'server', dest, '--port', String(port), '--http'], {
      encoding: 'utf8',
      env: { ...process.env },
    });

    let settled = false;
    const lines = [];

    const onData = (chunk) => {
      lines.push(chunk);
      if (!settled && chunk.includes('server is running')) {
        settled = true;
        resolve({
          proc,
          port,
          stop: () => new Promise(res => {
            proc.kill('SIGTERM');
            proc.on('exit', res);
          }),
        });
      }
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);

    proc.on('error', (err) => { if (!settled) { settled = true; reject(err); } });
    proc.on('exit', (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Server exited early with code ${code}:\n${lines.join('')}`));
      }
    });

    // Timeout if server doesn't start within 10s
    setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill();
        reject(new Error(`Server did not start within 10s. Output:\n${lines.join('')}`));
      }
    }, 10000);
  });
}

/**
 * Write large binary fixture files into a directory.
 * Sizes chosen to exceed the gzip internal buffer (16 KB) many times over,
 * triggering backpressure and drain cycles in the streaming upload path.
 * Uses pseudo-random-ish bytes so gzip cannot trivially compress to nothing.
 */
async function writeLargeFixtures(root) {
  const files = [
    // Sizes chosen to trigger multiple gzip drain cycles without taking too long.
    // 256 KB and 1 MB are enough to stress backpressure on localhost.
    { rel: 'large/binary-256k.bin', size: 256 * 1024 },
    { rel: 'large/binary-1mb.bin',  size: 1 * 1024 * 1024 },
    { rel: 'large/text-512k.txt',   size: 512 * 1024, text: true },
  ];
  const names = files.map(f => f.rel);
  for (const { rel, size, text } of files) {
    const abs = path.join(root, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    // Generate a buffer with a repeating pattern that compresses moderately
    // (not all zeros, not fully random — mimics real binary/text files)
    const buf = Buffer.allocUnsafe(size);
    if (text) {
      // Simulate a large text file with varying line content
      let off = 0;
      let line = 0;
      while (off < size) {
        const s = `line ${line++}: ${'abcdefghijklmnopqrstuvwxyz'.repeat(4)}\n`;
        const chunk = Buffer.from(s);
        chunk.copy(buf, off, 0, Math.min(chunk.length, size - off));
        off += chunk.length;
      }
    } else {
      // Pseudo-random bytes via xorshift — compressible but not trivially
      let x = 0xdeadbeef >>> 0;
      for (let i = 0; i < size; i++) {
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        buf[i] = x & 0xff;
      }
    }
    await writeFile(abs, buf);
  }
  return names;
}

module.exports = { makeTmpDir, writeFixtures, writeLargeFixtures, FIXTURE_FILES, runDdb, startServer };
