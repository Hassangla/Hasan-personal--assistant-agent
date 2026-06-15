/** @type {import('next').NextConfig} */
const nextConfig = {
  // The agent makes Anthropic/OpenAI/Supabase calls only from server code
  // (route handlers, server actions). Never from client components.
  serverExternalPackages: ["@anthropic-ai/sdk", "openai"],
};

export default nextConfig;
