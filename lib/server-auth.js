
const crypto = require('crypto');
const AuthDb = require('./auth-db');

// GET /auth/login/key

class LoginState {
  constructor({ at, token, key, secret, address, login }) {
    this.token = token;
    this.at = at;
    this.key = key;
    this.secret = secret;
    this.address = address;
    this.login = login;
    this.touch();
  }
  logout() {
  }
  touch() {
    this.touched = new Date();
  }
  expire(after) {
    const then = this.touched.valueOf();
    const now = Date.now();
    return now - then > (after*1000);
  }
}

class Auth {
  constructor() {
    this.tokens = {};
  }
  async setDb({ fn }) {
    this.db = new AuthDb({ fn });
    await this.db.load();
  }
  async process({ parts, key, request, response }) {
    let token;
    switch(parts.shift()) {
      case 'login':
        const address = request.socket.remoteAddress;
        const login = this.db.authenticate({ key, address });
        if (!login) {
          response.writeHead(403, 'Access denied');
          response.end();
          return;
        }
        const at = new Date();
        const sha1 = crypto.createHash('sha1');
        const secret = `${at.toISOString()}:${key}:${request.socket.remoteAddress}`;
        sha1.update(secret);
        token = sha1.digest('hex');
        this.tokens[token] = new LoginState({ at, token, key, secret, address, login });
        response.writeHead(200, token);
        response.end();
        return;
      case 'logout':
        token = (request.headers['authorization']||'').split(' ');
        if (token[0] == 'token') {
          token = token[1];
          const state = this.tokens[token];
          if (state) {
            state.logout();
            delete this.tokens[token];
            response.writeHead(200);
          } else {
            response.writeHead(401, 'not logged in');
          }
        } else {
            response.writeHead(403, 'not allowed');
        }
        response.end();
        return;
    }
  }
  removeToken(token) {
    delete this.tokens[token];
  }
  authenticate({ address, token }) {
    token = this.tokens[token];
    if (token && token.address == address) {
      token.touch();
      return token;
    }
  }
  expire({ after }) {
    if (this.tokens) {
      for (let token in this.tokens) {
        if (this.tokens[token].expire(after || 900)) {
          this.removeToken(token);
        }
      }
    }
  }
};

module.exports = new Auth();
