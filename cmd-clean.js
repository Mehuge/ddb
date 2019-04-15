const { BackupTarget, BackupOptions } = require('./lib');

class Clean {
  static async exec(args) {

    // Parse backup options
    const opts = (new BackupOptions()).parse(args);

    // Configure backup from options
    const { destination, verbose, accessKey } = opts;
    const target = new BackupTarget({ destination, verbose, accessKey });
    await target.connect();

    // login
    accessKey && await target.login();

    // Clean backup destination
    await target.clean(opts);

    // logout
    accessKey && await target.logout();

    // cleanup
    target.destroy();
  }
};

module.exports = Clean;
