const fs = require('./fs');
const BackupLog = require('./backup-log');
const BackupInstance = require('./backup-instance');
const BackupFileSystemV4 = require('./hash-filesystem-v4');
const path = require('path');
const { rdiff } = require('./rdiff');

class RemoteInstance {

  constructor({ target, setname }) {
    this.target = target;
    this.setname = setname;
  }

  async createNewInstance() {
    const { res } = await this.target.request({
      path: `/backup/create/${this.setname}`,
      query: { verbose: 1 }
    });
    if (res.statusCode == 200) {
      return;
    }
    throw new Error(`${res.statusCode} ${res.statusMessage}`);
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

  async _rdiffFile(fn, size, hash, oldsig) {
    const script = await rdiff(fn, size, oldsig);
    console.dir(script);    // ignore for now, just send whole file

    // If rdiff result is everything change, just do a putfile
    if (!size || (script.length == 1 && script[0].type == 'D')) {
      return await this._putFile(fn, size, hash);
    }

    return await this._putFile(fn, size, hash);

    // send rdiff
    return await this.target.request({
      path: '/fs/put-rdiff/${hash}/${size}',
      body: await rdiff_stream(fn, script, oldsig.hash)
    });
  }

  async _getPrevSignature(fn, size, hash) {
    const { res, body } = await this.target.request({
      path: `/backup/rdiff/${this.setname}`,
      headers: { 'Content-Type': 'text/json '},
      body: JSON.stringify(fn),
    });
    if (res.statusCode == 200) {
      return JSON.parse(body);
    }
    return null;
  }

  async _putFile(fn, size, hash) {
    return await this.target.request({
      path: `/fs/put/${hash}/${size}`,
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      body: await fs.zip2stream(fn),
    });
  }

  async put(fn, size, hash) {
    let stored = false;
    const { res } = await this.target.request({ path: `/fs/has/${hash}.0.${size}` });
    if (res.statusCode == 404) {
      const signature = size > 0 ? await this._getPrevSignature(fn, size, hash) : null;
      let { res } = signature ? await this._rdiffFile(fn, size, hash, signature) : await this._putFile(fn, size, hash);
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
        const file = typeof entry.path  == 'string' && path.join((output || root), entry.path);
        switch(entry.type) {
          case 'SOURCE':
            root = entry.root;
            break;
          case 'D':
            // create folder
            await BackupInstance.restoreEntry({ entry, to: file, verbose });
            break;
          case 'F':
            // check if file has change since backed up, if so, request file from server
            try {
              const stat = await fs.stat(file);   // will fail with ENOENT if missing
              if (stat.size == entry.size) {
                const localHash = await BackupFileSystemV4.hashFile(file);  // backup server uses V4
                if (localHash == entry.hash) {
                  await fs.chstat(file, Object.assign({}, entry, {
                    mode: parseInt(entry.mode,8),
                    mtime: new Date(entry.mtime),
                    atime: new Date()
                  }), stat);
                  console.log(`${file} not changed`);
                  break;
                }
              }
            } catch(e) {
              if (e.code != 'ENOENT') throw e;
            }
            const hash = `${entry.hash}.${entry.variant}.${entry.size}`;
            let { res } = await this.target.request({
              path: `/fs/get/${hash}`,
              onbody: async (reader) => {
                await BackupInstance.restoreEntry({
                  from: reader, isCompressedStream: true,
                  entry,
                  to: file,
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

// changed
