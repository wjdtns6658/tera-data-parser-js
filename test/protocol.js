const { test } = require('tap');
const sinon = require('sinon');

const path = require('path');

// we have to be careful with this because the object stores state,
// and we can't just re-require because node caches modules
const protocol = require('../lib/protocol');

// helper function
function getTestDataPath(dir) {
  return path.join(__dirname, dir, 'package.json');
}

const _console = {};

for (const method of ['log', 'warn', 'error']) {
  _console[method] = console[method].bind(console);
}

// tests
test('load', (t) => {
  // set up
  const warnings = [];

  const warn = sinon.stub(console, 'warn', (...args) => {
    if (args[0].startsWith('[protocol]')) {
      warnings.push(args);
    } else {
      _console.warn(...args);
    }
  });

  // test loads
  t.throws(
    () => protocol.load('invalid-directory'),
    /ENOENT: no such file or directory/,
    'should throw if basePath points to invalid tera-data'
  );

  // devDependencies should have installed tera-data
  t.ok(protocol.load(), 'should default load tera-data from node_modules');

  const ok = t.ok(
    protocol.load(getTestDataPath('protocol-load')),
    'should load tera-data from specified path'
  );

  if (!ok) t.bailout('cannot load custom tera-data paths for testing');

  // .map parsing
  t.ok(
    warnings.some(w => /parse error: non-numeric opcode\s+at ".+protocol\.map", line 5/.test(w)),
    'should warn on non-numeric opcode in protocol.map'
  );

  t.ok(
    warnings.some(w => /parse error: malformed line\s+at ".+protocol\.map", line 6/.test(w)),
    'should warn on malformed line in protocol.map'
  );

  // .def parsing
  t.ok(
    warnings.some(w => /parse error: malformed line\s+at ".+TEST_DEF\.def", line 4/.test(w)),
    'should warn on malformed line in a .def'
  );

  t.ok(
    warnings.some(w => /parse warning: array nesting too deep\s+at ".+TEST_DEF\.def", line 21/.test(w)),
    'should warn on invalid array level in a .def'
  );

  // final checks
  t.ok(
    warnings.some(w => /unmapped message "UNMAPPED"/.test(w)),
    'should warn on an unmapped message'
  );

  // tear down
  warn.restore();

  t.end();
});

test('parse', (t) => {
  // TODO

  t.end();
});

test('write', (t) => {
  // TODO

  t.end();
});
