
const fs = require('./fs');

class BackupLog {
  async create(name) {
    this.log = await fs.open(name, 'w', 0o666);
    await this.log.appendFile(`V1 type mode ctime mtime atime size hash path\n`);
  }

  async writeSourceEntry({ root }) {
    await this.log.appendFile(`SOURCE ${root}\n`);
  }

  async writeEntry({ type, mode, uid, gid, ctime, mtime, atime, size, hash, variant, fn }) {
    await this.log.appendFile(
      `${type} ${uid}:${gid}:${mode.toString(8)} ${ctime.toISOString()} ${mtime.toISOString()} ${atime.toISOString()}`
      + ` ${size|0} ${hash} ${variant} ${JSON.stringify(fn)}\n`
    );
  }

  async finish(status = 'OK') {
    await this.log.appendFile(`V1 STATUS ${status}\n`);
    await this.log.close();
  }

  static async getLinesFromLog(name) {
    const lines = [];
    return new Promise((resolve, reject) => {
      const readline = fs.readline(name);
      readline.on('line', line => {
        if (line = this.parse(line)) lines.push(line);
      });
      readline.on('error', reject);
      readline.on('close', () => resolve(lines));
    });
  }

  static parse(line) {
    const words = line.split(' ');
    switch(words[0]) {
    case 'V1':
      switch(words[1]) {
        case 'STATUS':
          return { type: 'STATUS', status: words[2], stats: JSON.parse(words.slice(3).join(' ')) };
      }
      return { type: 'HEADER', version: words[0][1] };
    case 'SOURCE':
      return { type: 'SOURCE', root: line.substr(words[0].length+1) };
    case 'D': case 'F':
      const key = ` ${words[6]} ${words[7]} `;
      const path = JSON.parse(line.substr(line.indexOf(key) + key.length));
      const mode = words[1].split(':');
      if (mode.length == 1) {
        mode.unshift(undefined);
        mode.unshift(undefined);
      }
      return {
        type: words[0],
        uid: mode[0], gid: mode[1], mode: mode[2],
        ctime: words[2],
        mtime: words[3],
        atime: words[4],
        size: words[0] == 'D' ? '-' : words[5],
        hash: words[6],
        variant: words[7],
        path,
      };
    }
    return { type: 'unknown', line: line };
  }
}

module.exports = BackupLog;
