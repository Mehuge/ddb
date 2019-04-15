const { BackupTarget, BackupSource, BackupSet, BackupRestore, BackupOptions } = require('./lib');

class Restore {
	static async exec(args) {

		// Parse backup options
		const opts = (new BackupOptions({ setname: 'default', sources: [] })).parse(args);

		// Configure backup from options
    const { destination, verbose, setname, when, filter, output, force, accessKey } = opts;
		const target = new BackupTarget({ destination, verbose, accessKey });
		await target.connect();

    // login
    accessKey && await target.login();

		// Start the restore
		await target.restore({ setname, when, filter, output, force, verbose });

    // logout
    accessKey && await target.logout();

    // cleanup
    target.destroy();
	}
};

module.exports = Restore;
