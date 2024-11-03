
const fs = require('./fs');
const path = require('path');
const BackupInstance = require('./backup-instance');
const BackupLog = require('./backup-log');
const BackupFileSystem = require('./backup-filesystem');
const Filter = require('./filter');
const { memtrack } = require('./debug');

const VERSION = 1;
class LocalBackup {

  constructor({ destination, fstype, fast }) {
    if (!destination) throw new Error("Backup destination not supplied");
    this.destination = destination;
    this.filesystem = new BackupFileSystem({ fast }),
    this.fstype = fstype;
    this.configFile = path.join(this.destination, 'config.json');
    this.filesDb = path.join(this.destination, 'files.db');
    this.backups = path.join(this.destination, 'backups');
  }

  async initConfig() {
    this.config = { version: VERSION, fstype: this.fstype || 'hash-v5' };
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

    if (this.fstype && this.config.fstype != this.fstype) {
      throw new Error(
        `${this.destination} is fstype ${this.config.fstype} which does not match`
        + ` the requested fstype ${this.fstype}.\n`
        + `See --fs-type option.\n`
        + `Note: Backup server destinations must be hash-v4.`);
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
  
  async ora(options) {
    let ora;
    try {
      ora = (await import('ora')).default;
    } catch(e) {
      // ora not available, return a stub
      ora = function({ text, discardStdin }) {
        const ora = {
          text,
          start: () => ora,
          stop: () => ora,
          render: () => ora,
        };
        return ora;
      };
    }
    return ora(options);
  }

  async getLogs(setname = null, instance = null, userid = null, logs = []) {
    const dir = path.join(this.backups, userid || '');
    for (const log of await fs.readdir(dir, { withFileTypes: true })) {
      if (log.isFile() && log.name[0] != '.') {
        const ext = path.extname(log.name);
        if (!setname || setname == path.basename(log.name, ext)) {
          if (!instance || instance == ext.substr(1)) {
            log.userid = userid;
            logs.push(log);
          }
        }
      } else if (!userid && log.isDirectory()) {
        // if enumerating all logs in all user directories, then enumerate logs in this users
        // directory.
        await this.getLogs(setname, instance, log.name, logs);
      }
    }
    return logs;
  }

  async getAllActiveHashes(spinner) {
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
        const instance = new BackupInstance({ target: this, setname: name, userid: log.userid })
        await instance.getHashesFromInstanceLog(ext.substr(1), hashes);
        spinner && spinner.render()
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

  async _scanFs(root, callback, baseLen = -1) {
    const dir = await fs.readdir(root, { withFileTypes: true });
    if (baseLen == -1) baseLen = root.length + 1;
    for (let i = 0; i < dir.length; i++) {
      const entry = dir[i];
      if (entry.isDirectory()) {
        await this._scanFs(path.join(root, entry.name), callback, baseLen);
      } else if (entry.isFile()) {
        const key = this.filesystem.keyFromFile(root.substr(baseLen), entry.name);
        await callback(root, entry, key);
      }
    }
  }

  async clean() {
    const hashes = await this.getAllActiveHashes();
    const stats = { cleaned: 0 };
    await this._scanFs(this.filesDb, async (root, entry, key) => {
      memtrack();
      if (key && !(key in hashes)) {
        console.log('REMOVE ' + key);
        stats.cleaned ++;
        await this._removeEntry(path.join(root, entry.name));
      }
    });
    console.log('Cleaned', stats.cleaned, 'orphaned hashes');
  }

  async getStats(setname, userid, when) {
    const instance = new BackupInstance({ target: this, userid, setname });
    const lines = await instance.getLinesFromInstanceLog(when);
    return lines.pop().stats;
  }

  async getFiles(setname, when, userid) {
    const instance = new BackupInstance({ target: this, setname, userid });
    return await instance.getLinesFromInstanceLog(when);
  }

  async listFiles(setname, when, userid, filter, sources, log) {
    function LOG(s) {
      (log||console.log)(s);
    }
    const instance = new BackupInstance({ target: this, setname, userid });
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
    let { setname, userid } = opts;
    function LOG(s) {
      (log||console.log)(s);
    }
    for await (const index of await this.getLogs(setname, when == 'current' && when, userid)) {
      let ext = path.extname(index.name);
      const name = index.name.substr(0, index.name.length - ext.length);
      if (name != setname) {
        LOG(`${index.userid ? `User ID: ${index.userid} ` : ''}Backup Set: ${name}`);
        setname = name;
      }
      ext = ext.substr(1);
      if (when == 'current') {
        if (ext == when) {
          await this.listFiles(name, when, userid, filter, sources, log);
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
              await this.listFiles(name, ext, index.userid, filter, sources, log);
              return;
            }
          } else {
            if (!since || instance.getTime() >= since.getTime()) {
              const stats = await this.getStats(name, index.userid, ext);
              LOG(`${instance.toISOString()} ${stats.files} files ${((stats.bytes*100/1024/1024)|0)/100} MB took ${stats.took/1000} seconds`);
              if (sources) {
                await this.listFiles(name, ext, index.userid, filter, sources, log);
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

  async backup({ backupset, comment }) {
    const target = this;
    const instance = new BackupInstance({ target, setname: backupset.setname })
    await instance.createNewInstance({ comment });
    return await backupset.backupTo(instance);
  }

  async cat({ setname, when }, args) {
    const instance = new BackupInstance({ target: this, setname });
    instance.cat({ when }, args);
  }

  async verify({ setname, when, userid, compare, compareWith, verbose, log }) {
    const target = this;
    if (setname) {
      const instance = new BackupInstance({ target, setname, userid })
      return await instance.verify({ setname, when, compare, compareWith, verbose, log });
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
    const stats = {
      total: 0,
      verified: 0,
      damaged: 0,
      orphaned: 0,
      missing: 0,
    }
    memtrack();
    const spinner = await this.ora({ text: 'loading hashes ...', discardStdin: true });
    spinner.start();
    let hashes;
    try {
      hashes = await this.getAllActiveHashes(spinner);
    } catch(e) {
      spinner.stop();
      throw e;
    }
    spinner.text = 'scanning fs...';
    await this._scanFs(this.filesDb, async (root, entry, key) => {
      stats.total ++;
      if (key) {
        spinner.render();
        if (!(key in hashes)) {
          spinner.stop();
          console.log('ORPHANED ' + key);
          stats.orphaned ++;
          spinner.start();
        } else {
          const parts = key.split('.');
          try {
            await this.filesystem.verify(parts[2], parts[0], parts[1]);
            memtrack();
            stats.verified ++;
            if (verbose) {
              spinner.stop();
              console.log('OK ' + key);
              spinner.start();
            }
            hashes[key].seen = true;
          } catch(e) {
            stats.damaged ++;
            spinner.stop();
            console.log('ERROR ' + key);
            console.dir(e);
            spinner.start();
          }
        }
      }
    });
    spinner.stop();
    Object.keys(hashes).filter(key => !hashes[key].seen).forEach(key => {
      console.log('MISSING ' + key);
      stats.missing ++;
    });
    console.log(
      'Total', stats.total,
      'Verified', stats.verified,
      'Orphaned', stats.orphaned,
      'Damaged', stats.damaged,
      'Missing', stats.missing
    );
    memtrack();
  }

  async rm({ setname, when, userid, verbose, dryRun }, args) {
    const spinner = await this.ora({ text: 'get logs ...', discardStdin: true });
    spinner.start();
    const search = new Filter({ filters: [
      "-**",
      ...args.map(arg => `+${arg}$`),
      ...args.map(arg => `+${arg}/`)
    ]});
    if (when == 'all') when = null;
    const logs = await this.getLogs(setname, when, userid);
    for await (const log of logs) {
      spinner.text = `scanning ${log.name} ...`;
      const ext = path.extname(log.name);
      const when = ext.substr(1);
      const setname = path.basename(log.name, ext);
      const { userid } = log;
      const entries = await this.getFiles(setname, when, userid);
      const remove = {};
      for (let entry of entries) {
        switch(entry.type) {
        case 'F': case 'D':
          if (!search.ignores(entry.path)) {
            if (verbose || dryRun) {
              spinner.stop();
              console.log(`REMOVE ${setname}.${when} ${entry.hash}.${entry.variant}.${entry.size} ${entry.path}`);
              spinner.start();
            }
            remove[entry.path] = true;
          }
          break;
        }
      }

      if (dryRun) {
        spinner.stop();
        console.log('DRY RUN: would remove', Object.keys(remove).length, 'entries from', log.name);
        continue;
      }

      // If nothing to remove, skip
      if (Object.keys(remove).length == 0) continue;

      spinner.text = `updating ${log.name} ...`;
      const filtered = entries.filter(entry => !((entry.type == 'F' || entry.type == 'D') && remove[entry.path]));
      const logFile = new BackupLog({ root: this.getPath(), userid, setname });
      const newLogFile = "updated-" + when;
      await logFile.create(newLogFile);
      spinner.text = `writing ${log.name} ...`;
      let fileCount = 0;
      let bytes = 0;
      let i = 0;
      for await (const entry of filtered) {
        spinner.text = `saving ${parseInt(i++ / filtered.length * 100)}%`;
        switch(entry.type) {
          case 'HEADER':
            break;
          case 'SOURCE':
            await logFile.writeSourceEntry(entry);
            break;
          case 'STATUS':
            entry.stats.files = fileCount;
            entry.stats.bytes = bytes;
            await logFile.finish(entry.status + " " + JSON.stringify(entry.stats));
            break;
          case 'F':
            fileCount ++;
            bytes += parseInt(entry.size);
            /* NOBREAK */
          default:
            await logFile.writeEntry(entry);
            break;
        }
      }
      // Move updated log to original log name
      spinner.text = `saving ${log.name}`;
      const originalLogName = logFile.getLogName(when);
      const newLogName = logFile.getLogName(newLogFile);
      const stat = await fs.stat(originalLogName);   // will fail with ENOENT if missing
      await fs.chstat(newLogName, stat);
      await fs.move(originalLogName, originalLogName + ".old");
      await fs.move(newLogName, originalLogName);
      await fs.unlink(originalLogName + ".old");
    }
    spinner.stop();
  }

  destroy() {
  }
};

module.exports = LocalBackup;
