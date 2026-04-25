const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    transpilePackages: ["@agentq/infra"],
    webpack: (config) => {
        // Ensure modules imported from @agentq/infra (transpiled source) can
        // resolve peer dependencies from the server's node_modules.
        config.resolve.modules = [
            path.resolve(__dirname, "node_modules"),
            ...(config.resolve.modules || ["node_modules"]),
        ];
        return config;
    },
};

module.exports = nextConfig;
