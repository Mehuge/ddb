
const fs = require('./fs');

class BackupFileSystem {

  constructor({ fast }) {
    this.root = null;
    this.fast = fast;
  }

  async setLocation(root, fstype = 'hash-v1') {
    this.root = root;
    switch(fstype) {
      case 'hash-v3':
        this.hfs = new (require('./hash-filesystem-v3'))({ root });
        this.fstype = fstype;
        break;
      case 'hash-v2':			/* deprecated */
        this.hfs = new (require('./hash-filesystem-v2'))({ root });
        await this.hfs.initFs();
        this.fstype = fstype;
        break;
      case 'hash-v1':			/* deprecated */
        this.hfs = new (require('./hash-filesystem-v1'))({ root });
        this.fstype = fstype;
        break;
      default:
        throw new Error('unknown hash filesystem type');
    }
  }

  getLocation() {
    return this.root;
  }

  async put(file, size, hash, variant = 0) {
    let stored = false;
    size = ''+size;
    const key = await this.hfs.getKey(hash, variant, size);
    const exists = await this.hfs.exists(key);
    if (exists) {
      try {
        this.fast || await fs.compare(file, key.path);
      } catch(e) {
        switch (e.code) {
        case 'ENOCOMPARE':
          const h = await fs.hash(file, { hash: 'sha256', encoding: 'hex' });
          if (h == hash) return this.put(file, size, hash, ++variant);
          throw new Error('file changed while backing up');
        default:
          throw e;
        }
      }
    } else {
      await this.hfs.store(file, key);
      stored = true;
    }
    return { variant, stored };
  }

  async verify(size, hash, variant, compareWith) {
    const key = await this.hfs.getKey(hash, variant, size);
    const exists = await this.hfs.exists(key);
    if (!exists) throw new Error('entry not found');
    const hash2 = await fs.hash(key.path, { hash: 'sha256', encoding: 'hex' });
    if (hash2 != hash) throw new Error(`files.db entry corrupt for ${key.name}/${size}`);
    if (compareWith) await fs.compare(key.path, compareWith);
  }

  async restore(size, hash, variant, copyTo) {
    await this.hfs.restore(this.hfs.getKey(hash, variant, size), copyTo);
  }

  keyFromFile(dir, name) {
    return this.hfs.keyFromFile(dir, name);
  }

  async get(hash) {
    // get a file from the backup stor
  }
}

module.exports = BackupFileSystem;
