// requires
const fs = require('fs');
const path = require('path');

const Stream = require('./stream');

// constants
const PATH_MAPDEF = 'map/protocol.map';
const PATH_DEFS = 'protocol';

class TeraProtocol {
  constructor() {
    this.map = {
      name: new Map(),
      code: new Map(),
    };
    this.messages = new Map();

    this.loaded = false;
  }

  // helper functions
  /**
   * Given an identifier, retrieve the name, opcode, and definition object.
   * @private
   * @param {String|Number|Object} identifier
   * @param {Number} [desiredVersion]
   * @param {String} [defaultName] Default name to return if `identifier` is an
   * object, since no lookups will be performed.
   * @returns Object An object with the `definition` property set, plus a `name`
   * and `code` if either a name or an opcode was passed in as the identifier.
   * @throws {TypeError} `identifier` must be one of the listed types.
   * @throws Errors if supplied an opcode that could not be mapped to a `name`.
   * @throws Errors if a `definition` cannot be found.
   */
  resolveIdentifier(identifier, desiredVersion = '*', defaultName = '<Object>') {
    const { map, messages, loaded } = this;
    let name;
    let code;
    let version;
    let definition;

    // lazy load
    if (!loaded) this.load();

    if (Array.isArray(identifier)) {
      name = defaultName;
      code = null;
      version = '?';
      definition = identifier;
    } else {
      switch (typeof identifier) {
        case 'string': {
          name = identifier;
          if (map.name.has(name)) {
            code = map.name.get(name);
          } else {
            console.warn(new Error(`code not known for message "${name}"`));
            code = null;
          }
          break;
        }

        case 'number': {
          code = identifier;
          if (map.code.has(code)) {
            name = map.code.get(code);
          } else {
            throw new Error(`mapping not found for opcode ${code}`);
          }
          break;
        }

        default: {
          throw new TypeError('named identifier must be a string or number');
        }
      }

      const versions = messages.get(name);
      const version = (desiredVersion === '*')
        ? Math.max(...versions.keys())
        : desiredVersion;

      definition = versions.get(version);
    }

    if (!definition) {
      throw new Error(`no definition found for message (name: "${name}", code: ${code}, version: ${version})`);
    }

    return { name, code, version, definition };
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
  getLength(definition, data = {}) {
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
      const val = data[key];
      if (Array.isArray(type)) {
        if (Array.isArray(val)) {
          for (const elem of val) {
            length += 4 + this.getLength(type, elem); // here + next offsets + recurisve length
          }
        }
      } else {
        switch (type) {
          case 'bytes': {
            if (val) length += val.length;
            break;
          }

          case 'string': {
            // utf+16 + null byte
            length += ((val || '').length + 1) * 2;
            break;
          }

          default: {
            const size = SIZES[type];
            if (size) {
              length += size;
            } else {
              throw new Error(`unknown type: ${type}`);
            }
            break;
          }
        }
      }
    }

    return length;
  }

