
const BackupLog = require('./backup-log');
const path = require('path');
const fs = require('./fs');
const Filter = require('./filter');

/*
 * A backup instance represents a single run of a backup and is associated with the instance
 * log file in ./backups/ in the backup destination.
 */

class BackupInstance {
  constructor({ destination, name }) {
    this.destination = destination;
    this.name = name;   // the backup set name
  }

  time2when(when = 'current') {
    switch(when) {
      case 'current': case 'running': return when;
    }
    return (when.toISOString ? when.toISOString() : when).replace(/[\-:\.]/g,'');
  }

  getInstanceLogName(when) {
    return path.join(this.destination.getPath(), 'backups', `${this.name}.${when}`);
  }

  async createNewInstance() {
    this._log = new BackupLog();
    await this._log.create(this.getInstanceLogName('running'));
    return this._log;
  }

  log() {
    return this._log;
  }

  async complete(ts = new Date()) {
    console.log('start complete');
    const from = this.getInstanceLogName('running');
    this.when = this.time2when(ts);
    const to = this.getInstanceLogName(this.when);
    const current = this.getInstanceLogName('current');
    await fs.move(from, to)
    try {
      await fs.access(current);
      await fs.unlink(current);
    } catch(e) {
      if (e.code != 'ENOENT') throw e;
    }
    await fs.link(to, current);
    console.log('done complete');
  }

  async verify(opts) {
    const fs = this.destination.fs();
    const when = this.time2when(opts.when);
    const lines = await BackupLog.getLinesFromLog(this.getInstanceLogName(when));
    let root;
    for (let i = 0; i < lines.length; i++) {
      const entry = lines[i];
      switch (entry.type) {
      case 'SOURCE':
        opts.verbose && console.log(`SOURCE ${entry.root}`);
        root = entry.root;
        break;
      case 'F':
        try {
          const compareWith = opts.compare ? path.join(root, entry.path) : null;
          await fs.verify(entry.size, entry.hash, entry.variant, compareWith);
          opts.verbose && console.log(`OK ${entry.hash} ${entry.variant} ${entry.size} ${entry.path}`);
        } catch(e) {
          if (e.code == 'ENOCOMPARE') {
            console.log(`CHANGED ${entry.hash} ${entry.variant} ${entry.size} ${entry.path}`);
          } else if (e.code == 'ENOENT') {
            console.log(`DELETED ${entry.hash} ${entry.variant} ${entry.size} ${entry.path}`);
          } else {
            console.log(`ERROR ${entry.hash} ${entry.variant} ${entry.size} ${entry.path}`);
            console.log(e);
          }
        }
        break;
      }
    }
  }

  async getLinesFromInstanceLog(when) {
    return await BackupLog.getLinesFromLog(this.getInstanceLogName(when));
  }

  async getHashesFromInstanceLog(when, hashes) {
    return new Promise((resolve, reject) => {
      const readline = fs.readline(this.getInstanceLogName(when));
      readline.on('line', line => {
        const entry = BackupLog.parse(line);
        if (entry.type == 'F') {
          hashes[`${entry.hash}.${entry.variant}.${entry.size}`] = 1;
        }
      });
      readline.on('close', resolve);
    });
  }

  async restore(opts) {
    // restore requires that we:-
    // specify a backup set
    // specify an instance (support for woolyer slection to come later --after <date> sort of thing)
    // specify a source path (or not, to mean all)
    // specify an output path (which must be empty, or --force'd)
    if (!opts.output && !opts.force) {
      throw new Error('cowardly refusing to restore backup over source, use either --output or --force');
    }
    const bfs = this.destination.fs();
    const when = this.time2when(opts.when);
    const lines = await BackupLog.getLinesFromLog(this.getInstanceLogName(when));
    const filter = new Filter({ excludes: opts.filter.excludes, includes: opts.filter.includes });
    let root;
    for (let i = 0; i < lines.length; i++) {
      const entry = lines[i];
      switch(entry.type) {
        case 'HEADER':
          break;
        case 'SOURCE':
          root = entry.root;
          if (opts.sources) {
            // find this source in sources, and create filter if found
            // TODO:
            // sourceFilter = new Filter({ excludes: this.exclude, includes: this.include });
          }
          break;
        default:
          if (!root) throw new Error('missing root (corrupt instance?) use --output to override');
          if (!filter || !filter.ignores(entry.path)) {
            switch(entry.type) {
              case 'D':
                // re-create directory
                const toDir = path.join((opts.output || root), entry.path);
                if (opts.verbose) console.log(toDir);
                await fs.mkdirp(toDir, parseInt(entry.mode,8));
                break;
              case 'F':
                // re-create file
                const toFile = path.join((opts.output || root), entry.path);
                if (opts.verbose) console.log(toFile);
                await bfs.restore(entry.size, entry.hash, entry.variant, toFile);
                await fs.chmod(toFile, parseInt(entry.mode,8));
                if (entry.uid != '') {
                  await fs.chown(file, entry.uid, entry.gid);
                }
                break;
            }
          }
          break;
      }
    }
  }
}

module.exports = BackupInstance;
