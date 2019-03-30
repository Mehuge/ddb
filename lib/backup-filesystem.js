
const fs = require('./fs');

class BackupFileSystem {

  constructor({ fast }) {
    this.root = null;
    this.fast = fast;
  }

  async setLocation(root, fstype = 'hash-v3') {
    this.root = root;
    switch(fstype) {
      case 'hash-v4':     /* like v3 but compressed */
        this.hfs = new (require('./hash-filesystem-v4'))({ root });
        this.fstype = fstype;
        break;
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
    const hfs = this.hfs;
    const key = await hfs.getKey(hash, variant, size);
    const exists = await hfs.exists(key);
    if (exists) {
      try {
        this.fast || await hfs.compare(key, file);
      } catch(e) {
        switch (e.code) {
        case 'ENOCOMPARE':
          const h = await hfs.hashFile(file);
          if (h == hash) return this.put(file, size, hash, ++variant);
          throw new Error('file changed while backing up');
        default:
          throw e;
        }
      }
    } else {
      await hfs.store(file, key);
      stored = true;
    }
    return { variant, stored };
  }

  async verify(size, hash, variant, compareWith) {
    const hfs = this.hfs;
    const key = await hfs.getKey(hash, variant, size);
    const exists = await hfs.exists(key);
    if (!exists) throw new Error('entry not found');
    const hash2 = await hfs.hashKey(key);
    if (hash2 != hash) throw new Error(`files.db entry corrupt for ${key.name}/${size}`);
    if (compareWith) await hfs.compare(key, compareWith);
  }

  async restore(size, hash, variant, copyTo) {
    await this.hfs.restore(this.hfs.getKey(hash, variant, size), copyTo);
  }

  async has(size, hash, variant) {
    console.log(`has(${size}, ${hash}, ${variant})`);
    const key = await this.hfs.getKey(hash, variant, size);
    return await this.hfs.exists(key);
  }

  keyFromFile(dir, name) {
    return this.hfs.keyFromFile(dir, name);
  }

  async get(hash) {
    // get a file from the backup stor
  }
}

module.exports = BackupFileSystem;
