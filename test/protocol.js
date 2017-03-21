const { test } = require('tap');
const sinon = require('sinon');

const path = require('path');

// we have to be careful with this because the object stores state,
// and we can't just re-require because node caches modules
const protocol = require('../lib/protocol');

// helper functions
function getTestDataPath(dir) {
  return path.join(__dirname, dir, 'package.json');
}

const stubConsole = (() => {
  const cons = {};

  for (const method of ['log', 'warn', 'error']) {
    cons[method] = console[method].bind(console);
  }

  return (method, array) =>
    sinon.stub(console, method, (...args) => {
      if (args[0].startsWith('[protocol]')) {
        array.push(args);
      } else {
        cons.warn(...args);
      }
    });
})();

// tests
test('load', (t) => {
  // set up
  const warnings = [];
  const warn = stubConsole('warn', warnings);

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
    warnings.some(w => /invalid filename syntax ".+NO_VERSION\.def"/.test(w)),
    'should warn on invalid .def filename'
  );

  t.ok(
    warnings.some(w => /parse error: malformed line\s+at ".+TEST_DEF\.1\.def", line 4/.test(w)),
    'should warn on malformed line in a .def'
  );

  t.ok(
    warnings.some(w => /parse warning: array nesting too deep\s+at ".+TEST_DEF\.1\.def", line 21/.test(w)),
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
  const load = protocol.load(getTestDataPath('protocol-write'));
  if (!load) t.bailout('could not load protocol-write for testing');

  const testDefDefault = Buffer.from('2d00e8032b00000000000000000000000000000000000000000000000000000000000000000000000000000000', 'hex');

  // TODO maybe split into tests for each field type?
  t.same(
    protocol.write('TEST_DEF', 2, {
      byte: 1,
      int16: 2,
      int32: 3,
      int64: { high: 4, low: 5 },
      uint16: 6,
      uint32: 7,
      uint64: { high: 8, low: 9 },
      float: 10.11,
      string: 'twelve',
      array: [
        {
          element: 13,
          nested: [
            { element1: 14, element2: 15 },
            { element1: 16, element2: 17 },
          ],
        },
      ],
    }),
    Buffer.from('5900e8032b000100390001020003000000050000000400000006000700000009000000080000008fc221417400770065006c0076006500000039000000020045000d00000045004f000e0000000f004f000000100000001100', 'hex'),
    'should write all fields and types correctly'
  );

  t.same(
    protocol.write('TEST_DEF', 2),
    testDefDefault,
    'should use default values for missing properties'
  );

  t.same(
    protocol.write('TEST_DEF', 1, { byte: 1 }),
    Buffer.from('0500e80301', 'hex'),
    'should use the specified definition version'
  );

  t.same(
    protocol.write('TEST_DEF', '*'),
    testDefDefault,
    'should use latest version for "*"'
  );

  t.same(
    protocol.write('TEST_DEF'),
    testDefDefault,
    'should use latest version for sole string identifier'
  );

  t.end();
});
