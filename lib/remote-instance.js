const { zip2stream } = require('./fs');
const BackupLog = require('./backup-log');

class RemoteInstance {
  constructor({ target, setname }) {
    this.target = target;
    this.setname = setname;
  }
  async createNewInstance() {
    const target = this.target;
    const { res, body } = await this.target.request({
      path: `/backup/create/${this.setname}`,
      query: { verbose: 1 }
    });
  }

  log() {
    return this;
  }

  async writeSourceEntry({ root }) {
    const { res, body } = await this.target.request({
      path: `/backup/log/${this.setname}/source`,
      headers: { 'Content-Type': 'text/json' },
      body: JSON.stringify(root)
    });
  }

  async writeEntry(attrs) {
    const { res, body } = await this.target.request({
      path: `/backup/log/${this.setname}/entry`,
      headers: { 'Content-Type': 'text/json' },
      body: JSON.stringify(attrs)
    });
  }

  async put(fn, size, hash) {
    let stored = false;
    let { res } = await this.target.request({ path: `/fs/has/${hash}.0.${size}` });
    if (res.statusCode == 404) {
      let { res } = await this.target.request({
        path: `/fs/put/${hash}/${size}`,
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        body: await zip2stream(fn)
      });
      if (res.statusCode == 200) {
        stored = true;
      }
    }
    return { variant: 0, stored };
  }

  async finish(body) {
    let { res } = await this.target.request({ path: `/backup/finish/${this.setname}`, body });
    if (res.statusCode != 200) {
      console.log(`backup failed, status ${res.statusCode}`);
    }
  }

  async complete(ts) {
    let { res } = await this.target.request({
      path: `/backup/complete/${this.setname}/${BackupLog.parseWhen(ts)}`
    });
    if (res.statusCode != 200) {
      console.error(`backup failed, status ${res.statusCode}`);
    }
  }

}

module.exports = RemoteInstance;
