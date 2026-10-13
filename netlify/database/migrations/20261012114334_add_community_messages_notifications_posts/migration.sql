CREATE TABLE "community_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sender_uid" text NOT NULL,
	"receiver_uid" text NOT NULL,
	"sender_name" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"file_name" text,
	"file_size" integer,
	"blob_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_uid" text NOT NULL,
	"sender_uid" text NOT NULL,
	"sender_name" text NOT NULL,
	"message_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"preview" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"author_uid" text NOT NULL,
	"author_name" text NOT NULL,
	"title" text NOT NULL,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "community_messages_sender_idx" ON "community_messages" ("sender_uid","created_at");--> statement-breakpoint
CREATE INDEX "community_messages_receiver_idx" ON "community_messages" ("receiver_uid","created_at");--> statement-breakpoint
CREATE INDEX "community_notifications_user_idx" ON "community_notifications" ("user_uid","created_at");--> statement-breakpoint
CREATE INDEX "community_posts_created_idx" ON "community_posts" ("created_at");--> statement-breakpoint
ALTER TABLE "community_notifications" ADD CONSTRAINT "community_notifications_message_id_community_messages_id_fkey" FOREIGN KEY ("message_id") REFERENCES "community_messages"("id") ON DELETE CASCADE;