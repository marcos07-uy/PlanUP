import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
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
    coachId: item.coachId,
    date: item.date,
    title: item.title,
    content: item.content,
    contentFormat: item.contentFormat ?? "text-v1",
    status: item.status ?? "pending",
    result: item.result,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    skippedAt: item.skippedAt,
    executionUpdatedAt: item.executionUpdatedAt,
    executionVersion: item.executionVersion ?? 0,
    updatedAt: item.updatedAt,
  };
}

type SessionStatus = "pending" | "in_progress" | "completed" | "skipped";
type MetricType = "weight" | "reps" | "time" | "distance" | "note";

interface SessionMetric {
  id: string;
  type: MetricType;
  label: string;
  value?: number;
  unit?: string;
  note?: string;
}

interface SessionResult {
  metrics: SessionMetric[];
  rpe?: number;
  comment?: string;
}

function assertExecutionStatus(value: unknown): Exclude<SessionStatus, "pending"> {
  if (value !== "in_progress" && value !== "completed" && value !== "skipped") {
    throw Object.assign(new Error("Session status must be in_progress, completed, or skipped"), { statusCode: 400 });
  }
  return value;
}

function assertStatusTransition(current: SessionStatus, next: Exclude<SessionStatus, "pending">) {
  const allowed: Record<SessionStatus, SessionStatus[]> = {
    pending: ["in_progress", "completed", "skipped"],
    in_progress: ["in_progress", "completed", "skipped"],
    completed: ["completed"],
    skipped: ["skipped", "in_progress", "completed"],
  };
  if (!allowed[current].includes(next)) {
    throw Object.assign(new Error(`Session cannot transition from ${current} to ${next}`), { statusCode: 409 });
  }
}

function assertResult(value: unknown, status: Exclude<SessionStatus, "pending">): SessionResult | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Object.assign(new Error("Session result must be an object"), { statusCode: 400 });
  const input = value as { metrics?: unknown; rpe?: unknown; comment?: unknown };
  if (status !== "completed" && input.metrics !== undefined) throw Object.assign(new Error("Metrics can only be saved for a completed session"), { statusCode: 400 });
  const metrics = input.metrics ?? [];
  if (!Array.isArray(metrics) || metrics.length > 5) throw Object.assign(new Error("A session result can contain up to 5 metrics"), { statusCode: 400 });
  const parsedMetrics = metrics.map((metric, index): SessionMetric => {
    if (!metric || typeof metric !== "object" || Array.isArray(metric)) throw Object.assign(new Error(`Metric ${index + 1} is invalid`), { statusCode: 400 });
    const item = metric as Record<string, unknown>;
    const types: MetricType[] = ["weight", "reps", "time", "distance", "note"];
    if (typeof item.id !== "string" || !item.id.trim() || item.id.length > 100) throw Object.assign(new Error(`Metric ${index + 1} requires a valid id`), { statusCode: 400 });
    if (!types.includes(item.type as MetricType)) throw Object.assign(new Error(`Metric ${index + 1} has an invalid type`), { statusCode: 400 });
    if (typeof item.label !== "string" || !item.label.trim() || item.label.length > 80) throw Object.assign(new Error(`Metric ${index + 1} requires a label`), { statusCode: 400 });
    if (item.type === "note") {
      if (typeof item.note !== "string" || !item.note.trim() || item.note.length > 500) throw Object.assign(new Error(`Metric ${index + 1} requires a note`), { statusCode: 400 });
      return { id: item.id.trim(), type: "note", label: item.label.trim(), note: item.note.trim() };
    }
    if (typeof item.value !== "number" || !Number.isFinite(item.value) || item.value < 0) throw Object.assign(new Error(`Metric ${index + 1} requires a non-negative value`), { statusCode: 400 });
    if (item.type === "reps" && !Number.isInteger(item.value)) throw Object.assign(new Error(`Metric ${index + 1} repetitions must be an integer`), { statusCode: 400 });
    const allowedUnits: Partial<Record<MetricType, string[]>> = { weight: ["kg", "lb"], time: ["seconds"], distance: ["m", "km"] };
    const units = allowedUnits[item.type as MetricType];
    if (units && (typeof item.unit !== "string" || !units.includes(item.unit))) throw Object.assign(new Error(`Metric ${index + 1} has an invalid unit`), { statusCode: 400 });
    return { id: item.id.trim(), type: item.type as MetricType, label: item.label.trim(), value: item.value, unit: typeof item.unit === "string" ? item.unit : undefined };
  });
  if (input.rpe !== undefined && (typeof input.rpe !== "number" || !Number.isInteger(input.rpe) || input.rpe < 1 || input.rpe > 10)) throw Object.assign(new Error("RPE must be an integer between 1 and 10"), { statusCode: 400 });
  if (input.comment !== undefined && (typeof input.comment !== "string" || input.comment.trim().length > 1_000)) throw Object.assign(new Error("Session comment cannot exceed 1,000 characters"), { statusCode: 400 });
  return { metrics: parsedMetrics, rpe: input.rpe as number | undefined, comment: typeof input.comment === "string" ? input.comment.trim() : undefined };
}

