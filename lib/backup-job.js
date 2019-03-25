
class BackupJob {
  constructor({ destination, backupset }) {
    if (!destination) throw new Error("destination missing");
    this.destination = destination;
    this.backupset = backupset;
  }
  async backup() {
    await this.backupset.backupTo(this.destination);
  }
  async verify(opts) {
    await this.backupset.verify(this.destination, opts);
  }
  async complete() {
    await this.backupset.complete();
  }
}

module.exports = BackupJob;
