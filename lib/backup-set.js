
const BackupInstance = require('./backup-instance');

class BackupSet {
  constructor({ setname, sources }) {
    if (!setname) throw new Error("backup set must have a name");
    this.setname = setname;
    this.sources = sources || [];
    this.started = null;
    this.stats = {
      skipped: 0,
      folders: 0,
      files: 0,
      bytes: 0,
      backedUp: {
        files: 0,
        bytes: 0,
      },
    };
  }

  addSource(source) {
    this.sources.push(source);
  }

  getSources() {
    return this.sources;
  }

  async backupTo(instance) {
    this.instance = instance;
    debugger;
    this.lastBackup = await instance.log().getLastBackup();
    this.started = new Date();
    for (const source of this.sources) {
      await source.backupTo(instance, this.stats, this.lastBackup);
    }
    this.stats.took = Date.now() - this.started.valueOf();
    await instance.log().finish('OK ' + JSON.stringify(this.stats));
  }

  async complete() {
    await this.instance.complete(this.started);
    this.displayStats();
  }

  displayStats() {
    const { skipped, folders, files, bytes, backedUp, took } = this.stats
    console.log(`Backup ${this.setname} complete. Took ${took/1000} seconds.`);
    console.log(`Processed: ${files} files (${((bytes+1023)/1024/1024)|0} MB) ${folders} folders. Skipped ${skipped}.`);
    console.log(`Backed up: ${backedUp.files} files (${((backedUp.bytes+1023)/1024/1024)|0} MB)`);
  }

  getStats() {
    return this.stats;
  }
};

module.exports = BackupSet;
