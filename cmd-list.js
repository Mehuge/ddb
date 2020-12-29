const { BackupTarget, BackupOptions } = require('./lib');

class List {
  static async exec(args) {

    // Parse backup options
    const opts = (new BackupOptions()).parse(args);

    // Configure backup from options
    const { fast, fstype, verbose, destination, filter, setname, when, accessKey, userid } = opts;
    const target = new BackupTarget({ destination, fast, fstype, verbose , accessKey});
    await target.connect(false);

    // login
    accessKey && await target.login();

    // List
    await target.list({ setname, when, filter, userid });

    // logout
    accessKey && await target.logout();

    // cleanup
    target.destroy();
  }
};

module.exports = List;
