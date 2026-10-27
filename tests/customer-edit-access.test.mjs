import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/customer-edit-access.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { editAccess, unlockToken, requestCookie, editCookieHeader } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const env = { CUSTOMER_FILE_EDIT_PASSCODE: "  cody-team-2026 " };

test("no passcode: open locally, disabled on Vercel", async () => {
  assert.equal(await editAccess(undefined, {}), "open");
  assert.equal(await editAccess(undefined, { VERCEL: "1" }), "disabled");
  assert.equal(await unlockToken("anything", {}), null);
});

test("passcode: wrong input is refused, right input unlocks, token survives the cookie round trip", async () => {
  assert.equal(await editAccess(undefined, env), "locked");
  assert.equal(await unlockToken("cody-team-2025", env), null);
  const token = await unlockToken("cody-team-2026", env);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, "cody-team-2026");
  assert.equal(await editAccess(token, env), "unlocked");
  assert.equal(await editAccess(`${token.slice(0, -1)}A`, env), "locked");
  // Changing the passcode signs every browser out.
  assert.equal(await editAccess(token, { CUSTOMER_FILE_EDIT_PASSCODE: "new-code" }), "locked");
});

test("cookie helpers", () => {
  const request = new Request("https://example.com/api/customer-sites", { headers: { cookie: "a=1; customer_file_edit=abc_-DEF; b=2" } });
  assert.equal(requestCookie(request, "customer_file_edit"), "abc_-DEF");
  assert.equal(requestCookie(request, "missing"), undefined);
  assert.match(editCookieHeader(request, "tok"), /^customer_file_edit=tok; Path=\/; HttpOnly; SameSite=Strict; Max-Age=2592000; Secure$/);
  assert.match(editCookieHeader(new Request("http://localhost:5181/"), null), /Max-Age=0$/);
});
