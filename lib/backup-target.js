const BackupDest = require('./backup-dest');
const RemoteBackup = require('./remote-backup');

class BackupTarget {
  constructor({ destination, fstype, fast, verify }) {
    this.destination = destination;
    this.fstype = fstype;
    this.fast = fast;
    this.verify = verify;
  }
  async connect(create) {
    const destination = this.destination;
    if (destination.substr(0,5) == 'http:' || destination.substr(0,6) == 'https') {
      await this._connectRemote();
    } else {
      await this._connectLocal(create);
    }
  }
  async _connectLocal(create = false) {
    const { destination, fstype, fast, verify } = this;
    this.target = new BackupDest({ destination, fstype, fast, verify });
    await this.target.init(create);
  }
  async _connectRemote() {
    const { destination } = this;
    this.target = new RemoteBackup({ destination });
  }

  target() {
    return this.target;
  }

  isRemote() {
    return this.target instanceof RemoteBackup;
  }

  async clean() {
    await this.target.clean();
  }

  async getLogs(set, instance) {
    return await this.target.getLogs(set, instance);
  }

  getPath() {
    return this.target.getPath();
  }

  fs() {
    return this.target.fs();
  }
}

module.exports = BackupTarget;
