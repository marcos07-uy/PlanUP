import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || "sa-east-1";
const USER_POOL_ID = process.env.PLANUP_USER_POOL_ID || "sa-east-1_svr1LdPh2";
const TABLE_NAME = process.env.PLANUP_TABLE_NAME || "planup-dev";
const EXPECTED_ACCOUNT_ID = "920250548109";
const SEED_ID = "planup-demo-v1";
const operation = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const confirmedDev = process.argv.includes("--confirm-dev");

if (!["seed", "cleanup"].includes(operation)) throw new Error("Usage: manage-demo-data.mjs <seed|cleanup> [--dry-run|--confirm-dev]");
if (!dryRun && !confirmedDev) throw new Error("Refusing to modify AWS without --confirm-dev");
if (!dryRun && (!USER_POOL_ID.startsWith("sa-east-1_") || TABLE_NAME !== "planup-dev")) {
  throw new Error(`Refusing to modify non-dev resources: ${USER_POOL_ID} / ${TABLE_NAME}`);
}

const crossfitPlans = [
  ["Déficit HSPU y conditioning", `==Warmup\n2 sets\n20\" side OH KB carry\n5/5 KB push press\n5/5 plate wrist rotations\n8/8 plate halos\n\n==Handstand push-ups volume\n5 x max rep deficit HSPU\nElegir un déficit que permita al menos 4 repeticiones unbroken por set\nRest máximo 3' entre sets\n\n==Workout\nPartition as necessary\n100 GHD sit-ups\n60 burpee pull-ups\n250 double unders`],
  ["Rope climbs y remo progresivo", `==Warmup\n2 sets\n30\" KB farmer carry\n10 KB deadlift\n10 elevaciones de piernas\n6/6 plate halos\n\n==Rope climb skill\n15 rope climbs for time\nEvery 1'30\" (not include 0') perform 8 alternating DB snatch\nCap: 12' · DB: 25 kg\n\n==Row work\n1000 m row RPE 6 · Rest 2'\n800 m row RPE 7 · Rest 1'30\"\n600 m row RPE 8 · Rest 1'\n400 m row RPE 9 · Rest 30\"\n200 m row RPE 10`],
  ["Toes-to-bar y sandbag", `==Warmup\n2 sets\n1' SkiErg\n30\" elbow plank\n20 mountain climbers\n10 bar kipping\n\n==Toes-to-bar stamina\n60 T2B for time\nEvery break: 8 GHD sit-ups\nCap: 10'\n\n==Workout\n10/8/6/4/2 sandbag cleans\n4 burpee box jump overs between rounds\nSandbag: 70 kg · Box: 24\"`],
  ["HSPU, box jumps y front squat", `==Warmup\n2 sets\n1' SkiErg\n10 light dumbbell skull crushers\n20\"/side KB OH farmer carry\n6/6 KB push press\n20\" handstand hold\n\n==Handstand push-ups work\n1) Max kipping HSPU unbroken con progresión de al menos 10 reps\nRest 3'\n2) 5 x 50% de parte 1 · Rest 1'\n\n==Workout\n5 rounds for time\n12 box jump overs\n12 T2B\n18/15/12/9/6 front squats\nBarbell: 50/60/70/80/90 kg`],
  ["Clean técnico y sprint", `==Warmup\n3 rounds\n10 cal bike\n8 empty-bar good mornings\n6 tall cleans\n\n==Strength\nEvery 2' x 6 sets\n2 power cleans + 1 hang squat clean\nSubir de 60% a 80%\n\n==Workout\n6 rounds\n10 wall balls\n8 power cleans 50/35 kg\n200 m run\nRest 1'`],
  ["Snatch y assault bike", `==Warmup\n2 sets\n12 PVC pass-throughs\n8 overhead squats\n6 muscle snatch\n\n==Weightlifting\n8 x 1 squat snatch\nBuild to a technically heavy single\nRest 2'\n\n==Conditioning\nEvery 3' x 5\n12/10 cal assault bike\n6 squat snatches 40/30 kg`],
  ["Back squat y Cindy", `==Warmup\n3 rounds\n12 air squats\n10 glute bridges\n8 goblet squats\n\n==Strength\nBack squat 5 x 5 @ RPE 8\nRest 2'30\"\n\n==Workout\nAMRAP 15'\n5 pull-ups\n10 push-ups\n15 air squats`],
  ["Deadlift y box endurance", `==Warmup\n2 sets\n10 KB deadlifts\n8 inchworms\n12 step-ups\n\n==Strength\nDeadlift 5/5/3/3/2\nBuild to 85%\n\n==Workout\n4 rounds for time\n15 deadlifts 70/50 kg\n20 box jump overs\n400 m run`],
  ["Gymnastics pulling", `==Warmup\n3 rounds\n8 scap pull-ups\n10 ring rows\n20 hollow rocks\n\n==Skill\nEMOM 12\nMin 1: 4-8 chest-to-bar\nMin 2: 20\" L-sit\nMin 3: rest\n\n==Workout\n21-15-9\nPull-ups\nDB thrusters 2 x 15/10 kg`],
  ["Thruster y double unders", `==Warmup\n2 sets\n1' jump rope\n10 front rack lunges\n8 push press\n\n==Strength\nThruster 6 x 3 building\nRest 90\"\n\n==Workout\n5 rounds\n40 double unders\n10 thrusters 42.5/30 kg\nRest 45\"`],
  ["Long aerobic chipper", `==Warmup\n8' easy machine rotation\n\n==Endurance\nFor time at sustainable pace\n1000 m row\n50 wall balls\n800 m run\n40 alternating DB snatch\n1000 m SkiErg\nCap: 35'`],
  ["Recovery and mobility", `==Aerobic recovery\n30' Zone 2 bike or row\nNasal breathing only\n\n==Mobility\n3 rounds easy\n45\" couch stretch per side\n10 thoracic rotations per side\n60\" passive hang\n12 controlled Cossack squats`],
];

