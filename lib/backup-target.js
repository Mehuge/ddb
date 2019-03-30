const LocalBackup = require('./local-backup');
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
  async _connectLocal(create) {
    const { destination, fstype, fast, verify } = this;
    this._target = new LocalBackup({ destination, fstype, fast, verify });
    await this._target.connect(create);
  }
  async _connectRemote() {
    const { destination } = this;
    this._target = new RemoteBackup({ destination });
  }

  target() {
    return this._target;
  }

  isRemote() {
    return this._target instanceof RemoteBackup;
  }

  async clean() {
    await this._target.clean();
  }

  async getLogs(set, instance) {
    return await this._target.getLogs(set, instance);
  }

  getPath() {
    return this._target.getPath();
  }

  fs() {
    return this._target.fs();
  }
}

module.exports = BackupTarget;
