import { constants, createPrivateKey, sign } from "node:crypto";

export function signingMessage(
  timestampMs: string | number,
  method: string,
  pathWithOptionalQuery: string,
): string {
  const path = pathWithOptionalQuery.split("?")[0] ?? pathWithOptionalQuery;
  return `${timestampMs}${method}${path}`;
}

export function signKalshiRequest(
  privateKeyPem: string,
  timestampMs: string | number,
  method: string,
  pathWithOptionalQuery: string,
): string {
  const message = signingMessage(timestampMs, method, pathWithOptionalQuery);
  const key = createPrivateKey(privateKeyPem);
  const signature = sign("sha256", Buffer.from(message), {
    key,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return signature.toString("base64");
}

export function kalshiAuthHeaders(
  keyId: string,
  privateKeyPem: string,
  method: string,
  pathWithOptionalQuery: string,
  timestampMs = String(Date.now()),
): Record<string, string> {
  return {
    "KALSHI-ACCESS-KEY": keyId,
    "KALSHI-ACCESS-TIMESTAMP": String(timestampMs),
    "KALSHI-ACCESS-SIGNATURE": signKalshiRequest(
      privateKeyPem,
      timestampMs,
      method,
      pathWithOptionalQuery,
    ),
  };
}
