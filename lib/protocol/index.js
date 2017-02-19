// requires
const fs = require('fs');
const path = require('path');

const Stream = require('./stream');

// constants
const PATH_MAPDEF = '../map/protocol.map';
const PATH_DEFS = '../protocol';

// "globals"
const $map = {
  name: new Map(),
  code: new Map(),
};
const $messages = new Map();

let loaded = false;

// helper functions
/**
 * Given an identifier, retrieve the name, opcode, and definition object.
 * @private
 * @param {String|Number|Object} identifier
 * @param {String} [defaultName] Default name to return if `identifier` is an
 * object, since no lookups will be performed.
 * @returns Object An object with the `definition` property set, plus a `name`
 * and `code` if either a name or an opcode was passed in as the identifier.
 * @throws {TypeError} `identifier` must be one of the listed types.
 * @throws Errors if supplied an opcode that could not be mapped to a `name`.
 * @throws Errors if a `definition` cannot be found.
 */
function resolveIdentifier(identifier, defaultName = '<Object>') {
  let name;
  let code;
  let definition;

  // lazy load
  if (!loaded) load();

  switch (typeof identifier) {
    case 'object': {
      name = defaultName;
      code = null;
      definition = identifier;
      break;
    }

    case 'string': {
      if (!$map.name.has(identifier)) {
        console.warn(new Error(`code not known for message "${identifier}"`));
      }

      name = identifier;
      code = $map.name.get(name);
      definition = $messages.get(name);
      break;
    }

    case 'number': {
      if (!$map.code.has(identifier)) {
        throw new Error(`mapping not found for opcode ${identifier}`);
      }

      name = $map.code.get(identifier);
      code = identifier;
      definition = $messages.get(name);
      break;
    }

    default: {
      throw new TypeError('identifier must be an object, string, or number');
    }
  }

  if (!definition) {
    throw new Error(`no definition found for message (name: "${name}", code: ${code})`);
  }

  return { name, code, definition };
}

/**
 * Given a definition object and a data object, efficiently compute the byte
 * length for the resulting data buffer.
 * @private
 * @param {Object} definition
 * @param {Object} data
 * @returns {Number}
 * @throws Errors if a type specified in the `definition` is not recognized.
 */
function getLength(definition, data) {
  const SIZES = {
    byte: 1,

    int16: 2,
    uint16: 2,
    count: 2,
    offset: 2,

    int32: 4,
    uint32: 4,
    float: 4,

    int64: 8,
    uint64: 8,
    double: 8,
  };

  let length = 0;

  for (const [key, type] of definition) {
    if (Array.isArray(type)) {
      for (const elem of data[key]) {
        // add here offset + next offset + recursive length
        length += 4 + getLength(type, elem);
      }
    } else {
      switch (type) {
        case 'bytes': {
          length += data[key].length;
          break;
        }

        case 'string': {
          // utf+16 + null byte
          length += (data[key].length + 1) * 2;
          break;
        }

        default: {
          const size = SIZES[type];
          if (size) {
            length += size;
          } else {
            throw new Error(`unknown type: ${type}`);
          }
        }
      }
    }
  }

  return length;
}

// exports
/**
 * Loads (or reloads) the opcode mapping and message definitions.
 * @param {String} [basePath] Path to the base package.json.
 */
