const { BackupTarget, BackupSource, BackupSet, BackupRestore, BackupOptions } = require('./lib');

class Restore {
	static async exec(args) {

		// Parse backup options
		const opts = (new BackupOptions({
			set: 'default',
			sources: [],
		})).parse(args);

		// Configure backup from options
    const { destination, verbose } = opts;
		const target = new BackupTarget({ destination, verbose });
		await target.connect();

		// Setup backup set
		const backupset = new BackupSet({
			name: opts.set,
			sources: opts.backup && opts.sources.map
				(source => new BackupSource({
					src: source.src,
					verbose: opts.verbose,
				}))
		});

		// Create backup job
    const job = new BackupRestore({ target, backupset });
		job.restore(opts);
	}
};

module.exports = Restore;
