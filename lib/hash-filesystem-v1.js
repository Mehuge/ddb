const fs = require('./fs');
const FS = require('fs').constants;
const path = require('path');

const HASH_OPTS = { hash: 'sha256', encosing: 'hex' };

class HashFileSystemV1 {
  constructor({ root }) {
    this.root = root;
  }

  _hash2name(hash, variant = 0) {
    const name = [ hash.substr(0,2), hash.substr(2,3), hash.substr(5,4), ...hash.substr(9).match(/.{1,12}/g) ];
    return name.join(path.sep) + '.' + variant;
  }

  async getKey(hash, variant, size) {
    const name = this._hash2name(hash, variant);
    return { hash, variant, size, name, path: path.join(this.root, name, size) };
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
    await fs.mkdirp(path.join(this.root, key.name), 0o777);
    await fs.copy(file, key.path, FS.COPYFILE_FICLONE);
  }

  async restore(key, file) {
    await fs.copy(key.path, file, FS.COPYFILE_FICLONE);
  }

  async compare(key, file) {
    await fs.compare(key.path, file);
  }

  async hashKey(key) {
    return await fs.hash(key.path, HASH_OPTS);
  }

  async hashFile(file) {
    return await fs.hash(file, HASH_OPTS);
  }

  keyFromFile(dir, name) {
    return dir.replace(new RegExp('\\' + path.sep, 'g'),'') + '.' + name;
  }

}

module.exports = HashFileSystemV1;
