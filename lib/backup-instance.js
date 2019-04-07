
const BackupLog = require('./backup-log');
const BackupFileSystem = require('./backup-filesystem');
const path = require('path');
const fs = require('./fs');
const Readable = require('stream').Readable;
const Filter = require('./filter');

/*
 * A backup instance represents a single run of a backup and is associated with the instance
 * log file in ./backups/ in the backup target.
 */

class BackupInstance {
  constructor({ target, setname }) {
    this.target = target;
    this.setname = setname;   // the backup set name
  }

  async createNewInstance() {
    this._log = new BackupLog({ root: this.target.getPath(), setname: this.setname });
    await this._log.create('running');
  }

  async complete(ts) {
    await this._log.complete(ts);
  }

  log() {
    if (!this._log) {
      this._log = new BackupLog({ root: this.target.getPath(), setname: this.setname });
    }
    return this._log;
  }

  async verify({ when, log, verbose, compare }) {
    const bfs = this.target.fs();
    const lines = await this.log().getLinesFromLog(when);
    function LOG(s) {
      (log || console.log)(s);
    }
    let root;
    for (let i = 0; i < lines.length; i++) {
      const entry = lines[i];
      switch (entry.type) {
      case 'SOURCE':
        if (verbose) LOG(`SOURCE ${entry.root}`);
        root = entry.root;
        break;
      case 'F':
        try {
          const compareWith = compare ? path.join(root, entry.path) : null;
          await bfs.verify(entry.size, entry.hash, entry.variant, compareWith);
          if (verbose) LOG(`OK ${entry.hash} ${entry.variant} ${entry.size} ${entry.path}`);
        } catch(e) {
          if (e.code == 'ENOCOMPARE') {
            LOG(`CHANGED ${entry.hash} ${entry.variant} ${entry.size} ${entry.path}`);
          } else if (e.code == 'ENOENT') {
            LOG(`DELETED ${entry.hash} ${entry.variant} ${entry.size} ${entry.path}`);
          } else {
            LOG(`ERROR ${entry.hash} ${entry.variant} ${entry.size} ${entry.path}`);
            LOG(e);
          }
        }
        break;
      }
    }
  }

  async getLinesFromInstanceLog(when) {
    return await this.log().getLinesFromLog(when);
  }

  async getHashesFromInstanceLog(when, hashes) {
    return await this.log().getHashesFromInstanceLog(when, hashes);
  }

  async restore({ when, filter, sources, output, verbose }, performRestore) {
    // restore requires that we:-
    // specify a backup set
    // specify an instance (support for woolyer slection to come later --after <date> sort of thing)
    // specify a source path (or not, to mean all)
    const lines = await this.log().getLinesFromLog(when);
    const search = new Filter({ filters: filter.filters });
    const from = this.target.fs();
    let root;
    for (let i = 0; i < lines.length; i++) {
      const entry = lines[i];
      switch(entry.type) {
        case 'HEADER':
          break;
        case 'SOURCE':
          root = entry.root;
          if (performRestore) await performRestore({ type: 'SOURCE', root });
          if (sources) {
            console.log('TODO: what are we supposed to do here?');
            console.dir(sources);
            // find this source in sources, and create filter if found
            // TODO:
            // sourceFilter = new Filter({ excludes: this.exclude, includes: this.include });
          }
          break;
        default:
          if (!root) throw new Error('missing root (corrupt instance?) use --output to override');
          if (!search.ignores(entry.path)) {
            if (performRestore) {
              await performRestore(entry);
            } else {
              await BackupInstance.restoreEntry({ from, entry, to: (output || root), verbose });
            }
          }
          break;
      }
    }
  }

  static async restoreEntry({ from, entry, to, verbose, isCompressedStream }) {
    switch(entry.type) {
      case 'D':
        // re-create directory
        const toDir = path.join(to, entry.path);
        if (verbose) console.log(toDir);
        await fs.mkdirp(toDir, parseInt(entry.mode,8));
        break;
      case 'F':
        // re-create file
        const toFile = path.join(to, entry.path);
        if (verbose) console.log(toFile);
        if (from instanceof BackupFileSystem) {
          await from.restore(entry.size, entry.hash, entry.variant, toFile);
        } else if (from instanceof Readable && from.readable || typeof from == 'string') {
          // restore from stream or file (latter not actually used anywhere)
          if (isCompressedStream) {
            await fs.unzip(from, toFile);
          } else {
            await fs.copy(from, toFile);
          }
        } else {
          throw new Error('restoreEntry from is not a supported type');
        }
        await fs.chmod(toFile, parseInt(entry.mode,8));
        if (entry.uid != '') {
          await fs.chown(toFile, entry.uid, entry.gid);
        }
        break;
    }
  }

  async put(file, size, hash) {
    const bfs = this.target.fs();
    return await bfs.put(file, size, hash);
  }
}

module.exports = BackupInstance;