function load(basePath) {
  if (!basePath) basePath = require.resolve('tera-data');

  // reset map and messages
  $map.name.clear();
  $map.code.clear();
  $messages.clear();

  // read map
  const mapPath = path.join(basePath, PATH_MAPDEF);
  const data = fs.readFileSync(mapPath, { encoding: 'utf8' }).split(/\r?\n/);
  for (let i = 0; i < data.length; i++) {
    const line = data[i].replace(/#.*$/, '').trim();
    if (!line) continue;

    const match = line.match(/^(\S+)\s+(\S+)$/);
    if (!match) {
      console.warn(`[protocol] load - parse error: malformed line (${FILENAME_MAPDEF}:${i + 1})`);
      continue;
    }

    const name = match[1];
    const code = parseInt(match[2]);
    if (isNaN(code)) {
      console.warn(`[protocol] load - parse error: non-numeric opcode (${FILENAME_MAPDEF}:${i + 1})`);
      continue;
    }

    $map.name.set(name, code);
    $map.code.set(code, name);
  }

  // read protocol directory
  const defPath = path.join(basePath, PATH_DEFS);
  const files = fs.readdirSync(defPath);
  for (const file of files) {
    if (path.extname(file) !== '.def') continue;

    const fullpath = path.join(defPath, file);
    const data = fs.readFileSync(fullpath, { encoding: 'utf8' }).split(/\r?\n/);

    const definition = [];
    const order = [];
    const name = path.basename(file, '.def');
    let top = definition; // pointer to current level

    for (let i = 0; i < data.length; i++) {
      // clean line
      const line = data[i].replace(/#.*$/, '').trim();
      if (!line) continue;

      const match = line.match(/^((?:-\s*)*)(\S+)\s+(\S+)$/);
      if (!match) {
        console.warn(`[protocol] load - parse error: malformed line (${file}:${j + 1})`);
        continue;
      }

      const depth = match[1].replace(/[^-]/g, '').length;
      const type = match[2];
      const key = match[3];

      // check if we need to move up or down a level
      // move deeper
      if (depth > order.length) {
        // sanity check
        if (depth !== order.length + 1) {
          console.warn(`[protocol] load - parse warning: array nesting too deep (${file}:${j + 1})`);
        }

        // we are defining the subfields for the last field we saw,
        // so move current level to the `type` value (2nd elem) of the last field
        const id = top.length - 1;
        top = top[id][1];

        // push name onto stack so we can traverse back up the hierarchy
        order.push(id);
      // move up
      } else if (depth < order.length) {
        // pop the stack to match the correct depth
        while (depth < order.length) order.pop();

        // reset current level pointer and walk back down the hierarchy
        top = definition;
        for (const id of order) top = top[id][1];
      }

      // append the field to the current level
      top.push([key, type === 'array' ? [] : type]);
    }

    $messages.set(name, definition);
    if (!$map.name.has(name)) {
      console.warn(`[protocol] load - unmapped message "${name}"`);
    }
  }

  loaded = true;
  return true;
}

/**
 * @param {String|Number|Object} identifier
 * @param {Buffer|Stream.Readable} [reader]
 * @param {String} [customName]
 * @returns {Object}
 */
function parse(identifier, reader, customName) {
  const data = {};
  const { name, code, definition } = resolveIdentifier(identifier, customName);

  // convert `reader` to a stream
  if (Buffer.isBuffer(reader)) {
    reader = new Stream.Readable(reader, 4);
  }

  // begin parsing
  const count = new Map();
  const offset = new Map();
  for (const [key, type] of definition) {
    // handle array type
    if (Array.isArray(type)) {
      const length = count.get(key);
      const array = new Array(length);
      let index = 0;
      let next = offset.get(key);

      while (next) {
        let pos = reader.position;
        if (pos !== next) {
          console.warn(`[protocol] parse - ${name}: offset mismatch for array "${key}" at ${reader.position} (expected ${next})`);
          reader.seek(next);
          pos = next;
        }

        const here = reader.uint16();
        if (pos !== here) {
          throw new Error(`${name}.${key}: cannot find next element of array at ${pos} (found value ${here})`);
        }

        next = reader.uint16();
        array[index++] = parse(type, reader, `${name}.${key}`);

        if (next && index === length) {
          console.warn(`[protocol] parse - ${name}.${key}: found out of bounds element ${index} (expected max ${length})`);
        }
      }

      data[key] = array;
    // handle primitive type
    } else {
      switch (type) {
        case 'count': {
          count.set(key, reader.uint16());
          break;
        }

        case 'offset': {
          offset.set(key, reader.uint16());
          break;
        }

        default: {
          if (offset.has(key)) {
            const ofs = offset.get(key);
            if (reader.position !== ofs) {
              console.warn(`[protocol] parse - ${name}: offset mismatch for "${key}" at ${reader.position} (expected ${ofs})`);
              reader.seek(ofs);
            }
          }

          data[key] = reader[type](count.get(key));
        }
      }
    }
  }

  return data;
}

/**
 * @param {String|Number|Object} identifier
 * @param {Object} data
 * @param {Stream.Writeable} [writer]
 * @param {String} [customName]
 * @returns {Buffer}
 */
function write(identifier, data, writer, customName) {
  const { name, code, definition } = resolveIdentifier(identifier, customName);

  // set up optional arg `writer`
  if (!writer) {
    // make sure `code` is valid
    if (code == null || code < 0) {
      console.error('[protocol] write (%s): invalid code "%s"', name, code);
      return;
    }

    // set up stream
    const length = 4 + getLength(definition, data);
    writer = new Stream.Writeable(length);
    writer.uint16(length);
    writer.uint16(code);
  }

  // begin writing
  const count = new Map();
  const offset = new Map();
  for (const [key, type] of definition) {
    const value = data[key];

    // `type` is array
    if (Array.isArray(type)) {
      if (!value) continue;

      const length = value.length;
      if (length !== 0) {
        // write length in header
        const here = writer.position;
        writer.seek(count.get(key));
        writer.uint16(length);
        writer.seek(here);

        // iterate elements
        let last = offset.get(key);
        for (const element of value) {
          // write position in last element (or header)
          const here = writer.position;
          writer.seek(last);
          writer.uint16(here);
          writer.seek(here);

          // write position in current element
          writer.uint16(here);

          // store position pointing to next element
          last = writer.position;

          // write placeholder position
          writer.uint16(0);

          // recurse
          write(type, element, writer, `${name}.${key}`);
        }
      }
    // `type` is primitive
    } else {
      switch (type) {
        // save position and write placeholders for count and offset
        case 'count': {
          count.set(key, writer.position);
          writer.uint16(0);
          break;
        }

        case 'offset': {
          offset.set(key, writer.position);
          writer.uint16(0);
          break;
        }

        // otherwise,
        default: {
          // update count
          if (count.has(key)) {
            const here = writer.position;
            writer.seek(count.get(key));
            writer.uint16(value.length);
            writer.seek(here);
          }

          // update offset
          if (offset.has(key)) {
            const here = writer.position;
            writer.seek(offset.get(key));
            writer.uint16(here);
            writer.seek(here);
          }

          // write it
          writer[type](value);
        }
      }
    }
  }

  return writer.buffer;
}

module.exports = {
  map: $map,
  messages: $messages,

  load,
  parse,
  write,
};
