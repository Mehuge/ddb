const { BackupFileSystem, BackupDest, BackupSource, BackupSet, BackupRestore, BackupOptions } = require('./lib');

class Restore {
	static async exec(args) {

		// Parse backup options
		const opts = (new BackupOptions({
			set: 'default',
			sources: [],
		})).parse(args);

		// Configure backup from options
		const destination = new BackupDest({
			destination: opts.destination,
			filesystem: new BackupFileSystem({ fast: opts.fast }),
			fstype: opts.fstype,
			verbose: opts.verbose,
		});
		await destination.init(false);

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
    const job = new BackupRestore({ destination, backupset });
		job.restore(opts);
	}
};

module.exports = Restore;
