const { BackupTarget, BackupSource, BackupSet, BackupJob, BackupOptions } = require('./lib');

class Backup {
  static async exec(args) {

    // Parse backup options
    const opts = (new BackupOptions({
      set: 'default',
      sources: [],
      backup: true,
    })).parse(args);

    // Configure backup from options
    const { fast, fstype, verbose, destination } = opts;
    const target = new BackupTarget({ destination, fast, fstype, verbose });
    await target.connect(opts.backup);

    // Clean backup destination
    if (opts.clean) {
      await target.clean();
    }

    // Setup backup set
    const backupset = new BackupSet({
      name: opts.set,
      sources: opts.backup && opts.sources.map
        (source => new BackupSource({
          src: source.src,
          filters: source.filters,
          subdirs: source.subdirs,
          verbose: opts.verbose,
        }))
    });

    // Create backup job
    const job = new BackupJob({ target, backupset });

    // Run the backup job
    if (opts.backup) await job.backup();

    // If asked to verify, verify
    if (opts.verify) {
      await job.verify({
        compare: opts.compare,
        verbose: opts.verbose,
        when: opts.backup ? 'running' : (opts.when || 'current')
      });
    }

    // Finally, if backing up, complete the job (bake it)
    if (opts.backup) await job.complete();
  }
};

module.exports = Backup;
