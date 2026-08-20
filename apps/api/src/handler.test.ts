import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { createHandler } from "./handler.js";

type Item = Record<string, unknown> & { PK: string; SK: string };

class MemoryDb {
  items = new Map<string, Item>();

  seed(...items: Item[]) {
    for (const item of items) this.items.set(this.key(item.PK, item.SK), structuredClone(item));
  }

  async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
    const input = command.input as {
      Key?: { PK: string; SK: string };
      Item?: Item;
      UpdateExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      IndexName?: string;
      ExpressionAttributeValues?: Record<string, unknown>;
      ConditionExpression?: string;
      TransactItems?: Array<{ Put?: { Item: Item }; Delete?: { Key: { PK: string; SK: string } } }>;
      ExclusiveStartKey?: { PK: string; SK: string };
      Limit?: number;
      ScanIndexForward?: boolean;
    };

    if (command.constructor.name === "PutCommand") {
      if (!input.Item) throw new Error("PutCommand Item is required");
      const key = this.key(input.Item.PK, input.Item.SK);
      if (input.ConditionExpression === "attribute_not_exists(PK)" && this.items.has(key)) {
        throw Object.assign(new Error("Conditional check failed"), { name: "ConditionalCheckFailedException" });
      }
      if (input.ConditionExpression?.includes("#status = :pending")) {
        const current = this.items.get(key);
        const values = input.ExpressionAttributeValues ?? {};
        if (current && current.status !== undefined && current.status !== "pending") throw Object.assign(new Error("Conditional check failed"), { name: "ConditionalCheckFailedException" });
        if (current && current.executionVersion !== undefined && current.executionVersion !== values[":executionVersion"]) throw Object.assign(new Error("Conditional check failed"), { name: "ConditionalCheckFailedException" });
      }
      this.items.set(key, structuredClone(input.Item));
      return {};
    }

    if (command.constructor.name === "GetCommand") {
      if (!input.Key) throw new Error("GetCommand Key is required");
      return { Item: this.items.get(this.key(input.Key.PK, input.Key.SK)) };
    }

    if (command.constructor.name === "DeleteCommand") {
      if (!input.Key) throw new Error("DeleteCommand Key is required");
      this.items.delete(this.key(input.Key.PK, input.Key.SK));
      return {};
    }

    if (command.constructor.name === "UpdateCommand") {
      if (!input.Key) throw new Error("UpdateCommand Key is required");
      const key = this.key(input.Key.PK, input.Key.SK);
      const current = this.items.get(key);
      const values = input.ExpressionAttributeValues ?? {};
      if (!current || (current.executionVersion !== undefined && current.executionVersion !== values[":expectedVersion"])) {
        throw Object.assign(new Error("Conditional check failed"), { name: "ConditionalCheckFailedException" });
      }
      this.items.set(key, structuredClone({
        ...current,
        status: values[":status"],
        result: values[":result"],
        startedAt: values[":startedAt"],
        completedAt: values[":completedAt"],
        skippedAt: values[":skippedAt"],
        executionUpdatedAt: values[":executionUpdatedAt"],
        executionVersion: values[":nextVersion"],
        lastMutationId: values[":mutationId"],
        updatedAt: values[":updatedAt"],
      } as Item));
      return {};
    }

    if (command.constructor.name === "TransactWriteCommand") {
      const transactItems = input.TransactItems ?? [];
      for (const operation of transactItems) {
        if (operation.Put) this.items.set(this.key(operation.Put.Item.PK, operation.Put.Item.SK), structuredClone(operation.Put.Item));
        if (operation.Delete) this.items.delete(this.key(operation.Delete.Key.PK, operation.Delete.Key.SK));
      }
      return {};
    }

