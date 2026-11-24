const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@hydrosense/shared': path.resolve(workspaceRoot, 'packages/shared'),
};

const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolved = (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
  // The tslib wrapper imports CommonJS as a default, which Metro can resolve as undefined on web.
  if (moduleName === 'tslib' && resolved.type === 'sourceFile' &&
      resolved.filePath.endsWith(path.join('tslib', 'modules', 'index.js'))) {
    return { type: 'sourceFile', filePath: path.resolve(path.dirname(resolved.filePath), '../tslib.es6.js') };
  }
  return resolved;
};

module.exports = config;
