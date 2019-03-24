const fs = require('./fs');
const FS = require('fs').constants;
const path = require('path');
const crc = require('crc');

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

  async getKey(hash, variant, size) {
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

  async store(file, key) {
    await fs.mkdirp(path.join(this.root, path.dirname(key.name)));
    await fs.copy(file, key.path, FS.COPYFILE_FICLONE);
  }

  keyFromFile(dir, name) {
    return name;
  }

}

module.exports = HashFileSystemV3;
