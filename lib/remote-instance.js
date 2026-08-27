const fs = require('./fs');
const BackupLog = require('./backup-log');
const BackupInstance = require('./backup-instance');
const BackupFileSystemV5 = require('./hash-filesystem-v5');
const { Readable } = require('stream');
const { createReadStream } = require('fs');
const { createGzip } = require('zlib');
const path = require('path');
const { memtrack } = require('./debug');

const BATCH_FILE_COUNT = 50;  // flush when this many files are queued
const MAX_LOG_ENTRIES  = 500; // flush when this many log-only entries queue up

class RemoteInstance {

  constructor({ target, setname }) {
    this.target = target;
    this.setname = setname;
    this._batchItems = [];
    this._flushChain  = null;
    this._fatalError  = null;
  }

  async createNewInstance() {
    const { res } = await this.target.request({
      path: `/backup/create/${this.setname}`,
      query: { verbose: 1 }
    });
    if (res.statusCode == 200) return;
    throw new Error(`${res.statusCode} ${res.statusMessage}`);
  }

  log() { return this; }

  async getLastBackup() {
    const { res, body } = await this.target.request({
      path: `/log/get/${this.setname}/last`,
    });
    if (res.statusCode == 200) {
      try {
        const response = JSON.parse(body);
        const { F, D, H } = response;
        for (let key in F) { F[key].ctime = new Date(F[key].ctime); F[key].mtime = new Date(F[key].mtime); }
        for (let key in D) { D[key].ctime = new Date(D[key].ctime); D[key].mtime = new Date(D[key].mtime); }
        for (let key in H) { H[key].ctime = new Date(H[key].ctime); H[key].mtime = new Date(H[key].mtime); }
        const lastBackup = { time: new Date(response.time), D: {}, F: {}, H };
        Object.keys(D).forEach(key => { lastBackup.D[path.normalize(key)] = D[key]; });
        Object.keys(F).forEach(key => { lastBackup.F[path.normalize(key)] = F[key]; });
        return lastBackup;
      } catch(e) {
        console.error(e);
      }
    }
  }

  async writeSourceEntry({ root }) {
    if (this._fatalError) throw this._fatalError;
    this._batchItems.push({ type: 'source', root });
    if (this._batchItems.length >= MAX_LOG_ENTRIES) this._enqueueFlush();
  }

  async writeEntry(attrs) {
    if (this._fatalError) throw this._fatalError;
    this._batchItems.push({ type: 'log', entry: attrs });
    if (this._batchItems.length >= MAX_LOG_ENTRIES) this._enqueueFlush();
  }

  // Non-blocking. Queues a file and its log entry together.
  // onResult({variant, stored}) is called once the batch containing this file is flushed.
  queueFile(fn, size, hash, logEntry, onResult) {
    if (this._fatalError) throw this._fatalError;
    this._batchItems.push({ type: 'fileWithEntry', fn, hash, size, logEntry, onResult });
    const fileCount = this._batchItems.filter(i => i.type === 'fileWithEntry').length;
    if (fileCount >= BATCH_FILE_COUNT) this._enqueueFlush();
  }

  // Append a flush onto the async chain so flushes serialise naturally.
  _enqueueFlush() {
    this._flushChain = (this._flushChain || Promise.resolve()).then(async () => {
      if (this._fatalError) return;
      if (this._batchItems.length > 0) await this._flushBatch();
    }).catch(err => {
      this._fatalError = err;
      // Drain pending callbacks so they don't hang
      this._batchItems.forEach(item => { if (item.onResult) item.onResult({ variant: 0, stored: false }); });
      this._batchItems = [];
    });
  }

  async flush() {
    if (this._fatalError) throw this._fatalError;
    this._enqueueFlush();
    await (this._flushChain || Promise.resolve());
    if (this._fatalError) throw this._fatalError;
    while (this._batchItems.length > 0) await this._flushBatch();
  }

