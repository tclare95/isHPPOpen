import "server-only";
import { RdpError } from "./errors.js";

export const RDP_STAGING_API_URL = "https://jfwpvzs8ig.execute-api.eu-west-1.amazonaws.com/staging";
export const RDP_SOURCE_KEYS = Object.freeze([
  "RDP_TRENT_SOURCE", "RDP_LEVELS_SOURCE", "RDP_GAUGE_ALERTS_SOURCE",
]);

export function getRdpSourceModes(env = process.env) {
  return Object.fromEntries(RDP_SOURCE_KEYS.map((key) => {
    const mode = env[key] ?? "legacy";
    if (!["legacy", "shadow", "rdp"].includes(mode)) throw new RdpError("CONFIGURATION_ERROR");
    return [key, mode];
  }));
}

export function getRdpConfig(env = process.env) {
  const sources = getRdpSourceModes(env);
  const stage = { preview: "staging", production: "production" }[env.VERCEL_ENV];
  if (!stage || env.RDP_AWS_REGION !== "eu-west-1") throw new RdpError("CONFIGURATION_ERROR");

  const roleArn = `arn:aws:iam::080812383734:role/river-data-platform-${stage}-vercel-${env.VERCEL_ENV}`;
  const apiUrl = env.RDP_API_URL;
  // Exact AWS origin/path only: no userinfo, ports, query, fragment or alternate hosts.
  if (env.RDP_ROLE_ARN !== roleArn || typeof apiUrl !== "string" ||
      !new RegExp(`^https://[a-z0-9]{1,32}\\.execute-api\\.eu-west-1\\.amazonaws\\.com/${stage}$`).test(apiUrl) ||
      (stage === "staging" && apiUrl !== RDP_STAGING_API_URL) ||
      (stage === "production" && new URL(apiUrl).hostname === new URL(RDP_STAGING_API_URL).hostname)) {
    throw new RdpError("CONFIGURATION_ERROR");
  }
  return Object.freeze({ apiUrl, roleArn, region: "eu-west-1", stage, sources: Object.freeze(sources) });
}
