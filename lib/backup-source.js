
const fs = require('./fs');
const path = require('path');
const Filter = require('./filter');

class BackupSource {
  constructor({ src, include, exclude, verbose }) {
    this.src = src;
    if (!src) throw new Error("source path missing");
    this.include = include;
    this.exclude = exclude;
    this.verbose = verbose;
    this.ignore = null;
  }

  async backupTo(destination, instance, stats) {
    instance.log().writeSourceEntry({ root: this.src });
    await this._backupDir(this.src, destination, instance, stats);
  }

  async _log(instance, type, fn, stats, hash = '-', variant = 0) {
    if (this.verbose) console.log(path.join(this.src, fn));
    const { mode, ctime, mtime, atime, size } = stats;
    let { uid, gid } = stats;
    if (process.platform === "win32") {
      gid = uid = '';
    };
    await instance.log().writeEntry({ type, uid, gid, mode, ctime, mtime, atime, size, hash, variant, fn });
  }

  async _backupDir(dirname, destination, instance, stats) {
    try {
      const fstat = await fs.stat(dirname);
      await this._log(instance, 'D', dirname.substr(this.src.length+1), fstat);
    } catch(e) {
      if (e.code == 'ENOENT') {
        console.log(`${dirname} is missing`);
        stats.skipped++;
        return;
      }
      throw e;
    }
    stats.folders ++;
    const dir = await fs.readdir(dirname, { withFileTypes: true });
    const l = this.src.length+1;
    const filter = new Filter({ excludes: this.exclude, includes: this.include });
    for (let i = 0; i < dir.length; i++) {
      const entry = dir[i];
      let type;
      if (entry.isFile()) type = 'F';
      if (entry.isDirectory()) type = 'D';
      if (entry.isBlockDevice()) type = 'B';
      if (entry.isCharacterDevice()) type = 'C';
      if (entry.isFIFO()) type = 'P';
      if (entry.isSocket()) type = 'S';
      if (entry.isSymbolicLink()) type = 'L';
      if (type) {
        const fn = path.join(dirname, entry.name);
        if (!filter.ignores(fn.substr(l))) {
          switch(type) {
          case 'D':
            await this._backupDir(fn, destination, instance, stats);
            break;
          case 'F':
            await this._backupFile(fn, destination, instance, stats);
            break;
          default:
            // ignore other types
            break;
          }
        }
      } else {
        console.log(`${dir.name} unknown file type`);
      }
    }
  }

  async _backupFile(fn, destination, instance, stats) {
    try {
      const fstat = await fs.stat(fn);
      const hash = await fs.hash(fn, { hash: 'sha256', encoding: 'hex' });
      stats.files ++;
      stats.bytes += fstat.size;
      const { variant, stored } = await destination.fs().put(fn, fstat.size, hash);
      await this._log(instance, 'F', fn.substr(this.src.length+1), fstat, hash, variant);
      if (stored) {
        stats.backedUp.files ++;
        stats.backedUp.bytes += fstat.size;
      }
    } catch(e) {
      stats.skipped ++;
      console.log(`${fn} failed`);
      console.dir(e);
      throw e;
    }
  }
};

module.exports = BackupSource;
