ALTER TABLE "attribute_history" ADD CONSTRAINT "attribute_history_delta_nonnegative" CHECK ("attribute_history"."delta" >= 0);--> statement-breakpoint
ALTER TABLE "user_attributes" ADD CONSTRAINT "user_attributes_current_value_nonnegative" CHECK ("user_attributes"."current_value" >= 0);--> statement-breakpoint
ALTER TABLE "user_levels" ADD CONSTRAINT "user_levels_total_xp_nonnegative" CHECK ("user_levels"."total_xp" >= 0);--> statement-breakpoint
ALTER TABLE "user_levels" ADD CONSTRAINT "user_levels_current_level_positive" CHECK ("user_levels"."current_level" >= 1);--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_amount_nonnegative" CHECK ("xp_transactions"."amount" >= 0);