  // Wire format per item:
  //   source / log  → 'L' frame: [0x4C][uint32 hdr-len][JSON]
  //   fileWithEntry → if uploading: 'F' frame: [0x46][uint32 hdr-len][JSON]
  //                                             then size-prefixed gzip chunks, 0-terminator
  //                   always:      'L' frame for the F log entry
  async* _generateBatchFrames(items) {
    for (const item of items) {
      if (item.type === 'source') {
        const json = Buffer.from(JSON.stringify({ type: 'source', root: item.root }));
        const hdr = Buffer.alloc(5);
        hdr[0] = 0x4C; hdr.writeUInt32BE(json.length, 1);
        yield hdr; yield json;
      } else if (item.type === 'log') {
        const json = Buffer.from(JSON.stringify({ type: 'log', entry: item.entry }));
        const hdr = Buffer.alloc(5);
        hdr[0] = 0x4C; hdr.writeUInt32BE(json.length, 1);
        yield hdr; yield json;
      } else if (item.type === 'fileWithEntry') {
        if (!item.alreadyOnServer) {
          const headerJson = Buffer.from(JSON.stringify({ hash: item.hash, size: item.size }));
          const hdr = Buffer.alloc(5);
          hdr[0] = 0x46; hdr.writeUInt32BE(headerJson.length, 1);
          yield hdr; yield headerJson;
          const reader = createReadStream(item.fn);
          const gzip = createGzip();
          reader.on('error', err => gzip.destroy(err));
          reader.pipe(gzip);
          try {
            for await (const chunk of gzip) {
              const sizeHdr = Buffer.alloc(4);
              sizeHdr.writeUInt32BE(chunk.length, 0);
              yield sizeHdr; yield chunk;
            }
          } finally {
            reader.destroy();
          }
          yield Buffer.alloc(4); // 0-length terminator
        }
        // F log entry always follows (whether or not file data was sent)
        const logJson = Buffer.from(JSON.stringify({ type: 'log', entry: item.logEntry }));
        const logHdr = Buffer.alloc(5);
        logHdr[0] = 0x4C; logHdr.writeUInt32BE(logJson.length, 1);
        yield logHdr; yield logJson;
      }
    }
  }

  async _flushBatch() {
    if (this._batchItems.length === 0) return;
    const items = this._batchItems;
    this._batchItems = [];

    const fileItems = items.filter(i => i.type === 'fileWithEntry');

    // Phase 1: one has-check round-trip for all files in this batch
    if (fileItems.length > 0) {
      const checks = fileItems.map(i => ({ hash: i.hash, size: i.size }));
      const { res, body } = await this.target.request({
        path: `/backup/batch-has/${this.setname}`,
        body: JSON.stringify(checks),
      });
      const exists = res.statusCode === 200 ? JSON.parse(body) : null;
      fileItems.forEach((item, i) => { item.alreadyOnServer = exists ? exists[i] : false; });
    }

    // Phase 2: one streaming batch POST — log entries + file data + F log entries, all in order
    let res, responseBody;
    try {
      ({ res, body: responseBody } = await this.target.request({
        path: `/backup/batch/${this.setname}`,
        body: Readable.from(this._generateBatchFrames(items)),
      }));
    } catch(err) {
      fileItems.forEach(item => { if (item.onResult) item.onResult({ variant: 0, stored: false }); });
      throw err;
    }

    if (res.statusCode !== 200) {
      const err = new Error(`batch failed: ${res.statusCode} ${res.statusMessage}`);
      fileItems.forEach(item => { if (item.onResult) item.onResult({ variant: 0, stored: false }); });
      throw err;
    }

    // uploadResults has one entry per F frame (files actually sent, not already-on-server)
    const uploadResults = JSON.parse(responseBody);
    let ri = 0;
    for (const item of items) {
      if (item.type === 'fileWithEntry' && item.onResult) {
        item.onResult(item.alreadyOnServer ? { variant: 0, stored: false } : uploadResults[ri++]);
      }
    }
  }

  async finish(body) {
    await this.flush();
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
        const file = typeof entry.path == 'string' && path.join((output || root), entry.path);
        switch(entry.type) {
          case 'SOURCE':
            root = entry.root;
            break;
          case 'D':
            await BackupInstance.restoreEntry({ entry, to: file, verbose });
            break;
          case 'F':
            try {
              const stat = await fs.stat(file);
              if (stat.size == entry.size) {
                const localHash = await BackupFileSystemV5.hashFile(file);
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
            memtrack();
            const hash = `${entry.hash}.${entry.variant}.${entry.size}`;
            let { res } = await this.target.request({
              path: `/fs/get/${hash}`,
              onbody: async (reader) => {
                await BackupInstance.restoreEntry({
                  from: reader, isCompressedStream: true,
                  entry, to: file, verbose
                });
              }
            });
            if (res.statusCode != 200) {
              console.error(`http-status ${res.statusCode} retrieving ${hash} for ${entry.path}`);
            }
            break;
        }
      }
    } else {
      console.error(res.statusCode, res.statusMessage);
    }
  }
}

module.exports = RemoteInstance;
