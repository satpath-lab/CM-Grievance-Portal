import { Schema, model, Document } from "mongoose";

export interface IDispatchEvent extends Document {
  grvId: string;
  department: string;
  departmentCode: string;
  refNumber: string;
  dispatchedAt: Date;
  dispatchedBy: string;
  method: "internal" | "open311" | "manual";
  acknowledged: boolean;
  ackBy?: string;
  ackAt?: Date;
  note: string;
}

const DispatchEventSchema = new Schema<IDispatchEvent>({
  grvId: { type: String, required: true, index: true },
  department: { type: String, required: true },
  departmentCode: { type: String, required: true, index: true },
  refNumber: { type: String, required: true, unique: true },
  dispatchedAt: { type: Date, required: true },
  dispatchedBy: { type: String, required: true },
  method: { type: String, enum: ["internal", "open311", "manual"], default: "internal" },
  acknowledged: { type: Boolean, default: false, index: true },
  ackBy: { type: String },
  ackAt: { type: Date },
  note: { type: String, default: "" },
});

export const DispatchEvent = model<IDispatchEvent>("DispatchEvent", DispatchEventSchema);
