import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedSender } from "./auth";

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("isAllowedSender allows the primary TELEGRAM_USER_ID", () => {
  withEnv({ TELEGRAM_USER_ID: "111", TESTER_TELEGRAM_USER_ID: undefined }, () => {
    assert.equal(isAllowedSender(111), true);
    assert.equal(isAllowedSender("111"), true);
    assert.equal(isAllowedSender(999), false);
  });
});

test("isAllowedSender allows the tester ID only when TESTER_TELEGRAM_USER_ID is set", () => {
  withEnv({ TELEGRAM_USER_ID: "111", TESTER_TELEGRAM_USER_ID: "222" }, () => {
    assert.equal(isAllowedSender(111), true);
    assert.equal(isAllowedSender(222), true);
    assert.equal(isAllowedSender(333), false);
  });
});

test("isAllowedSender revokes the tester the moment the env var is unset — no code change needed", () => {
  withEnv({ TELEGRAM_USER_ID: "111", TESTER_TELEGRAM_USER_ID: "222" }, () => {
    assert.equal(isAllowedSender(222), true);
  });
  withEnv({ TELEGRAM_USER_ID: "111", TESTER_TELEGRAM_USER_ID: undefined }, () => {
    assert.equal(isAllowedSender(222), false);
    assert.equal(isAllowedSender(111), true);
  });
});

test("isAllowedSender rejects everything when no allowlist is configured", () => {
  withEnv({ TELEGRAM_USER_ID: undefined, TESTER_TELEGRAM_USER_ID: undefined }, () => {
    assert.equal(isAllowedSender(111), false);
    assert.equal(isAllowedSender(undefined), false);
  });
});

test("isAllowedSender rejects an undefined sender id even with a configured allowlist", () => {
  withEnv({ TELEGRAM_USER_ID: "111" }, () => {
    assert.equal(isAllowedSender(undefined), false);
  });
});