function coachFromItem(item: Record<string, unknown>) {
  return { id: item.coachId, name: item.name, email: item.email };
}

function invitationFromItem(item: Record<string, unknown>) {
  return { coach: coachFromItem(item), createdAt: item.createdAt };
}

function coachSessionFromItem(item: Record<string, unknown>) {
  return {
    id: item.id,
    title: item.title,
    date: item.date,
    content: item.content,
    summary: item.summary ?? planningSummary(String(item.content ?? "")),
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

function planningSummary(content: string) {
  const summary = content.replace(/^==\s*/gm, "").replace(/\s+/g, " ").trim();
  return summary.length > 180 ? `${summary.slice(0, 177)}…` : summary;
}

function encodeCursor(key: Record<string, unknown> | undefined) {
  return key ? Buffer.from(JSON.stringify(key)).toString("base64url") : undefined;
}

function decodeCursor(value: string | undefined) {
  if (!value) return undefined;
  try {
    const key = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { PK?: unknown; SK?: unknown };
    if (typeof key.PK !== "string" || typeof key.SK !== "string") throw new Error("Invalid key");
    return { PK: key.PK, SK: key.SK };
  } catch {
    throw Object.assign(new Error("Invalid planning cursor"), { statusCode: 400 });
  }
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
      await Promise.all((result.Items ?? []).map((item) => database.send(new PutCommand({
        TableName: tableName,
        Item: {
          PK: `ATHLETE#${item.athleteId}`,
          SK: `COACH#${identity.id}`,
          entityType: "ATHLETE_COACH",
          athleteId: item.athleteId,
          coachId: identity.id,
          name: identity.name,
          email: identity.email,
          createdAt: item.createdAt,
        },
      }))));
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

      const existing = await database.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `COACH#${identity.id}`, SK: `ATHLETE#${athlete.id}` },
      }));
      if (existing.Item) return response(409, { message: "Athlete is already linked to this coach" });

      const invitation = {
        PK: `ATHLETE#${athlete.id}`,
        SK: `INVITATION#${identity.id}`,
        entityType: "COACH_INVITATION",
        athleteId: athlete.id,
        coachId: identity.id,
        name: identity.name,
        email: identity.email,
        createdAt: new Date().toISOString(),
      };
      await database.send(new PutCommand({
        TableName: tableName,
        Item: invitation,
      }));
      return response(202, invitationFromItem(invitation));
    }

    if (path === "/coaches" && method === "GET") {
      if (identity.role !== "athlete") return response(403, { message: "Only athletes have a coach list" });
      const result = await database.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
        ExpressionAttributeValues: { ":pk": `ATHLETE#${identity.id}`, ":from": "COACH#", ":to": "COACH#~" },
      }));
      return response(200, (result.Items ?? []).map(coachFromItem));
    }

    if (path === "/coach-invitations" && method === "GET") {
      if (identity.role !== "athlete") return response(403, { message: "Only athletes have coach invitations" });
      const result = await database.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
        ExpressionAttributeValues: { ":pk": `ATHLETE#${identity.id}`, ":from": "INVITATION#", ":to": "INVITATION#~" },
      }));
      return response(200, (result.Items ?? []).map(invitationFromItem));
    }

    const invitationMatch = path.match(/^\/coach-invitations\/([^/]+)\/(accept|reject)$/);
    if (invitationMatch && method === "POST") {
      if (identity.role !== "athlete") return response(403, { message: "Only athletes can answer coach invitations" });
      const coachId = decodeURIComponent(invitationMatch[1]);
      const action = invitationMatch[2];
      const key = { PK: `ATHLETE#${identity.id}`, SK: `INVITATION#${coachId}` };
      const result = await database.send(new GetCommand({ TableName: tableName, Key: key }));
      if (!result.Item) return response(404, { message: "Coach invitation not found" });

      if (action === "accept") {
        const createdAt = new Date().toISOString();
        await database.send(new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: tableName, Item: {
              PK: `COACH#${coachId}`,
              SK: `ATHLETE#${identity.id}`,
              entityType: "COACH_ATHLETE",
              coachId,
              athleteId: identity.id,
              name: identity.name,
              email: identity.email,
              createdAt,
            } } },
            { Put: { TableName: tableName, Item: {
              PK: `ATHLETE#${identity.id}`,
              SK: `COACH#${coachId}`,
              entityType: "ATHLETE_COACH",
              athleteId: identity.id,
              coachId,
              name: result.Item.name,
              email: result.Item.email,
              createdAt,
            } } },
            { Delete: { TableName: tableName, Key: key } },
          ],
        }));
        return response(200, coachFromItem(result.Item));
      }
      await database.send(new DeleteCommand({ TableName: tableName, Key: key }));
      return { statusCode: 204 };
    }

    if (path === "/coach-sessions" && method === "GET") {
      if (identity.role !== "coach") return response(403, { message: "Only coaches can manage coach sessions" });
      const from = event.queryStringParameters?.from ?? "0000-01-01";
      const to = event.queryStringParameters?.to ?? "9999-12-31";
      const requestedLimit = Number(event.queryStringParameters?.limit ?? 20);
      const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 20;
      const cursor = decodeCursor(event.queryStringParameters?.cursor);
      if (cursor && cursor.PK !== `COACH#${identity.id}`) return response(400, { message: "Invalid planning cursor" });
      const result = await database.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
        ExpressionAttributeValues: {
          ":pk": `COACH#${identity.id}`,
          ":from": `COACH_SESSION#${from}#`,
          ":to": `COACH_SESSION#${to}#~`,
        },
        ExclusiveStartKey: cursor,
        Limit: limit,
        ScanIndexForward: false,
      }));
      return response(200, {
        items: (result.Items ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          date: item.date,
          summary: item.summary ?? planningSummary(String(item.content ?? "")),
          updatedAt: item.updatedAt,
        })),
        nextCursor: encodeCursor(result.LastEvaluatedKey),
      });
    }

    const coachSessionDetailMatch = path.match(/^\/coach-sessions\/([^/]+)\/([^/]+)$/);
    if (coachSessionDetailMatch && method === "GET") {
      if (identity.role !== "coach") return response(403, { message: "Only coaches can manage coach sessions" });
      const date = decodeURIComponent(coachSessionDetailMatch[1]);
      const sessionId = decodeURIComponent(coachSessionDetailMatch[2]);
      assertDate(date);
      const result = await database.send(new GetCommand({
        TableName: tableName,
        Key: { PK: `COACH#${identity.id}`, SK: `COACH_SESSION#${date}#${sessionId}` },
      }));
      return result.Item ? response(200, coachSessionFromItem(result.Item)) : response(404, { message: "Coach session not found" });
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
        summary: planningSummary(content),
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
      const body = JSON.parse(event.body ?? "{}") as { athleteIds?: string[]; date?: string; replacePending?: boolean };
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
      const outcomes = await Promise.all(athleteIds.map(async (athleteId) => {
        const key = { PK: `ATHLETE#${athleteId}`, SK: `SESSION#${identity.id}#${assignmentDate}` };
        const existing = await database.send(new GetCommand({ TableName: tableName, Key: key }));
        const existingStatus = (existing.Item?.status ?? "pending") as SessionStatus;
        if (existing.Item && (!body.replacePending || existingStatus !== "pending")) {
          return { athleteId, assigned: false, reason: existingStatus === "pending" ? "pending_session_exists" : `session_${existingStatus}` };
        }
        try {
          await database.send(new PutCommand({
            TableName: tableName,
            Item: {
              ...existing.Item,
              ...key,
              entityType: "SESSION",
              athleteId,
              coachId: identity.id,
              date: assignmentDate,
              title: coachSession.Item?.title,
              content: coachSession.Item?.content,
              contentFormat: "text-v1",
              sourcePlanningId: sessionId,
              sourcePlanningDate: date,
              status: "pending",
              executionVersion: existing.Item?.executionVersion ?? 0,
              updatedAt,
            },
            ConditionExpression: existing.Item
              ? "(#status = :pending OR attribute_not_exists(#status)) AND (attribute_not_exists(executionVersion) OR executionVersion = :executionVersion)"
              : "attribute_not_exists(PK)",
            ExpressionAttributeNames: existing.Item ? { "#status": "status" } : undefined,
            ExpressionAttributeValues: existing.Item ? { ":pending": "pending", ":executionVersion": existing.Item.executionVersion ?? 0 } : undefined,
          }));
          return { athleteId, assigned: true };
        } catch (error) {
          if (error instanceof Error && error.name === "ConditionalCheckFailedException") return { athleteId, assigned: false, reason: "session_changed" };
          throw error;
        }
      }));
      const conflicts = outcomes.filter((item) => !item.assigned).map(({ athleteId, reason }) => ({ athleteId, reason }));
      return response(200, { assigned: outcomes.length - conflicts.length, skipped: conflicts.length, conflicts });
    }

    const executionMatch = path.match(/^\/me\/sessions\/([^/]+)\/([^/]+)\/execution$/);
    if (executionMatch && method === "PUT") {
      if (identity.role !== "athlete") return response(403, { message: "Only athletes can update session results" });
      const coachId = decodeURIComponent(executionMatch[1]);
      const executionDate = decodeURIComponent(executionMatch[2]);
      assertDate(executionDate);
      const body = JSON.parse(event.body ?? "{}") as { status?: unknown; result?: unknown; expectedVersion?: unknown; clientMutationId?: unknown };
      const nextStatus = assertExecutionStatus(body.status);
      if (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 0) throw Object.assign(new Error("expectedVersion must be a non-negative integer"), { statusCode: 400 });
      if (typeof body.clientMutationId !== "string" || !body.clientMutationId.trim() || body.clientMutationId.length > 100) throw Object.assign(new Error("clientMutationId is required"), { statusCode: 400 });

      const relation = await database.send(new GetCommand({ TableName: tableName, Key: { PK: `ATHLETE#${identity.id}`, SK: `COACH#${coachId}` } }));
      if (!relation.Item) return response(403, { message: "Coach is not linked to this athlete" });
      const key = { PK: `ATHLETE#${identity.id}`, SK: `SESSION#${coachId}#${executionDate}` };
      const current = await database.send(new GetCommand({ TableName: tableName, Key: key }));
      if (!current.Item) return response(404, { message: "Session not found" });
      if (current.Item.lastMutationId === body.clientMutationId) return response(200, sessionFromItem(current.Item));
      const currentStatus = (current.Item.status ?? "pending") as SessionStatus;
      const currentVersion = Number(current.Item.executionVersion ?? 0);
      if (currentVersion !== body.expectedVersion) return response(409, { message: "Session was updated on another device", session: sessionFromItem(current.Item) });
      assertStatusTransition(currentStatus, nextStatus);
      const result = assertResult(body.result, nextStatus);
      const now = new Date().toISOString();
      const updated = {
        ...current.Item,
        status: nextStatus,
        result: result ?? current.Item.result,
        startedAt: current.Item.startedAt ?? (nextStatus === "in_progress" || nextStatus === "completed" ? now : undefined),
        completedAt: nextStatus === "completed" ? current.Item.completedAt ?? now : current.Item.completedAt,
        skippedAt: nextStatus === "skipped" ? current.Item.skippedAt ?? now : current.Item.skippedAt,
        executionUpdatedAt: now,
        executionVersion: currentVersion + 1,
        lastMutationId: body.clientMutationId.trim(),
        updatedAt: now,
      };
      try {
        await database.send(new UpdateCommand({
          TableName: tableName,
          Key: key,
          UpdateExpression: "SET #status = :status, #result = :result, startedAt = :startedAt, completedAt = :completedAt, skippedAt = :skippedAt, executionUpdatedAt = :executionUpdatedAt, executionVersion = :nextVersion, lastMutationId = :mutationId, updatedAt = :updatedAt",
          ConditionExpression: "attribute_exists(PK) AND (attribute_not_exists(executionVersion) OR executionVersion = :expectedVersion)",
          ExpressionAttributeNames: { "#status": "status", "#result": "result" },
          ExpressionAttributeValues: {
            ":status": updated.status,
            ":result": updated.result ?? null,
            ":startedAt": updated.startedAt ?? null,
            ":completedAt": updated.completedAt ?? null,
            ":skippedAt": updated.skippedAt ?? null,
            ":executionUpdatedAt": now,
            ":nextVersion": updated.executionVersion,
            ":mutationId": updated.lastMutationId,
            ":updatedAt": now,
            ":expectedVersion": currentVersion,
          },
        }));
      } catch (error) {
        if (error instanceof Error && error.name === "ConditionalCheckFailedException") return response(409, { message: "Session was updated on another device" });
        throw error;
      }
      return response(200, sessionFromItem(updated));
    }

    const match = path.match(/^\/athletes\/([^/]+)\/sessions(?:\/([^/]+))?$/);
    if (!match) return response(404, { message: "Route not found" });
    const athleteId = decodeURIComponent(match[1]);
    const date = match[2] ? decodeURIComponent(match[2]) : undefined;

    if (method === "GET" && !date) {
      await assertReadAccess(database, identity, athleteId);
      const coachId = identity.role === "coach" ? identity.id : event.queryStringParameters?.coachId;
      if (!coachId) return response(400, { message: "Coach is required" });
      if (identity.role === "athlete") {
        const relation = await database.send(new GetCommand({
          TableName: tableName,
          Key: { PK: `ATHLETE#${identity.id}`, SK: `COACH#${coachId}` },
        }));
        if (!relation.Item) return response(403, { message: "Coach is not linked to this athlete" });
      }
      const from = event.queryStringParameters?.from ?? "0000-01-01";
      const to = event.queryStringParameters?.to ?? "9999-12-31";
      const scoped = await database.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
        ExpressionAttributeValues: {
          ":pk": `ATHLETE#${athleteId}`,
          ":from": `SESSION#${coachId}#${from}`,
          ":to": `SESSION#${coachId}#${to}`,
        },
      }));
      const legacy = await database.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
        ExpressionAttributeValues: {
          ":pk": `ATHLETE#${athleteId}`,
          ":from": `SESSION#${from}`,
          ":to": `SESSION#${to}`,
        },
      }));
      const sessionsByDate = new Map<string, Record<string, unknown>>();
      for (const item of legacy.Items ?? []) if (item.coachId === coachId) sessionsByDate.set(String(item.date), item);
      for (const item of scoped.Items ?? []) sessionsByDate.set(String(item.date), item);
      return response(200, [...sessionsByDate.values()].map(sessionFromItem).sort((a, b) => String(a.date).localeCompare(String(b.date))));
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
