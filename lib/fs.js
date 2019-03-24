const fs = require('fs').promises;
const FS = require('fs').constants;
const path = require('path');
const hashFile = require('./hash-file');

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

async function copy(from, to, flags) {
  return await fs.copyFile(from, to, flags);
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

async function hash(path, opts) {
  return await hashFile(path, opts);
}

async function compare(a, b) {
  return new Promise((resolve, reject) => {
    require('filecompare')(a,b,(same) => {
      if (same) resolve();
      const e = new Error("not same");
      e.code = 'ENOCOMPARE';
      reject(e);
    }, 4096, 8192);
  });
}

function readline(path) {
  return require('readline').createInterface({ input: require('fs').createReadStream(path) });
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
};
