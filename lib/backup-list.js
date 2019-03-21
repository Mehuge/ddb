
const path = require('path');
const BackupInstance = require('./backup-instance');
const Filter = require('./filter');

class BackupList {
  constructor({ destination }) {
    if (!destination) throw new Error("destination missing");
    this.destination = destination;
  }

  ext2iso(ext) {
    return `${ext.substr(0,4)}-${ext.substr(4,2)}-${ext.substr(6,2)}`
          + `T${ext.substr(9,2)}:${ext.substr(11,2)}:${ext.substr(13,2)}`
          + `.${ext.substr(15)}`;
  }

  async getStats(name, when) {
    const instance = new BackupInstance({ destination: this.destination, name });
    const lines = await instance.getLinesFromInstanceLog(when);
    return lines.pop().stats;
  }

  async listFiles(name, when, { includes, excludes }) {
    const instance = new BackupInstance({ destination: this.destination, name });
    const filter = new Filter({ includes, excludes });
    for (const entry of await instance.getLinesFromInstanceLog(when)) {
      switch(entry.type) {
      case 'F':
        if (!filter.ignores(entry.path)) {
          console.log(`${entry.mtime} ${entry.mode} ${entry.size.padStart(10)} ${entry.path}`);
        }
        break;
      }
    }
  }

  async list(opts) {
    let set = opts.set;
    for (const log of await this.destination.getLogs(opts.set)) {
      let ext = path.extname(log.name);
      const name = log.name.substr(0, log.name.length - ext.length);
      if (name != set) {
        console.log(`Backup Set: ${name}`)
        set = name;
      }
      switch(ext) {
        case '.current': case '.running': break;
        default:
          ext = ext.substr(1);
          const when = new Date(`${this.ext2iso(ext)}`);
          if (opts.when) {
            if (opts.when.getTime() == when.getTime()) {
              this.listFiles(name, ext, opts.filter);
            }
          } else {
            if (!opts.since || when.getTime() >= opts.since.getTime()) {
              const stats = await this.getStats(name, ext);
              console.log(`${when.toISOString()} ${stats.files} files ${((stats.bytes*100/1024/1024)|0)/100} MB took ${stats.took/1000} seconds`);
            }
          }
          break;
      }
    }
  }
}

module.exports = BackupList;
