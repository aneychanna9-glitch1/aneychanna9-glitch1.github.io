import { pgTable, text, timestamp, integer, uuid, index } from "drizzle-orm/pg-core";

export const messages = pgTable("community_messages", {
  id: uuid().defaultRandom().primaryKey(),
  senderUid: text("sender_uid").notNull(),
  receiverUid: text("receiver_uid").notNull(),
  senderName: text("sender_name").notNull(),
  text: text().notNull().default(""),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  blobKey: text("blob_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("community_messages_sender_idx").on(table.senderUid, table.createdAt), index("community_messages_receiver_idx").on(table.receiverUid, table.createdAt)]);

export const notifications = pgTable("community_notifications", {
  id: uuid().defaultRandom().primaryKey(),
  userUid: text("user_uid").notNull(),
  senderUid: text("sender_uid").notNull(),
  senderName: text("sender_name").notNull(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  kind: text().notNull(),
  preview: text().notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("community_notifications_user_idx").on(table.userUid, table.createdAt)]);

export const posts = pgTable("community_posts", {
  id: uuid().defaultRandom().primaryKey(),
  authorUid: text("author_uid").notNull(),
  authorName: text("author_name").notNull(),
  title: text().notNull(),
  subject: text().notNull(),
  content: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("community_posts_created_idx").on(table.createdAt)]);
