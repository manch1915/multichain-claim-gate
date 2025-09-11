CREATE TABLE "allocations" (
	"campaign_id" text NOT NULL,
	"family" text NOT NULL,
	"address" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"source" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocations_campaign_id_family_address_pk" PRIMARY KEY("campaign_id","family","address")
);
--> statement-breakpoint
CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"message" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"evm_decimals" integer NOT NULL,
	"solana_decimals" integer NOT NULL,
	"demo_amount" text NOT NULL,
	"demo_join_open" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gate_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"gate_id" text NOT NULL,
	"accounts" jsonb NOT NULL,
	"passed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gates" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"rule" jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"telegram_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prepared_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"address" text NOT NULL,
	"campaign_id" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"message_base64" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "root_publications" (
	"campaign_id" text NOT NULL,
	"chain" text NOT NULL,
	"root" text NOT NULL,
	"status" text NOT NULL,
	"tx_hash" text,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "root_publications_campaign_id_chain_pk" PRIMARY KEY("campaign_id","chain")
);
--> statement-breakpoint
CREATE TABLE "session_accounts" (
	"session_id" text NOT NULL,
	"family" text NOT NULL,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_accounts_session_id_family_pk" PRIMARY KEY("session_id","family")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsored_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"campaign_id" text,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"amount" numeric(78, 0),
	"method" text NOT NULL,
	"status" text NOT NULL,
	"tx_hash" text,
	"user_op_hash" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tree_snapshots" (
	"campaign_id" text NOT NULL,
	"family" text NOT NULL,
	"root" text NOT NULL,
	"size" integer NOT NULL,
	"total" numeric(78, 0) NOT NULL,
	"entries" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tree_snapshots_campaign_id_family_root_pk" PRIMARY KEY("campaign_id","family","root")
);
--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_checks" ADD CONSTRAINT "gate_checks_gate_id_gates_id_fk" FOREIGN KEY ("gate_id") REFERENCES "public"."gates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prepared_transactions" ADD CONSTRAINT "prepared_transactions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "root_publications" ADD CONSTRAINT "root_publications_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_accounts" ADD CONSTRAINT "session_accounts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tree_snapshots" ADD CONSTRAINT "tree_snapshots_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gate_checks_gate" ON "gate_checks" USING btree ("gate_id");--> statement-breakpoint
CREATE INDEX "sponsored_actions_lookup" ON "sponsored_actions" USING btree ("kind","chain","address");--> statement-breakpoint
CREATE INDEX "sponsored_actions_recent" ON "sponsored_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tree_snapshots_latest" ON "tree_snapshots" USING btree ("campaign_id","family","created_at");