
const path = require('path');
const BackupInstanceProxy = require('./backup-instance-proxy');
const Filter = require('./filter');

class BackupList {
  constructor({ target }) {
    if (!target) throw new Error("backup target missing");
    this.target = target;
  }

  ext2iso(ext) {
    return `${ext.substr(0,4)}-${ext.substr(4,2)}-${ext.substr(6,2)}`
          + `T${ext.substr(9,2)}:${ext.substr(11,2)}:${ext.substr(13,2)}`
          + `.${ext.substr(15)}`;
  }

  async getStats(name, when) {
    const instance = new BackupInstanceProxy({ target: this.target, name });
    const lines = await instance.getLinesFromInstanceLog(when);
    return lines.pop().stats;
  }

  async listFiles(name, when, { includes, excludes }, sources) {
    const target = this.target;
    const instance = new BackupInstanceProxy({ target, name });
    const filter = new Filter({ includes, excludes });
    for (const entry of await instance.getLinesFromInstanceLog(when)) {
      if (sources) {
        if (entry.type == 'SOURCE') {
          console.log(`${entry.root}`);
        }
      } else {
        switch(entry.type) {
        case 'F':
          if (!filter.ignores(entry.path)) {
            console.log(`${entry.mtime} ${entry.uid||'-'}:${entry.gid||'-'} ${entry.mode} ${entry.size.padStart(10)} ${entry.path}`);
          }
          break;
        }
      }
    }
  }

  async listWhen(opts, set, when) {
    for (const log of await this.target.getLogs(set, when == 'current' && when)) {
      let ext = path.extname(log.name);
      const name = log.name.substr(0, log.name.length - ext.length);
      if (name != set) {
        console.log(`Backup Set: ${name}`)
        set = name;
      }
      ext = ext.substr(1);
      if (when == 'current') {
        if (ext == when) {
          this.listFiles(name, when, opts.filter, opts.sources);
          return;
        }
      } else {
        switch(ext) {
        case 'running': case 'current':
          break;
        default:
          const instance = new Date(`${this.ext2iso(ext)}`);
          if (when) {
            if (when.getTime() == instance.getTime()) {
              this.listFiles(name, ext, opts.filter, opts.sources);
              return;
            }
          } else {
            if (!opts.since || instance.getTime() >= opts.since.getTime()) {
              const stats = await this.getStats(name, ext);
              console.log(`${instance.toISOString()} ${stats.files} files ${((stats.bytes*100/1024/1024)|0)/100} MB took ${stats.took/1000} seconds`);
              if (opts.sources) {
                this.listFiles(name, ext, opts.filter, opts.sources);
              }
            }
          }
          break;
        }
      }
    }
  }

  async list(opts) {
    switch (opts.when) {
      case 'current':
      case undefined: case null:
        await this.listWhen(opts, opts.set, opts.when);
        break;
      default:
        await this.listWhen(opts, opts.set, new Date(opts.when));
        break;
    }
  }
}

module.exports = BackupList;
