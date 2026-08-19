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
      IndexName?: string;
      ExpressionAttributeValues?: Record<string, string>;
      ConditionExpression?: string;
    };

    if (command.constructor.name === "PutCommand") {
      if (!input.Item) throw new Error("PutCommand Item is required");
      const key = this.key(input.Item.PK, input.Item.SK);
      if (input.ConditionExpression === "attribute_not_exists(PK)" && this.items.has(key)) {
        throw Object.assign(new Error("Conditional check failed"), { name: "ConditionalCheckFailedException" });
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

    if (command.constructor.name === "QueryCommand") {
      const values = input.ExpressionAttributeValues ?? {};
      const items = [...this.items.values()];
      if (input.IndexName === "GSI1") {
        return { Items: items.filter((item) => item.GSI1PK === values[":email"]) };
      }
      if (values[":athlete"]) {
        return { Items: items.filter((item) => item.PK === values[":pk"] && item.SK.startsWith(values[":athlete"])) };
      }
      return {
        Items: items
          .filter((item) => item.PK === values[":pk"] && item.SK >= values[":from"] && item.SK <= values[":to"])
          .sort((a, b) => a.SK.localeCompare(b.SK)),
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

  it("links a registered athlete to a coach by email", async () => {
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

    const result = await invoke(db, event("POST", "/athletes", coach, { body: { email: "ATHLETE@example.com" } }));

    assert.equal(result.statusCode, 201);
    assert.deepEqual(result.json, { id: "athlete-1", name: "Athlete", email: "athlete@example.com" });
    assert.equal(db.get("COACH#coach-1", "ATHLETE#athlete-1")?.entityType, "COACH_ATHLETE");
  });

  it("blocks athletes from coach-only routes", async () => {
    const result = await invoke(db, event("GET", "/athletes", athlete));

    assert.equal(result.statusCode, 403);
    assert.equal(result.json.message, "Only coaches have an athlete list");
  });

  it("creates and lists coach base sessions by date range", async () => {
    const createResult = await invoke(db, event("POST", "/coach-sessions", coach, {
      body: { date: "2026-08-18", content: "==warmup\nMove\n\n==wod\nTrain" },
    }));

    assert.equal(createResult.statusCode, 201);
    assert.match(createResult.json.id, /^[0-9a-f-]{36}$/);

    const listResult = await invoke(db, event("GET", "/coach-sessions", coach, {
      query: { from: "2026-08-01", to: "2026-08-31" },
    }));

    assert.equal(listResult.statusCode, 200);
    assert.equal(listResult.json.length, 1);
    assert.equal(listResult.json[0].content, "==warmup\nMove\n\n==wod\nTrain");
  });

  it("assigns one coach base session to multiple linked athletes", async () => {
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
      body: { athleteIds: ["athlete-1", "athlete-2", "athlete-1"] },
    }));

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.json, { assigned: 2 });
    assert.equal(db.get("ATHLETE#athlete-1", "SESSION#2026-08-18")?.content, "==wod\nAMRAP");
    assert.equal(db.get("ATHLETE#athlete-2", "SESSION#2026-08-18")?.coachId, "coach-1");
  });

  it("lets athletes read only their own sessions", async () => {
    db.seed(
      {
        PK: "ATHLETE#athlete-1",
        SK: "SESSION#2026-08-18",
        entityType: "SESSION",
        athleteId: "athlete-1",
        date: "2026-08-18",
        content: "==wod\nAMRAP",
        updatedAt: "2026-08-18T00:00:00.000Z",
      },
      {
        PK: "ATHLETE#athlete-2",
        SK: "SESSION#2026-08-18",
        entityType: "SESSION",
        athleteId: "athlete-2",
        date: "2026-08-18",
        content: "==wod\nOther",
        updatedAt: "2026-08-18T00:00:00.000Z",
      },
    );

    const own = await invoke(db, event("GET", "/athletes/athlete-1/sessions", athlete, {
      query: { from: "2026-08-01", to: "2026-08-31" },
    }));
    const other = await invoke(db, event("GET", "/athletes/athlete-2/sessions", athlete, {
      query: { from: "2026-08-01", to: "2026-08-31" },
    }));

    assert.equal(own.statusCode, 200);
    assert.equal(own.json.length, 1);
    assert.equal(other.statusCode, 403);
  });
});
