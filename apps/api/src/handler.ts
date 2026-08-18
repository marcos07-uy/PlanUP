import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
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

async function ensureProfile(identity: Identity) {
  await db.send(new PutCommand({
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

async function assertCoachAccess(identity: Identity, athleteId: string) {
  if (identity.role !== "coach") throw Object.assign(new Error("Only coaches can modify sessions"), { statusCode: 403 });
  const relation = await db.send(new GetCommand({
    TableName: tableName,
    Key: { PK: `COACH#${identity.id}`, SK: `ATHLETE#${athleteId}` },
  }));
  if (!relation.Item) throw Object.assign(new Error("Athlete is not linked to this coach"), { statusCode: 403 });
}

async function assertReadAccess(identity: Identity, athleteId: string) {
  if (identity.role === "athlete") {
    if (identity.id !== athleteId) throw Object.assign(new Error("You cannot view another athlete"), { statusCode: 403 });
    return;
  }
  await assertCoachAccess(identity, athleteId);
}

function sessionFromItem(item: Record<string, unknown>) {
  return {
    athleteId: item.athleteId,
    date: item.date,
    content: item.content,
    updatedAt: item.updatedAt,
  };
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const identity = identityFromClaims(event.requestContext.authorizer.jwt.claims);
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (method === "GET" && path === "/me") {
      await ensureProfile(identity);
      return response(200, identity);
    }

    if (path === "/athletes" && method === "GET") {
      if (identity.role !== "coach") return response(403, { message: "Only coaches have an athlete list" });
      const result = await db.send(new QueryCommand({
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

      const result = await db.send(new QueryCommand({
        TableName: tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :email",
        ExpressionAttributeValues: { ":email": `EMAIL#${email}` },
        Limit: 1,
      }));
      const athlete = result.Items?.[0];
      if (!athlete || athlete.role !== "athlete") return response(404, { message: "No registered athlete uses that email" });

      await db.send(new PutCommand({
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

    const match = path.match(/^\/athletes\/([^/]+)\/sessions(?:\/([^/]+))?$/);
    if (!match) return response(404, { message: "Route not found" });
    const athleteId = decodeURIComponent(match[1]);
    const date = match[2] ? decodeURIComponent(match[2]) : undefined;

    if (method === "GET" && !date) {
      await assertReadAccess(identity, athleteId);
      const from = event.queryStringParameters?.from ?? "0000-01-01";
      const to = event.queryStringParameters?.to ?? "9999-12-31";
      const result = await db.send(new QueryCommand({
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

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return response(400, { message: "A valid session date is required" });
    await assertCoachAccess(identity, athleteId);

    if (method === "PUT") {
      const body = JSON.parse(event.body ?? "{}") as { content?: string };
      const content = body.content?.trim();
      if (!content || content.length > 20_000) return response(400, { message: "Session content must contain between 1 and 20,000 characters" });
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
      await db.send(new PutCommand({ TableName: tableName, Item: item }));
      return response(200, sessionFromItem(item));
    }

    if (method === "DELETE") {
      await db.send(new DeleteCommand({ TableName: tableName, Key: { PK: `ATHLETE#${athleteId}`, SK: `SESSION#${date}` } }));
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

