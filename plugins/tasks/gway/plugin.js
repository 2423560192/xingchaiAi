// Gway (https://api.gway.dev) OpenAI-compatible video task plugin.
//
// Gway is itself a New API gateway: it accepts POST /v1/video/generations and
// reports task state through GET /v1/videos/tasks/:task_id, returning result
// links in result_urls. This plugin proxies that protocol for its video models
// and declares per-second usage facts so the operator can price by duration.

const MODELS = ["MiniMax H3", "Wan 3.0"];

const PROFILES = {
  "minimax h3": {
    key: "minimax",
    minDuration: 4,
    maxDuration: 15,
    defaultDuration: 15,
    resolutions: ["768p"],
    defaultResolution: "768p",
    maxImages: 9,
    maxVideos: 3,
    maxAudios: 3,
  },
  "wan 3.0": {
    key: "wan",
    minDuration: 5,
    maxDuration: 30,
    defaultDuration: 5,
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    maxImages: 10,
    maxVideos: 0,
    maxAudios: 5,
  },
};

const RATIOS = ["16:9", "9:16", "1:1"];

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function profileFor(model) {
  const folded = trimmed(model).toLowerCase();
  if (/^minimax[\s-]?h3/.test(folded)) return PROFILES["minimax h3"];
  if (/^wan[\s-]?3/.test(folded)) return PROFILES["wan 3.0"];
  throw new Error("unsupported model: " + String(model || ""));
}

function integerField(value, name, minimum, maximum) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < minimum || number > maximum)
    throw new Error(name + " must be an integer between " + minimum + " and " + maximum);
  return number;
}

function durationField(request, profile) {
  if (request.duration === undefined && request.seconds === undefined) return profile.defaultDuration;
  return integerField(
    request.duration === undefined ? request.seconds : request.duration,
    "duration",
    profile.minDuration,
    profile.maxDuration
  );
}

function mediaItems(value, name) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(name + " must be an array");
  const items = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item === "string") {
      if (!/^https?:\/\//i.test(item.trim())) throw new Error(name + "[" + index + "] must be an http(s) URL");
      items.push(item.trim());
      continue;
    }
    const object = plainObject(item);
    if (!object) throw new Error(name + "[" + index + "] must be an object or URL string");
    const url = trimmed(object.url);
    if (!url || !/^https?:\/\//i.test(url)) throw new Error(name + "[" + index + "].url must be an http(s) URL");
    items.push(Object.assign({}, object, { url: url }));
  }
  return items;
}

function normalizeRequest(request, model, upstreamModel) {
  const source = plainObject(request);
  if (!source) throw new Error("request body must be an object");
  const prompt = trimmed(source.prompt);
  if (!prompt) throw new Error("field prompt is required");

  const profile = profileFor(model);
  const body = {
    model: trimmed(upstreamModel) || trimmed(model) || MODELS[0],
    prompt: prompt,
    duration: durationField(source, profile),
  };

  const requestedResolution = trimmed(source.resolution).toLowerCase();
  if (requestedResolution && !profile.resolutions.includes(requestedResolution))
    throw new Error("resolution must be one of " + profile.resolutions.join(", "));
  body.resolution = requestedResolution || profile.defaultResolution;

  const ratio = trimmed(source.ratio || source.aspect_ratio);
  if (ratio) {
    if (!RATIOS.includes(ratio)) throw new Error("ratio must be one of " + RATIOS.join(", "));
    body.ratio = ratio;
  }

  for (const key of ["images", "videos", "audios"]) {
    const items = mediaItems(source[key], key);
    if (items !== undefined) body[key] = items;
  }
  if (body.images && body.images.length > profile.maxImages)
    throw new Error("images accepts at most " + profile.maxImages + " items");
  if (profile.maxVideos > 0 && body.videos && body.videos.length > profile.maxVideos)
    throw new Error("videos accepts at most " + profile.maxVideos + " items");
  if (body.audios && body.audios.length > profile.maxAudios)
    throw new Error("audios accepts at most " + profile.maxAudios + " items");

  if (source.materials !== undefined) {
    if (!Array.isArray(source.materials)) throw new Error("materials must be an array");
    body.materials = source.materials;
  }
  if (source.face !== undefined && plainObject(source.face)) body.face = source.face;

  const images = body.images || [];
  const action = images.some((item) => {
    if (plainObject(item)) {
      const type = trimmed(item.type || item.role);
      return type === "first_frame" || type === "end_frame" || type === "last_frame";
    }
    return false;
  })
    ? "image_to_video"
    : "text_to_video";
  return { body, action, profile };
}

