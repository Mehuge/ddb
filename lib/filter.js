

class Filter {
  constructor({ filters }) {
    this.filters = filters ? [...filters] : [];
    this._init();
  }
  _init() {
    function re(patterns) {
      const res = [];

      // Convert a glob pattern string into a RegExp.
      // prefix: optional literal prefix to prepend before the translated pattern
      //   (used to produce the "nested" variant, e.g. '^.+[/\\]')
      function makeRe(pat, prefix = '^') {
        const endsWild = /[*\\/]$/.test(pat);
        const boundary = endsWild ? '' : '([/\\\\].*)?$';
        return new RegExp(
          prefix + pat
          .replace(/\*\*[\\/]/g, '{STARSTARGLOBSLASH}')
          .replace(/\*\*/g, '{STARSTARGLOB}')
          .replace(/[.]/g, '{ESCAPEDOT}')
          .replace(/[/\\]/g, '[/\\\\]')
          .replace(/\*/g, '[^/\\\\]*')
          .replace(/{STARSTARGLOB}/g, '.*')
          .replace(/{STARSTARGLOBSLASH}/g, '.+[\\\\/]')
          .replace(/{ESCAPEDOT}/g, '\\.')
          + boundary
        );
      }

      // Push two filter entries for patterns that match at any depth:
      // one anchored at root (^pat) and one requiring a leading path component (^.+[/\\]pat).
      function pushAnyDepth(type, splitPat, rest) {
        res.push({ type, pattern: splitPat, re: makeRe(rest, '^.+[/\\\\]') });
        res.push({ type, pattern: splitPat, re: makeRe(rest) });
      }

      for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        const type = pattern[0];
        const p = pattern.substr(1);
        const splitPat = pattern.split(/[\\/]/g);

        // **/something — matches at any depth including root
        if (p.substr(0,2) == '**' && (p[2] == '/' || p[2] == '\\')) {
          pushAnyDepth(type, splitPat, p.substr(3));
          continue;
        }

        // Plain pattern with no path separator (e.g. "node_modules", "*.log") —
        // implicitly treated as **/pattern, matching at any depth including root.
        if (p.indexOf('/') === -1 && p.indexOf('\\') === -1 && p !== '**') {
          pushAnyDepth(type, splitPat, p);
          continue;
        }

        // All other patterns (contain path separators, or are bare **).
        res.push({ type, pattern: splitPat, re: makeRe(p) });
      }
      return res;
    }
    this.filters = re(this.filters);
  }
  ignores(str) {
    let ignored = false;
    for (const filter of this.filters) {
      if (filter.re.test(str)) {
        ignored = filter.type == '-' ? filter : null;
      }
    }
    return ignored;
  }
}

module.exports = Filter;
