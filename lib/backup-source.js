
const fs = require('./fs');
const path = require('path');
const Filter = require('./filter');

function sameAsLastBackup(a, b) {
  return a.size == b.size
    && a.mtime.getTime() == b.mtime.getTime()
    && a.ctime.getTime() == b.ctime.getTime();
}

class BackupSource {
  constructor({ src, filters, subdirs, deepscan, verbose, checkHash }) {
    this.src = src;
    if (!src) throw new Error("source path missing");
    this.filters = filters;
    this.subdirs = subdirs;
    this.ignore = null;
    this.deepscan = deepscan;
    this.verbose = verbose;
    this.checkHash = checkHash;
  }

  async backupTo(instance, stats, lastBackup) {
    this.lastBackup = lastBackup;
    instance.log().writeSourceEntry({ root: this.src });
    const filter = new Filter({ filters: this.filters });
    const subdirs = this.subdirs;
    if (subdirs.length) {
      for (const subdir of subdirs) {
        await this._backupDir(path.join(this.src, subdir), instance, stats, filter);
      }
    } else {
      await this._backupDir(this.src, instance, stats, filter);
    }
  }

  async _log(instance, type, fn, stats, hash = '-', variant = 0, modified = ' ') {
    if (this.verbose) console.log(modified, path.join(this.src, fn));
    const { mode, ctime, mtime, size } = stats;
    let { uid, gid } = stats;
    if (process.platform === "win32") {
      gid = uid = '';
    };
    await instance.log().writeEntry({ type, uid, gid, mode, ctime, mtime, size, hash, variant, path: fn });
  }

  async _scanDir(dirname, instance, stats, filter) {
    // if (this.verbose) console.log(`scan ${dirname}`);
    const dir = await fs.readdir(dirname, { withFileTypes: true });
    const l = this.src.length+1;
    for (let i = 0; i < dir.length; i++) {
      const entry = dir[i];
      if (entry.isDirectory()) {
        const fn = path.join(dirname, entry.name);
        const ignored = filter.ignores(fn.substr(l));
        if (ignored) {
          await this._scanDir(fn, instance, stats, filter);
        } else {
          await this._backupDir(fn, instance, stats, filter);
        }
      }
    }
  }

  async _backupDir(dirname, instance, stats, filter) {
    try {
      const fstat = await fs.stat(dirname);
      let modified = 'a';
      if (this.lastBackup) {
        const last = this.lastBackup.D[dirname];
        if (last && fstat.mtime > this.lastBackup.time) {
          modified = 'u';
        } else {
          modified = '-';
        }
      }
      await this._log(instance, 'D', dirname.substr(this.src.length+1), fstat, '-', 0, modified);
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
    const deepscan = this.deepscan;
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
        const ignored = filter.ignores(fn.substr(l));
        switch(type) {
        case 'D':
          if (ignored) {
            if (deepscan) {
              await this._scanDir(fn, instance, stats, filter)
            }
          } else {
            await this._backupDir(fn, instance, stats, filter);
          }
          break;
        case 'F':
          if (!ignored) await this._backupFile(fn, instance, stats);
          break;
        default:
          // ignore other types
          break;
        }
      } else {
        console.log(`${dir.name} unknown file type`);
      }
    }
  }

  async _backupFile(fn, instance, stats) {
    try {
      const fstat = await fs.stat(fn);
      let hash;
      let modified = 'a';
      if (this.lastBackup) {
        const last = this.lastBackup.F[fn];
        if (last) {
          if (fstat.mtime <= this.lastBackup.time && sameAsLastBackup(fstat, last)) {
            if (this.checkHash) {
              modified = 'c';
            } else {
              hash = last.hash;
              modified = '-';
            }
          } else {
            modified = 'u';
          }
        }
      }
      if (!hash) {
        hash = await fs.hash(fn, { hash: 'sha256', encoding: 'hex' });
      }
      stats.files ++;
      stats.bytes += fstat.size;
      const { variant, stored } = await instance.put(fn, fstat.size, hash);
      await this._log(instance, 'F', fn.substr(this.src.length+1), fstat, hash, variant, modified);
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
