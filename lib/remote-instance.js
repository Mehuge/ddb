const { zip2stream } = require('./fs');
const BackupLog = require('./backup-log');
const BackupInstance = require('./backup-instance');

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
      body: JSON.stringify(attrs),
    });
  }

  async put(fn, size, hash) {
    let stored = false;
    const { res } = await this.target.request({ path: `/fs/has/${hash}.0.${size}` });
    if (res.statusCode == 404) {
      let { res } = await this.target.request({
        path: `/fs/put/${hash}/${size}`,
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        body: await zip2stream(fn),
      });
      if (res.statusCode == 200) {
        stored = true;
      }
    }
    return { variant: 0, stored };
  }

  async finish(body) {
    const { res } = await this.target.request({ path: `/backup/finish/${this.setname}`, body });
    if (res.statusCode != 200) {
      console.log(`backup failed, status ${res.statusCode}`);
    }
  }

  async complete(ts) {
    const { res } = await this.target.request({
      path: `/backup/complete/${this.setname}/${BackupLog.parseWhen(ts)}`
    });
    if (res.statusCode != 200) {
      console.error(`backup failed, status ${res.statusCode}`);
    }
  }

  async restore(opts) {
    let { res, body } = await this.target.request({
      path: `/restore/get/${this.setname}/${BackupLog.parseWhen(opts.when||'current')}`,
      body: { filters: opts.filter.filters },
    });
    if (res.statusCode == 200) {
      let root;
      const { output, verbose } = opts;
      const entries = body.split('\n').slice(0,-1).map(line => BackupLog.parse(line));
      for (const entry of entries) {
        switch(entry.type) {
          case 'SOURCE':
            root = entry.root;
            break;
          case 'D':
            // create folder
            await BackupInstance.restoreEntry({ entry, to: (output || root), verbose });
            break;
          case 'F':
            // request file from server
            const hash = `${entry.hash}.${entry.variant}.${entry.size}`;
            let { res } = await this.target.request({
              path: `/fs/get/${hash}`,
              onbody: async (reader) => {
                await BackupInstance.restoreEntry({
                  from: reader, isCompressedStream: true,
                  entry,
                  to: (output || root),
                  verbose
                });
              }
            });
            if (res.statusCode != 200) {
              console.error(`http-status ${res.statusCode} retrieving ${hash} for ${entry.path}`);
            }
            break;
        }
      }
    }
  }

}

module.exports = RemoteInstance;
