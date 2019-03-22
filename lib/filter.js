class Filter {
  constructor({ includes, excludes }) {
    this.includes = includes ? [...includes] : [];
    this.excludes = excludes ? [...excludes] : [];
    this._init();
  }
  _init() {
    function re(patterns) {
      const res = [];
      for (let i = 0; i < patterns.length; i++) {
        const p = patterns[i];
        // Handle special **/something case, which means any level of folder, including root
        // so matches both ^something and ^.+/something
        if (p.substr(0,2) == '**' && (p[2] == '/' || p[2] == '\\')) {
          res.push(...re([ p.substr(3) ]));
        }
        res.push(new RegExp(
          '^' + p
          .replace(/\*\*[\\/]/g, '{STARSTARGLOBSLASH}')
          .replace(/\*\*/g, '{STARSTARGLOB}')
          .replace(/[.]/g,'\.')
          .replace(/[/\\]/g,'[/\\\\]')
          .replace(/\*/g, '[^/\\\\]*')
          .replace(/{STARSTARGLOB}/g, '.*')
          .replace(/{STARSTARGLOBSLASH}/g, '.+[\\\\/]')
        ));
      }
      return res;
    }
    this.excludes = re(this.excludes);
    this.includes = re(this.includes);
  }
  ignores(str) {
    let ignored = false;
    for (const exclude of this.excludes) {
      if (exclude.test(str)) {
        ignored = true;
      }
    }
    for (const include of this.includes) {
      if (include.test(str)) {
        ignored = false;
      }
    }
    return ignored;
  }
}

module.exports = Filter;