    if (command.constructor.name === "QueryCommand") {
      const values = input.ExpressionAttributeValues ?? {};
      const items = [...this.items.values()];
      if (input.IndexName === "GSI1") {
        return { Items: items.filter((item) => item.GSI1PK === values[":email"]) };
      }
      if (values[":athlete"]) {
        return { Items: items.filter((item) => item.PK === values[":pk"] && item.SK.startsWith(String(values[":athlete"]))) };
      }
      let matches = items
        .filter((item) => item.PK === values[":pk"] && item.SK >= String(values[":from"]) && item.SK <= String(values[":to"]))
        .sort((a, b) => a.SK.localeCompare(b.SK));
      if (input.ScanIndexForward === false) matches.reverse();
      if (input.ExclusiveStartKey) {
        const startIndex = matches.findIndex((item) => item.PK === input.ExclusiveStartKey?.PK && item.SK === input.ExclusiveStartKey?.SK);
        if (startIndex >= 0) matches = matches.slice(startIndex + 1);
      }
      const page = input.Limit ? matches.slice(0, input.Limit) : matches;
      return {
        Items: page,
        LastEvaluatedKey: input.Limit && matches.length > input.Limit
          ? { PK: page.at(-1)?.PK, SK: page.at(-1)?.SK }
          : undefined,
      };
    }

    throw new Error(`Unsupported command ${command.constructor.name}`);
  }

  get(pk: string, sk: string) {
    return this.items.get(this.key(pk, sk));
  }

  private key(pk: string, sk: string) {
    return `${pk}|${sk}`;
  }
}

const coach = { sub: "coach-1", email: "Coach@Example.com", name: "Coach", "custom:role": "coach" };
const athlete = { sub: "athlete-1", email: "athlete@example.com", name: "Athlete", "custom:role": "athlete" };

