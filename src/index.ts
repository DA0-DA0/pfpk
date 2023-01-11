import { createCors } from "itty-cors";
import { Router } from "itty-router";
import { Env } from "./types";
import { updateProfile } from "./routes/updateProfile";
import { fetchProfile } from "./routes/fetchProfile";
import { searchProfiles } from "./routes/searchProfiles";

// Create CORS handlers.
const { preflight, corsify } = createCors({
  methods: ["GET", "POST"],
  origins: ["*"],
  maxAge: 3600,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  },
});

const router = Router();

// Handle CORS preflight OPTIONS request.
router.options("*", preflight);

// Search profiles.
router.get("/search/:bech32Prefix/:namePrefix", searchProfiles);

// Fetch profile.
router.get("/:publicKey", fetchProfile);

// Update profile.
router.post("/:publicKey", updateProfile);

// 404
router.all("*", () => new Response("404", { status: 404 }));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return router
      .handle(request, env)
      .catch(
        (err) =>
          new Response(
            JSON.stringify({
              error: "Unknown error occurred.",
              message: err instanceof Error ? err.message : `${err}`,
            }),
            {
              status: 500,
            }
          )
      )
      .then(corsify);
  },
};
