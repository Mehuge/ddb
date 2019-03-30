
class BackupJob {
  constructor({ target, backupset }) {
    if (!target) throw new Error("target missing");
    this.target = target;
    this.backupset = backupset;
  }
  async backup() {
    await this.backupset.backupTo(this.target);
  }
  async verify(opts) {
    await this.backupset.verify(this.target, opts);
  }
  async complete() {
    await this.backupset.complete();
  }
}

module.exports = BackupJob;
