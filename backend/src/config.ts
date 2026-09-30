import dotenv from "dotenv";
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  rpcUrl: requireEnv("RPC_URL"),
  contractAddress: requireEnv("CONTRACT_ADDRESS"),
  privateKey: requireEnv("PRIVATE_KEY"),
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
};