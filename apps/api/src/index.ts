import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  coachingSuggestionSchema,
  exerciseEvaluationRequestSchema,
  mediaConfigSchema,
  mediaPrepareUploadRequestSchema,
  mediaPrepareUploadResponseSchema,
  workoutMediaAssetSchema,
  type WorkoutMediaAsset
} from "@repiq/shared";

const app = express();
const port = Number(process.env.API_PORT ?? 4000);
const engineBaseUrl = process.env.ENGINE_BASE_URL ?? "http://127.0.0.1:8000";
const apiRootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const configuredMediaUploadDir = process.env.MEDIA_UPLOAD_DIR ?? "uploads";
const mediaUploadDir = path.isAbsolute(configuredMediaUploadDir)
  ? configuredMediaUploadDir
  : path.resolve(apiRootDir, configuredMediaUploadDir);
const preparedMediaAssets = new Map<string, WorkoutMediaAsset>();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(mediaUploadDir));

const programRequestSchema = z.object({
  goal: z.enum(["strength", "hypertrophy", "general_fitness"]),
  daysPerWeek: z.number().int().min(2).max(6),
  equipment: z.array(z.string()).min(1),
  experienceLevel: z.enum(["beginner", "returning", "intermediate", "advanced"]),
  sessionDurationMinutes: z.number().int().min(30).max(120)
});

const exampleSuggestion = coachingSuggestionSchema.parse({
  suggestion_type: "INCREASE_LOAD",
  reason_code: "TOP_OF_RANGE",
  label: "Progress the weight",
  what: "Add 2.5kg and target 6-8 reps next session.",
  why: "You have been consistently at the top of your hypertrophy rep range across recent sessions.",
  certainty: "high",
  evidence: [
    {
      key: "top_range_sessions",
      label: "Top-range sessions",
      value: "2",
      detail: "You have repeatedly reached the upper end of the target rep range."
    },
    {
      key: "last_weight",
      label: "Last top weight",
      value: "80.0kg",
      detail: "The next target is anchored to your most recent completed load."
    },
    {
      key: "average_reps",
      label: "Average reps",
      value: "11.3",
      detail: "Rep performance is consistent enough to justify a progression jump."
    }
  ],
  coaching_note: "This is a progression signal, not a guess.",
  override_allowed: true,
  override_prompt:
    "If this does not match how the session felt, you can override it and keep training ownership.",
  safety_notes: [],
  generated_for_date: "2026-01-19",
  options: [],
  rep_range_context: {
    average_reps: 11.3,
    rep_min: 6,
    rep_max: 12,
    status: "progressing"
  }
});

const demoEvaluationPayload = exerciseEvaluationRequestSchema.parse({
  goal: "hypertrophy",
  exercise_name: "Bench Press",
  sessions: [
    {
      date: "2026-01-05",
      exercise: "Bench Press",
      sets: [
        { weight: 80, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 80, reps: 10, set_type: "normal", rpe: 7.5, failed: false },
        { weight: 80, reps: 10, set_type: "normal", rpe: 8, failed: false }
      ]
    },
    {
      date: "2026-01-12",
      exercise: "Bench Press",
      sets: [
        { weight: 80, reps: 11, set_type: "normal", rpe: 8, failed: false },
        { weight: 80, reps: 11, set_type: "normal", rpe: 8, failed: false },
        { weight: 80, reps: 10, set_type: "normal", rpe: 8.5, failed: false }
      ]
    },
    {
      date: "2026-01-19",
      exercise: "Bench Press",
      sets: [
        { weight: 80, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 80, reps: 12, set_type: "normal", rpe: 8, failed: false },
        { weight: 80, reps: 11, set_type: "normal", rpe: 8.5, failed: false }
      ]
    }
  ]
});

const mediaConfig = mediaConfigSchema.parse({
  target: "local_uploads",
  max_images_per_workout: 3,
  image_enabled: true,
  video_enabled: false,
  max_photo_mb: 10,
  max_video_mb: 100,
  max_video_seconds: 30
});

function buildPublicUploadUrl(storageKey: string) {
  return `/uploads/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
}

function resolveStoragePath(storageKey: string) {
  const normalizedKey = path.posix.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, "");
  if (!normalizedKey || normalizedKey.startsWith("/") || normalizedKey.includes("..")) {
    throw new Error("Invalid storage key");
  }

  const resolvedPath = path.resolve(mediaUploadDir, normalizedKey);
  const uploadRoot = path.resolve(mediaUploadDir);

  if (!resolvedPath.startsWith(uploadRoot)) {
    throw new Error("Storage path escapes upload root");
  }

  return {
    normalizedKey,
    resolvedPath
  };
}

async function requestEngineSuggestion(payload: z.infer<typeof exerciseEvaluationRequestSchema>) {
  const response = await fetch(`${engineBaseUrl}/v1/evaluate`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Engine request failed (${response.status}): ${body}`);
  }

  const json = await response.json();
  return coachingSuggestionSchema.parse(json);
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "api",
    timestamp: new Date().toISOString()
  });
});

