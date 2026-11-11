import { describe, it } from "vitest";
import assert from "node:assert/strict";
import {
  OWNER_EMAIL,
  isOwnerEmail,
  canActivateOwner,
  sendOwnerAccess,
  activateVerifiedOwner,
} from "@/lib/owner.server";

const now = 1_800_000_000_000;
const owner = {
  id: "owner-id",
  email: OWNER_EMAIL,
  email_confirmed_at: "2026-11-11T00:00:00Z",
  app_metadata: {},
};
const proof = (method = "invite", timestamp = now / 1000) => ({
  sub: owner.id,
  email: OWNER_EMAIL,
  amr: [{ method, timestamp }],
});

type FakeOptions = {
  user?: typeof owner | null;
  inviteCode?: string;
  otpError?: boolean;
  userError?: boolean;
  markError?: boolean;
  profileError?: boolean;
  missingProfile?: boolean;
  roleError?: boolean;
};
function fakeClient(options: FakeOptions = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
  };
  const client = {
    auth: {
      admin: {
        inviteUserByEmail: async (...args: unknown[]) => {
          record("invite", ...args);
          return { error: options.inviteCode ? { code: options.inviteCode } : null };
        },
        getUserById: async (...args: unknown[]) => {
          record("getUser", ...args);
          return {
            data: { user: options.user === undefined ? owner : options.user },
            error: options.userError ? new Error("Auth unavailable") : null,
          };
        },
        updateUserById: async (...args: unknown[]) => {
          record("mark", ...args);
          return { error: options.markError ? new Error("Cannot mark") : null };
        },
      },
      signInWithOtp: async (...args: unknown[]) => {
        record("otp", ...args);
        return { error: options.otpError ? new Error("Mail unavailable") : null };
      },
    },
    from: (table: string) => {
      const query = {
        update: (payload: unknown) => {
          record(table + ".update", payload);
          return query;
        },
        eq: (...args: unknown[]) => {
          record(table + ".eq", ...args);
          return query;
        },
        select: () => query,
        single: async () => ({
          data: options.missingProfile ? null : { id: owner.id },
          error: options.profileError ? new Error("Cannot update") : null,
        }),
        upsert: async (...args: unknown[]) => {
          record(table + ".upsert", ...args);
          return { error: options.roleError ? new Error("Cannot grant") : null };
        },
      };
      return query;
    },
  };
  return { client: client as unknown as Parameters<typeof sendOwnerAccess>[0], calls };
}

describe("Owner identity policy", () => {
  it("accepts only the configured address, ignoring case and surrounding spaces", () => {
    assert.equal(isOwnerEmail("  " + OWNER_EMAIL.toUpperCase() + "  "), true);
    for (const invalid of [undefined, null, "", OWNER_EMAIL + ".evil", "student@example.com"])
      assert.equal(isOwnerEmail(invalid), false);
  });
  it("rejects an unconfirmed identity even with an email-link claim", () => {
    assert.equal(
      canActivateOwner({ id: owner.id, email: owner.email, app_metadata: {} }, proof(), now),
      false,
    );
  });
  it("rejects mismatched authenticated subjects and email addresses", () => {
    assert.equal(canActivateOwner(owner, { ...proof(), sub: "another-user" }, now), false);
    assert.equal(canActivateOwner(owner, { ...proof(), email: "student@example.com" }, now), false);
    assert.equal(canActivateOwner({ ...owner, email: "student@example.com" }, proof(), now), false);
  });
  it("does not treat an auto-confirmed password login as mailbox ownership", () => {
    assert.equal(canActivateOwner(owner, proof("password"), now), false);
  });
  it("accepts recent email invitation, recovery, magic-link and email OTP proofs", () => {
    for (const method of [
      "invite",
      "recovery",
      "magiclink",
      "email/signup",
      "email_change",
      "otp",
    ]) {
      assert.equal(canActivateOwner(owner, proof(method), now), true, method);
    }
  });
  it("rejects expired, future and malformed proof timestamps", () => {
    for (const timestamp of [now / 1000 - 901, now / 1000 + 31, Infinity, NaN]) {
      assert.equal(canActivateOwner(owner, proof("invite", timestamp), now), false);
    }
    assert.equal(
      canActivateOwner(
        owner,
        { ...proof(), amr: [{ method: "invite", timestamp: "1800000000" }] },
        now,
      ),
      false,
    );
  });
  it("does not accept a phone OTP as proof of mailbox ownership", () => {
    assert.equal(canActivateOwner({ ...owner, phone: "+5511999999999" }, proof("otp"), now), false);
    assert.equal(canActivateOwner(owner, { ...proof("otp"), phone: "+5511999999999" }, now), false);
  });
  it("denies malformed or absent authentication-method claims", () => {
    for (const amr of [undefined, null, {}, [], [null], [1], [{ method: "password" }]]) {
      assert.equal(canActivateOwner(owner, { ...proof(), amr }, now), false);
    }
  });
  it("preserves subsequent logins only after a server-protected verification marker", () => {
    const verified = { ...owner, app_metadata: { a_ordem_verified_owner_email: OWNER_EMAIL } };
    assert.equal(canActivateOwner(verified, proof("password"), now), true);
    assert.equal(
      canActivateOwner({ ...verified, email: "student@example.com" }, proof("password"), now),
      false,
    );
  });
});

