const fs = require('./fs');
const FS = require('fs').constants;
const path = require('path');
const crc = require('crc');

const HASH_OPTS = { hash: 'sha256', encoding: 'hex' };

class HashFileSystemV5 {
  constructor({ root }) {
    this.root = root;
  }
  // V5 we just use first part of hash for sub-folders, and hash is rest of hash.
  // ie. aabbccddeeff... becomes aa/bb/ccddeeff...
  // we also don't use a variant
  _hash2name(hash) {
    const name = path.join(hash.substr(0,2), hash.substr(2,2));
    return path.join(name, hash.substr(4));
  }

  getKey(hash, variant /* deprecated */, size) {
    const name = this._hash2name(hash);
    return { hash, variant, size, name, path: path.join(this.root, `${name}.${size}`) };
  }

  async exists(key) {
    try {
      await fs.access(key.path);
      return true;
    } catch(e) {
      if (e.code == 'ENOENT') return false;
      throw e;
    }
  }

  // isAlreadyCompressed means, the file is already compressed and we can just copy
  // it to the backup location. This is the case when the server receives a file
  // from the client over the network, the client compressed the file before sending
  // it, so the server can just copy it to the backup location.
  async store(file, key, isAlreadyCompressed) {
    await fs.mkdirp(path.join(this.root, path.dirname(key.name)), 0o700);
    if (isAlreadyCompressed) {
      await fs.copy(file, key.path);
    } else {
      await fs.zip(file, key.path);
    }
  }

  async cat(key) {
    const unzipper = await fs.unzip(key.path);
    unzipper.pipe(process.stdout);
  }

  // asCompressedStream means, we want to restore the file as a compressed 
  // stream, without unzipping it. This is the case when the client wants to
  // receive the file over the network, and it will unzip it on its side.
  async restore(key, file, asCompressedStream = false) {
    // TODO: As we restore this file, calculate the hash of the restored file
    // and compare it with the original hash to ensure integrity.
    if (asCompressedStream) {
      await fs.copy(key.path, file);
    } else {
      await fs.unzip(key.path, file);
    }
  }

  async compare(key, file) {
    await fs.compareZipWith(key.path, file);
  }

  async hashKey(key) {
    return await fs.hashZip(key.path, HASH_OPTS);
  }

  static async hashFile(file) {
    return await fs.hash(file, HASH_OPTS);
  }

  async hashFile(file) {
    return await HashFileSystemV5.hashFile(file);
  }

  keyFromFile(dir, name) {
    // index files still have variant in the hash
    name = name.split(".");
    return dir.substr(0,2) + dir.substr(3,2) + name[0] + ".0." + name[1];
  }

}

module.exports = HashFileSystemV5;
