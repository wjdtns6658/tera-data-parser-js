const { test } = require('tap');
const sinon = require('sinon');

const path = require('path');
const spec = require('./spec/protocol-spec.js');

const util = require('util');
const logger = require('../lib/logger');

// we have to be careful with this because the object stores state,
// and we can't just re-require because node caches modules
const protocol = require('../lib/protocol');

// helper functions
function getTestDataPath(dir) {
  return path.join(__dirname, 'fixtures', dir);
}

function fakeLogger(array) {
  return (...args) => {
    const call = {};

    if (typeof args[0] === 'object') {
      call.meta = args.shift();
    }

    call.message = util.format(...args);
    array.push(call);
  };
}

// tests
test('load', (t) => {
  // set up
  const warnings = [];
  const warn = sinon.stub(logger, 'warn').callsFake(fakeLogger(warnings));

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
    warnings.some(w => /parse error: non-numeric opcode\s+at ".+protocol\.1\.map", line 5/.test(w.message)),
    'should warn on non-numeric opcode in protocol map'
  );

  t.ok(
    warnings.some(w => /parse error: malformed line\s+at ".+protocol\.1\.map", line 6/.test(w.message)),
    'should warn on malformed line in protocol map'
  );

  // .def parsing
  t.ok(
    warnings.some(w => /invalid filename syntax ".+NO_VERSION\.def"/.test(w.message)),
    'should warn on invalid .def filename'
  );

  t.ok(
    warnings.some(w => /parse error: malformed line\s+at ".+TEST_DEF\.1\.def", line 4/.test(w.message)),
    'should warn on malformed line in a .def'
  );

  t.ok(
    warnings.some(w => /parse warning: "count" or "offset" encountered, disabling implicit metatypes\s+at ".+TEST_DEF\.1\.def", line 17/.test(w.message)),
    'should warn on explicit "count"/"offset" type in a .def'
  );

  t.ok(
    warnings.some(w => /parse warning: array nesting too deep\s+at ".+TEST_DEF\.1\.def", line 21/.test(w.message)),
    'should warn on invalid array level in a .def'
  );

  // final checks
  t.ok(
    warnings.some(w => /unmapped message "UNMAPPED"/.test(w.message)),
    'should warn on an unmapped message'
  );

  // tear down
  warn.restore();

  t.end();
});

test('parse', (t) => {
  const load = protocol.load(getTestDataPath('protocol-write'));
  if (!load) t.bailout('could not load protocol-write for testing');

  for (const testCase of spec.both.concat(spec.parse)) {
    const result = protocol.parse(1, ...testCase.args, testCase.buffer);
    t.same(result, testCase.object, `${testCase.it} (parse)`);

    if (testCase.subtests && testCase.subtests.parser) {
      testCase.subtests.parser(t, testCase.buffer, result);
    }
  }

  t.end();
});

test('write', (t) => {
  const load = protocol.load(getTestDataPath('protocol-write'));
  if (!load) t.bailout('could not load protocol-write for testing');

  for (const testCase of spec.both.concat(spec.write)) {
    const result = protocol.write(1, ...testCase.args, testCase.object);
    t.same(result, testCase.buffer, `${testCase.it} (write)`);

    if (testCase.subtests && testCase.subtests.writer) {
      testCase.subtests.writer(t, testCase.object, result);
    }
  }

  t.end();
});
