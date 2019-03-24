
class BackupRestore {
  constructor({ destination, backupset }) {
    if (!destination) throw new Error("destination missing");
    this.destination = destination;
    this.backupset = backupset;
  }
  async restore() {
    console.dir(this.destination);
    console.dir(this.backupset);
  }
}

module.exports = BackupRestore;