const gymPlans = [
  ["Pecho y tríceps", `==Entrada en calor\n8' bicicleta suave\n2 x 15 band pull-aparts\n\n==Fuerza\nPress banca 4 x 6 @ RPE 8\nPress inclinado con mancuernas 3 x 10\n\n==Accesorios\nAperturas en polea 3 x 12\nFondos asistidos 3 x 10\nExtensión de tríceps 3 x 15`],
  ["Espalda y bíceps", `==Entrada en calor\n5' remo\nMovilidad escapular\n\n==Trabajo principal\nJalón al pecho 4 x 10\nRemo con barra 4 x 8\nRemo unilateral 3 x 12 por lado\n\n==Accesorios\nFace pulls 3 x 15\nCurl con barra 3 x 10\nCurl martillo 3 x 12`],
  ["Piernas: cuádriceps", `==Entrada en calor\n8' caminata inclinada\n2 x 15 sentadillas libres\n\n==Fuerza\nBack squat 5 x 5\nPrensa 45° 4 x 10\nBulgarian split squat 3 x 10 por lado\n\n==Accesorios\nExtensión de rodilla 3 x 15\nGemelos de pie 4 x 15`],
  ["Piernas: cadena posterior", `==Entrada en calor\nMovilidad de cadera\n2 x 12 glute bridges\n\n==Fuerza\nPeso muerto rumano 4 x 8\nHip thrust 4 x 10\nCurl femoral 4 x 12\n\n==Accesorios\nBack extension 3 x 12\nGemelos sentado 4 x 15`],
  ["Hombros completos", `==Entrada en calor\nRotaciones con banda\n2 x 12 press liviano\n\n==Fuerza\nPress militar 4 x 6\nPress Arnold 3 x 10\n\n==Accesorios\nElevaciones laterales 4 x 12\nPájaros 3 x 15\nFace pulls 3 x 15`],
  ["Full body A", `==Fuerza\nSentadilla goblet 4 x 10\nPress banca 4 x 8\nRemo sentado 4 x 10\n\n==Accesorios\nPeso muerto rumano con mancuernas 3 x 12\nElevaciones laterales 3 x 15\nPlancha 3 x 45\"`],
  ["Full body B", `==Fuerza\nTrap-bar deadlift 4 x 6\nPress inclinado 4 x 8\nJalón neutro 4 x 10\n\n==Accesorios\nZancadas 3 x 10 por lado\nCurl femoral 3 x 12\nPallof press 3 x 12 por lado`],
  ["Empuje hipertrofia", `==Trabajo principal\nPress inclinado con barra 4 x 8\nPress de hombros en máquina 4 x 10\nPress plano con mancuernas 3 x 12\n\n==Accesorios\nElevaciones laterales 4 x 15\nCruce de poleas 3 x 15\nTríceps con cuerda 4 x 12`],
  ["Tirón hipertrofia", `==Trabajo principal\nDominadas asistidas 4 x 8\nRemo T 4 x 10\nJalón unilateral 3 x 12\n\n==Accesorios\nReverse fly 4 x 15\nCurl predicador 3 x 12\nCurl en polea 3 x 15`],
  ["Lower body fuerza", `==Fuerza\nBack squat 5 x 3 @ RPE 8\nPeso muerto rumano 4 x 6\nPrensa 3 x 8\n\n==Accesorios\nCurl femoral 3 x 10\nExtensión de rodilla 3 x 12\nFarmer carry 4 x 30 m`],
  ["Core y acondicionamiento", `==Core\nDead bug 3 x 10 por lado\nPallof press 3 x 12 por lado\nCable crunch 3 x 15\nSide plank 3 x 30\" por lado\n\n==Cardio\n10 rounds\n1' bicicleta RPE 8\n1' recuperación suave`],
  ["Recuperación activa", `==Cardio\n25' caminata inclinada en Zona 2\n\n==Movilidad\n90/90 de cadera 2 x 8 por lado\nEstiramiento de flexor 2 x 45\"\nRotación torácica 2 x 10\nFoam roller 8'`],
];

