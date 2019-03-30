const { BackupFileSystem, BackupDest, BackupSet, BackupJob, BackupOptions, BackupInstance } = require('./lib');

class Verify {
  static async exec(args) {

    // Parse backup options
    const opts = (new BackupOptions()).parse(args);

    // Configure backup from options
    const destination = new BackupDest({
      destination: opts.destination,
      filesystem: new BackupFileSystem({ fast: opts.fast }),
      verbose: opts.verbose,
    });
    await destination.init(false);

    if (!opts.set) throw new Error('missing --set-name argument');

    // Setup backup set
    const backupset = new BackupSet({ name: opts.set });

    // Create backup job
    const job = new BackupJob({ destination, backupset });

    // Verify the backup
    await job.verify({
      compare: opts.compare,
      verbose: opts.verbose,
      when: opts.when || 'current',
    });
  }
};

module.exports = Verify;
