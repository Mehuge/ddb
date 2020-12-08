
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

  async verify({ when, log, verbose, compare, compareWith }) {
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
          const compareWithFile = compare ? path.join(compareWith || root, entry.path) : null;
          await bfs.verify(entry.size, entry.hash, entry.variant, compareWithFile);
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

  async restore({ when, filter, sources, output, verbose }, remoteRestore) {
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
        case 'HEADER': case 'STATUS':
          break;
        case 'SOURCE':
          root = entry.root;
          if (remoteRestore) await remoteRestore({ type: 'SOURCE', root });
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
            if (remoteRestore) {
              await remoteRestore(entry);
            } else {
              let doRestore = true;
              const file = path.join((output || root), entry.path);
              switch(entry.type) {
              case 'F':
                try {
                  const stat = await fs.stat(file);   // will fail with ENOENT if missing
                  const localHash = await this.target.fs().hashFile(file);
                  if (localHash == entry.hash && stat.size == entry.size) {
                    await fs.chstat(file, Object.assign({}, entry, {
                      mode: parseInt(entry.mode,8),
                      mtime: new Date(entry.mtime),
                      atime: new Date()
                    }), stat);
                    console.log(`${file} not changed`);
                    doRestore = false;
                  }
                } catch(e) {
				  if (e.code == 'EPERM') {
					console.error(e.message);
					doRestore = false;
				  } else {
					  if (e.code != 'ENOENT') throw e;
				  }
                }
                break;
              }
              doRestore && await BackupInstance.restoreEntry({ from, entry, to: file, verbose });
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
        if (verbose) console.log(to);
        await fs.mkdirp(to, parseInt(entry.mode,8)|0o100);   // give at least excute to creator on directories
        break;
      case 'F':
        // re-create file
        if (verbose) console.log(to);
        if (from instanceof BackupFileSystem) {
          await from.restore(entry.size, entry.hash, entry.variant, to);
        } else if (from instanceof Readable && from.readable || typeof from == 'string') {
          // restore from stream or file (latter not actually used anywhere)
          if (isCompressedStream) {
            await fs.unzip(from, to);
          } else {
            await fs.copy(from, to);
          }
        } else {
          throw new Error('restoreEntry from is not a supported type');
        }
		try {
			await fs.chstat(to, Object.assign({}, entry, {
			  mode: parseInt(entry.mode,8),
			  mtime: new Date(entry.mtime),
			  atime: new Date(),
			}));
		} catch(e) {
			if (e.code != 'EPERM') throw e;
			console.error(e.message);
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
