import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LEN = 64;
const SCRYPT_OPTIONS = { N: 1 << 15, r: 8, p: 1 } as const;
/** scrypt 内存上限：128 * N * r = 32MB，显式放宽到 64MB 避免运行环境默认限制 */
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function deriveKey(
  password: string | Buffer,
  salt: string | Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LEN,
      { ...SCRYPT_OPTIONS, maxmem: SCRYPT_MAXMEM },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      },
    );
  });
}

export interface PasswordHash {
  /** 版本标记，便于未来升级算法 */
  version: 1;
  algorithm: "scrypt";
  salt: string;
  hash: string;
}

function encodeBase64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = padded.length % 4;
  const full = remainder === 0 ? padded : padded + "=".repeat(4 - remainder);
  return Buffer.from(full, "base64");
}

/**
 * 使用 scrypt 派生密码哈希。返回格式：v1:scrypt:<saltBase64url>:<hashBase64url>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt);
  const record: PasswordHash = {
    version: 1,
    algorithm: "scrypt",
    salt: encodeBase64Url(salt),
    hash: encodeBase64Url(derived),
  };
  return `v1:scrypt:${record.salt}:${record.hash}`;
}

/**
 * 校验密码是否与哈希匹配。
 * 对不存在的账号也执行一次虚校验，避免通过响应时间差枚举账号。
 */
export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (!storedHash) {
    await hashPassword(password);
    return false;
  }
  const parts = storedHash.split(":");
  if (parts.length !== 4 || parts[0] !== "v1" || parts[1] !== "scrypt") {
    await hashPassword(password);
    return false;
  }
  const [, , saltPart = "", hashPart = ""] = parts;
  const salt = decodeBase64Url(saltPart);
  const expected = decodeBase64Url(hashPart);
  const derived = await deriveKey(password, salt);
  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
}

export interface JwtPayload {
  sub: string;
  username: string;
  employeeId: string;
  organizationId: string;
  /** 签发时间（Unix 秒） */
  iat: number;
  /** 过期时间（Unix 秒） */
  exp: number;
  /** 唯一 jti，便于吊销追踪 */
  jti: string;
}

function sign(input: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

/**
 * 签发 HS256 JWT（零依赖实现，遵循 RFC 7519）。
 */
export function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp" | "jti"> & { exp: number },
  secret: string,
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = encodeBase64Url(Buffer.from(JSON.stringify(header)));
  const now = Math.floor(Date.now() / 1000);
  const bodyB64 = encodeBase64Url(
    Buffer.from(JSON.stringify({ ...payload, iat: now, jti: randomBytes(16).toString("hex") })),
  );
  const input = `${headerB64}.${bodyB64}`;
  const signature = sign(input, Buffer.from(secret, "utf8"));
  return `${input}.${signature}`;
}

/**
 * 校验 JWT 签名、过期时间与算法。返回 payload；无效或过期返回 null。
 */
export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64 = "", bodyB64 = "", signature = ""] = parts;
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(decodeBase64Url(headerB64).toString("utf8")) as {
      alg?: string;
      typ?: string;
    };
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;

  const expected = sign(`${headerB64}.${bodyB64}`, Buffer.from(secret, "utf8"));
  const provided = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (
    provided.length !== expectedBuffer.length ||
    !timingSafeEqual(provided, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(bodyB64).toString("utf8")) as JwtPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
