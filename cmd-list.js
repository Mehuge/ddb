const { BackupFileSystem, BackupTarget, BackupSource, BackupSet, BackupList, BackupOptions } = require('./lib');

class List {
  static async exec(args) {

    // Parse backup options
    const opts = (new BackupOptions()).parse(args);

    // Configure backup from options
    const { fast, fstype, verbose, destination } = opts;
    const target = new BackupTarget({ destination, fast, fstype, verbose });
    await target.connect(false);

    // Create backup job
    const job = new BackupList({ target });
    job.list(opts);
  }
};

module.exports = List;
