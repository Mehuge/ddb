const { BackupTarget, BackupSource, BackupSet, BackupRestore, BackupOptions } = require('./lib');

class Restore {
	static async exec(args) {

		// Parse backup options
		const opts = (new BackupOptions({ setname: 'default', sources: [] })).parse(args);

		// Configure backup from options
    const { destination, verbose, setname, when, filter, output, force } = opts;
		const target = new BackupTarget({ destination, verbose });
		await target.connect();

		// Start the restore
		target.restore({ setname, when, filter, output, force, verbose });
	}
};

module.exports = Restore;
