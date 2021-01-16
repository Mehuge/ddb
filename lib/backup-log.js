
const fs = require('./fs');
const path = require('path');

const VERSION = 2;

class BackupLog {
  constructor({ root, userid, setname }) {
    this.root = root;
    this.userid = userid||'';
    this.setname = setname;
  }

  static parseWhen(when = 'current') {
    switch(when) {
      case 'current': case 'running': return when;
    }
    return (when.toISOString ? when.toISOString() : when).replace(/[\-:\.]/g,'');
  }

  static ext2iso(ext) {
    return `${ext.substr(0,4)}-${ext.substr(4,2)}-${ext.substr(6,2)}`
          + `T${ext.substr(9,2)}:${ext.substr(11,2)}:${ext.substr(13,2)}`
          + `.${ext.substr(15)}`;
  }

  getLogName(when) {
    return path.join(this.root, 'backups', this.userid, `${this.setname}.${when}`);
  }

  async exists(when) {
    try {
      await fs.access(this.getLogName(when));
      return true;
    } catch(e) {
      // does not exist, return undefined
    }
  }

  async create(when) {
    const dir = path.join(this.root, 'backups', this.userid);
    await fs.mkdirp(dir, 0o755);
    this.log = await fs.open(this.getLogName(when), 'w', 0o600);
    await this.log.appendFile(`V${VERSION} type mode ctime mtime - size hash path\n`);
  }

  async writeSourceEntry({ root }) {
    await this.log.appendFile(`SOURCE ${root}\n`);
  }

  static entryToString({ type, mode, uid, gid, ctime, mtime, size, hash, variant, path }) {
    if (typeof mode != 'string') mode = mode.toString(8);
    if (typeof ctime != 'string') ctime = ctime.toISOString();
    if (typeof mtime != 'string') mtime = mtime.toISOString();
    if (typeof size != 'string') size = size|0;
    return `${type} ${uid}:${gid}:${mode} ${ctime} ${mtime} -`
      + ` ${size} ${hash} ${variant} ${JSON.stringify(path.replace(/\\/g,'/'))}`;
  }

  async writeEntry(entry) {
    await this.log.appendFile(`${BackupLog.entryToString(entry)}\n`);
  }

  async finish(status = 'OK') {
    await this.log.appendFile(`V${VERSION} STATUS ${status}\n`);
    await this.log.close();
  }

  async getLinesFromLog(when) {
    const lines = [];
    return new Promise((resolve, reject) => {
      const readline = fs.readline(this.getLogName(BackupLog.parseWhen(when)));
      readline.on('line', line => {
        if (line = BackupLog.parse(line)) lines.push(line);
      });
      readline.on('error', reject);
      readline.on('close', () => resolve(lines));
    });
  }

  async getHashesFromInstanceLog(when, hashes) {
    return new Promise((resolve, reject) => {
      const readline = fs.readline(this.getLogName(BackupLog.parseWhen(when)));
      readline.on('line', line => {
        const entry = BackupLog.parse(line);
        if (entry.type == 'F') {
          const key = `${entry.hash}.${entry.variant}.${entry.size}`;
          const hash = hashes[key] || { count: 0 };
          hash.count ++;
          hashes[key] = hash;
        }
      });
      readline.on('close', resolve);
    });
  }

  async getLastBackup() {
    const dir = path.join(this.root, 'backups', this.userid || '');
    const prefix = `${this.setname}.`;
    let lastBackup;
    try {
      for (const log of await fs.readdir(dir, { withFileTypes: true })) {
        if (log.isFile() && log.name[0] != '.') {
          if (log.name.startsWith(prefix)) {
            const ts = log.name.substr(prefix.length);
            switch(ts) {
              case 'running': case 'current':
                break;
              default:
                if (!lastBackup || ts > lastBackup) lastBackup = ts;
            }
          }
        }
      }
    } catch(e) {
      console.log(e);
    }
    if (lastBackup) {
      const date = `${lastBackup.substr(0,4)}-${lastBackup.substr(4,2)}-${lastBackup.substr(6,2)}`;
      const time = `${lastBackup.substr(9,2)}:${lastBackup.substr(11,2)}:${lastBackup.substr(13,2)}.${lastBackup.substr(15,3)}`;
      const log = await this.getLinesFromLog(lastBackup);
      const info = {
        time: new Date(`${date}T${time}Z`),
        F: {},
        D: {},
      };
      let source;
      log.forEach(entry => {
        switch(entry.type) {
          case 'SOURCE':
            source = entry.root;
            break;
          case 'F': case 'D':
            const { hash, size } = entry;
            info[entry.type][path.join(source, entry.path)] = {
              hash, size, source,
              mtime: new Date(entry.mtime),
              ctime: new Date(entry.ctime)
            };
            break;
        }
      });
      return info;
    }
  }

  static parse(line) {
    const words = line.split(' ');
    switch(words[0]) {
    case 'V1': case 'V2':
      switch(words[1]) {
        case 'STATUS':
          return { type: 'STATUS', status: words[2], stats: JSON.parse(words.slice(3).join(' ')) };
      }
      return { type: 'HEADER', version: words[0][1] };
    case 'SOURCE':
      return { type: 'SOURCE', root: line.substr(words[0].length+1) };
    case 'D': case 'F':
      const path = JSON.parse(words.slice(8).join(' '));
      const mode = words[1].split(':');
      if (mode.length == 1) {
        mode.unshift(undefined);
        mode.unshift(undefined);
      }
      return {
        type: words[0],
        uid: mode[0]|0, gid: mode[1]|0, mode: mode[2],
        ctime: words[2],
        mtime: words[3],
        size: words[0] == 'D' ? '-' : words[5],
        hash: words[6],
        variant: words[7],
        path,
      };
    }
    return { type: 'unknown', line: line };
  }

  async complete(ts = new Date()) {
    const from = this.getLogName('running');
    const to = this.getLogName(BackupLog.parseWhen(ts));
    const current = this.getLogName('current');
    await fs.move(from, to)
    try {
      await fs.access(current);
      await fs.unlink(current);
    } catch(e) {
      if (e.code != 'ENOENT') throw e;
    }
    try {
      await fs.link(to, current);
    } catch(e) {
      if (e.code == "EISDIR") {
        // get this on FAT32 filesystem where links are not supported
        // so copy instead.
        await fs.copy(to, current);
      } else {
        throw e;
      }
    }
  }
}

module.exports = BackupLog;
