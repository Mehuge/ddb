
const BackupInstance = require('./backup-instance');
const RemoteInstance = require('./remote-instance');

class BackupInstanceProxy {
  constructor({ target, name }) {
    this.target = target;
    this.name = name;
    this.instance = target.isRemote()
      ? new RemoteInstance({ target, name })
      : new BackupInstance({ target, name });
  }

  async createNewInstance() {
    await this.instance.createNewInstance();
  }

  async complete(ts = new Date()) {
    await this.instance.complete(ts);
  }

  async verify(opts) {
    await this.instance.verify(opts);
  }

  async getLinesFromInstanceLog(when) {
    return await this.instance.getLinesFromInstanceLog(when);
  }

  log() {
    return this.instance.log();
  }

  async put(fn, size, hash) {
    return this.instance.put(fn, size, hash);
  }
}

module.exports = BackupInstanceProxy;