const groups = [
  { key: "crossfit", coach: { email: "coach.crossfit@example.com", name: "Valentina CrossFit" }, athletes: ["Ana Metcon", "Bruno Barbell", "Carla Engine", "Diego Gymnastics"], plans: crossfitPlans, schedule: [[0, 1, 2, 3, 4, 10, 11], [0, 4, 2, 6, 5, 10, 11], [1, 1, 7, 3, 8, 10, 11], [2, 4, 2, 9, 4, 10, 11]] },
  { key: "gym", coach: { email: "coach.gym@example.com", name: "Martín Sala" }, athletes: ["Elena Fuerza", "Facundo Volumen", "Gabriela Fitness", "Hugo Inicial"], plans: gymPlans, schedule: [[0, 1, 2, 3, 4, 10, 11], [7, 8, 3, 5, 6, 10, 11], [5, 1, 2, 4, 6, 10, 11], [5, 6, 11, 5, 6, 10, 11]] },
];

const isoDay = (offset) => { const date = new Date(); date.setUTCHours(12, 0, 0, 0); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
const summary = (content) => content.replace(/^==\s*/gm, "").replace(/\s+/g, " ").trim().slice(0, 180);
const attr = (attributes, name) => attributes?.find((item) => item.Name === name)?.Value;
const usersFor = (group) => [{ ...group.coach, role: "coach" }, ...group.athletes.map((name, index) => ({ name, email: `${group.key}.athlete${index + 1}@example.com`, role: "athlete" }))];

async function batchWrite(database, requests) {
  for (let index = 0; index < requests.length; index += 25) {
    let pending = requests.slice(index, index + 25);
    do {
      const result = await database.send(new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: pending } }));
      pending = result.UnprocessedItems?.[TABLE_NAME] ?? [];
      if (pending.length) await new Promise((resolve) => setTimeout(resolve, 250));
    } while (pending.length);
  }
}

async function scanSeedItems(database) {
  const items = [];
  let cursor;
  do {
    const result = await database.send(new ScanCommand({ TableName: TABLE_NAME, FilterExpression: "seedId = :seedId", ExpressionAttributeValues: { ":seedId": SEED_ID }, ProjectionExpression: "PK, SK", ExclusiveStartKey: cursor }));
    items.push(...(result.Items ?? []));
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return items;
}

async function removeDynamoSeed(database, extraKeys = []) {
  const items = await scanSeedItems(database);
  const keys = new Map([...items, ...extraKeys].map(({ PK, SK }) => [`${PK}\u0000${SK}`, { PK, SK }]));
  await batchWrite(database, [...keys.values()].map((Key) => ({ DeleteRequest: { Key } })));
  return keys.size;
}

async function upsertCognitoUser(cognito, user, password) {
  const attributes = [{ Name: "email", Value: user.email }, { Name: "email_verified", Value: "true" }, { Name: "name", Value: user.name }, { Name: "custom:role", Value: user.role }];
  try {
    await cognito.send(new AdminCreateUserCommand({ UserPoolId: USER_POOL_ID, Username: user.email, UserAttributes: attributes, MessageAction: "SUPPRESS" }));
  } catch (error) {
    if (error?.name !== "UsernameExistsException") throw error;
    const existing = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: user.email }));
    const existingRole = attr(existing.UserAttributes, "custom:role");
    if (existingRole !== user.role) throw new Error(`Refusing to change immutable role for ${user.email}: ${existingRole} -> ${user.role}`);
    await cognito.send(new AdminUpdateUserAttributesCommand({ UserPoolId: USER_POOL_ID, Username: user.email, UserAttributes: attributes.filter((item) => item.Name !== "custom:role") }));
  }
  await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: USER_POOL_ID, Username: user.email, Password: password, Permanent: true }));
  const result = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: user.email }));
  return { ...user, id: attr(result.UserAttributes, "sub") };
}

