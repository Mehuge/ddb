const path = require('path');
const createReadStream = require('fs').createReadStream;
const { zip2stream } = require('./fs');

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
    console.log(`check ${fn}`);
    let stored = false;
    let { res } = await this.target.request({ path: `/fs/has/${hash}.0.${size}` });
    if (res.statusCode == 404) {
      console.log(`put ${fn}`);
      let { res2, body2 } = await this.target.request({
        path: `/fs/put/${hash}/${size}`,
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        body: await zip2stream(fn)
      });
      if (res.statusCode == 200) {
        stored = true;
        console.log('file stored');
      }
    }
    return { variant: 0, stored };
  }

  async finish(msg) {
    let { res } = await this.target.request({ path: `/backup/finish/${this.setname}` });
    if (res.statusCode == 200) {
      console.log('backup finished');
    }
  }

  async complete(opts) {
    let { res } = await this.target.request({ path: `/backup/complete/${this.setname}` });
    if (res.statusCode == 200) {
      console.log('backup complete');
    }
  }

}

module.exports = RemoteInstance;
