const { BackupInstance, BackupOptions, BackupTarget, BackupLog } = require('./lib');
const url = require('url');
const path = require('path');
const server = require('./lib/server');
const fs = require('./lib/fs');

class BackupServer {
  static async exec(args) {
    const opts = (new BackupOptions()).parse(args);

    // Configure backup from options
    const { destination, verbose } = opts;
    const target = new BackupTarget({ destination, fast: true, verbose, fstype: 'hash-v4' });
    await target.connect(true);

    const port = opts.port || 4444;
    const bind = opts.bind || '0.0.0.0';
    const https = opts.https || (port.toString().substr(-3) == '443');
    const cert = opts.cert || '';
    const server = new BackupServer({ target, port, bind, https, cert, verbose });
    await server.run();
  }

  static getRequestBody(request) {
    return new Promise((resolve, reject) => {
      let body = [];
      request.on('data', chunk => {
        body.push(chunk);
      });
      request.on('error', reject);
      request.on('end', () => {
        body = Buffer.concat(body).toString();
        resolve(body)
      });
    });
  }

  constructor({ target, port, bind, https, cert, verbose }) {
    this.target = target;
    this.port = port;
    this.bind = bind;
    this.protocol = `http${https ? 's' : ''}`;
    this.http = require(this.protocol);
    this.verbose = verbose;
    this.cert = cert;
    this.running = {};
  }

  async run() {
    let options;
    switch(this.protocol) {
      case 'https':
        options = { key: await fs.readFile(this.cert + 'key.pem'), cert: await fs.readFile(this.cert + 'cert.pem') };
        break;
    }
    return new Promise((resolve, reject) => {
      const http = this.http = this.http.createServer(options, this.handleRequest.bind(this));
      http.listen(this.port, this.bind, async (err) => {
        if (err) return reject(err);
        console.log(`${this.protocol} server is running on port ${this.port}`);
        await server.auth.setDb({ fn: path.join(this.target.getPath(), 'auth.json') });
      });
    });
  }

  registerOp({ type, request, setname, token }) {
    const address = request.socket.remoteAddress;
    const port = request.socket.remotePort;
    const id = `${address}/${setname}`;
    const running = this.running;
    const other = running[setname];
    if (other && other.id != id) {
      // other backup/restore running
      return { error: 403, type: other.type, id };
    }
    return running[setname] = { type, client: `${address}:${port}`, id, token };
  }

  // Backup Service

  // TODO: break down

  writeHead(response, code, message, headers) {
    if (typeof message == "object") {
      headers = message;
      message = undefined;
    }
    if (this.verbose) console.log(`${code}${message?' '+message:''}${headers?' '+JSON.stringify(headers):''}`);
    response.writeHead(code, message, headers);
  }

