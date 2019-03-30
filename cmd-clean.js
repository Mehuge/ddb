const { BackupFileSystem, BackupDest, BackupSource, BackupSet, BackupJob, BackupOptions } = require('./lib');

class Clean {
  static async exec(args) {

    // Parse backup options
    const opts = (new BackupOptions()).parse(args);

    // Configure backup from options
    const destination = new BackupDest({
      destination: opts.destination,
      filesystem: new BackupFileSystem({ fast: opts.fast }),
      fstype: opts.fstype,
      verbose: opts.verbose,
    });
    await destination.init(opts.backup);

    // Clean backup destination
    await destination.clean(opts);

  }
};

module.exports = Clean;
