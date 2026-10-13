import { getStore } from "@netlify/blobs";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { and, count, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Config } from "@netlify/functions";
import { getDb } from "../../db/index.js";
import { messages, notifications, posts } from "../../db/schema.js";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function validText(value: unknown, label: string, maximum: number, required = true) {
  if (typeof value !== "string" || value.trim().length > maximum || (required && !value.trim())) {
    throw new HttpError(400, `${label} must be ${required ? "between 1 and" : "no more than"} ${maximum} characters.`);
  }
  return value.trim();
}

function validUid(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new HttpError(400, "Choose a valid friend.");
  }
  return value;
}

function validId(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) {
    throw new HttpError(400, "Invalid item.");
  }
  return value;
}

async function authenticate(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, "Please sign in to continue.");
  try {
    const project = "study-hub-f9904";
    const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"],
      audience: project,
      issuer: `https://securetoken.google.com/${project}`,
      requiredClaims: ["sub", "exp", "iat", "auth_time"],
      maxTokenAge: "1h",
      clockTolerance: 5,
    });
    if (!payload.sub || payload.sub.length > 128) throw new Error("Invalid identity");
    return { uid: payload.sub, name: typeof payload.name === "string" ? payload.name.slice(0, 100) : "Student", token };
  } catch {
    throw new HttpError(401, "Your session has expired. Please sign in again.");
  }
}

async function firestoreDocument(path: string, token: string) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/study-hub-f9904/databases/(default)/documents/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new HttpError(403, "Unable to verify your friendship. Please try again.");
  return response.json();
}

async function requireFriend(user: Awaited<ReturnType<typeof authenticate>>, friendUid: string) {
  if (user.uid === friendUid) throw new HttpError(400, "Choose a friend other than yourself.");
  const friendshipId = [user.uid, friendUid].sort().join("_");
  const document = await firestoreDocument(`friendships/${encodeURIComponent(friendshipId)}`, user.token);
  const members = document?.fields?.users?.arrayValue?.values?.map((member: { stringValue?: string }) => member.stringValue) || [];
  if (!members.includes(user.uid) || !members.includes(friendUid)) {
    throw new HttpError(403, "You must be friends to chat or share files.");
  }
}

