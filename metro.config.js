const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web runs SQLite as WebAssembly inside a worker. Metro has to
// know .wasm is an asset, and the page has to be cross origin isolated so the
// worker may use SharedArrayBuffer. Phones need none of this.
// See https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/ (Web setup).
config.resolver.assetExts.push('wasm');

config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    if (req.url === '/' || req.url === '/index.html') {
      // credentialless rather than require-corp, so the Mapbox tiles and
      // Supabase requests still load without their own CORP headers.
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }
    return middleware(req, res, next);
  };
};

module.exports = config;
