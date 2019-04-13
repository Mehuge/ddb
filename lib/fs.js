const fs = require('fs').promises;
const FS = require('fs').constants;
const path = require('path');
const streamEqual = require('stream-equal');
const zlib = require('zlib');
const hashFile = require('./hash-file');
const { createReadStream, createWriteStream } = require('fs');

async function stat(fn) {
  return await fs.stat(fn);
}

async function mkdir(fn, mode) {
  await fs.mkdir(fn, mode);
}

async function rmdir(fn) {
  await fs.rmdir(fn);
}

async function mkdirp(fn, mode) {
  const parts = fn.split(path.sep);
  while (parts.length) {
    try {
      await fs.access(parts.join(path.sep), FS.W_OK);
      break;
    } catch(e) {
      if (e.code != 'ENOENT') throw e;
    }
    parts.pop();
  }
  const start = parts.length;
  const add = fn.split(path.sep);
  for (let i = start; i < add.length; i++) {
    parts.push(add[i]);
    await mkdir(parts.join(path.sep), mode);
  }
}

async function writeFile(fn, data, options = {}) {
  await fs.writeFile(fn, data, options);
}

async function open(fn, flags, mode) {
  return await fs.open(fn, flags, mode);
}

async function readFile(fn) {
  try {
    return await fs.readFile(fn);
  } catch(e) {
    if (e.code == 'ENOENT') return null;
    throw e;
  }
}

async function readdir(path, options) {
  return await fs.readdir(path, options);
}

async function access(path, access = FS.R_OK) {
  return await fs.access(path, access);
}

function copy(from, to, options = {}) {
  return new Promise((resolve, reject) => {
    const reader = typeof from == 'string' ? createReadStream(from) : from;
    const writer = typeof to == 'string' ? createWriteStream(to, Object.assign({ mode: 0o600 }, options)) : to;
    function fail(err) {
      reader.destroy();
      writer.end();
      reject(err);
    }
    reader.on('error', fail);
    writer.on('error', fail);
    writer.on('close', resolve);
    reader.pipe(writer);
  });
}

async function move(from, to, flags) {
  return await fs.rename(from, to);
}

async function move(from, to) {
  return await fs.rename(from, to);
}

async function link(from, to) {
  return await fs.link(from, to);
}

async function unlink(fn) {
  return await fs.unlink(fn);
}

async function chmod(fn, mode) {
  return await fs.chmod(fn, mode);
}

async function chown(fn, uid, gid) {
  return await fs.chown(fn, uid, gid);
}

async function chstat(fn, stat, old) {
  if (!old || (stat.mode != old.mode)) await fs.chmod(fn, stat.mode);
  if (!old || (stat.uid != old.uid || stat.gid != old.gid)) {
    if (stat.uid != '' && stat.gid != '') await fs.chown(fn, stat.uid, stat.gid);
  }
  if (!old || stat.mtime != old.mtime) await fs.utimes(fn, new Date(), stat.mtime);
}

async function hash(filename, opts) {
  return await hashFile(filename, opts);
}

function compare(a, b) {
  return new Promise((resolve, reject) => {
    require('filecompare')(a,b,(same) => {
      if (same) resolve();
      const e = new Error("not same");
      e.code = 'ENOCOMPARE';
      reject(e);
    }, 4096, 8192);
  });
}

function compareZipWith(z, f) {
  return new Promise((resolve, reject) => {
    const zipped = createReadStream(z);
    const file = createReadStream(f);
    const gunzip = zlib.createGunzip();
    const unzipped = zipped.pipe(gunzip);
    streamEqual(unzipped, file, (err, same) => {
      if (err) reject(err);
      else if (same) resolve();
      else {
        const e = new Error("not same");
        e.code = 'ENOCOMPARE';
        reject(e);
      }
    });
  });
}

function readline(path) {
  return require('readline').createInterface({ input: require('fs').createReadStream(path) });
}

function zip2stream(from, options = {}) {
  return new Promise((resolve, reject) => {
    const reader = typeof from == 'string' ? createReadStream(from) : from;
    const gzip = require('zlib').createGzip();
    const zipper = reader.pipe(gzip);
    reader.on('error', err => {
      reader.destroy();
      reject(err);
    });
    resolve(zipper);
  });
}

function zip(from, to, options = {}) {
  return new Promise((resolve, reject) => {
    const reader = typeof from == 'string' ? createReadStream(from) : from;
    const writer = createWriteStream(to, Object.assign({ mode: 0o600 }, options));
    const gzip = require('zlib').createGzip();
    const task = reader.pipe(gzip).pipe(writer);
    function fail(err) {
      reader.destroy();
      writer.end();
      reject(err);
    }
    reader.on('error', fail);
    writer.on('error', fail);
    task.on('finish', err => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function unzip(from, to = null) {
  return new Promise((resolve, reject) => {
    const reader = typeof from == 'string' ? createReadStream(from) : from;
    const writer = to ? typeof to == 'string' ? createWriteStream(to) : to : null;
    const gunzip = require('zlib').createGunzip();
    const unzipper = reader.pipe(gunzip);
    if (!writer) {
      resolve(unzipper);
    } else {
      const task = unzipper.pipe(writer);
      task.on('finish', err => {
        if (err) reject(err);
        else resolve()
      });
    }
  });
}

function old_unzip(from, to) {
  return new Promise((resolve, reject) => {
    const reader = typeof from == 'string' ? createReadStream(from) : from;
    const writer = typeof to == 'string' ? createWriteStream(to) : to;
    const gunzip = require('zlib').createGunzip();
    const task = reader.pipe(gunzip).pipe(writer);
    task.on('finish', err => {
      if (err) reject(err);
      else resolve()
    });
  });
}

async function hashZip(zip, opts) {
  const reader = createReadStream(zip);
  const gunzip = zlib.createGunzip();
  const task = reader.pipe(gunzip);
  return await hash(task, opts);
}

async function signature(source, opts) {
  const reader = typeof source == 'string' ? createReadStream(source) : source;
  const signature = { blockSize: opts.blockSize, blocks: [] };
  opts = Object.assign({}, opts);
  opts.signature = (index, offset, size, sum) => { signature.blocks.push({ sum }); };
  signature.hash = await hash(reader, opts);
  return signature;
}

module.exports = {
  stat,
  mkdir,
  rmdir,
  mkdirp,
  writeFile,
  readFile,
  open,
  readdir,
  hash,
  access,
  copy,
  readline,
  compare,
  move,
  link,
  unlink,
  chmod,
  chown,
  chstat,
  zip,
  zip2stream,
  unzip,
  compareZipWith,
  hashZip,
  signature,
};
