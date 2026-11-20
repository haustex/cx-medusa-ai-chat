import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261120081808 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "ai_chat_usage" drop constraint if exists "ai_chat_usage_day_unique";`);
    this.addSql(`alter table if exists "ai_chat_session" drop constraint if exists "ai_chat_session_token_hash_unique";`);
    this.addSql(`create table if not exists "ai_chat_session" ("id" text not null, "token_hash" text not null, "locale" text not null, "country_code" text null, "region_id" text null, "currency_code" text null, "path_prefix" text not null default '', "ip_hash" text null, "page" text null, "consent_at" timestamptz null, "turns" integer not null default 0, "input_tokens" integer not null default 0, "output_tokens" integer not null default 0, "cache_read_tokens" integer not null default 0, "cache_write_tokens" integer not null default 0, "cost_usd" real not null default 0, "last_prompt_tokens" integer not null default 0, "summary" text null, "summarized_until" text null, "handoff_at" timestamptz null, "handoff_reason" text null, "handoff_source" text null, "last_message_at" timestamptz null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ai_chat_session_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ai_chat_session_token_hash_unique" ON "ai_chat_session" ("token_hash") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_chat_session_deleted_at" ON "ai_chat_session" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_chat_session_handoff_at" ON "ai_chat_session" ("handoff_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_chat_session_last_message_at" ON "ai_chat_session" ("last_message_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ai_chat_message" ("id" text not null, "session_id" text not null, "role" text check ("role" in ('user', 'assistant')) not null, "content" text not null, "tool_calls" jsonb null, "products" jsonb null, "feedback" integer null, "flagged" jsonb null, "handoff" boolean not null default false, "input_tokens" integer not null default 0, "output_tokens" integer not null default 0, "cost_usd" real not null default 0, "latency_ms" integer null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ai_chat_message_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_chat_message_session_id" ON "ai_chat_message" ("session_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_chat_message_deleted_at" ON "ai_chat_message" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ai_chat_setting" ("id" text not null, "enabled" boolean not null default true, "greeting" jsonb null, "instructions" text null, "faqs" jsonb null, "daily_budget_usd" real null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ai_chat_setting_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_chat_setting_deleted_at" ON "ai_chat_setting" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ai_chat_usage" ("id" text not null, "day" text not null, "cost_usd" real not null default 0, "turns" integer not null default 0, "sessions" integer not null default 0, "handoffs" integer not null default 0, "input_tokens" integer not null default 0, "output_tokens" integer not null default 0, "cache_read_tokens" integer not null default 0, "cache_write_tokens" integer not null default 0, "refused" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ai_chat_usage_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ai_chat_usage_day_unique" ON "ai_chat_usage" ("day") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_chat_usage_deleted_at" ON "ai_chat_usage" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "ai_chat_message" add constraint "ai_chat_message_session_id_foreign" foreign key ("session_id") references "ai_chat_session" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "ai_chat_message" drop constraint if exists "ai_chat_message_session_id_foreign";`);

    this.addSql(`drop table if exists "ai_chat_session" cascade;`);

    this.addSql(`drop table if exists "ai_chat_message" cascade;`);

    this.addSql(`drop table if exists "ai_chat_setting" cascade;`);

    this.addSql(`drop table if exists "ai_chat_usage" cascade;`);
  }

}
