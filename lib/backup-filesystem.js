
const fs = require('./fs');

class BackupFileSystem {

  constructor({ fast }) {
    this.root = null;
    this.fast = fast;
    this._cache = {};
  }

  async setLocation(root, fstype = 'hash-v4') {
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
      case 'hash-v1':			/* deprecated */
        throw new Error('hash filesystem type no longer supported');
        break;
      default:
        throw new Error('unknown hash filesystem type');
    }
  }

  getLocation() {
    return this.root;
  }

  async put(file, size, hash, options = { variant: 0 }) {
    let stored = false;
    size = ''+size;
    const hfs = this.hfs;
    const key = await hfs.getKey(hash, options.variant, size);
    const alreadyExists = this._cache && this.fast && this._cache[key.hash];
    const exists = alreadyExists || await hfs.exists(key);
    if (exists) {
      try {
        if (!this.fast) {
          if (typeof file == 'string') {
            await hfs.compare(key, file);
          } else {
            console.warn('backup-filesystem.js: skipping compare on file stream');
          }
        }
      } catch(e) {
        switch (e.code) {
        case 'ENOCOMPARE':
          const h = await hfs.hashFile(file);
          if (h == hash) {
            options.variant ++;
            return this.put(file, size, hash, options);
          }
          throw new Error('file changed while backing up');
        default:
          throw e;
        }
      }
    } else {
      await hfs.store(file, key, options.compressed);
      stored = true;
    }
    if (this._cache) this._cache[key.hash] = file;
    return { variant: options.variant, stored };
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

  async hashFile(file) {
    return await this.hfs.hashFile(file);
  }

  async restore(size, hash, variant, copyTo, isCompressedStream) {
    await this.hfs.restore(this.hfs.getKey(hash, variant, size), copyTo, isCompressedStream);
  }

  async has(size, hash, variant) {
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
