const { BackupTarget, BackupOptions } = require('./lib');

class Verify {
  static async exec(args) {

    // Parse backup options
    const opts = (new BackupOptions()).parse(args);

    const { destination, verbose, setname, compare, when, accessKey, userid, compareWith } = opts;

    // Configure backup from options
    const target = new BackupTarget({ destination, verbose, accessKey });
    await target.connect(false);

    // login
    accessKey && await target.login();

    // Verify the backup
    await target.verify({ setname, compare, verbose, userid, when: when || 'current', compareWith });

    // logout
    accessKey && await target.logout();

    // cleanup
    target.destroy();
  }
};

module.exports = Verify;