async function authorName(user: Awaited<ReturnType<typeof authenticate>>) {
  const profile = await firestoreDocument(`users/${encodeURIComponent(user.uid)}`, user.token);
  return String(profile?.fields?.name?.stringValue || user.name).slice(0, 100);
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function readJson(request: Request) {
  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Invalid request.");
  return body;
}

export default async (request: Request) => {
  try {
    if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method)) {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST, PATCH, DELETE" } });
    }
    const user = await authenticate(request);
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const database = getDb();

    if (action === "messages" && request.method === "GET") {
      const friendUid = validUid(url.searchParams.get("friend"));
      await requireFriend(user, friendUid);
      const conversation = await database.select({
        id: messages.id, senderUid: messages.senderUid, receiverUid: messages.receiverUid,
        text: messages.text, fileName: messages.fileName, fileSize: messages.fileSize, createdAt: messages.createdAt,
      }).from(messages).where(or(
        and(eq(messages.senderUid, user.uid), eq(messages.receiverUid, friendUid)),
        and(eq(messages.senderUid, friendUid), eq(messages.receiverUid, user.uid)),
      )).orderBy(desc(messages.createdAt)).limit(200);
      return json(conversation.reverse());
    }

    if (action === "messages" && request.method === "POST") {
      const form = await request.formData();
      const friendUid = validUid(form.get("friend"));
      const text = validText(form.get("text") || "", "Message", 4000, false);
      const file = form.get("file");
      const attachment = file instanceof File && file.size > 0 ? file : null;
      if (!text && !attachment) throw new HttpError(400, "Write a message or choose a file.");
      if (attachment && (attachment.size > 3 * 1024 * 1024 || !/\.(pdf|txt|md|csv|png|jpe?g|webp|gif|docx?|xlsx?|pptx?|zip)$/i.test(attachment.name))) {
        throw new HttpError(400, "Choose a document, image, or ZIP file up to 3 MB.");
      }
      await requireFriend(user, friendUid);
      const name = await authorName(user);
      const id = crypto.randomUUID();
      const fileName = attachment ? attachment.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 180) : null;
      const store = attachment ? getStore({ name: "friend-files", consistency: "strong" }) : null;
      if (attachment && store) await store.set(id, await attachment.arrayBuffer());
      try {
        const message = await database.transaction(async transaction => {
          const [saved] = await transaction.insert(messages).values({
            id, senderUid: user.uid, receiverUid: friendUid, senderName: name, text,
            fileName, fileSize: attachment?.size || null, blobKey: attachment ? id : null,
          }).returning({ id: messages.id });
          await transaction.insert(notifications).values({
            userUid: friendUid, senderUid: user.uid, senderName: name, messageId: id,
            kind: attachment ? "file" : "message", preview: (fileName || text).slice(0, 180),
          });
          return saved;
        });
        return json(message, 201);
      } catch (error) {
        if (store) await store.delete(id).catch(() => {});
        throw error;
      }
    }

    if (action === "file" && request.method === "GET") {
      const id = validId(url.searchParams.get("id"));
      const [message] = await database.select().from(messages).where(and(eq(messages.id, id), or(eq(messages.senderUid, user.uid), eq(messages.receiverUid, user.uid)))).limit(1);
      if (!message?.blobKey || !message.fileName) throw new HttpError(404, "This file is not available.");
      await requireFriend(user, message.senderUid === user.uid ? message.receiverUid : message.senderUid);
      const data = await getStore({ name: "friend-files", consistency: "strong" }).get(message.blobKey, { type: "arrayBuffer" });
      if (!data) throw new HttpError(404, "This file is not available.");
      return new Response(data, { headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(message.fileName)}`,
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      } });
    }

    if (action === "notifications" && request.method === "GET") {
      const items = await database.select().from(notifications).where(eq(notifications.userUid, user.uid)).orderBy(desc(notifications.createdAt)).limit(100);
      const [unread] = await database.select({ value: count() }).from(notifications).where(and(eq(notifications.userUid, user.uid), isNull(notifications.readAt)));
      return json({ items, unread: unread.value });
    }

    if (action === "notifications" && request.method === "PATCH") {
      const body = await readJson(request);
      let condition = and(eq(notifications.userUid, user.uid), isNull(notifications.readAt));
      if (body.friend) condition = and(condition, eq(notifications.senderUid, validUid(body.friend)));
      if (body.id) condition = and(condition, eq(notifications.id, validId(body.id)));
      if (body.messageIds !== undefined) {
        if (!Array.isArray(body.messageIds) || !body.messageIds.length || body.messageIds.length > 200) throw new HttpError(400, "Invalid messages.");
        condition = and(condition, inArray(notifications.messageId, body.messageIds.map(validId)));
      }
      await database.update(notifications).set({ readAt: new Date() }).where(condition);
      return json({ success: true });
    }

    if (action === "posts" && request.method === "GET") {
      const feed = await database.select().from(posts).orderBy(desc(posts.createdAt)).limit(50);
      return json(feed);
    }

    if (action === "posts" && request.method === "POST") {
      const body = await readJson(request);
      const title = validText(body.title, "Title", 120);
      const subject = validText(body.subject, "Subject", 60);
      const content = validText(body.content, "Post", 12000);
      const name = await authorName(user);
      const [post] = await database.insert(posts).values({ authorUid: user.uid, authorName: name, title, subject, content }).returning();
      return json(post, 201);
    }

    if (action === "posts" && request.method === "DELETE") {
      const id = validId(url.searchParams.get("id"));
      const removed = await database.delete(posts).where(and(eq(posts.id, id), eq(posts.authorUid, user.uid))).returning({ id: posts.id });
      if (!removed.length) throw new HttpError(404, "This post is unavailable or belongs to another student.");
      return json({ success: true });
    }

    return json({ error: "This action is not available." }, 404);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError || error instanceof TypeError && error.message.includes("form")) return json({ error: "Invalid request." }, 400);
    return json({ error: "StudyHub could not complete this request. Please try again shortly." }, 503);
  }
};

export const config: Config = { path: "/api/community" };