describe("Owner invitation", () => {
  it("refuses other email addresses before any auth or database operation", async () => {
    const f = fakeClient();
    await assert.rejects(
      sendOwnerAccess(f.client, { name: "Someone", email: "student@example.com" }),
      /não está autorizado/,
    );
    assert.deepEqual(f.calls, []);
  });
  it("sends an invitation without creating a password or assigning admin permissions", async () => {
    const f = fakeClient();
    assert.deepEqual(await sendOwnerAccess(f.client, { name: "Carlos", email: OWNER_EMAIL }), {
      verificationRequired: true,
    });
    assert.deepEqual(f.calls, [
      { method: "invite", args: [OWNER_EMAIL, { data: { full_name: "Carlos" } }] },
    ]);
  });
  it("sends a fresh link to an existing account without overwriting its password", async () => {
    const f = fakeClient({ inviteCode: "email_exists" });
    await sendOwnerAccess(f.client, { name: "Carlos", email: OWNER_EMAIL });
    assert.deepEqual(
      f.calls.map((c) => c.method),
      ["invite", "otp"],
    );
    assert.deepEqual(f.calls[1]?.args, [
      { email: OWNER_EMAIL, options: { shouldCreateUser: false } },
    ]);
  });
  it("does not bypass auth rate limits or SMTP failures", async () => {
    const f = fakeClient({ inviteCode: "over_email_send_rate_limit" });
    await assert.rejects(sendOwnerAccess(f.client, { name: "Carlos", email: OWNER_EMAIL }));
    assert.deepEqual(
      f.calls.map((c) => c.method),
      ["invite"],
    );
  });
  it("reports a failed email delivery request rather than claiming success", async () => {
    const f = fakeClient({ inviteCode: "user_already_exists", otpError: true });
    await assert.rejects(sendOwnerAccess(f.client, { name: "Carlos", email: OWNER_EMAIL }));
  });
});

describe("Owner role activation", () => {
  it("does not modify ordinary mentor accounts", async () => {
    const f = fakeClient();
    assert.deepEqual(
      await activateVerifiedOwner(f.client, "student-id", {
        sub: "student-id",
        email: "student@example.com",
      }),
      { activated: false },
    );
    assert.deepEqual(f.calls, []);
  });
  it("refuses activation if Auth cannot validate the authenticated user", async () => {
    for (const options of [
      { userError: true },
      { user: null },
      { user: { ...owner, id: "different-id" } },
    ]) {
      const f = fakeClient(options);
      await assert.rejects(activateVerifiedOwner(f.client, owner.id, proof()));
      assert.deepEqual(
        f.calls.map((c) => c.method),
        ["getUser"],
      );
    }
  });
  it("does not trust a JWT email when the Auth account has changed email", async () => {
    const f = fakeClient({ user: { ...owner, email: "student@example.com" } });
    assert.deepEqual(await activateVerifiedOwner(f.client, owner.id, proof()), {
      activated: false,
    });
    assert.deepEqual(
      f.calls.map((c) => c.method),
      ["getUser"],
    );
  });
  it("refuses a password-only first activation without any writes", async () => {
    const f = fakeClient();
    await assert.rejects(
      activateVerifiedOwner(f.client, owner.id, proof("password", Date.now() / 1000)),
      /Confirme seu e-mail/,
    );
    assert.deepEqual(
      f.calls.map((c) => c.method),
      ["getUser"],
    );
  });
  it("grants admin only to the current verified subject using an idempotent upsert", async () => {
    const f = fakeClient();
    assert.deepEqual(
      await activateVerifiedOwner(f.client, owner.id, proof("invite", Date.now() / 1000)),
      { activated: true },
    );
    assert.deepEqual(
      f.calls.map((c) => c.method),
      ["getUser", "mark", "profiles.update", "profiles.eq", "user_roles.upsert"],
    );
    assert.deepEqual(f.calls.at(-1)?.args, [
      { user_id: owner.id, role: "admin" },
      { onConflict: "user_id,role" },
    ]);
  });
  it("does not grant a role if verification metadata or profile writes fail", async () => {
    for (const options of [{ markError: true }, { profileError: true }, { missingProfile: true }]) {
      const f = fakeClient(options);
      await assert.rejects(
        activateVerifiedOwner(f.client, owner.id, proof("invite", Date.now() / 1000)),
      );
      assert.equal(
        f.calls.some((c) => c.method === "user_roles.upsert"),
        false,
      );
    }
  });
  it("reports database role-write failures", async () => {
    const f = fakeClient({ roleError: true });
    await assert.rejects(
      activateVerifiedOwner(f.client, owner.id, proof("invite", Date.now() / 1000)),
      /permissão administrativa/,
    );
  });
});
