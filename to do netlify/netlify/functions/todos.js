const { MongoClient, ObjectId } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = "LAB8";
const COLLECTION_NAME = "to do list";

// Cache the client connection across warm lambda invocations
let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) {
    try {
      // Ping to verify the connection is still alive
      await cachedClient.db("admin").command({ ping: 1 });
      return cachedClient;
    } catch {
      cachedClient = null;
    }
  }
  const client = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });
  await client.connect();
  cachedClient = client;
  return client;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

function respond(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

exports.handler = async (event, context) => {
  // Prevent Lambda from waiting for the event loop to drain (needed for MongoDB)
  context.callbackWaitsForEmptyEventLoop = false;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const client = await connectToDatabase();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);

    // ── GET  /api/todos  ─────────────────────────────────────────
    if (event.httpMethod === "GET") {
      const todos = await collection
        .find({})
        .sort({ createdAt: -1 })
        .toArray();
      return respond(200, todos);
    }

    // ── POST  /api/todos  ────────────────────────────────────────
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      if (!body.text || !body.text.trim()) {
        return respond(400, { error: "text is required" });
      }
      const todo = {
        text: body.text.trim(),
        completed: false,
        createdAt: new Date(),
      };
      const result = await collection.insertOne(todo);
      return respond(201, { ...todo, _id: result.insertedId });
    }

    // ── PUT  /api/todos  ─────────────────────────────────────────
    if (event.httpMethod === "PUT") {
      const body = JSON.parse(event.body || "{}");
      if (!body.id) return respond(400, { error: "id is required" });

      const update = {};
      if (body.text !== undefined) update.text = body.text.trim();
      if (body.completed !== undefined) update.completed = body.completed;

      if (Object.keys(update).length === 0) {
        return respond(400, { error: "Nothing to update" });
      }

      const result = await collection.updateOne(
        { _id: new ObjectId(body.id) },
        { $set: update }
      );

      if (result.matchedCount === 0) {
        return respond(404, { error: "Todo not found" });
      }
      return respond(200, { success: true });
    }

    // ── DELETE  /api/todos  ──────────────────────────────────────
    if (event.httpMethod === "DELETE") {
      const body = JSON.parse(event.body || "{}");
      if (!body.id) return respond(400, { error: "id is required" });

      const result = await collection.deleteOne({
        _id: new ObjectId(body.id),
      });
      if (result.deletedCount === 0) {
        return respond(404, { error: "Todo not found" });
      }
      return respond(200, { success: true });
    }

    return respond(405, { error: "Method not allowed" });
  } catch (err) {
    console.error("Function error:", err);
    return respond(500, { error: err.message });
  }
};