function event(
  method: string,
  rawPath: string,
  claims: Record<string, string>,
  options: { body?: unknown; query?: Record<string, string> } = {},
) {
  return {
    rawPath,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    queryStringParameters: options.query,
    requestContext: {
      http: { method },
      authorizer: { jwt: { claims } },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

async function invoke(db: MemoryDb, request: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const result = await createHandler(db)(request, {} as never, () => undefined) as APIGatewayProxyStructuredResultV2;
  assert(result);
  return {
    statusCode: result.statusCode,
    headers: result.headers,
    body: result.body,
    json: result.body ? JSON.parse(result.body) : undefined,
  };
}

describe("PlanUp API handler", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = new MemoryDb();
  });

  it("upserts and returns the authenticated profile", async () => {
    const result = await invoke(db, event("GET", "/me", coach));

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.json, { id: "coach-1", email: "coach@example.com", name: "Coach", role: "coach" });
    assert.equal(db.get("USER#coach-1", "PROFILE")?.GSI1PK, "EMAIL#coach@example.com");
  });

  it("invites an athlete and links both sides only after acceptance", async () => {
    db.seed({
      PK: "USER#athlete-1",
      SK: "PROFILE",
      entityType: "USER",
      id: "athlete-1",
      email: "athlete@example.com",
      name: "Athlete",
      role: "athlete",
      GSI1PK: "EMAIL#athlete@example.com",
      GSI1SK: "USER#athlete-1",
    });

    const invitation = await invoke(db, event("POST", "/athletes", coach, { body: { email: "ATHLETE@example.com" } }));

    assert.equal(invitation.statusCode, 202);
    assert.deepEqual(invitation.json.coach, { id: "coach-1", name: "Coach", email: "coach@example.com" });
    assert.equal(db.get("COACH#coach-1", "ATHLETE#athlete-1"), undefined);

    const pending = await invoke(db, event("GET", "/coach-invitations", athlete));
    assert.equal(pending.json.length, 1);

    const accepted = await invoke(db, event("POST", "/coach-invitations/coach-1/accept", athlete));
    assert.equal(accepted.statusCode, 200);
    assert.equal(db.get("COACH#coach-1", "ATHLETE#athlete-1")?.entityType, "COACH_ATHLETE");
    assert.equal(db.get("ATHLETE#athlete-1", "COACH#coach-1")?.entityType, "ATHLETE_COACH");

    const coaches = await invoke(db, event("GET", "/coaches", athlete));
    assert.deepEqual(coaches.json, [{ id: "coach-1", name: "Coach", email: "coach@example.com" }]);
  });

  it("allows an athlete to reject a coach invitation", async () => {
    db.seed({
      PK: "ATHLETE#athlete-1", SK: "INVITATION#coach-1", entityType: "COACH_INVITATION",
      athleteId: "athlete-1", coachId: "coach-1", name: "Coach", email: "coach@example.com",
    });

    const rejected = await invoke(db, event("POST", "/coach-invitations/coach-1/reject", athlete));

    assert.equal(rejected.statusCode, 204);
    assert.equal(db.get("ATHLETE#athlete-1", "INVITATION#coach-1"), undefined);
    assert.equal(db.get("COACH#coach-1", "ATHLETE#athlete-1"), undefined);
  });

  it("blocks athletes from coach-only routes", async () => {
    const result = await invoke(db, event("GET", "/athletes", athlete));

    assert.equal(result.statusCode, 403);
    assert.equal(result.json.message, "Only coaches have an athlete list");
  });

  it("creates and lists the complete coach planning library", async () => {
    const createResult = await invoke(db, event("POST", "/coach-sessions", coach, {
      body: { date: "2026-08-18", title: "Fuerza y AMRAP", content: "==warmup\nMove\n\n==wod\nTrain" },
    }));

    assert.equal(createResult.statusCode, 201);
    assert.match(createResult.json.id, /^[0-9a-f-]{36}$/);

    const listResult = await invoke(db, event("GET", "/coach-sessions", coach));

    assert.equal(listResult.statusCode, 200);
    assert.equal(listResult.json.items.length, 1);
    assert.equal(listResult.json.items[0].title, "Fuerza y AMRAP");
    assert.equal(listResult.json.items[0].summary, "warmup Move wod Train");
    assert.equal(listResult.json.items[0].content, undefined);

    const detailResult = await invoke(db, event("GET", `/coach-sessions/2026-08-18/${createResult.json.id}`, coach));
    assert.equal(detailResult.json.content, "==warmup\nMove\n\n==wod\nTrain");
  });

  it("paginates coach planning summaries with an opaque cursor", async () => {
    db.seed(...[1, 2, 3].map((day) => ({
      PK: "COACH#coach-1",
      SK: `COACH_SESSION#2026-08-0${day}#plan-${day}`,
      entityType: "COACH_SESSION",
      id: `plan-${day}`,
      coachId: "coach-1",
      title: `Plan ${day}`,
      date: `2026-08-0${day}`,
      content: `==wod\nDay ${day}`,
      updatedAt: `2026-08-0${day}T00:00:00.000Z`,
    })));

    const first = await invoke(db, event("GET", "/coach-sessions", coach, { query: { limit: "2" } }));
    const second = await invoke(db, event("GET", "/coach-sessions", coach, { query: { limit: "2", cursor: first.json.nextCursor } }));

    assert.deepEqual(first.json.items.map((item: { id: string }) => item.id), ["plan-3", "plan-2"]);
    assert.equal(typeof first.json.nextCursor, "string");
    assert.deepEqual(second.json.items.map((item: { id: string }) => item.id), ["plan-1"]);
    assert.equal(second.json.nextCursor, undefined);

    const foreignCursor = Buffer.from(JSON.stringify({ PK: "COACH#other", SK: "COACH_SESSION#2026-08-03#plan-3" })).toString("base64url");
    const invalid = await invoke(db, event("GET", "/coach-sessions", coach, { query: { cursor: foreignCursor } }));
    assert.equal(invalid.statusCode, 400);
  });

  it("assigns one coach planning to multiple linked athletes on a selected date", async () => {
    db.seed(
      { PK: "COACH#coach-1", SK: "ATHLETE#athlete-1", entityType: "COACH_ATHLETE", athleteId: "athlete-1" },
      { PK: "COACH#coach-1", SK: "ATHLETE#athlete-2", entityType: "COACH_ATHLETE", athleteId: "athlete-2" },
      {
        PK: "COACH#coach-1",
        SK: "COACH_SESSION#2026-08-18#base-1",
        entityType: "COACH_SESSION",
        id: "base-1",
        coachId: "coach-1",
        date: "2026-08-18",
        content: "==wod\nAMRAP",
        updatedAt: "2026-08-18T00:00:00.000Z",
      },
    );

    const result = await invoke(db, event("POST", "/coach-sessions/2026-08-18/base-1/assign", coach, {
      body: { date: "2026-08-25", athleteIds: ["athlete-1", "athlete-2", "athlete-1"] },
    }));

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.json, { assigned: 2, skipped: 0, conflicts: [] });
    assert.equal(db.get("ATHLETE#athlete-1", "SESSION#coach-1#2026-08-25")?.content, "==wod\nAMRAP");
    assert.equal(db.get("ATHLETE#athlete-2", "SESSION#coach-1#2026-08-25")?.coachId, "coach-1");
  });

  it("lets only the athlete complete a session with validated results", async () => {
    db.seed(
      { PK: "ATHLETE#athlete-1", SK: "COACH#coach-1", entityType: "ATHLETE_COACH", coachId: "coach-1" },
      { PK: "ATHLETE#athlete-1", SK: "SESSION#coach-1#2026-08-25", entityType: "SESSION", athleteId: "athlete-1", coachId: "coach-1", date: "2026-08-25", content: "==wod\nAMRAP", updatedAt: "2026-08-20T00:00:00.000Z" },
    );

    const completed = await invoke(db, event("PUT", "/me/sessions/coach-1/2026-08-25/execution", athlete, {
      body: {
        status: "completed",
        expectedVersion: 0,
        clientMutationId: "mutation-1",
        result: { metrics: [{ id: "load", type: "weight", label: "Front squat", value: 90, unit: "kg" }], rpe: 8, comment: "Good session" },
      },
    }));

    assert.equal(completed.statusCode, 200);
    assert.equal(completed.json.status, "completed");
    assert.equal(completed.json.executionVersion, 1);
    assert.equal(completed.json.result.metrics[0].value, 90);
    assert.equal(typeof completed.json.startedAt, "string");
    assert.equal(typeof completed.json.completedAt, "string");

    const coachAttempt = await invoke(db, event("PUT", "/me/sessions/coach-1/2026-08-25/execution", coach, {
      body: { status: "completed", expectedVersion: 1, clientMutationId: "mutation-2" },
    }));
    assert.equal(coachAttempt.statusCode, 403);
  });

  it("makes execution retries idempotent and rejects stale versions", async () => {
    db.seed(
      { PK: "ATHLETE#athlete-1", SK: "COACH#coach-1", entityType: "ATHLETE_COACH", coachId: "coach-1" },
      { PK: "ATHLETE#athlete-1", SK: "SESSION#coach-1#2026-08-25", entityType: "SESSION", athleteId: "athlete-1", coachId: "coach-1", date: "2026-08-25", content: "WOD", status: "pending", executionVersion: 0, updatedAt: "2026-08-20T00:00:00.000Z" },
    );
    const request = event("PUT", "/me/sessions/coach-1/2026-08-25/execution", athlete, {
      body: { status: "in_progress", expectedVersion: 0, clientMutationId: "same-mutation" },
    });
    const first = await invoke(db, request);
    const retry = await invoke(db, request);
    assert.equal(first.json.executionVersion, 1);
    assert.equal(retry.json.executionVersion, 1);

    const stale = await invoke(db, event("PUT", "/me/sessions/coach-1/2026-08-25/execution", athlete, {
      body: { status: "completed", expectedVersion: 0, clientMutationId: "new-mutation" },
    }));
    assert.equal(stale.statusCode, 409);
  });

  it("never replaces an active or completed session and requires confirmation for pending", async () => {
    db.seed(
      { PK: "COACH#coach-1", SK: "ATHLETE#athlete-1", entityType: "COACH_ATHLETE", athleteId: "athlete-1" },
      { PK: "COACH#coach-1", SK: "COACH_SESSION#2026-08-18#base-1", entityType: "COACH_SESSION", id: "base-1", coachId: "coach-1", title: "New", date: "2026-08-18", content: "New content" },
      { PK: "ATHLETE#athlete-1", SK: "SESSION#coach-1#2026-08-25", entityType: "SESSION", athleteId: "athlete-1", coachId: "coach-1", date: "2026-08-25", content: "Old content", status: "completed", executionVersion: 2, result: { metrics: [], rpe: 7 } },
    );
    const blocked = await invoke(db, event("POST", "/coach-sessions/2026-08-18/base-1/assign", coach, { body: { date: "2026-08-25", athleteIds: ["athlete-1"], replacePending: true } }));
    assert.equal(blocked.json.assigned, 0);
    assert.equal(blocked.json.conflicts[0].reason, "session_completed");
    assert.equal(db.get("ATHLETE#athlete-1", "SESSION#coach-1#2026-08-25")?.content, "Old content");
  });

  it("keeps sessions from different coaches isolated on the same date", async () => {
    db.seed(
      { PK: "COACH#coach-1", SK: "ATHLETE#athlete-1", entityType: "COACH_ATHLETE", athleteId: "athlete-1" },
      { PK: "COACH#coach-2", SK: "ATHLETE#athlete-1", entityType: "COACH_ATHLETE", athleteId: "athlete-1" },
      { PK: "ATHLETE#athlete-1", SK: "COACH#coach-1", entityType: "ATHLETE_COACH", coachId: "coach-1" },
      { PK: "ATHLETE#athlete-1", SK: "COACH#coach-2", entityType: "ATHLETE_COACH", coachId: "coach-2" },
      { PK: "ATHLETE#athlete-1", SK: "SESSION#coach-1#2026-08-26", entityType: "SESSION", athleteId: "athlete-1", coachId: "coach-1", date: "2026-08-26", content: "Coach one" },
      { PK: "ATHLETE#athlete-1", SK: "SESSION#coach-2#2026-08-26", entityType: "SESSION", athleteId: "athlete-1", coachId: "coach-2", date: "2026-08-26", content: "Coach two" },
    );

    assert.equal(db.get("ATHLETE#athlete-1", "SESSION#coach-1#2026-08-26")?.content, "Coach one");
    assert.equal(db.get("ATHLETE#athlete-1", "SESSION#coach-2#2026-08-26")?.content, "Coach two");

    const first = await invoke(db, event("GET", "/athletes/athlete-1/sessions", athlete, {
      query: { coachId: "coach-1", from: "2026-08-01", to: "2026-08-31" },
    }));
    const second = await invoke(db, event("GET", "/athletes/athlete-1/sessions", athlete, {
      query: { coachId: "coach-2", from: "2026-08-01", to: "2026-08-31" },
    }));

    assert.equal(first.json[0].content, "Coach one");
    assert.equal(second.json[0].content, "Coach two");
  });

  it("lets athletes read only their own sessions", async () => {
    db.seed(
      {
        PK: "ATHLETE#athlete-1",
        SK: "COACH#coach-1",
        entityType: "ATHLETE_COACH",
        athleteId: "athlete-1",
        coachId: "coach-1",
        name: "Coach",
        email: "coach@example.com",
      },
      {
        PK: "ATHLETE#athlete-1",
        SK: "SESSION#2026-08-18",
        entityType: "SESSION",
        athleteId: "athlete-1",
        coachId: "coach-1",
        date: "2026-08-18",
        content: "==wod\nAMRAP",
        updatedAt: "2026-08-18T00:00:00.000Z",
      },
      {
        PK: "ATHLETE#athlete-2",
        SK: "SESSION#2026-08-18",
        entityType: "SESSION",
        athleteId: "athlete-2",
        coachId: "coach-1",
        date: "2026-08-18",
        content: "==wod\nOther",
        updatedAt: "2026-08-18T00:00:00.000Z",
      },
    );

    const own = await invoke(db, event("GET", "/athletes/athlete-1/sessions", athlete, {
      query: { coachId: "coach-1", from: "2026-08-01", to: "2026-08-31" },
    }));
    const other = await invoke(db, event("GET", "/athletes/athlete-2/sessions", athlete, {
      query: { coachId: "coach-1", from: "2026-08-01", to: "2026-08-31" },
    }));

    assert.equal(own.statusCode, 200);
    assert.equal(own.json.length, 1);
    assert.equal(other.statusCode, 403);
  });
});
