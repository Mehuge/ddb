const fs = require('./fs');
const path = require('path');
const crc = require('crc');
const { rdiff_signature, rdiff_blocksize } = require('./rdiff');

const HASH_OPTS = { hash: 'sha256', encosing: 'hex' };

class HashFileSystemV3 {
  constructor({ root }) {
    this.root = root;
  }

  _hash2name(hash, variant = 0) {
    function crc8(s) {
      return crc.crc8(s).toString(16).padStart(2,'0');
    }
    const l = (hash.length / 2) | 0;
    const name = path.join(`${crc8(hash.substr(0,l))}`, `${crc8(hash.substr(l))}`);
    return path.join(name, hash + '.' + variant);
  }

  getKey(hash, variant, size) {
    const name = this._hash2name(hash, variant);
    return { hash, variant, size, name, path: path.join(this.root, `${name}.${size}`) };
  }

  async exists(key) {
    try {
      await fs.access(key.path);
      return true;
    } catch(e) {
      if (e.code == 'ENOENT') return false;
      throw e;
    }
  }

  async store(file, key, isCompressedStream) {
    if (isCompressedStream) throw new Error('compressed stream only supported in hash-v4');
    await fs.mkdirp(path.join(this.root, path.dirname(key.name)), 0o700);
    await fs.copy(file, key.path);
  }

  async restore(key, file) {
    await fs.copy(key.path, file);
  }

  async compare(key, file) {
    await fs.compare(key.path, file);
  }

  async hashKey(key, opts) {
    return await fs.hash(key.path, Object.assign({}, opts, HASH_OPTS));
  }

  async hashFile(file, opts) {
    return await fs.hash(file, Object.assign({}, opts, HASH_OPTS));
  }

  keyFromFile(dir, name) {
    return name;
  }

  async getSignature(key) {
    return await rdiff_signature(key.path, key.size);
  }

}

module.exports = HashFileSystemV3;
