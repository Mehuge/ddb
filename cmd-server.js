const { BackupInstance, BackupOptions, BackupTarget, BackupLog } = require('./lib');
const url = require('url');

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
    const server = new BackupServer({ target, port, bind, https, verbose });
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

  constructor({ target, port, bind, https, verbose }) {
    this.target = target;
    this.port = port;
    this.bind = bind;
    this.protocol = `http${https ? 's' : ''}`;
    this.http = require(this.protocol);
    this.verbose = verbose;
    this.running = {};
  }

  async run() {
    return new Promise((resolve, reject) => {
      const server = this.server = this.http.createServer(this.handleRequest.bind(this));
      server.listen(this.port, this.bind, (err) => {
        if (err) return reject(err);
        console.log(`${this.protocol} server is running on port ${this.port}`);
      });
    });
  }

  registerOp({ type, request, setname }) {
    const address = request.socket.remoteAddress;
    const port = request.socket.remotePort;
    const id = `${address}:${port}/${setname}`;
    const running = this.running;
    const other = running[setname];
    if (other && other.id != backup.id) {
      // other backup/restore running for this client
      return { error: 403, type: other.type };
    }
    return running[setname] = { type, client: `${address}:${port}`, id };
  }

  // Backup Service

  // TODO: break down

  async handleRequest(request, response) {
    try {
      if (this.verbose) console.log(`${request.method} ${request.url}`);
      const uri = url.parse(request.url, true);
      const parts = uri.pathname.split('/').slice(1);
      const target = this.target;
      const running = this.running;
      let setname, when, verbose, op, body, hash, size, key;
      switch(parts.shift()) {
        case 'fs':
          switch(parts.shift()) {
            case 'has':
              key = parts.shift().split('.');
              const has = await target.fs().has(key[2], key[0], key[1]);
              response.writeHead(has ? 200 : 404);
              response.end();
              return;
            case 'put':
              hash = parts.shift();
              size = parts.shift();
              await target.fs().put(request, size, hash, { compressed: true });
              response.writeHead(200, 'OK');
              response.end();
              return;
            case 'clean':
              await this.target.clean();
              response.writeHead(200);
              response.end();
              return;
            case 'get':
              key = parts.shift().split('.');
              response.writeHead(200, 'OK');
              await target.fs().restore(key[2], key[0], key[1], response, true);
              response.end();
              return;
          }
          break;
        case 'verify':
          setname = parts.shift();
          when = parts.shift() || 'current';
          verbose = uri.query.verbose == true;
          response.writeHead(200, { 'Content-Type': 'text/plain' });
          await this.target.verify({ setname, when, verbose, log: (s) => {
            response.write(s+'\n');
          }});
          response.end();
          return;
        case 'list':
          setname = parts.shift();
          when = parts.shift();
          const filter = {};
          response.writeHead(200, { 'Content-Type': 'text/plain' });
          await this.target.list({ setname, when, filter, log: (s) => {
            response.write(s+'\n');
          }});
          response.end();
          return;
        case 'backup':
          switch(parts.shift()) {
            case 'create':
              setname = parts.shift();
              op = this.registerOp({ type: 'backup', request, setname });
              if (op.error) {
                response.writeHead(op.error, '${op.type} is already running');
                response.end();
                return;
              }
              try {
                op.instance = new BackupInstance({ target, setname });
                await op.instance.createNewInstance();
                console.log(`${(new Date()).toISOString()}: New backup started for ${setname} by ${op.client}`);
                response.writeHead(200, op.id);
                response.end();
              } catch(e) {
                console.log(`${(new Date()).toISOString()}: Failed to started for ${setname} by ${op.client}`);
                console.dir(e);
                delete running[setname];
                throw e;
              }
              return;
            case 'log':
              setname = parts.shift();
              op = running[setname];
              if (!op || !op.instance) {
                response.writeHead(401, 'backup is not running');
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
                response.writeHead(200, 'OK');
                response.end();
                return;
              }
              response.writeHead(401, 'invalid request, no body');
              response.end();
              return;
            case 'finish':
              setname = parts.shift();
              op = running[setname];
              if (!op || !op.instance) {
                response.writeHead(401, 'backup is not running');
                response.end();
              }
              body = await BackupServer.getRequestBody(request);
              await op.instance.log().finish(body);
              response.writeHead(200, 'backup completed');
              response.end();
              return;
            case 'complete':
              setname = parts.shift();
              const when = parts.shift();
              op = running[setname];
              if (!op || !op.instance) {
                response.writeHead(401, 'backup is not running');
                response.end();
              }
              await op.instance.complete(when);
              delete running[setname];
              console.log(`${(new Date()).toISOString()}: Backup complete for ${setname} by ${op.client}`);
              response.writeHead(200, 'backup completed');
              response.end();
              return;
            case 'abandon':
              setname = parts.shift();
              op = running[setname];
              if (!op || !op.instance) {
                response.writeHead(401, 'backup is not running');
                response.end();
              }
              running[setname] = null;
              response.writeHead(200, 'backup abandoned');
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
              response.writeHead(200, { 'Content-Type': 'text/json' });
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
      response.writeHead(400); // Bad Request
      response.end();
    } catch(e) {
      console.error(`503 ${e.toString()}`);
      response.writeHead(503, e.toString());
      response.end();
    }
  }
}

module.exports = BackupServer;
