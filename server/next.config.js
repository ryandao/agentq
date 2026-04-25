/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    transpilePackages: ["@agentq/infra"],
};

module.exports = nextConfig;