export const meta = {
  apiVersion: 1,
  key: "gway",
  name: "Gway Video",
  icon: "text:GW",
  description: {
    en: "Gway OpenAI-compatible video generation (MiniMax H3 / Wan 3.0)",
    zh: "Gway 视频生成（MiniMax H3 / Wan 3.0，OpenAI 兼容协议）",
  },
  version: "1.1.0",
  author: { name: "XingChai" },
  website: "https://gway.dev",
  baseUrl: "https://api.gway.dev",
  models: MODELS,
  fetchMode: "per_task",
  upstreams: ["vendor", "new_api"],
  usageSchema: {
    seconds: {
      type: "number",
      unit: "second",
      description: { en: "Requested video duration in seconds", zh: "请求的视频时长（秒）" },
    },
  },
  usageProfiles: [
    {
      models: ["MiniMax H3"],
      schema: {
        seconds: {
          type: "number",
          unit: "second",
          description: { en: "Requested video duration in seconds", zh: "请求的视频时长（秒）" },
        },
      },
      examples: [
        { label: "4s", facts: { seconds: 4 } },
        { label: "15s", facts: { seconds: 15 } },
      ],
    },
    {
      models: ["Wan 3.0"],
      schema: {
        seconds: {
          type: "number",
          unit: "second",
          description: { en: "Requested video duration in seconds", zh: "请求的视频时长（秒）" },
        },
        resolution: {
          enum: ["480p", "720p", "1080p"],
          enumLabels: {
            "480p": { en: "480p", zh: "480p" },
            "720p": { en: "720p", zh: "720p" },
            "1080p": { en: "1080p", zh: "1080p" },
          },
          description: { en: "Output resolution", zh: "输出分辨率" },
        },
      },
      examples: [
        { label: "480p · 5s", facts: { seconds: 5, resolution: "480p" } },
        { label: "720p · 5s", facts: { seconds: 5, resolution: "720p" } },
        { label: "1080p · 5s", facts: { seconds: 5, resolution: "1080p" } },
      ],
    },
  ],
  protocols: [{ name: "openai_video", models: MODELS }],
};

export function buildSubmitRequest(ctx) {
  const request = normalizeRequest(ctx.requestBody || {}, ctx.model, ctx.upstreamModel);
  return {
    url: ctx.baseUrl + "/v1/video/generations",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + ctx.apiKey,
    },
    body: request.body,
    action: request.action,
  };
}

export function parseSubmitResponse(_ctx, response) {
  const body = plainObject(response && response.body);
  const taskId = body && (trimmed(body.id) || trimmed(body.task_id));
  if (!taskId) throw new Error("Gway did not return a task id");
  return { taskId: taskId, taskData: body };
}

export function buildQueryRequest(ctx) {
  return {
    url: ctx.baseUrl + "/v1/videos/tasks/" + encodeURIComponent(ctx.taskId),
    method: "GET",
    headers: { Accept: "application/json", Authorization: "Bearer " + ctx.apiKey },
  };
}

export function extractUsage(ctx) {
  const request = normalizeRequest(ctx.requestBody || {}, ctx.model, ctx.upstreamModel);
  return { seconds: request.body.duration, resolution: request.body.resolution };
}

export function extractUsageOnComplete() {
  return {};
}

export function parseTaskResult(_ctx, body) {
  const data = plainObject(body);
  if (!data) return { status: "UNKNOWN", reason: "invalid task response" };
  const status = trimmed(data.status).toLowerCase();
  if (status === "queued" || status === "pending") return { status: "QUEUED", progress: "10%" };
  if (status === "in_progress" || status === "processing" || status === "running")
    return { status: "IN_PROGRESS", progress: "50%" };
  if (status === "completed" || status === "succeeded") {
    const urls = Array.isArray(data.result_urls) ? data.result_urls : [];
    const url = trimmed(urls[0]);
    return url ? { status: "SUCCESS", progress: "100%", url: url } : { status: "SUCCESS", progress: "100%" };
  }
  if (status === "failed" || status === "cancelled" || status === "expired") {
    const error = plainObject(data.error);
    return { status: "FAILURE", progress: "100%", reason: trimmed(error && error.message) || status };
  }
  return { status: "UNKNOWN", reason: "unrecognized status: " + String(data.status || "") };
}

function artifactURL(task) {
  const data = plainObject(task && task.data) || {};
  const urls = Array.isArray(data.result_urls) ? data.result_urls : [];
  return trimmed(urls[0]);
}

export function listArtifacts(task) {
  if (task.status !== "SUCCESS" || !artifactURL(task)) return [];
  return [{ key: "video", type: "video", mimeType: "video/mp4" }];
}

export function buildContentRequest(ctx) {
  const url = artifactURL(ctx);
  if (!url) throw new Error("artifact_not_found");
  return { url: url, method: ctx.clientRequest.method, credentialless: true };
}

function renderVideo(task) {
  const data = plainObject(task && task.data) || {};
  const statuses = {
    QUEUED: "queued",
    IN_PROGRESS: "in_progress",
    SUCCESS: "completed",
    FAILURE: "failed",
  };
  const progress = Number(String(task.progress || "0").replace("%", ""));
  const output = {
    id: task.task_id,
    object: "video",
    model: trimmed(data.model) || trimmed((plainObject(task.properties) || {}).origin_model_name),
    status: statuses[task.status] || "unknown",
    progress: Number.isFinite(progress) ? progress : 0,
    created_at: Number(data.created_at || 0),
    result_urls: [],
  };
  if (task.status === "SUCCESS") {
    const urls = Array.isArray(data.result_urls) ? data.result_urls : [];
    output.result_urls = urls.filter((url) => trimmed(url));
  }
  if (task.status === "FAILURE") {
    const error = plainObject(data.error);
    output.error = {
      code: "video_generation_failed",
      message: trimmed(error && error.message) || trimmed(task.fail_reason) || "task failed",
    };
  }
  return output;
}

export const protocols = {
  openai_video: {
    decodeRequest: function (ctx) {
      if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
      const request = plainObject(ctx.body.value);
      if (!request) throw new Error("request body must be an object");
      const normalized = normalizeRequest(request, ctx.model, ctx.upstreamModel);
      return { kind: "submit", model: ctx.model, action: normalized.action, requestBody: normalized.body };
    },
    render: function (_ctx, task) {
      return renderVideo(task);
    },
  },
};
