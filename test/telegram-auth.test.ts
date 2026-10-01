import { describe, expect, it } from "vitest";
import { validateInitData } from "../src/lib/telegram-auth";
import { BOT_TOKEN, signInitData as sign } from "./helpers";

const NOW = 1_790_000_000;
const user = { id: 42, first_name: "Pavel" };

const fields = { auth_date: String(NOW - 60), query_id: "AAE", user: JSON.stringify(user) };

describe("validateInitData", () => {
  it("accepts correctly signed data and returns the user", async () => {
    expect(await validateInitData(sign(fields), BOT_TOKEN, NOW)).toEqual(user);
  });

  it("rejects data signed with another bot token", async () => {
    expect(await validateInitData(sign(fields, "999:OTHER"), BOT_TOKEN, NOW)).toBeNull();
  });

  it("rejects tampered fields", async () => {
    const tampered = sign(fields).replace("Pavel", "Mallory");
    expect(await validateInitData(tampered, BOT_TOKEN, NOW)).toBeNull();
  });

  it("rejects data older than 24 hours", async () => {
    const old = sign({ ...fields, auth_date: String(NOW - 25 * 3600) });
    expect(await validateInitData(old, BOT_TOKEN, NOW)).toBeNull();
  });

  it("rejects data without a hash", async () => {
    expect(await validateInitData("auth_date=1&user=%7B%7D", BOT_TOKEN, NOW)).toBeNull();
  });
});
