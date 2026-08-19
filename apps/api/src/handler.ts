import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const tableName = process.env.TABLE_NAME;
if (!tableName) throw new Error("TABLE_NAME is required");

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

type Database = Pick<DynamoDBDocumentClient, "send">;
type Role = "coach" | "athlete";

interface Identity {
  id: string;
  email: string;
  name: string;
  role: Role;
}

function response(statusCode: number, body?: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function identityFromClaims(claims: Record<string, string | number | boolean | string[]>): Identity {
  const role = claims["custom:role"];
  if (role !== "coach" && role !== "athlete") throw new Error("Account role is invalid");
  return {
    id: String(claims.sub),
    email: String(claims.email).toLowerCase(),
    name: String(claims.name || claims.email),
    role,
  };
}

async function ensureProfile(database: Database, identity: Identity) {
  await database.send(new PutCommand({
    TableName: tableName,
    Item: {
      PK: `USER#${identity.id}`,
      SK: "PROFILE",
      entityType: "USER",
      ...identity,
      GSI1PK: `EMAIL#${identity.email}`,
      GSI1SK: `USER#${identity.id}`,
      updatedAt: new Date().toISOString(),
    },
  }));
}

async function assertCoachAccess(database: Database, identity: Identity, athleteId: string) {
  if (identity.role !== "coach") throw Object.assign(new Error("Only coaches can modify sessions"), { statusCode: 403 });
  const relation = await database.send(new GetCommand({
    TableName: tableName,
    Key: { PK: `COACH#${identity.id}`, SK: `ATHLETE#${athleteId}` },
  }));
  if (!relation.Item) throw Object.assign(new Error("Athlete is not linked to this coach"), { statusCode: 403 });
}

async function assertReadAccess(database: Database, identity: Identity, athleteId: string) {
  if (identity.role === "athlete") {
    if (identity.id !== athleteId) throw Object.assign(new Error("You cannot view another athlete"), { statusCode: 403 });
    return;
  }
  await assertCoachAccess(database, identity, athleteId);
}

function sessionFromItem(item: Record<string, unknown>) {
  return {
    athleteId: item.athleteId,
    date: item.date,
    content: item.content,
    updatedAt: item.updatedAt,
  };
}

function coachSessionFromItem(item: Record<string, unknown>) {
  return {
    id: item.id,
    title: item.title,
    date: item.date,
    content: item.content,
    updatedAt: item.updatedAt,
  };
}

function assertDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw Object.assign(new Error("A valid session date is required"), { statusCode: 400 });
  }
}

function assertContent(value: string | undefined) {
  const content = value?.trim();
  if (!content || content.length > 20_000) {
    throw Object.assign(new Error("Session content must contain between 1 and 20,000 characters"), { statusCode: 400 });
  }
  return content;
}

function assertTitle(value: string | undefined) {
  const title = value?.trim();
  if (!title || title.length > 120) {
    throw Object.assign(new Error("Planning title must contain between 1 and 120 characters"), { statusCode: 400 });
  }
  return title;
}

