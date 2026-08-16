const { BackupTarget, BackupSource, BackupSet, BackupOptions } = require('./lib');
const { memstats } = require('./lib/debug');

class Backup {
  static async exec(args) {

    // Parse backup options
    const opts = (new BackupOptions({
      setname: 'default',
      sources: [],
      backup: true,
    })).parse(args);

    // Configure backup from options
    const { setname, sources, backup, verify, compare, fast, fstype, verbose, terse, destination, accessKey, checkHash } = opts;
    const target = new BackupTarget({ destination, fast, fstype, verbose, accessKey });
    await target.connect(opts.backup);

    // login
    accessKey && await target.login();

    // Clean backup destination
    if (opts.clean) {
      await target.clean();
    }

    // Setup backup set
    const backupset = new BackupSet({
      setname,
      verbose,
      sources: backup && sources.map
        (source => new BackupSource({
          src: source.src,
          filters: source.filters,
          subdirs: source.subdirs,
          verbose,
          terse,
          checkHash
        })),
    });

    // Run the backup job
    if (backup) await target.backup({ backupset, ...opts });

    // If asked to verify, verify
    if (verify) {
      await target.verify({
        compare, verbose, setname,
        when: opts.backup ? 'running' : (opts.when || 'current')
      });
    }

    // Finally, if backing up, complete the job (bake it)
    if (opts.backup) await target.complete({ backupset, ...opts });

    // logout
    accessKey && await target.logout();

    // cleanup
    target.destroy();

    // dump memory stats
    if (verbose) memstats();
  }
};

module.exports = Backup;
