
const { Readable } = require('stream');
const RemoteInstance = require('./remote-instance');

class RemoteBackup {
  constructor({ protocol, hostname, host, port, verbose }) {
    this.protocol = protocol;
    this.host = hostname || host;
    this.port = port;
    this.verbose = verbose;
    this.base = `${protocol}//${host}:${port}`;
    this.http = require(protocol.substr(0, protocol.length - 1));
    this.token == null;
    this.agent = new this.http.Agent({
      keepAlive: true,
      maxSockets: 1,
      keepAliveMsecs: 3000
    });
    this.baseRequest = {
      agent: this.agent,
      protocol: this.protocol,
      host: this.host,
      port: this.port,
    };
  }

  request({ path, options = {}, body, query, onbody }) {
    return new Promise((resolve, reject) => {
      if (query) {
        path += '?' + Object.keys(query).map(k => `${k}=${query[k]}`).join('&');
      }
      options = Object.assign({}, this.baseRequest, options, { path });
      if (body) options.method = 'POST';
      const request = this.http.request(options, res => {
        if (onbody) {
          const reader = new Readable();
          reader._read = () => {};
          onbody(reader);
          res.on('data', (chunk) => reader.push(chunk));
          res.on('end', () => {
            reader.destroy();
            resolve({ res });
          });
        } else {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            resolve({ res, body });
          });
        }
        res.on('error', (err) => { body.destroy(); reject(err) });
      });
      if (this.token) request.setHeader('Authorization', `token ${this.token}`);
      request.on('error', reject);
      if (!body) {
        request.end();
        return;
      }
      if (body instanceof Readable && body.readable) {
        body.pipe(request);
        body.on('error', reject);
        body.on('end', () => request.end());
      } else if (typeof body == 'string') {
        request.write(body);
        request.end();
      } else {
        request.setHeader('Content-Type', 'text/json');
        request.write(JSON.stringify(body));
        request.end();
      }
    });
  }

  async login({ accessKey }) {
    const { res, body } = await this.request({ path: `/auth/login`, body: accessKey });
    if (res.statusCode == 200) {
      this.token = res.statusMessage;
      return;
    }
    throw new Error(`${res.statusCode} ${res.statusMessage}`);
  }

  async logout() {
    const { res, body } = await this.request({ path: `/auth/logout` });
    if (res.statusCode == 200) {
      return;
    }
    throw new Error(`${res.statusCode} ${res.statusMessage}`);
  }

  async backup({ backupset }) {
    const target = this;
    const instance = this.instance = new RemoteInstance({ target, setname: backupset.setname })
    await instance.createNewInstance();
    return await backupset.backupTo(instance);
  }

  async clean() {
    const { res, body } = await this.request({ path: '/fs/clean', query: { verbose: 1 } });
    if (res.statusCode == 200) {
      if (body) console.log(body);
    }
  }

  async list({ setname, when }) {
    const path = [ '/list' ];
    if (setname) path.push(setname);
    if (when) path.push(when);
    const { res, body } = await this.request({ path: path.join('/'), query: { verbose: 1 } });
    if (res.statusCode == 200) {
      if (body) console.log(body);
    }
  }

  async verify({ setname, when }) {
    const path = [ '/verify' ];
    if (setname) path.push(setname);
    if (when) path.push(when);
    let part = '';
    const { res, body } = await this.request({
      path: path.join('/'),
      query: { verbose: this.verbose ? 1 : 0 },
      onbody: reader => {
        reader.on('data', chunk => {
          const lines = (part + chunk.toString()).split('\n');
          part = lines.pop();  // remove last incomplete line (might be '')
          lines.forEach(l => console.log(l));
        });
        reader.on('error', e => { throw e; });
        reader.on('end', () => {
          console.log('finished');
        })
      }
    });
    if (res.statusCode == 200) {
      if (this.verbose) {
        console.log('Backup Verified');
        if (body) console.log(body.substr(0, body.length - 1));
      }
    } else {
      console.log(`Backup Verification failed with status ${res.statusCode}`);
    }
  }

  async complete({ backupset }) {
    await backupset.complete();
  }

  async restore(opts) {
    const { setname } = opts;
    const target = this;
    const instance = new RemoteInstance({ target, setname })
    return await instance.restore(opts);
  }

  destroy() {
    this.agent.destroy();
  }

}

module.exports = RemoteBackup;
