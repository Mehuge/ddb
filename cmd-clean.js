const { BackupTarget, BackupOptions } = require('./lib/backup');

class Clean {
  static async exec(args) {

    // Parse backup options
    const opts = (new BackupOptions()).parse(args);

    // Configure backup from options
    const { destination, verbose } = opts;
    const target = new BackupTarget({ destination, verbose });
    await target.connect();

    // Clean backup destination
    await target.clean(opts);

  }
};

module.exports = Clean;
