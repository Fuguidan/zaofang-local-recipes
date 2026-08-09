import assert from "node:assert/strict";
import test from "node:test";
import { shouldStoreLog } from "../app/lib/logger.ts";

test("keeps requested token usage info logs in production without debug mode", () => {
  assert.equal(shouldStoreLog("info", false, true, true), true);
  assert.equal(shouldStoreLog("info", false, true, false), false);
});

test("always keeps warnings and errors", () => {
  assert.equal(shouldStoreLog("warn", false, true, false), true);
  assert.equal(shouldStoreLog("error", false, true, false), true);
});
