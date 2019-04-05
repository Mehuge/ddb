const { BackupInstance, BackupOptions, BackupTarget } = require('./lib');
const http = require('http');
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
    const server = new BackupServer({ target, port, bind });
    await server.run();
  }

  static getRequestBody(request) {
    console.log('getRequestBody');
    return new Promise((resolve, reject) => {
      let body = [];
      request.on('data', chunk => {
        body.push(chunk);
        console.log('received chunk');
      });
      request.on('error', reject);
      request.on('end', () => {
        body = Buffer.concat(body).toString();
        console.log(`resolve getRequestBody [${body}]`);
        resolve(body)
      });
    });
  }

  constructor({ target, port, bind }) {
    this.target = target;
    this.port = port;
    this.bind = bind;
    this.running = {};
  }

  async run() {
    return new Promise((resolve, reject) => {
      const server = this.server = http.createServer(this.handleRequest.bind(this));
      server.listen(this.port, /* this.host, */ (err) => {
        if (err) return reject(err);
        console.log(`TCP Server is running on port ${this.port}`);
      });
    });
  }

  // Backup Service EndPoints
  //
  //  Hash File System
  //   GET /fs/has/<hash>.variant.size
  //      status 200 if exists, 401 if not
  //
  //   POST /fs/put/<hash>.variant.size
  //      {chunked data}
  //      status 200 if put succeeded, 50? if failed
  //
  //   GET /fs/get/<hash>.variant.size
  //      {chunked data}
  //      status 200 if exists, 401 if not
  //
  //   POST /fs/compare/<hash>.n.size
  //      {hash-chain}
  //      status 200 if same, ??? if not
  //
  //   GET /fs/clean
  //      status 200
  //
  //  Instance Management
  //
  //    GET /backup/create/{set-name}              // create new (running) instance
  //

  async handleRequest(request, response) {
    try {
      console.dir(`${request.method} ${request.url}`);
      const uri = url.parse(request.url, true);
      const parts = uri.pathname.split('/').slice(1);
      const target = this.target;
      const running = this.running;
      let setname, when, verbose, backup;
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
          verbose = "verbose" in uri.query;
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
                started: new Date(),
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
              const body = await BackupServer.getRequestBody(request);
              if (body) {
                const entry = JSON.parse(body);
                switch(parts.shift()) {
                  case 'source':
                    console.log(`source ${entry}`);
                    await backup.instance.log().writeSourceEntry(entry);
                    break;
                  case 'entry':
                    console.log(`source ${entry}`);
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
              backup = running[setname];
              if (!backup) {
                response.writeHead(401, 'backup is not running');
                response.end();
              }
              await backup.instance.complete(backup.started);
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
      response.writeHead(503, e.toString());
      response.end();
    }
  }
}

module.exports = BackupServer;
