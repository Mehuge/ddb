const { BackupTarget, BackupOptions } = require('./lib');

class Rm {
  static async exec(args) {

    // Parse backup options
    const opts = (new BackupOptions({ when: 'current' })).parse(args);

    // Configure backup from options
    const { fast, fstype, verbose, destination, setname, when, accessKey } = opts;
    const target = new BackupTarget({ destination, fast, fstype, verbose , accessKey});
    await target.connect(false);

    // login
    accessKey && await target.login();

    // Rm
    await target.rm({ setname, when }, opts.args);

    // logout
    accessKey && await target.logout();

    // cleanup
    target.destroy();
  }
};

module.exports = Rm;
