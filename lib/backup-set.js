
const BackupInstance = require('./backup-instance');

class BackupSet {
  constructor({ name, sources }) {
    if (!name) throw new Error("backup set must have a name");
    this.name = name;
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

  async backupTo(destination) {
    this.instance = new BackupInstance({ destination, name: this.name });
    await this.instance.createNewInstance();
    this.started = new Date();
    for (const source of this.sources) {
      await source.backupTo(destination, this.instance, this.stats);
    }
    this.finish();
  }

  async finish() {
    this.stats.took = Date.now() - this.started.valueOf();
    await this.instance.log().finish('OK ' + JSON.stringify(this.stats));
  }

  async complete() {
    await this.instance.complete(this.started);
    this.displayStats();
  }

  displayStats() {
    const { skipped, folders, files, bytes, backedUp, took } = this.stats
    console.log(`Backup ${this.name} complete. Took ${took/1000} seconds.`);
    console.log(`Processed: ${files} files (${((bytes+1023)/1024/1024)|0} MB) ${folders} folders. Skipped ${skipped}.`);
    console.log(`Backed up: ${backedUp.files} files (${((backedUp.bytes+1023)/1024/1024)|0} MB)`);
  }

  getStats() {
    return this.stats;
  }

  async verify(opts = {}) {
    this.instance.verify(opts);
  }
};

module.exports = BackupSet;