function buildItems(seededGroups) {
  const now = new Date().toISOString();
  const items = [];
  for (const group of seededGroups) {
    const [coach, ...athletes] = group.users;
    for (const user of group.users) items.push({ PK: `USER#${user.id}`, SK: "PROFILE", entityType: "USER", id: user.id, email: user.email, name: user.name, role: user.role, GSI1PK: `EMAIL#${user.email}`, GSI1SK: `USER#${user.id}`, updatedAt: now, seedId: SEED_ID });
    for (const athlete of athletes) {
      items.push({ PK: `COACH#${coach.id}`, SK: `ATHLETE#${athlete.id}`, entityType: "COACH_ATHLETE", coachId: coach.id, athleteId: athlete.id, name: athlete.name, email: athlete.email, createdAt: now, seedId: SEED_ID });
      items.push({ PK: `ATHLETE#${athlete.id}`, SK: `COACH#${coach.id}`, entityType: "ATHLETE_COACH", coachId: coach.id, athleteId: athlete.id, name: coach.name, email: coach.email, createdAt: now, seedId: SEED_ID });
    }
    group.plans.forEach(([title, content], index) => {
      const date = isoDay(-index);
      const id = `demo-${group.key}-${String(index + 1).padStart(2, "0")}`;
      items.push({ PK: `COACH#${coach.id}`, SK: `COACH_SESSION#${date}#${id}`, entityType: "COACH_SESSION", id, coachId: coach.id, title, date, content, summary: summary(content), updatedAt: now, seedId: SEED_ID });
    });
    athletes.forEach((athlete, athleteIndex) => group.schedule[athleteIndex].forEach((planIndex, dayOffset) => {
      const [, content] = group.plans[planIndex];
      const date = isoDay(dayOffset);
      items.push({ PK: `ATHLETE#${athlete.id}`, SK: `SESSION#${coach.id}#${date}`, entityType: "SESSION", athleteId: athlete.id, coachId: coach.id, date, content, contentFormat: "text-v1", status: "pending", executionVersion: 0, updatedAt: now, seedId: SEED_ID });
    }));
  }
  return items;
}

if (dryRun) {
  const users = groups.flatMap(usersFor);
  console.log(JSON.stringify({ region: REGION, userPoolId: USER_POOL_ID, tableName: TABLE_NAME, users: users.length, coaches: 2, athletes: 8, relations: 16, plans: 24, assignedSessions: 56, coachEmails: groups.map((group) => group.coach.email) }, null, 2));
  process.exit(0);
}

const cognito = new CognitoIdentityProviderClient({ region: REGION });
const database = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const pool = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: USER_POOL_ID }));
const accountId = pool.UserPool?.Arn?.split(":")[4];
if (accountId !== EXPECTED_ACCOUNT_ID) throw new Error(`Refusing AWS account ${accountId}; expected ${EXPECTED_ACCOUNT_ID}`);

if (operation === "cleanup") {
  const existingGroups = [];
  for (const group of groups) {
    const users = [];
    for (const user of usersFor(group)) {
      try {
        const result = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: user.email }));
        users.push({ ...user, id: attr(result.UserAttributes, "sub") });
      } catch (error) {
        if (error?.name !== "UserNotFoundException") throw error;
      }
    }
    existingGroups.push({ ...group, users });
  }
  const stableKeys = existingGroups.flatMap((group) => {
    const coach = group.users.find((user) => user.role === "coach");
    const athletes = group.users.filter((user) => user.role === "athlete");
    return [
      ...group.users.map((user) => ({ PK: `USER#${user.id}`, SK: "PROFILE" })),
      ...(coach ? athletes.flatMap((athlete) => [
        { PK: `COACH#${coach.id}`, SK: `ATHLETE#${athlete.id}` },
        { PK: `ATHLETE#${athlete.id}`, SK: `COACH#${coach.id}` },
      ]) : []),
    ];
  });
  const deletedItems = await removeDynamoSeed(database, stableKeys);
  let deletedUsers = 0;
  for (const user of groups.flatMap(usersFor)) {
    try { await cognito.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: user.email })); deletedUsers += 1; }
    catch (error) { if (error?.name !== "UserNotFoundException") throw error; }
  }
  console.log(`Demo cleanup complete: ${deletedItems} DynamoDB items and ${deletedUsers} Cognito users deleted.`);
  process.exit(0);
}

const password = process.env.PLANUP_DEMO_PASSWORD;
if (!password || password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) throw new Error("PLANUP_DEMO_PASSWORD must have at least 12 characters, uppercase, lowercase, and a number");

const seededGroups = [];
for (const group of groups) {
  const users = [];
  for (const user of usersFor(group)) users.push(await upsertCognitoUser(cognito, user, password));
  seededGroups.push({ ...group, users });
}
const deletedItems = await removeDynamoSeed(database);
const items = buildItems(seededGroups);
await batchWrite(database, items.map((Item) => ({ PutRequest: { Item } })));
console.log(`Demo seed complete: 10 users, 24 plans, 56 assigned sessions, ${items.length} DynamoDB items (${deletedItems} previous seed items replaced).`);
console.log(`Coach logins: ${groups.map((group) => group.coach.email).join(", ")}`);
