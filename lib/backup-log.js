
const fs = require('./fs');
const path = require('path');

const VERSION = 2;

class BackupLog {
  constructor({ root, setname }) {
    this.root = root;
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
    return path.join(this.root, 'backups', `${this.setname}.${when}`);
  }

  async create(when) {
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
          hashes[`${entry.hash}.${entry.variant}.${entry.size}`] = 1;
        }
      });
      readline.on('close', resolve);
    });
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
    await fs.link(to, current);
  }
}

module.exports = BackupLog;
