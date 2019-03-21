const fs = require('./fs');
const FS = require('fs').constants;
const path = require('path');

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
    await fs.mkdirp(path.join(this.root, key.name));
    await fs.copy(file, key.path, FS.COPYFILE_FICLONE);
  }

  keyFromFile(dir, name) {
    return dir.replace(new RegExp('\\' + path.sep, 'g'),'') + '.' + name;
  }

}

module.exports = HashFileSystemV1;
