const { BackupInstance, BackupOptions, BackupTarget } = require('./lib');
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
    const server = new BackupServer({ target, port, bind, https });
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

  constructor({ target, port, bind, https }) {
    this.target = target;
    this.port = port;
    this.bind = bind;
    this.protocol = `http${https ? 's' : ''}`;
    this.http = require(this.protocol);
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

  // Backup Service

  async handleRequest(request, response) {
    try {
      if (this.verbose) console.log(`${request.method} ${request.url}`);
      const uri = url.parse(request.url, true);
      const parts = uri.pathname.split('/').slice(1);
      const target = this.target;
      const running = this.running;
      let setname, when, verbose, backup, body;
      switch(parts.shift()) {
        case 'fs':
          switch(parts.shift()) {
            case 'has':
              const key = parts.shift().split('.');
              const has = await target.fs().has(key[2], key[0], key[1]);
              response.writeHead(has ? 200 : 404);
              response.end();
              return;
            case 'put':
              const hash = parts.shift();
              const size = parts.shift();
              await target.fs().put(request, size, hash, { compressed: true });
              response.writeHead(200, 'OK');
              response.end();
              break;
            case 'clean':
              await this.target.clean();
              response.writeHead(200);
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
          break;
        case 'backup':
          switch(parts.shift()) {
            case 'create':
              setname = parts.shift();
              backup = {
                id: request.socket.address() + '/' + setname,
              };
              const other = running[setname];
              if (other && other.id != backup.id) {
                response.writeHead(403, 'backup is already running');
                response.end();
              }
              backup.instance = new BackupInstance({ target, setname })
              await backup.instance.createNewInstance();
              running[setname] = backup;
              response.writeHead(200, backup.id);
              response.end();
              break;
            case 'log':
              setname = parts.shift();
              backup = running[setname];
              if (!backup) {
                response.writeHead(401, 'backup is not running');
                response.end();
              }
              body = await BackupServer.getRequestBody(request);
              if (body) {
                switch(parts.shift()) {
                  case 'source':
                    const root = JSON.parse(body);
                    if (this.verbose) console.log(`source ${body}`);
                    await backup.instance.log().writeSourceEntry({ root });
                    break;
                  case 'entry':
                    const entry = JSON.parse(body);
                    if (this.verbose) console.log(`entry ${body}`);
                    await backup.instance.log().writeEntry(
                      Object.assign(entry, {
                        ctime: new Date(entry.ctime),
                        mtime: new Date(entry.mtime),
                      })
                    );
                    break;
                }
                response.writeHead(200, 'OK');
                response.end();
              }
              response.writeHead(401, 'invalid request, no body');
              response.end();
              break;
            case 'complete':
              setname = parts.shift();
              const when = parts.shift();
              backup = running[setname];
              if (!backup) {
                response.writeHead(401, 'backup is not running');
                response.end();
              }
              await backup.instance.complete(when);
              response.writeHead(200, 'backup completed');
              response.end();
              break;
            case 'finish':
              setname = parts.shift();
              backup = running[setname];
              if (!backup) {
                response.writeHead(401, 'backup is not running');
                response.end();
              }
              body = await BackupServer.getRequestBody(request);
              await backup.instance.log().finish(body);
              response.writeHead(200, 'backup completed');
              response.end();
              break;
            case 'abandon':
              setname = parts.shift();
              backup = running[setname];
              if (!backup) {
                response.writeHead(401, 'backup is not running');
                response.end();
              }
              running[setname] = null;
              response.writeHead(200, 'backup abandoned');
              response.end();
              break;
          }
          response.end();
          break;
      }
      response.writeHead(400);
      response.end();
    } catch(e) {
      console.error(`503 ${e.toString()}`);
      response.writeHead(503, e.toString());
      response.end();
    }
  }
}

module.exports = BackupServer;
