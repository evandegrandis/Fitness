import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "./proxy";

function request(path = "/historique", cookie?: string): NextRequest {
  return new NextRequest(`https://jeera.test${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("proxy access mode", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows the app only when public mode is explicit", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JEERA_PUBLIC_MODE", "true");
    vi.stubEnv("SESSION_SECRET", "");

    expect(proxy(request()).headers.get("x-middleware-next")).toBe("1");
  });

  it("fails closed in production when neither public mode nor a secret is configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JEERA_PUBLIC_MODE", "");
    vi.stubEnv("SESSION_SECRET", "");

    const response = proxy(request());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://jeera.test/login?from=%2Fhistorique&configuration=missing"
    );
  });

  it("accepts a valid session when private mode is enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JEERA_PUBLIC_MODE", "");
    vi.stubEnv("SESSION_SECRET", "expected-secret");

    expect(
      proxy(request("/historique", "jeera_session=expected-secret")).headers.get(
        "x-middleware-next"
      )
    ).toBe("1");
  });
});
