import mongoose from "mongoose";

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/delhi_grievance";

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri);

  const conn = mongoose.connection;
  conn.on("error", (err) => console.error("MongoDB connection error:", err));
  conn.once("open", () => console.log(`MongoDB connected: ${conn.name}`));
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