  async handleRequest(request, response) {
    server.auth.expire(900);               // expire logins after 15 mins inactivity
    try {
      if (this.verbose) console.log(`${request.method} ${request.url}`);
      const uri = url.parse(request.url, true);
      const parts = uri.pathname.split('/').slice(1);
      const target = this.target;
      const running = this.running;
      let setname, when, verbose, op, body, hash, size, key, verb, auth;
      switch(verb = parts.shift()) {
        case 'dump':    // temp while in dev
          console.log('logins');
          console.dir(server.auth.tokens);
          console.log('backups');
          console.dir(running);
          this.writeHead(response, 200);
          response.end();
          return;
        case 'auth':
          await server.auth.process({ parts, request, response, key: await BackupServer.getRequestBody(request) });
          return;
      }

      // Make sure this is an authenticated request.
      let token, userid;
      if (server.auth.enabled()) {
        const authorization = (request.headers['authorization'] || '').split(' ');
        if (authorization.length == 2 && authorization[0] == 'token') {
          const address = request.socket.remoteAddress;
          token = authorization[1];
          auth = await server.auth.authenticate({ address, token });
          userid = auth.login.userid;
        } else {
          auth = null;
        }
        if (!auth) {
          this.writeHead(response, 403, 'not allowed');
          response.end();
          return;
        }
      }

      switch(verb) {
        case 'fs':
          switch(parts.shift()) {
            case 'has':
              key = parts.shift().split('.');
              const has = await target.fs().has(key[2], key[0], key[1]);
              this.writeHead(response, has ? 200 : 404);
              response.end();
              return;
            case 'put':
              hash = parts.shift();
              size = parts.shift();
              await target.fs().put(request, size, hash, { compressed: true });
              this.writeHead(response, 200, 'OK');
              response.end();
              return;
            case 'clean':
              await this.target.clean();
              this.writeHead(response, 200, 'OK');
              response.end();
              return;
            case 'get':
              key = parts.shift().split('.');
              this.writeHead(response, 200, 'OK');
              await target.fs().restore(key[2], key[0], key[1], response, true);
              response.end();
              return;
          }
          break;
        case 'verify':
          setname = parts.shift();
          when = parts.shift() || 'current';
          verbose = uri.query.verbose == true;
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.setHeader('Transfer-Encoding', 'chunked');
          this.writeHead(response, 200, 'OK', { 'Content-Type': 'text/plain' });
          await this.target.verify({ setname, when, userid, verbose, log: (s) => {
            response.write(s+'\n');
            if (this.verbose) console.log(s);
          }});
          response.end();
          if (this.verbose) console.log('Verify complete');
          return;
        case 'list':
          setname = parts.shift();
          when = parts.shift();
          const filter = {};
          this.writeHead(response, 200, 'OK', { 'Content-Type': 'text/plain' });
          await this.target.list({ setname, when, userid, filter, log: (s) => {
            response.write(s+'\n');
          }});
          response.end();
          return;
        case 'backup':
          switch(parts.shift()) {
            case 'create':
              setname = parts.shift();
              op = this.registerOp({ type: 'backup', request, setname, token });
              if (op.error) {
                this.writeHead(response, op.error, `${op.type} is already running for ${op.id}`);
                response.end();
                return;
              }
              try {
                op.instance = new BackupInstance({ target, setname, userid });
                await op.instance.createNewInstance();
                console.log(`${(new Date()).toISOString()}: New backup started for ${setname} by ${op.client}`);
                this.writeHead(response, 200, op.id);
                response.end();
              } catch(e) {
                console.log(`${(new Date()).toISOString()}: Failed to start for ${setname} by ${op.client}`);
                console.dir(e);
                delete running[setname];
                throw e;
              }
              return;
            case 'log':
              setname = parts.shift();
              op = running[setname];
              if (!op || !op.instance || op.token != token) {
                this.writeHead(response, 401, 'backup is not running');
                response.end();
                return;
              }
              body = await BackupServer.getRequestBody(request);
              if (body) {
                switch(parts.shift()) {
                  case 'source':
                    const root = JSON.parse(body);
                    if (this.verbose) console.log(`source ${body}`);
                    await op.instance.log().writeSourceEntry({ root });
                    break;
                  case 'entry':
                    const entry = JSON.parse(body);
                    if (this.verbose) console.log(`entry ${body}`);
                    await op.instance.log().writeEntry(
                      Object.assign(entry, {
                        ctime: new Date(entry.ctime),
                        mtime: new Date(entry.mtime),
                      })
                    );
                    break;
                }
                this.writeHead(response, 200, 'OK');
                response.end();
                return;
              }
              this.writeHead(response, 401, 'invalid request, no body');
              response.end();
              return;
            case 'rdiff':
              setname = parts.shift();
              op = running[setname];
              if (!op) {
                response.writeHead(401, 'backup is not running');
                response.end();
                return;
              }
              if (!op.current) {
                try {
                  op.current = await op.instance.getLogEntries();
                } catch(e) {
                  op.current = [];
                }
              }
              if (op.current.length) {
                body = JSON.parse(await BackupServer.getRequestBody(request));
                for (const entry of op.current) {
                  if (entry.type == 'F' && path.join(entry.root, entry.path) == body) {
                    let signature;
                    try {
                      signature = await op.instance.getSignature(entry);
                      response.writeHead(200, { 'Content-Type': 'text/json' });
                      response.write(JSON.stringify(signature));
                      response.end();
                    } catch(e) {
                      console.log('file does not exist, backup is corrupt');
                      response.writeHead(500, 'current backup missing or corrupt');
                      response.end();
                    }
                    return;
                  }
                }
              }
              response.writeHead(401, 'not found');
              response.end();
              return;
            case 'finish':
              setname = parts.shift();
              op = running[setname];
              if (!op || !op.instance || op.token != token) {
                this.writeHead(response, 401, 'backup is not running');
                response.end();
                return;
              }
              body = await BackupServer.getRequestBody(request);
              await op.instance.log().finish(body);
              this.writeHead(response, 200, 'backup completed');
              response.end();
              return;
            case 'complete':
              setname = parts.shift();
              const when = parts.shift();
              op = running[setname];
              if (!op || !op.instance || op.token != token) {
                this.writeHead(response, 401, 'backup is not running');
                response.end();
              }
              await op.instance.complete(when);
              delete running[setname];
              console.log(`${(new Date()).toISOString()}: Backup complete for ${setname} by ${op.client}`);
              this.writeHead(response, 200, 'backup completed');
              response.end();
              return;
            case 'abandon':
              setname = parts.shift();
              op = running[setname];
              if (!op || !op.instance || op.token != token) {
                this.writeHead(response, 401, 'backup is not running');
                response.end();
              }
              running[setname] = null;
              this.writeHead(response, 200, 'backup abandoned');
              response.end();
              return;
          }
          break;
        case 'restore':
          switch(parts.shift()) {
            case 'get':
              setname = parts.shift();
              when = parts.shift();
              body = await BackupServer.getRequestBody(request);
              const filter = (body && JSON.parse(body)) || { filters: [] };
              const address = request.socket.address();
              console.log(`Restore started for ${setname}.${when} filter ${filter.filters.join(' ')} by ${address.address}:${address.port}`);
              const instance = new BackupInstance({ target, setname });
              this.writeHead(response, 200, 'OK', { 'Content-Type': 'text/json' });
              await instance.restore({ when, filter }, (entry) => {
                let output;
                switch(entry.type) {
                  case 'SOURCE':
                    output = `${entry.type} ${entry.root}`;
                    break;
                  default:
                    output = BackupLog.entryToString(entry);
                    break;
                }
                if (this.verbose) console.log(output);
                response.write(output + '\n');
              });
              response.end();
              return;
          }
          break;
      }
      this.writeHead(response, 400); // Bad Request
      response.end();
    } catch(e) {
      console.error(`503 ${e.toString()}`);
      response.writeHead(503, e.toString());
      response.end();
    }
  }
}

module.exports = BackupServer;
