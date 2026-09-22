const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
module.exports = function loader(mocks = {}) {
  const cache = {};
  function load(filename) {
    const file = path.resolve(filename);
    if (Object.hasOwn(mocks, file)) return mocks[file];
    if (cache[file]) return cache[file].exports;
    const module = { exports: {} }; cache[file] = module;
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('require', 'module', 'exports', source)((id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/')) id = path.resolve('src', id.slice(2));
      else if (id.startsWith('.')) id = path.resolve(path.dirname(file), id);
      else return require(id);
      return load(path.extname(id) ? id : `${id}.ts`);
    }, module, module.exports);
    return module.exports;
  }
  return load;
};