app.get("/v1/architecture", (_req, res) => {
  res.json({
    northStar: "You've been putting in the work. RepIQ makes sure the work pays off.",
    firstSlice: [
      "Generate program",
      "Log session",
      "Persist sets",
      "Run engine",
      "Show next suggestion"
    ],
    coachingContract: {
      principle:
        "RepIQ should guide with evidence and clear uncertainty, not just issue instructions.",
      responseShape: exampleSuggestion
    }
  });
});

app.get("/v1/media/config", (_req, res) => {
  res.json({
    status: "ok",
    uploadDir: "apps/api/uploads",
    constraints: mediaConfig
  });
});

app.post("/v1/media/prepare", (req, res) => {
  const parsed = mediaPrepareUploadRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid media prepare payload",
      issues: parsed.error.issues
    });
  }

  const { kind, file_name, mime_type, byte_size } = parsed.data;
  const extensionFromName = file_name.includes(".") ? file_name.split(".").pop() : undefined;
  const extensionFromMime = mime_type.split("/")[1];
  const extension = extensionFromName || extensionFromMime || "bin";
  const assetId = `media_${crypto.randomUUID()}`;
  const storageKey = `workouts/${new Date().toISOString().slice(0, 10)}/${assetId}.${extension}`;

  const response = mediaPrepareUploadResponseSchema.parse({
    status: "ready",
    target: mediaConfig.target,
    asset: {
      id: assetId,
      kind,
      storage_key: storageKey,
      original_name: file_name,
      mime_type,
      byte_size,
      upload_url: `/v1/media/${assetId}/upload`,
      public_url: null
    },
    constraints: mediaConfig
  });

  preparedMediaAssets.set(assetId, response.asset);

  return res.status(200).json({
    ...response,
    message:
      "RepIQ is using a backend-managed media boundary. Local uploads can be implemented behind this contract first, then swapped to cloud storage later."
  });
});

app.post(
  "/v1/media/:assetId/upload",
  express.raw({
    type: () => true,
    limit: `${Math.ceil(mediaConfig.max_photo_mb + 2)}mb`
  }),
  (req, res) => {
    void (async () => {
      const prepared = preparedMediaAssets.get(req.params.assetId);

      if (!prepared) {
        return res.status(404).json({
          error: "Unknown media asset",
          message: "Prepare the media asset before uploading content."
        });
      }

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({
          error: "Empty upload body"
        });
      }

      if (req.body.length !== prepared.byte_size) {
        return res.status(400).json({
          error: "Upload size mismatch",
          expected: prepared.byte_size,
          received: req.body.length
        });
      }

      if (prepared.kind === "image" && !prepared.mime_type.startsWith("image/")) {
        return res.status(400).json({
          error: "Prepared asset is not an image"
        });
      }

      try {
        const { normalizedKey, resolvedPath } = resolveStoragePath(prepared.storage_key);
        await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
        await fs.writeFile(resolvedPath, req.body);

        const uploadedAsset = workoutMediaAssetSchema.parse({
          ...prepared,
          storage_key: normalizedKey,
          public_url: buildPublicUploadUrl(normalizedKey)
        });

        preparedMediaAssets.set(req.params.assetId, uploadedAsset);

        return res.status(201).json({
          status: "stored",
          asset: uploadedAsset
        });
      } catch (error) {
        return res.status(500).json({
          error: "Upload failed",
          message: error instanceof Error ? error.message : "The media upload could not be saved."
        });
      }
    })();
  }
);

app.post("/v1/programs/generate", (req, res) => {
  const result = programRequestSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: "Invalid program generation payload",
      issues: result.error.issues
    });
  }

  return res.status(202).json({
    status: "accepted",
    message: "Program generation should become an async workflow backed by Supabase and the explanation worker.",
    payload: result.data
  });
});

app.post("/v1/sessions/:sessionId/complete", (req, res) => {
  void (async () => {
    const parsed = req.body && Object.keys(req.body).length
      ? exerciseEvaluationRequestSchema.safeParse(req.body)
      : { success: true as const, data: demoEvaluationPayload };

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid session completion payload",
        issues: parsed.error.issues
      });
    }

    try {
      const suggestion = await requestEngineSuggestion(parsed.data);
      return res.status(200).json({
        status: "ok",
        sessionId: req.params.sessionId,
        engineSource: "live",
        suggestion
      });
    } catch (error) {
      return res.status(502).json({
        status: "error",
        sessionId: req.params.sessionId,
        engineSource: "unavailable",
        message:
          error instanceof Error
            ? error.message
            : "The engine could not be reached.",
        fallbackSuggestion: exampleSuggestion
      });
    }
  })();
});

app.get("/v1/demo/session-complete", async (_req, res) => {
  try {
    const suggestion = await requestEngineSuggestion(demoEvaluationPayload);
    return res.json({
      status: "ok",
      engineSource: "live",
      sessionId: "demo-session-bench-001",
      suggestion
    });
  } catch (error) {
    return res.status(502).json({
      status: "error",
      engineSource: "unavailable",
      sessionId: "demo-session-bench-001",
      message:
        error instanceof Error
          ? error.message
          : "The engine could not be reached.",
      fallbackSuggestion: exampleSuggestion
    });
  }
});

app.listen(port, () => {
  console.log(`RepIQ API listening on http://localhost:${port}`);
});
