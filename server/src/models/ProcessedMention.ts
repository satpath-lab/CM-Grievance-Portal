import { Schema, model, Document } from "mongoose";

export type SocialDecision = "auto_filed" | "needs_review" | "rejected";

export interface IProcessedMention extends Document {
  postUrl: string;
  platform: string;
  handle: string;
  text: string;
  decision: SocialDecision;
  reason: string;
  confidence: number;
  grvId?: string; // set if decision === "auto_filed"
  processedAt: Date;
}

const ProcessedMentionSchema = new Schema<IProcessedMention>({
  postUrl: { type: String, required: true, unique: true, index: true },
  platform: { type: String, required: true },
  handle: { type: String, required: true },
  text: { type: String, required: true },
  decision: { type: String, enum: ["auto_filed", "needs_review", "rejected"], required: true },
  reason: { type: String, default: "" },
  confidence: { type: Number, default: 0 },
  grvId: { type: String },
  processedAt: { type: Date, required: true, default: Date.now },
});

export const ProcessedMention = model<IProcessedMention>("ProcessedMention", ProcessedMentionSchema);
