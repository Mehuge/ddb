const Filter = require('../lib/filter');

function expect(r, e) {
  console.log(r === e ? 'pass' : 'fail');
}

let f = new Filter({ excludes: [ '**' ], includes: [ '**/saved', '**/somefile.txt' ] });
expect(true, f.ignores('somefile.txt'));
expect(false, f.ignores('UnrealTournament/somefile.txt'));
expect(false, f.ignores('UnrealTournament/saved/somefile.txt'));

f = new Filter({ excludes: [ '**/node_modules', '**/somefile.txt' ] });
expect(false, f.ignores('somefile.txt'));
expect(true, f.ignores('node_modules/somefile.txt'));
expect(false, f.ignores('node_modules/module/package.json'));
expect(true, f.ignores('UnrealTournament/node_modules/module/package.json'));
