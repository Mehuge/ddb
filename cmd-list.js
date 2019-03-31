const { BackupTarget, BackupOptions } = require('./lib');

class List {
  static async exec(args) {

    // Parse backup options
    const opts = (new BackupOptions()).parse(args);

    // Configure backup from options
    const { fast, fstype, verbose, destination, filter, setname, when } = opts;
    const target = new BackupTarget({ destination, fast, fstype, verbose });
    await target.connect(false);

    // List
    target.list({ setname, when, filter });
  }
};

module.exports = List;
