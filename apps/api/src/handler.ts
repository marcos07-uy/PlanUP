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
    version: item.version ?? 0,
    updatedAt: item.updatedAt,
  };
}

function assertDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw Object.assign(new Error("A valid session date is required"), { statusCode: 400 });
  }
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function assertWeekStart(value: string | undefined) {
  assertDate(value);
  if (new Date(`${value}T12:00:00Z`).getUTCDay() !== 1) {
    throw Object.assign(new Error("Week start must be a Monday"), { statusCode: 400 });
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

function assertGroupName(value: string | undefined) {
  const name = value?.trim();
  if (!name || name.length > 80) throw Object.assign(new Error("Group name must contain between 1 and 80 characters"), { statusCode: 400 });
  return name;
}

function planningSummary(content: string) {
  const summary = content.replace(/^==\s*/gm, "").replace(/\s+/g, " ").trim();
  return summary.length > 180 ? `${summary.slice(0, 177)}…` : summary;
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
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

function calendarMonths(from: string, to: string) {
  const months: string[] = [];
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = to.slice(0, 7);
  while (cursor.toISOString().slice(0, 7) <= end) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function assertCalendarRange(from: string | undefined, to: string | undefined) {
  assertDate(from);
  assertDate(to);
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime || (toTime - fromTime) / 86_400_000 > 30) {
    throw Object.assign(new Error("Calendar range must contain between 1 and 31 days"), { statusCode: 400 });
  }
}

function encodeCalendarCursor(monthIndex: number, key?: Record<string, unknown>) {
  return Buffer.from(JSON.stringify({ monthIndex, key })).toString("base64url");
}

function decodeCalendarCursor(value: string | undefined, monthCount: number) {
  if (!value) return { monthIndex: 0, key: undefined };
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { monthIndex?: unknown; key?: unknown };
    if (!Number.isInteger(cursor.monthIndex) || Number(cursor.monthIndex) < 0 || Number(cursor.monthIndex) >= monthCount) throw new Error("Invalid month");
    if (cursor.key !== undefined && (!cursor.key || typeof cursor.key !== "object" || Array.isArray(cursor.key))) throw new Error("Invalid key");
    return { monthIndex: Number(cursor.monthIndex), key: cursor.key as Record<string, unknown> | undefined };
  } catch {
    throw Object.assign(new Error("Invalid calendar cursor"), { statusCode: 400 });
  }
}

function todayInTimezone(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
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

    if (path === "/groups" && method === "GET") {
      if (identity.role !== "coach") return response(403, { message: "Only coaches can manage groups" });
      const result = await database.send(new QueryCommand({ TableName: tableName, KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to", ExpressionAttributeValues: { ":pk": `COACH#${identity.id}`, ":from": "GROUP#", ":to": "GROUP#~" } }));
      return response(200, (result.Items ?? []).map((item) => ({ id: item.id, name: item.name, version: item.version ?? 0, updatedAt: item.updatedAt })));
    }

    if (path === "/groups" && method === "POST") {
      if (identity.role !== "coach") return response(403, { message: "Only coaches can manage groups" });
      const name = assertGroupName((JSON.parse(event.body ?? "{}") as { name?: string }).name);
      const id = randomUUID();
      const now = new Date().toISOString();
      const item = { PK: `COACH#${identity.id}`, SK: `GROUP#${id}`, entityType: "GROUP", id, coachId: identity.id, name, version: 1, createdAt: now, updatedAt: now };
      await database.send(new PutCommand({ TableName: tableName, Item: item, ConditionExpression: "attribute_not_exists(PK)" }));
      return response(201, { id, name, version: 1, updatedAt: now, athletes: [] });
    }

    const groupMemberMatch = path.match(/^\/groups\/([^/]+)\/athletes\/([^/]+)$/);
    if (groupMemberMatch && (method === "PUT" || method === "DELETE")) {
      if (identity.role !== "coach") return response(403, { message: "Only coaches can manage groups" });
      const groupId = decodeURIComponent(groupMemberMatch[1]);
      const athleteId = decodeURIComponent(groupMemberMatch[2]);
      const group = await database.send(new GetCommand({ TableName: tableName, Key: { PK: `COACH#${identity.id}`, SK: `GROUP#${groupId}` } }));
      if (!group.Item) return response(404, { message: "Group not found" });
      await assertCoachAccess(database, identity, athleteId);
      const directKey = { PK: `GROUP#${identity.id}#${groupId}`, SK: `ATHLETE#${athleteId}` };
      const reverseKey = { PK: `ATHLETE#${athleteId}`, SK: `GROUP#${identity.id}#${groupId}` };
      if (method === "DELETE") {
        await database.send(new TransactWriteCommand({ TransactItems: [{ Delete: { TableName: tableName, Key: directKey } }, { Delete: { TableName: tableName, Key: reverseKey } }] }));
        return { statusCode: 204 };
      }
      const relation = await database.send(new GetCommand({ TableName: tableName, Key: { PK: `COACH#${identity.id}`, SK: `ATHLETE#${athleteId}` } }));
      const now = new Date().toISOString();
      await database.send(new TransactWriteCommand({ TransactItems: [
        { Put: { TableName: tableName, Item: { ...directKey, entityType: "GROUP_MEMBERSHIP", groupId, coachId: identity.id, athleteId, name: relation.Item?.name, email: relation.Item?.email, createdAt: now } } },
        { Put: { TableName: tableName, Item: { ...reverseKey, entityType: "ATHLETE_GROUP", groupId, coachId: identity.id, athleteId, groupName: group.Item.name, createdAt: now } } },
      ] }));
      return response(200, { id: athleteId, name: relation.Item?.name, email: relation.Item?.email });
    }

    const groupMatch = path.match(/^\/groups\/([^/]+)$/);
    if (groupMatch) {
      if (identity.role !== "coach") return response(403, { message: "Only coaches can manage groups" });
      const groupId = decodeURIComponent(groupMatch[1]);
      const key = { PK: `COACH#${identity.id}`, SK: `GROUP#${groupId}` };
      const group = await database.send(new GetCommand({ TableName: tableName, Key: key }));
      if (!group.Item) return response(404, { message: "Group not found" });
      if (method === "GET") {
        const members = await database.send(new QueryCommand({ TableName: tableName, KeyConditionExpression: "PK = :pk AND begins_with(SK, :athlete)", ExpressionAttributeValues: { ":pk": `GROUP#${identity.id}#${groupId}`, ":athlete": "ATHLETE#" } }));
        return response(200, { id: group.Item.id, name: group.Item.name, version: group.Item.version ?? 0, updatedAt: group.Item.updatedAt, athletes: (members.Items ?? []).map((item) => ({ id: item.athleteId, name: item.name, email: item.email })) });
      }
      if (method === "DELETE") {
        const members = await database.send(new QueryCommand({ TableName: tableName, KeyConditionExpression: "PK = :pk AND begins_with(SK, :athlete)", ExpressionAttributeValues: { ":pk": `GROUP#${identity.id}#${groupId}`, ":athlete": "ATHLETE#" } }));
        if ((members.Items ?? []).length > 40) return response(409, { message: "Remove athletes before deleting a group with more than 40 members" });
        await database.send(new TransactWriteCommand({ TransactItems: [{ Delete: { TableName: tableName, Key: key } }, ...(members.Items ?? []).flatMap((item) => [{ Delete: { TableName: tableName, Key: { PK: item.PK, SK: item.SK } } }, { Delete: { TableName: tableName, Key: { PK: `ATHLETE#${item.athleteId}`, SK: `GROUP#${identity.id}#${groupId}` } } }])] }));
        return { statusCode: 204 };
      }
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
      let cursor = decodeCursor(event.queryStringParameters?.cursor);
      if (cursor && cursor.PK !== `COACH#${identity.id}`) return response(400, { message: "Invalid planning cursor" });
      const rawQuery = event.queryStringParameters?.query?.trim() ?? "";
      if (rawQuery.length > 80) return response(400, { message: "Planning search cannot exceed 80 characters" });
      const search = normalizeSearch(rawQuery);
      const matches: Record<string, unknown>[] = [];
      let inspected = 0;
      do {
        const result = await database.send(new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "PK = :pk AND SK BETWEEN :from AND :to",
          ExpressionAttributeValues: {
            ":pk": `COACH#${identity.id}`,
            ":from": `COACH_SESSION#${from}#`,
            ":to": `COACH_SESSION#${to}#~`,
          },
          ExclusiveStartKey: cursor,
          Limit: Math.min(limit - matches.length, 250 - inspected),
          ScanIndexForward: false,
        }));
        const page = result.Items ?? [];
        inspected += page.length;
        matches.push(...page.filter((item) => !search || normalizeSearch(String(item.title ?? "")).includes(search)));
        cursor = result.LastEvaluatedKey as { PK: string; SK: string } | undefined;
      } while (cursor && matches.length < limit && inspected < 250);
      return response(200, {
        items: matches.map((item) => ({
          id: item.id,
          title: item.title,
          date: item.date,
          summary: item.summary ?? planningSummary(String(item.content ?? "")),
          version: item.version ?? 0,
          updatedAt: item.updatedAt,
        })),
        nextCursor: encodeCursor(cursor),
      });
    }

    if (path === "/coach/calendar" && method === "GET") {
      if (identity.role !== "coach") return response(403, { message: "Only coaches can view team compliance" });
      const from = event.queryStringParameters?.from;
      const to = event.queryStringParameters?.to;
      assertCalendarRange(from, to);
      const months = calendarMonths(from!, to!);
      const cursor = decodeCalendarCursor(event.queryStringParameters?.cursor, months.length);
      if (cursor.key && cursor.key.GSI2PK !== `COACH#${identity.id}#${months[cursor.monthIndex]}`) return response(400, { message: "Invalid calendar cursor" });
      const athleteId = event.queryStringParameters?.athleteId;
      const status = event.queryStringParameters?.status;
      if (status && !["pending", "in_progress", "completed", "skipped", "overdue"].includes(status)) return response(400, { message: "Invalid calendar status" });

      const items: Record<string, unknown>[] = [];
      let nextCursor: string | undefined;
      for (let monthIndex = cursor.monthIndex; monthIndex < months.length && items.length < 500; monthIndex += 1) {
        const result = await database.send(new QueryCommand({
          TableName: tableName,
          IndexName: "GSI2",
          KeyConditionExpression: "GSI2PK = :pk AND GSI2SK BETWEEN :from AND :to",
          ExpressionAttributeValues: {
            ":pk": `COACH#${identity.id}#${months[monthIndex]}`,
            ":from": `DATE#${from}#ATHLETE#`,
            ":to": `DATE#${to}#ATHLETE#~`,
          },
          ExclusiveStartKey: monthIndex === cursor.monthIndex ? cursor.key : undefined,
          Limit: 500 - items.length,
        }));
        items.push(...(result.Items ?? []));
        if (result.LastEvaluatedKey) {
          nextCursor = encodeCalendarCursor(monthIndex, result.LastEvaluatedKey);
          break;
        }
        if (items.length >= 500 && monthIndex + 1 < months.length) nextCursor = encodeCalendarCursor(monthIndex + 1);
      }

      const today = todayInTimezone("America/Montevideo");
      const sessions = items.map(sessionFromItem).filter((session) => {
        const sessionStatus = String(session.status);
        const overdue = sessionStatus === "pending" && String(session.date) < today;
        return (!athleteId || session.athleteId === athleteId) && (!status || status === sessionStatus || (status === "overdue" && overdue));
      });
      const summary = { total: sessions.length, completed: 0, inProgress: 0, skipped: 0, pending: 0, overdue: 0 };
      for (const session of sessions) {
        if (session.status === "completed") summary.completed += 1;
        else if (session.status === "in_progress") summary.inProgress += 1;
        else if (session.status === "skipped") summary.skipped += 1;
        else if (String(session.date) < today) summary.overdue += 1;
        else summary.pending += 1;
      }
      return response(200, { items: sessions, summary, nextCursor });
    }

    if (path === "/coach/calendar/duplicate" && method === "POST") {
      if (identity.role !== "coach") return response(403, { message: "Only coaches can duplicate weeks" });
      const body = JSON.parse(event.body ?? "{}") as { sourceFrom?: string; targetFrom?: string; operationId?: unknown };
      assertWeekStart(body.sourceFrom);
      assertWeekStart(body.targetFrom);
      if (body.sourceFrom === body.targetFrom) return response(400, { message: "Source and target weeks must be different" });
      if (typeof body.operationId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.operationId)) return response(400, { message: "A valid operationId is required" });
      const sourceFrom = body.sourceFrom!;
      const targetFrom = body.targetFrom!;

      const sourceTo = addDays(sourceFrom, 6);
      const months = calendarMonths(sourceFrom, sourceTo);
      const sourceItems: Record<string, unknown>[] = [];
      for (const month of months) {
        if (sourceItems.length >= 201) break;
        let cursor: Record<string, unknown> | undefined;
        do {
          const result = await database.send(new QueryCommand({
            TableName: tableName,
            IndexName: "GSI2",
            KeyConditionExpression: "GSI2PK = :pk AND GSI2SK BETWEEN :from AND :to",
            ExpressionAttributeValues: {
              ":pk": `COACH#${identity.id}#${month}`,
              ":from": `DATE#${sourceFrom}#ATHLETE#`,
              ":to": `DATE#${sourceTo}#ATHLETE#~`,
            },
            ExclusiveStartKey: cursor,
            Limit: 201 - sourceItems.length,
          }));
          sourceItems.push(...(result.Items ?? []));
          cursor = result.LastEvaluatedKey;
        } while (cursor && sourceItems.length <= 200);
      }
      if (!sourceItems.length) return response(400, { message: "Source week has no assigned sessions" });
      if (sourceItems.length > 200) return response(400, { message: "A week can contain up to 200 sessions" });

      const dayOffset = Math.round((Date.parse(`${targetFrom}T12:00:00Z`) - Date.parse(`${sourceFrom}T12:00:00Z`)) / 86_400_000);
      const operationId = body.operationId.toLowerCase();
      const updatedAt = new Date().toISOString();
      const outcomes = await Promise.all(sourceItems.map(async (source) => {
        const athleteId = String(source.athleteId);
        const targetDate = addDays(String(source.date), dayOffset);
        const key = { PK: `ATHLETE#${athleteId}`, SK: `SESSION#${identity.id}#${targetDate}` };
        const existing = await database.send(new GetCommand({ TableName: tableName, Key: key }));
        if (existing.Item) {
          const sameOperation = existing.Item.duplicateWeekOperationId === operationId;
          return { athleteId, date: targetDate, created: false, unchanged: sameOperation, reason: sameOperation ? undefined : "session_exists" };
        }
        const item = {
          ...key,
          entityType: "SESSION",
          athleteId,
          coachId: identity.id,
          date: targetDate,
          title: source.title,
          content: source.content,
          contentFormat: source.contentFormat ?? "text-v1",
          sourcePlanningId: source.sourcePlanningId,
          sourcePlanningDate: source.sourcePlanningDate,
          status: "pending",
          executionVersion: 0,
          duplicatedFrom: { date: source.date, athleteId },
          duplicateWeekOperationId: operationId,
          GSI2PK: `COACH#${identity.id}#${targetDate.slice(0, 7)}`,
          GSI2SK: `DATE#${targetDate}#ATHLETE#${athleteId}`,
          updatedAt,
        };
        try {
          await database.send(new PutCommand({ TableName: tableName, Item: item, ConditionExpression: "attribute_not_exists(PK)" }));
          return { athleteId, date: targetDate, created: true, unchanged: false, reason: undefined };
        } catch (error) {
          if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
            const concurrent = await database.send(new GetCommand({ TableName: tableName, Key: key }));
            const sameOperation = concurrent.Item?.duplicateWeekOperationId === operationId;
            return { athleteId, date: targetDate, created: false, unchanged: sameOperation, reason: sameOperation ? undefined : "session_changed" };
          }
          throw error;
        }
      }));
      const conflicts = outcomes.filter((item) => item.reason).map(({ athleteId, date, reason }) => ({ athleteId, date, reason }));
      return response(200, {
        created: outcomes.filter((item) => item.created).length,
        unchanged: outcomes.filter((item) => item.unchanged).length,
        skipped: conflicts.length,
        conflicts,
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

    if (coachSessionDetailMatch && method === "PUT") {
      if (identity.role !== "coach") return response(403, { message: "Only coaches can edit coach sessions" });
      const date = decodeURIComponent(coachSessionDetailMatch[1]);
      const sessionId = decodeURIComponent(coachSessionDetailMatch[2]);
      assertDate(date);
      const body = JSON.parse(event.body ?? "{}") as { title?: string; content?: string; expectedVersion?: unknown };
      const title = assertTitle(body.title);
      const content = assertContent(body.content);
      if (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 0) return response(400, { message: "expectedVersion must be a non-negative integer" });
      const current = await database.send(new GetCommand({ TableName: tableName, Key: { PK: `COACH#${identity.id}`, SK: `COACH_SESSION#${date}#${sessionId}` } }));
      if (!current.Item) return response(404, { message: "Coach session not found" });
      const version = Number(current.Item.version ?? 0);
      if (version !== body.expectedVersion) return response(409, { message: "Planning was updated on another device", planning: coachSessionFromItem(current.Item) });
      const updatedAt = new Date().toISOString();
      try {
        await database.send(new UpdateCommand({
          TableName: tableName,
          Key: { PK: `COACH#${identity.id}`, SK: `COACH_SESSION#${date}#${sessionId}` },
          UpdateExpression: "SET #title = :title, content = :content, summary = :summary, normalizedTitle = :normalizedTitle, #version = :nextVersion, updatedAt = :updatedAt",
          ConditionExpression: "attribute_exists(PK) AND (attribute_not_exists(#version) OR #version = :expectedVersion)",
          ExpressionAttributeNames: { "#title": "title", "#version": "version" },
          ExpressionAttributeValues: { ":title": title, ":content": content, ":summary": planningSummary(content), ":normalizedTitle": normalizeSearch(title), ":nextVersion": version + 1, ":updatedAt": updatedAt, ":expectedVersion": version },
        }));
      } catch (error) {
        if (error instanceof Error && error.name === "ConditionalCheckFailedException") return response(409, { message: "Planning was updated on another device" });
        throw error;
      }
      return response(200, coachSessionFromItem({ ...current.Item, title, content, summary: planningSummary(content), normalizedTitle: normalizeSearch(title), version: version + 1, updatedAt }));
    }

    const coachSessionDuplicateMatch = path.match(/^\/coach-sessions\/([^/]+)\/([^/]+)\/duplicate$/);
    if (coachSessionDuplicateMatch && method === "POST") {
      if (identity.role !== "coach") return response(403, { message: "Only coaches can duplicate coach sessions" });
      const sourceDate = decodeURIComponent(coachSessionDuplicateMatch[1]);
      const sourceId = decodeURIComponent(coachSessionDuplicateMatch[2]);
      assertDate(sourceDate);
      const body = JSON.parse(event.body ?? "{}") as { title?: string; operationId?: unknown; date?: string };
      if (typeof body.operationId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.operationId)) return response(400, { message: "A valid operationId is required" });
      assertDate(body.date);
      const source = await database.send(new GetCommand({ TableName: tableName, Key: { PK: `COACH#${identity.id}`, SK: `COACH_SESSION#${sourceDate}#${sourceId}` } }));
      if (!source.Item) return response(404, { message: "Coach session not found" });
      const title = body.title === undefined ? `${String(source.Item.title ?? "Planificación")} (copia)` : assertTitle(body.title);
      const date = body.date!;
      const id = body.operationId.toLowerCase();
      const key = { PK: `COACH#${identity.id}`, SK: `COACH_SESSION#${date}#${id}` };
      const item = { ...key, entityType: "COACH_SESSION", id, coachId: identity.id, title, normalizedTitle: normalizeSearch(title), date, content: source.Item.content, summary: source.Item.summary ?? planningSummary(String(source.Item.content ?? "")), version: 1, duplicatedFrom: { date: sourceDate, id: sourceId }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      try {
        await database.send(new PutCommand({ TableName: tableName, Item: item, ConditionExpression: "attribute_not_exists(PK)" }));
      } catch (error) {
        if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
          const existing = await database.send(new GetCommand({ TableName: tableName, Key: key }));
          if (existing.Item?.duplicatedFrom && (existing.Item.duplicatedFrom as { id?: unknown }).id === sourceId) return response(200, coachSessionFromItem(existing.Item));
        }
        throw error;
      }
      return response(201, coachSessionFromItem(item));
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
        normalizedTitle: normalizeSearch(title),
        version: 1,
        createdAt: new Date().toISOString(),
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
      const body = JSON.parse(event.body ?? "{}") as { athleteIds?: string[]; groupIds?: string[]; date?: string; replacePending?: boolean };
      const assignmentDate = body.date ?? date;
      assertDate(assignmentDate);
      const groupIds = [...new Set(body.groupIds ?? [])].filter(Boolean);
      const groupedAthleteIds = await Promise.all(groupIds.map(async (groupId) => {
        const group = await database.send(new GetCommand({ TableName: tableName, Key: { PK: `COACH#${identity.id}`, SK: `GROUP#${groupId}` } }));
        if (!group.Item) throw Object.assign(new Error("Group not found"), { statusCode: 404 });
        const members = await database.send(new QueryCommand({ TableName: tableName, KeyConditionExpression: "PK = :pk AND begins_with(SK, :athlete)", ExpressionAttributeValues: { ":pk": `GROUP#${identity.id}#${groupId}`, ":athlete": "ATHLETE#" } }));
        return (members.Items ?? []).map((item) => String(item.athleteId));
      }));
      const athleteIds = [...new Set([...(body.athleteIds ?? []), ...groupedAthleteIds.flat()])].filter(Boolean);
      if (!athleteIds.length) return response(400, { message: "At least one athlete is required" });
      if (athleteIds.length > 50) return response(400, { message: "An assignment can contain up to 50 athletes" });

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
            GSI2PK: `COACH#${identity.id}#${assignmentDate.slice(0, 7)}`,
            GSI2SK: `DATE#${assignmentDate}#ATHLETE#${athleteId}`,
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
