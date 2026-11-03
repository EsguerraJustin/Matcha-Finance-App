// Metro configuration
//
// The only deviation from Expo's default config: treat `.wasm` as an asset so
// `expo-sqlite`'s web worker can bundle wa-sqlite. Not used by the Android
// build; enables `expo export --platform web` for local visual testing only.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

module.exports = config;
