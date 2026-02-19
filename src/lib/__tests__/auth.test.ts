// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";

// Mock server-only so it does not throw outside a server environment
vi.mock("server-only", () => ({}));

const JWT_SECRET = new TextEncoder().encode("development-secret-key");
const COOKIE_NAME = "auth-token";

// Factory to create a signed token with the given payload and expiry
async function makeToken(
  payload: Record<string, unknown>,
  expiresIn = "7d"
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

// Helper to mock next/headers cookies() with a specific token value
function mockCookies(token: string | undefined) {
  vi.doMock("next/headers", () => ({
    cookies: () =>
      Promise.resolve({
        get: (name: string) =>
          name === COOKIE_NAME && token ? { value: token } : undefined,
      }),
  }));
}

beforeEach(() => {
  vi.resetModules();
});

describe("getSession", () => {
  test("returns null when auth-token cookie is absent", async () => {
    mockCookies(undefined);
    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns null when token is malformed", async () => {
    mockCookies("not.a.valid.jwt");
    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns null when token is expired", async () => {
    const token = await makeToken(
      { userId: "user-1", email: "a@b.com", expiresAt: new Date() },
      "-1s" // already expired
    );
    mockCookies(token);
    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns session payload when token is valid", async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const token = await makeToken({
      userId: "user-123",
      email: "test@example.com",
      expiresAt: expiresAt.toISOString(),
    });
    mockCookies(token);
    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user-123");
    expect(session?.email).toBe("test@example.com");
  });

  test("returns null when token is signed with a different secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret");
    const token = await new SignJWT({ userId: "user-1", email: "a@b.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(wrongSecret);
    mockCookies(token);
    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    expect(session).toBeNull();
  });
});
