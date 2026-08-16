const { BackupTarget, BackupOptions } = require('./lib');

class Cat {
  static async exec(args) {

    // Parse backup options
    const opts = (new BackupOptions()).parse(args);

    // Configure backup from options
    const { fast, fstype, verbose, destination, setname, when, accessKey } = opts;
    const target = new BackupTarget({ destination, fast, fstype, verbose , accessKey});
    await target.connect(false);

    // login
    accessKey && await target.login();

    // Cat
    await target.cat({ setname, when }, opts.args);

    // logout
    accessKey && await target.logout();

    // cleanup
    target.destroy();
  }
};

module.exports = Cat;
