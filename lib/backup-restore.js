
class BackupRestore {
  constructor({ target, backupset }) {
    if (!target) throw new Error("target missing");
    this.target = target;
    this.backupset = backupset;
  }
  async restore(opts) {
    if (!this.backupset) {
      throw new Error('Backup set is missing');
    }
    await this.backupset.restoreFrom(this.target, opts);
  }
}

module.exports = BackupRestore;
