// Server-only: Amazon SES v2 client (SigV4 via aws4fetch) and SMTP password derivation.
import { AwsClient } from "aws4fetch";

export type SesCreds = { access_key_id: string; secret_access_key: string; region: string };

export function sesClient(c: SesCreds) {
  const region = c.region || "us-east-1";
  const aws = new AwsClient({ accessKeyId: c.access_key_id, secretAccessKey: c.secret_access_key, region, service: "ses" });
  const base = `https://email.${region}.amazonaws.com`;
  return async function call<T = any>(method: string, path: string, body?: unknown): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await aws.fetch(base + path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 300);
      try { const j = JSON.parse(text); msg = j.message ?? j.Message ?? msg; } catch { /* keep text */ }
      throw new Error(`Amazon SES ${res.status}: ${msg}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  };
}

async function hmac(key: ArrayBuffer | Uint8Array, msg: string) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
/** AWS-documented algorithm converting an IAM secret key into an SES SMTP password. */
export async function sesSmtpPassword(secret: string, region: string) {
  let sig = await hmac(new TextEncoder().encode("AWS4" + secret), "11111111");
  for (const part of [region, "ses", "aws4_request", "SendRawEmail"]) sig = await hmac(sig, part);
  const out = new Uint8Array(sig.length + 1); out[0] = 0x04; out.set(sig, 1);
  return btoa(String.fromCharCode(...out));
}
