
class BackupRestore {
  constructor({ destination, backupset }) {
    if (!destination) throw new Error("destination missing");
    this.destination = destination;
    this.backupset = backupset;
  }
  async restore(opts) {
    if (!this.backupset) {
      throw new Error('Backup set is missing');
    }
    await this.backupset.restoreFrom(this.destination, opts);
  }
}

module.exports = BackupRestore;
