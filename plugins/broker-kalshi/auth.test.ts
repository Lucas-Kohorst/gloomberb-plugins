import { describe, expect, test } from "bun:test";
import { constants, generateKeyPairSync, verify } from "node:crypto";
import { kalshiAuthHeaders, signingMessage } from "./auth";

describe("signingMessage", () => {
  test("strips the query string from the signed path", () => {
    expect(signingMessage("1703123456789", "GET", "/trade-api/v2/portfolio/orders?limit=5"))
      .toBe("1703123456789GET/trade-api/v2/portfolio/orders");
  });
});

describe("kalshiAuthHeaders", () => {
  test("RSA-PSS SHA-256 signature verifies against the signing message", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const timestamp = "1703123456789";
    const method = "GET";
    const path = "/trade-api/v2/portfolio/orders?limit=5";
    const headers = kalshiAuthHeaders("test-key-id", pem, method, path, timestamp);

    expect(headers["KALSHI-ACCESS-KEY"]).toBe("test-key-id");
    expect(headers["KALSHI-ACCESS-TIMESTAMP"]).toBe(timestamp);
    expect(headers["KALSHI-ACCESS-SIGNATURE"]).toBeTruthy();

    const ok = verify(
      "sha256",
      Buffer.from(signingMessage(timestamp, method, path)),
      {
        key: publicKey,
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
      },
      Buffer.from(headers["KALSHI-ACCESS-SIGNATURE"]!, "base64"),
    );
    expect(ok).toBe(true);
  });
});
