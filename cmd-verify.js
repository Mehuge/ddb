const { BackupTarget, BackupSet, BackupJob, BackupOptions } = require('./lib');

class Verify {
  static async exec(args) {

    // Parse backup options
    const opts = (new BackupOptions()).parse(args);

    // Configure backup from options
    const { destination, verbose } = opts;
    const target = new BackupTarget({ destination, verbose });
    await target.connect(false);

    if (!opts.set) throw new Error('missing --set-name argument');

    // Setup backup set
    const backupset = new BackupSet({ name: opts.set });

    // Create backup job
    const job = new BackupJob({ target, backupset });

    // Verify the backup
    await job.verify({
      compare: opts.compare,
      verbose: opts.verbose,
      when: opts.when || 'current',
    });
  }
};

module.exports = Verify;
