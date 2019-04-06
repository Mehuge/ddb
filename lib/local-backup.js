
const fs = require('./fs');
const path = require('path');
const BackupInstance = require('./backup-instance');
const BackupLog = require('./backup-log');
const BackupFileSystem = require('./backup-filesystem');
const Filter = require('./filter');

const VERSION = 1;
class LocalBackup {

  constructor({ destination, fstype, fast }) {
    if (!destination) throw new Error("Backup destination not supplied");
    this.destination = destination;
    this.filesystem = new BackupFileSystem({ fast }),
    this.fstype = fstype || 'hash-v3';
    this.configFile = path.join(this.destination, 'config.json');
    this.filesDb = path.join(this.destination, 'files.db');
    this.backups = path.join(this.destination, 'backups');
  }

  async initConfig() {
    this.config = { version: VERSION, fstype: this.fstype };
    await this.saveConfig();
  }

  async saveConfig() {
    this.config.saved = new Date();
    await fs.writeFile(this.configFile, JSON.stringify(this.config, '  '));
  }

  async loadConfig() {
    this.config = JSON.parse(await fs.readFile(this.configFile));
  }

  async connect(create) {

    // if writing to the destination need to make sure it exists
    if (create) {
      try {
        const stats = await fs.stat(this.destination);
        if (!stats.isDirectory()) throw new Error('destination not a directory');
      } catch(e) {
        if (e.code == 'ENOENT') await fs.mkdirp(this.destination);
        else throw e;
      }

      // If directory is not initialised, initialise it
      await fs.mkdirp(this.filesDb);
      await fs.mkdirp(this.backups);

      // Create config if it doesn't exist
      try {
        await fs.access(this.configFile);
      } catch(e) {
        if (e.code == 'ENOENT') {
          this.initConfig();
        } else {
          throw e;
        }
      }
    }

    if (!this.config) {
      // load the config
      await this.loadConfig();
      if (!this.config) {
        throw new Error(`${this.destination} backup destination does not exist`);
      }
    }

    // tell the filesystem where it is
    await this.filesystem.setLocation(this.filesDb, this.config.fstype);
  }

  getConfig() {
    return this.config;
  }

  getPath() {
    return this.destination;
  }

  toString() {
    return "BackupDest: " + this.destination;
  }

  fs() {
    return this.filesystem;
  }

  async createBackupInstance() {
    this._log = new BackupLog();
    await this._log.create(this.getInstanceLogName('running'));
    return this._log;
  }

  async getLogs(setname = null, instance = null) {
    const logs = [];
    for (const log of await fs.readdir(this.backups, { withFileTypes: true })) {
      if (log.isFile() && log.name[0] != '.') {
        const ext = path.extname(log.name);
        if (!setname || setname == path.basename(log.name, ext)) {
          if (!instance || instance == ext.substr(1)) {
            logs.push(log);
          }
        }
      }
    }
    return logs;
  }

  async getAllActiveHashes() {
    const hashes = {};
    for (const log of await this.getLogs()) {
      const ext = path.extname(log.name);
      switch (ext) {
      case '.current': break;		// ignore, just a link to newest entry
      case '.running':
        throw new Error("can't when a backup is running");
        break;
      default:
        const name = path.basename(log.name, ext);
        const instance = new BackupInstance({ target: this, setname: name })
        await instance.getHashesFromInstanceLog(ext.substr(1), hashes);
        break;
      }
    }
    return hashes;
  }

  async _removeEntry(fn) {
    const l = this.filesDb.length;
    await fs.unlink(fn);
    fn = path.dirname(fn);
    do {
      try {
        await fs.rmdir(fn);
      } catch(e) {
        if (e.code == 'ENOTEMPTY') return;
        throw e;
      }
      fn = path.dirname(fn);
    } while (fn.length > l);
  }

  async _scanFs(root, hashes, callback) {
    const dir = await fs.readdir(root, { withFileTypes: true });
    const s = this.filesDb.length + 1;
    for (let i = 0; i < dir.length; i++) {
      const entry = dir[i];
      if (entry.isDirectory()) {
        await this._scanFs(path.join(root, entry.name), hashes, callback);
      } else if (entry.isFile()) {
        const key = this.filesystem.keyFromFile(root.substr(s), entry.name);
        await callback(root, entry, key);
      }
    }
  }