  // public methods
  /**
   * Loads (or reloads) the opcode mapping and message definitions.
   * @param {String} [basePath] Path to the base package.json.
   */
  load(basePath = require.resolve('tera-data')) {
    const { map, messages } = this;

    if (path.basename(basePath) === 'package.json') {
      basePath = path.dirname(basePath);
    }

    // reset map and messages
    map.name.clear();
    map.code.clear();
    messages.clear();

    // read map
    const mapPath = path.join(basePath, PATH_MAPDEF);
    const data = fs.readFileSync(mapPath, { encoding: 'utf8' }).split(/\r?\n/);
    for (let i = 0; i < data.length; i++) {
      const line = data[i].replace(/#.*$/, '').trim();
      if (!line) continue;

      const match = line.match(/^(\S+)\s+(\S+)$/);
      if (!match) {
        console.warn(`[protocol] load - parse error: malformed line\n    at "${mapPath}", line ${i + 1}`);
        continue;
      }

      const name = match[1];
      const code = parseInt(match[2]);
      if (isNaN(code)) {
        console.warn(`[protocol] load - parse error: non-numeric opcode\n    at "${mapPath}", line ${i + 1}`);
        continue;
      }

      map.name.set(name, code);
      map.code.set(code, name);
    }

    // read protocol directory
    const defPath = path.join(basePath, PATH_DEFS);
    const files = fs.readdirSync(defPath);
    for (const file of files) {
      const parsedName = path.basename(file).match(/^(\w+)\.(\d+)\.def$/);
      if (!parsedName) {
        console.warn(`[protocol] load - invalid filename syntax "${path.join(defPath, file)}"`);
        continue;
      }

      const name = parsedName[1];
      const version = parseInt(parsedName[2], 10);

      const fullpath = path.join(defPath, file);
      const data = fs.readFileSync(fullpath, { encoding: 'utf8' }).split(/\r?\n/);

      const definition = [];
      const order = [];
      let top = definition; // pointer to current level

      for (let i = 0; i < data.length; i++) {
        // clean line
        const line = data[i].replace(/#.*$/, '').trim();
        if (!line) continue;

        const match = line.match(/^((?:-\s*)*)(\S+)\s+(\S+)$/);
        if (!match) {
          console.warn(`[protocol] load - parse error: malformed line\n    at "${fullpath}", line ${i + 1}`);
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
            console.warn(`[protocol] load - parse warning: array nesting too deep\n    at "${fullpath}", line ${i + 1}`);
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

      if (!messages.has(name)) messages.set(name, new Map());
      messages.get(name).set(version, definition);

      if (!map.name.has(name)) {
        console.warn(`[protocol] load - unmapped message "${name}"`);
      }
    }

    this.loaded = true;
    return true;
  }

  /**
   * @param {String|Number|Object} identifier
   * @param {Number} [desiredVersion]
   * @param {Buffer|Stream.Readable} [reader]
   * @param {String} [customName]
   * @returns {Object}
   */
  parse(identifier, desiredVersion, reader, customName) {
    // parse params
    if (Buffer.isBuffer(desiredVersion)) {
      reader = desiredVersion;
      desiredVersion = '*';
    }

    const data = {};
    const { name, version, definition } = this.resolveIdentifier(identifier, desiredVersion, customName);
    const displayName = (version !== '?') ? `${name}<${version}>` : name;

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
            console.warn(`[protocol] parse - ${displayName}: offset mismatch for array "${key}" at ${reader.position} (expected ${next})`);
            reader.seek(next);
            pos = next;
          }

          const here = reader.uint16();
          if (pos !== here) {
            throw new Error(`${displayName}.${key}: cannot find next element of array at ${pos} (found value ${here})`);
          }

          next = reader.uint16();
          array[index++] = this.parse(type, null, reader, `${displayName}.${key}`);

          if (next && index === length) {
            console.warn(`[protocol] parse - ${displayName}.${key}: found out of bounds element ${index} (expected max ${length})`);
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
                console.warn(`[protocol] parse - ${displayName}: offset mismatch for "${key}" at ${reader.position} (expected ${ofs})`);
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
   * @param {Number} [desiredVersion]
   * @param {Object} data
   * @param {Stream.Writeable} [writer]
   * @param {String} [customName]
   * @returns {Buffer}
   */
  write(identifier, desiredVersion, data, writer, customName) {
    // parse args
    if (typeof desiredVersion === 'object') {
      data = desiredVersion;
      desiredVersion = '*';
    }
    
    if (!desiredVersion) desiredVersion = '*';
    if (!data) data = {};

    const { name, code, version, definition } = this.resolveIdentifier(identifier, desiredVersion, customName);
    const displayName = (version !== '?') ? `${name}<${version}>` : name;

    // set up optional arg `writer`
    if (!writer) {
      // make sure `code` is valid
      if (code == null || code < 0) {
        console.error('[protocol] write (%s): invalid code "%s"', name, code);
        return null;
      }

      // set up stream
      const length = 4 + this.getLength(definition, data);
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
            this.write(type, version, element, writer, `${displayName}.${key}`);
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

  /**
   * @returns {TeraProtocol}
   */
  createInstance(...args) {
    return new TeraProtocol(...args);
  }
}

module.exports = new TeraProtocol();
