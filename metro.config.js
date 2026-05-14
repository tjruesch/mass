const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow importing .sql migration files as text via babel-plugin-inline-import.
config.resolver.sourceExts.push('sql');

module.exports = config;
