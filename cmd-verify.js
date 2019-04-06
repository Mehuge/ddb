const { BackupTarget, BackupOptions } = require('./lib');

class Verify {
  static async exec(args) {

    // Parse backup options
    const opts = (new BackupOptions()).parse(args);

    const { destination, verbose, setname, compare, when } = opts;

    // Configure backup from options
    const target = new BackupTarget({ destination, verbose });
    await target.connect(false);

    // Verify the backup
    await target.verify({ setname, compare, verbose, when: when || 'current' });
  }
};

module.exports = Verify;
