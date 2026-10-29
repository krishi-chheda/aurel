// Pull the zero-dependency shared package (../../packages/shared) into the bundle.
// It is not an npm workspace, so Metro needs to be told to watch and resolve it.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const shared = path.resolve(__dirname, "../../packages/shared");

config.watchFolders = [...(config.watchFolders ?? []), shared];
config.resolver.extraNodeModules = { ...(config.resolver.extraNodeModules ?? {}), "@aurel/shared": path.join(shared, "src") };

module.exports = config;