export function createHandler(database: Database): APIGatewayProxyHandlerV2WithJWTAuthorizer {
  return async (event) => {
  try {
    const identity = identityFromClaims(event.requestContext.authorizer.jwt.claims);
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (method === "GET" && path === "/me") {
      await ensureProfile(database, identity);
      return response(200, identity);
    }

    if (path === "/athletes" && method === "GET") {
      if (identity.role !== "coach") return response(403, { message: "Only coaches have an athlete list" });
      const result = await database.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :athlete)",
        ExpressionAttributeValues: { ":pk": `COACH#${identity.id}`, ":athlete": "ATHLETE#" },
      }));
      return response(200, (result.Items ?? []).map((item) => ({ id: item.athleteId, name: item.name, email: item.email })));
    }

    if (path === "/athletes" && method === "POST") {
      if (identity.role !== "coach") return response(403, { message: "Only coaches can link athletes" });
      const body = JSON.parse(event.body ?? "{}") as { email?: string };
      const email = body.email?.trim().toLowerCase();
      if (!email) return response(400, { message: "Email is required" });

      const result = await database.send(new QueryCommand({
        TableName: tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :email",
        ExpressionAttributeValues: { ":email": `EMAIL#${email}` },
        Limit: 1,
      }));
      const athlete = result.Items?.[0];
      if (!athlete || athlete.role !== "athlete") return response(404, { message: "No registered athlete uses that email" });

      await database.send(new PutCommand({
        TableName: tableName,
        Item: {
          PK: `COACH#${identity.id}`,
          SK: `ATHLETE#${athlete.id}`,
          entityType: "COACH_ATHLETE",
          coachId: identity.id,
          athleteId: athlete.id,
          name: athlete.name,
          email: athlete.email,
          createdAt: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(PK)",
      })).catch((error: { name?: string }) => {
        if (error.name !== "ConditionalCheckFailedException") throw error;
      });
      return response(201, { id: athlete.id, name: athlete.name, email: athlete.email });
    }

    if (path === "/coach-sessions" && method === "GET") {
      if (identity.role !== "coach") return response(403, { message: "Only coaches can manage coach sessions" });
      const from = event.queryStringParameters?.from ?? "0000-01-01";
      const to = event.queryStringParameters?.to ?? "9999-12-31";
      const result = await database.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
        ExpressionAttributeValues: {
          ":pk": `COACH#${identity.id}`,
          ":from": `COACH_SESSION#${from}#`,
          ":to": `COACH_SESSION#${to}#~`,
        },
      }));
      return response(200, (result.Items ?? []).map(coachSessionFromItem));
    }

    if (path === "/coach-sessions" && method === "POST") {
      if (identity.role !== "coach") return response(403, { message: "Only coaches can create coach sessions" });
      const body = JSON.parse(event.body ?? "{}") as { date?: string; title?: string; content?: string };
      assertDate(body.date);
      const title = assertTitle(body.title);
      const content = assertContent(body.content);
      const id = randomUUID();
      const item = {
        PK: `COACH#${identity.id}`,
        SK: `COACH_SESSION#${body.date}#${id}`,
        entityType: "COACH_SESSION",
        id,
        coachId: identity.id,
        title,
        date: body.date,
        content,
        updatedAt: new Date().toISOString(),
      };
      await database.send(new PutCommand({ TableName: tableName, Item: item }));
      return response(201, coachSessionFromItem(item));
    }

    const coachSessionAssignMatch = path.match(/^\/coach-sessions\/([^/]+)\/([^/]+)\/assign$/);
    if (coachSessionAssignMatch && method === "POST") {
      if (identity.role !== "coach") return response(403, { message: "Only coaches can assign coach sessions" });
      const date = decodeURIComponent(coachSessionAssignMatch[1]);
      const sessionId = decodeURIComponent(coachSessionAssignMatch[2]);
      assertDate(date);
      const body = JSON.parse(event.body ?? "{}") as { athleteIds?: string[]; date?: string };
      const assignmentDate = body.date ?? date;
      assertDate(assignmentDate);
      const athleteIds = [...new Set(body.athleteIds ?? [])].filter(Boolean);
      if (!athleteIds.length) return response(400, { message: "At least one athlete is required" });

      const coachSession = await database.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `COACH#${identity.id}`, SK: `COACH_SESSION#${date}#${sessionId}` },
      }));
      if (!coachSession.Item) return response(404, { message: "Coach session not found" });

      await Promise.all(athleteIds.map((athleteId) => assertCoachAccess(database, identity, athleteId)));
      const updatedAt = new Date().toISOString();
      await Promise.all(athleteIds.map((athleteId) => database.send(new PutCommand({
        TableName: tableName,
        Item: {
          PK: `ATHLETE#${athleteId}`,
          SK: `SESSION#${assignmentDate}`,
          entityType: "SESSION",
          athleteId,
          coachId: identity.id,
          date: assignmentDate,
          content: coachSession.Item?.content,
          updatedAt,
        },
      }))));

      return response(200, { assigned: athleteIds.length });
    }

    const match = path.match(/^\/athletes\/([^/]+)\/sessions(?:\/([^/]+))?$/);
    if (!match) return response(404, { message: "Route not found" });
    const athleteId = decodeURIComponent(match[1]);
    const date = match[2] ? decodeURIComponent(match[2]) : undefined;

    if (method === "GET" && !date) {
      await assertReadAccess(database, identity, athleteId);
      const from = event.queryStringParameters?.from ?? "0000-01-01";
      const to = event.queryStringParameters?.to ?? "9999-12-31";
      const result = await database.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
        ExpressionAttributeValues: {
          ":pk": `ATHLETE#${athleteId}`,
          ":from": `SESSION#${from}`,
          ":to": `SESSION#${to}`,
        },
      }));
      return response(200, (result.Items ?? []).map(sessionFromItem));
    }

    assertDate(date);
    await assertCoachAccess(database, identity, athleteId);

    if (method === "PUT") {
      const body = JSON.parse(event.body ?? "{}") as { content?: string };
      const content = assertContent(body.content);
      const item = {
        PK: `ATHLETE#${athleteId}`,
        SK: `SESSION#${date}`,
        entityType: "SESSION",
        athleteId,
        coachId: identity.id,
        date,
        content,
        updatedAt: new Date().toISOString(),
      };
      await database.send(new PutCommand({ TableName: tableName, Item: item }));
      return response(200, sessionFromItem(item));
    }

    if (method === "DELETE") {
      await database.send(new DeleteCommand({ TableName: tableName, Key: { PK: `ATHLETE#${athleteId}`, SK: `SESSION#${date}` } }));
      return { statusCode: 204 };
    }

    return response(405, { message: "Method not allowed" });
  } catch (error) {
    console.error(error);
    const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
    const message = error instanceof SyntaxError ? "Invalid JSON body" : error instanceof Error ? error.message : "Unexpected error";
    return response(statusCode, { message: statusCode === 500 ? "Unexpected error" : message });
  }
  };
}

export const handler = createHandler(db);
