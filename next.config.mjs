/** @type {import('next').NextConfig} */
const nextConfig = {
  // The agent makes Anthropic/OpenAI/Supabase calls only from server code
  // (route handlers, server actions). Never from client components.
  // agentmail lazily imports an optional @x402/fetch (payment add-on we don't
  // use); externalizing keeps webpack from trying to bundle that path.
  serverExternalPackages: ["@anthropic-ai/sdk", "openai", "agentmail", "svix"],
};

export default nextConfig;