  async clean() {
    const hashes = await this.getAllActiveHashes();
    await this._scanFs(this.filesDb, hashes, async (root, entry, key) => {
      if (key && !(key in hashes)) {
        console.log('REMOVE ' + key);
        await this._removeEntry(path.join(root, entry.name));
      }
    });
  }

  async getStats(setname, when) {
    const instance = new BackupInstance({ target: this, setname });
    const lines = await instance.getLinesFromInstanceLog(when);
    return lines.pop().stats;
  }

  async listFiles(setname, when, filter, sources, log) {
    function LOG(s) {
      (log||console.log)(s);
    }
    const instance = new BackupInstance({ target: this, setname });
    const search = new Filter({ filters: filter.filters });
    for (const entry of await instance.getLinesFromInstanceLog(when)) {
      if (sources) {
        if (entry.type == 'SOURCE') {
          LOG(`${entry.root}`);
        }
      } else {
        switch(entry.type) {
        case 'F':
          if (!search.ignores(entry.path)) {
            LOG(`${entry.mtime} ${entry.uid||'-'}:${entry.gid||'-'} ${entry.mode} ${entry.size.padStart(10)} ${entry.path}`);
          }
          break;
        }
      }
    }
  }

  async listWhen(opts, when) {
    const { log, filter, sources, since } = opts;
    let { setname } = opts;
    function LOG(s) {
      (log||console.log)(s);
    }
    for (const index of await this.getLogs(setname, when == 'current' && when)) {
      let ext = path.extname(index.name);
      const name = index.name.substr(0, index.name.length - ext.length);
      if (name != setname) {
        LOG(`Backup Set: ${name}`)
        setname = name;
      }
      ext = ext.substr(1);
      if (when == 'current') {
        if (ext == when) {
          await this.listFiles(name, when, filter, sources, log);
          return;
        }
      } else {
        switch(ext) {
        case 'running': case 'current':
          break;
        default:
          const instance = new Date(`${BackupLog.ext2iso(ext)}`);
          if (when) {
            if (when.getTime() == instance.getTime()) {
              await this.listFiles(name, ext, filter, sources, log);
              return;
            }
          } else {
            if (!since || instance.getTime() >= since.getTime()) {
              const stats = await this.getStats(name, ext);
              LOG(`${instance.toISOString()} ${stats.files} files ${((stats.bytes*100/1024/1024)|0)/100} MB took ${stats.took/1000} seconds`);
              if (sources) {
                await this.listFiles(name, ext, filter, sources, log);
              }
            }
          }
          break;
        }
      }
    }
  }

  async list(opts) {
    let { when } = opts;
    switch (when) {
      case 'current':
      case undefined: case null:
        await this.listWhen(opts, when);
        break;
      default:
        if (when.match(/^[0-9]{8}T[0-9]{9}Z$/)) {
          when = BackupLog.ext2iso(when);
        }
        await this.listWhen(opts, new Date(when));
        break;
    }
  }

  async backup({ backupset }) {
    const target = this;
    const instance = new BackupInstance({ target, setname: backupset.setname })
    await instance.createNewInstance();
    return await backupset.backupTo(instance);
  }

  async verify({ setname, when, compare, verbose, log }) {
    const target = this;
    if (setname) {
      const instance = new BackupInstance({ target, setname })
      return await instance.verify({ setname, when, compare, verbose, log });
    }
    return await this.fsck({ verbose });
  }

  async complete({ backupset }) {
    return await backupset.complete();
  }

  async restore(opts) {
    const { setname } = opts;
    const target = this;
    const instance = new BackupInstance({ target, setname })
    return await instance.restore(opts);
  }

  async fsck({ verbose }) {
    const hashes = await this.getAllActiveHashes();
    await this._scanFs(this.filesDb, hashes, async (root, entry, key) => {
      if (key) {
        if (!(key in hashes)) {
          console.log('ORPHANED ' + key);
        } else {
          const parts = key.split('.');
          try {
            this.filesystem.verify(parts[2], parts[0], parts[1]);
            if (verbose) console.log('OK ' + key);
          } catch(e) {
            console.log('ERROR ' + key);
            console.dir(e);
          }
        }
      }
    });
  }
};

module.exports = LocalBackup;