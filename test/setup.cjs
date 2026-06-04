const Module = require('module');
const path = require('path');

const vscodeStub = path.join(__dirname, '..', 'out-test', 'test', 'stubs', 'vscode.js');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'vscode') {
    return vscodeStub;
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};
