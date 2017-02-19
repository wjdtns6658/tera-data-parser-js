// requires
var fs = require('fs');
var path = require('path');

// constants
var PATH_MAP = path.join(__dirname, '../../../map/sysmsg.map');

// exports
var _module = module.exports = {
  map: { name: {}, code: {} },

  load: function load(filepath) {
    if (!filepath) filepath = PATH_MAP;

    var i, len;

    // reset map and messages
    var map = _module.map = { name: {}, code: {} };

    // read map
    var data = fs.readFileSync(filepath, { encoding: 'utf8' }).split(/\r?\n/);
    for (i = 0, len = data.length; i < len; i++) {
      // clean line
      var line = data[i].trim();
      if (line === '') continue;

      // match syntax
      var match = line.match(/^(\w+)\s+(\d+)$/);
      if (!match) {
        console.log(line);
        console.error('parse error: malformed line (%s:%d)', filepath, i + 1);
        return false;
      }

      // parse line
      var name = match[1];
      var code = parseInt(match[2]);
      if (isNaN(code)) {
        console.error('parse error: non-numeric id (%s:%d)', filepath, i + 1);
        return false;
      }

      // update mapping
      map.name[name] = code;
      map.code[code] = name;
    }
  }
};

_module.load(path.join(require.resolve('tera-data'), '../map/sysmsg.map'));
