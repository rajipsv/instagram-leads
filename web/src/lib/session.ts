/** Shared by middleware (edge) and the login action. */
export const COOKIE = "gi_session";

export async function sessionToken(password: string) {
  const data = new TextEncoder().encode(`growth-intelligence:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
