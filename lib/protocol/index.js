// requires
const fs = require('fs');
const path = require('path');
const util = require('util');

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
          throw new TypeError('identifier must be a string or number');
        }
      }

      const versions = messages.get(name);
      if (versions) {
        version = (desiredVersion === '*')
          ? Math.max(...versions.keys())
          : desiredVersion;

        definition = versions.get(version);
      }
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
      bool: 1,
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
        switch (type.type) {
          case 'array': {
            if (Array.isArray(val)) {
              for (const elem of val) {
                // here + next offsets + recurisve length
                length += 4 + this.getLength(type, elem);
              }
            }
            break;
          }

          case 'object': {
            length += this.getLength(type, val);
            break;
          }

          default: {
            // TODO warn/throw?
            break;
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

    // helper functions
    const META_TYPES = {
      array: ['count', 'offset'],
      bytes: ['offset', 'count'],
      string: ['offset'],
    };

    function pushMetaTypes(base, key, type) {
      const metaTypes = META_TYPES[type];
      if (!metaTypes) return;

      // get key path
      let ref = base;
      const keyPath = [key];
      while (ref.type === 'object') {
        keyPath.unshift(ref.name);
        ref = ref.up;
      }
      const kp = keyPath.join('.');

      //
      for (const t of metaTypes) {
        ref.meta.push([kp, t]);
      }
    }

    function flatten(def, implicitMeta = true) {
      const obj = [].concat(
        implicitMeta ? def.meta : [],
        def.map(([k, t]) => [k, Array.isArray(t) ? flatten(t, implicitMeta) : t])
      );
      obj.type = def.type;
      return obj;
    }

    // read map
    const mapPath = path.join(basePath, PATH_MAPDEF);
    const mapData = fs.readFileSync(mapPath, { encoding: 'utf8' }).split(/\r?\n/);
    for (let i = 0; i < mapData.length; i++) {
      const line = mapData[i].replace(/#.*$/, '').trim();
      if (!line) continue;

      const match = line.match(/^(\S+)\s+(\S+)$/);
      if (!match) {
        console.warn(`[protocol] load - parse error: malformed line\n    at "${mapPath}", line ${i + 1}`);
        continue;
      }

      const name = match[1];
      const code = parseInt(match[2], 10);
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
      let implicitMeta = true;
      let level = 0;
      let top = definition; // pointer to current level
      top.meta = [];
      top.type = 'root';

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

        if (implicitMeta && (type === 'count' || type === 'offset')) {
          console.warn(`[protocol] load - parse warning: "count" or "offset" encountered, disabling implicit metatypes\n    at "${fullpath}", line ${i + 1}`);
          implicitMeta = false;
        }

        // check if we need to move up or down a level
        // move deeper
        if (depth > level) {
          level++;

          // sanity check
          if (depth !== level) {
            console.warn(`[protocol] load - parse warning: array nesting too deep\n    at "${fullpath}", line ${i + 1}`);
          }

          // we are defining the subfields for the last field we saw,
          // so move current level to the `type` value (2nd elem) of the last field
          top = top[top.length - 1][1];
        // move up
        } else {
          // pop the stack to match the correct depth
          while (depth < level) {
            top = top.up;
            level--;
          }
        }

        // append necessary metadata fields
        pushMetaTypes(top, key, type);

        // append the field to the current level
        if (type === 'array' || type === 'object') {
          const group = [];
          group.type = type;
          group.name = key;
          group.up = top;
          group.meta = [];
          top.push([key, group]);
        } else {
          top.push([key, type]);
        }
      }

      if (!messages.has(name)) messages.set(name, new Map());
      messages.get(name).set(version, flatten(definition, implicitMeta));

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

    const { name, version, definition } =
      this.resolveIdentifier(identifier, desiredVersion, customName);
    const displayName = (version !== '?') ? `${name}<${version}>` : name;

    // convert `reader` to a stream
    if (Buffer.isBuffer(reader)) {
      reader = new Stream.Readable(reader, 4);
    }

    // begin parsing
    const count = new Map();
    const offset = new Map();

    const parseField = ([key, type], data, keyPathBase = '') => {
      const keyPath = (keyPathBase !== '') ? `${keyPathBase}.${key}` : key;

      if (Array.isArray(type)) {
        if (type.type === 'object') {
          data[key] = {};
          for (const f of type) {
            parseField(f, data[key], keyPath);
          }
          return;
        }

        // handle array type
        const length = count.get(keyPath);
        const array = new Array(length);
        let index = 0;
        let next = offset.get(keyPath);

        while (next) {
          let pos = reader.position;
          if (pos !== next) {
            console.warn(`[protocol] parse - ${displayName}: offset mismatch for array "${keyPath}" at ${reader.position} (expected ${next})`);
            reader.seek(next);
            pos = next;
          }

          const here = reader.uint16();
          if (pos !== here) {
            throw new Error(`${displayName}.${keyPath}: cannot find next element of array at ${pos} (found value ${here})`);
          }

          next = reader.uint16();
          array[index++] = this.parse(type, null, reader, `${displayName}.${keyPath}`);

          if (next && index === length) {
            console.warn(`[protocol] parse - ${displayName}.${keyPath}: found out of bounds element ${index} (expected max ${length})`);
          }
        }

        data[key] = array;
      } else {
        // handle primitive type
        switch (type) {
          case 'count': {
            count.set(keyPath, reader.uint16());
            break;
          }

          case 'offset': {
            offset.set(keyPath, reader.uint16());
            break;
          }

          default: {
            if (offset.has(keyPath)) {
              const ofs = offset.get(keyPath);
              if (reader.position !== ofs) {
                console.warn(`[protocol] parse - ${displayName}: offset mismatch for "${keyPath}" at ${reader.position} (expected ${ofs})`);
                reader.seek(ofs);
              }
            }

            data[key] = reader[type](count.get(keyPath));
            break;
          }
        }
      }
    };

    const data = {};
    for (const field of definition) {
      parseField(field, data, []);
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

    const { name, code, version, definition } =
      this.resolveIdentifier(identifier, desiredVersion, customName);
    const displayName = (version !== '?') ? `${name}<${version}>` : name;

    // set up optional arg `writer`
    if (!writer) {
      // make sure `code` is valid
      if (code == null || code < 0) {
        throw new Error(`[protocol] write ("${name}"): invalid code "${code}"'`);
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

    const writeField = ([key, type], dataObj, keyPathBase = '') => {
      const value = dataObj[key];
      const keyPath = (keyPathBase !== '') ? `${keyPathBase}.${key}` : key;

      // `type` is array or object
      if (Array.isArray(type)) {
        if (type.type === 'object') {
          for (const field of type) {
            writeField(field, value, keyPath);
          }
          return;
        }

        if (!value) return;

        const length = value.length;
        if (length !== 0) {
          // write length in header
          const here = writer.position;
          writer.seek(count.get(keyPath));
          writer.uint16(length);
          writer.seek(here);

          // iterate elements
          let last = offset.get(keyPath);
          for (const element of value) {
            // write position in last element (or header)
            const hereElem = writer.position;
            writer.seek(last);
            writer.uint16(hereElem);
            writer.seek(hereElem);

            // write position in current element
            writer.uint16(hereElem);

            // store position pointing to next element
            last = writer.position;

            // write placeholder position
            writer.uint16(0);

            // recurse
            this.write(type, version, element, writer, `${displayName}.${keyPath}`);
          }
        }
      // `type` is primitive
      } else {
        switch (type) {
          // save position and write placeholders for count and offset
          case 'count': {
            count.set(keyPath, writer.position);
            writer.uint16(0);
            break;
          }

          case 'offset': {
            offset.set(keyPath, writer.position);
            writer.uint16(0);
            break;
          }

          // otherwise,
          default: {
            // update count
            if (count.has(keyPath)) {
              const here = writer.position;
              writer.seek(count.get(keyPath));
              writer.uint16(value.length);
              writer.seek(here);
            }

            // update offset
            if (offset.has(keyPath)) {
              const here = writer.position;
              writer.seek(offset.get(keyPath));
              writer.uint16(here);
              writer.seek(here);
            }

            // write it
            try {
              writer[type](value);
            } catch (err) {
              err.message = [
                `[protocol] write - ${displayName}: error writing "${keyPath}" (type: ${type})`,
                `data: ${util.inspect(value)}`,
                `reason: ${err.message}`,
              ].join('\n');
              throw err;
            }
          }
        }
      }
    };

    for (const field of definition) {
      writeField(field, data);
    }

    return writer.buffer;
  }

  /**
   * @returns {TeraProtocol}
   */
  // eslint-disable-next-line class-methods-use-this
  createInstance(...args) {
    return new TeraProtocol(...args);
  }
}

module.exports = new TeraProtocol();
