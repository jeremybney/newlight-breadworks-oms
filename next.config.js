/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Prevent Node-only modules from being bundled for the browser
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^(undici|node-fetch|whatwg-fetch)$/,
        })
      )
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
      }
    }
    // Exclude firebase server-only auth from client bundle
    config.externals = config.externals || []
    if (isServer) {
      config.externals.push('undici')
    }
    return config
  },
}

module.exports = nextConfig
