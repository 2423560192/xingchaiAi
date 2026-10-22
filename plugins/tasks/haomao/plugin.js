const MODELS = ["seedance-2.0-mini", "seedance-2.0", "seedance-2.0-fast", "seedance-2.5"];
const RESOLUTIONS = ["480p", "720p"];
const ALL_RESOLUTIONS = ["480p", "720p", "1080p", "4k"];
const MODEL_RESOLUTIONS = {
  "seedance-2.0": ["480p", "720p", "4k", "1080p"],
  "seedance-2.5": ["480p", "720p", "1080p"],
};
const RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
const BITRATE_MODES = ["standard", "high"];
const MIN_DURATION = 4;
const MAX_DURATION = 15;
const DEFAULT_DURATION = 8;
const DEFAULT_RESOLUTION = "720p";
const DEFAULT_RATIO = "16:9";
const MAX_IMAGES = 9;
const MAX_VIDEOS = 3;
const MAX_AUDIOS = 3;
const MAX_INPUT_IMAGE_BYTES = 20 * 1024 * 1024;
// The local Haomao quote path reserves 15 seconds when a reference video is
// present because URL inputs do not expose their duration before submission.
const QUOTED_VIDEO_INPUT_SECONDS = 15;
const MAX_REPORTED_TOKENS = 1000000;

function resolutionField(resolutions) {
  const enumLabels = {};
  for (const r of resolutions) enumLabels[r] = { en: r, zh: r };
  return { enum: resolutions, enumLabels: enumLabels, description: { en: "Output video resolution", zh: "输出视频分辨率" } };
}

const USAGE_SCHEMA = {
  tokens: {
    type: "number",
    unit: "token",
    description: { en: "Billing token unit price", zh: "计费 Token 单价" },
  },
  resolution: {
    enum: RESOLUTIONS,
    enumLabels: { "480p": { en: "480p", zh: "480p" }, "720p": { en: "720p", zh: "720p" } },
    description: { en: "Output video resolution", zh: "输出视频分辨率" },
  },
  video_input: {
    enum: ["none", "video"],
    enumLabels: {
      none: { en: "No reference video", zh: "无参考视频" },
      video: { en: "With reference video", zh: "有参考视频" },
    },
    description: { en: "Reference video input", zh: "参考视频输入" },
  },
};

export const meta = {
  apiVersion: 1,
  key: "haomao",
  name: "Haomao Seedance",
  icon: "text:HM",
  description: {
    en: "Haomao Seedance 2.0 Mini. OpenAI: POST /v1/videos, GET /v1/videos/:task_id, GET/HEAD /v1/videos/:task_id/content, and POST /v1/responses. Native: POST /haomao/api/v3/contents/generations/tasks, GET the same path/:task_id. Fields: model; content types text/image_url/video_url/audio_url with frame/reference roles; resolution 480p|720p; ratio 21:9|16:9|4:3|1:1|3:4|9:16; duration 4-15; generate_audio; seed; guidance_scale; watermark; bitrate_mode standard|high. Limits: 9 images, 3 videos, 3 audios.",
    zh: "Haomao Seedance 2.0 Mini。OpenAI：POST /v1/videos，GET /v1/videos/:task_id，GET/HEAD /v1/videos/:task_id/content，以及 POST /v1/responses；原生：POST /haomao/api/v3/contents/generations/tasks，GET 同路径/:task_id。字段：model；content 类型 text/image_url/video_url/audio_url，角色 first_frame/last_frame/reference_image/reference_video/reference_audio；resolution 480p/720p；ratio 21:9/16:9/4:3/1:1/3:4/9:16；duration 4–15；generate_audio、seed、guidance_scale、watermark；bitrate_mode standard/high。上限：图片 9、视频 3、音频 3。",
  },
  version: "1.0.0",
  author: { name: "Incofusion" },
  website: "https://haomaotoken.apifox.cn/9427184m0",
  baseUrl: "https://haomaotoken.com/api/v3",
  models: MODELS,
  fetchMode: "per_task",
  upstreams: ["vendor", "new_api"],
  usageSchema: USAGE_SCHEMA,
  usageProfiles: [
    { models: ["seedance-2.0"], schema: { tokens: USAGE_SCHEMA.tokens, resolution: resolutionField(["480p", "720p", "4k", "1080p"]), video_input: USAGE_SCHEMA.video_input }, examples: [ { label: "480p · 5s", facts: { tokens: 50039, resolution: "480p", video_input: "none" } }, { label: "4k · 5s", facts: { tokens: 972000, resolution: "4k", video_input: "none" } } ] },
    { models: ["seedance-2.5"], schema: { tokens: USAGE_SCHEMA.tokens, resolution: resolutionField(["480p", "720p", "1080p"]), video_input: USAGE_SCHEMA.video_input }, examples: [ { label: "480p · 5s", facts: { tokens: 50039, resolution: "480p", video_input: "none" } }, { label: "1080p · 5s", facts: { tokens: 243000, resolution: "1080p", video_input: "none" } } ] },
  ],
  usageExamples: [
    { label: "480p · 5s", facts: { tokens: 50039, resolution: "480p", video_input: "none" } },
    { label: "720p · 5s", facts: { tokens: 108000, resolution: "720p", video_input: "none" } },
    { label: "720p · 5s (+15s input video)", facts: { tokens: 432000, resolution: "720p", video_input: "video" } },
  ],
  routes: [
    { method: "POST", path: "/haomao/api/v3/contents/generations/tasks", type: "submit", decode: "createTask", render: "taskCreated" },
    { method: "GET", path: "/haomao/api/v3/contents/generations/tasks/:task_id", type: "query", render: "taskStatus" },
  ],
  protocols: [
    { name: "openai_responses", supports: ["stream", "sync", "background"] },
    { name: "openai_video", models: MODELS },
  ],
};

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function apiRoot(ctx) {
  return ctx.baseUrl + (ctx.upstream && ctx.upstream.kind === "new_api" ? "/haomao/api/v3" : "");
}

function integerField(value, name, minimum, maximum) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < minimum || number > maximum)
    throw new Error(name + " must be an integer between " + minimum + " and " + maximum);
  return number;
}

function numberField(value, name) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number) || number <= 0) throw new Error(name + " must be a positive number");
  return number;
}

function booleanField(value, name) {
  if (typeof value !== "boolean") throw new Error(name + " must be a boolean");
  return value;
}

function base64Bytes(url) {
  const comma = url.indexOf(",");
  if (comma < 0) return Infinity;
  const payload = url.slice(comma + 1).replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) return Infinity;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

function mediaURL(value, name, image) {
  const object = plainObject(value);
  const url = trimmed(object && hasOwn(object, "url") ? object.url : value);
  if (!url) throw new Error(name + ".url is required");
  if (/^https?:\/\//i.test(url)) return url;
  if (image && /^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) {
    if (base64Bytes(url) > MAX_INPUT_IMAGE_BYTES) throw new Error(name + " exceeds the 20 MB image limit");
    return url;
  }
  throw new Error(name + " must use an http(s) URL" + (image ? " or an image data URL" : ""));
}

function normalizeContent(value) {
  if (!Array.isArray(value)) throw new Error("content must be an array");
  const content = [];
  const counts = { image: 0, video: 0, audio: 0, first: 0, last: 0 };
  for (let index = 0; index < value.length; index += 1) {
    const item = plainObject(value[index]);
    if (!item) throw new Error("content[" + index + "] must be an object");
    if (item.type === "text") {
      if (typeof item.text !== "string" || !item.text.trim()) throw new Error("content[" + index + "].text is required");
      content.push({ type: "text", text: item.text.trim() });
      continue;
    }
    const media = { image_url: "image", video_url: "video", audio_url: "audio" }[item.type];
    if (!media) throw new Error("content[" + index + "].type must be text, image_url, video_url, or audio_url");
    const expectedRole = "reference_" + media;
    let role = trimmed(item.role) || expectedRole;
    if (media === "image") {
      if (!["first_frame", "last_frame", "reference_image"].includes(role))
        throw new Error("content[" + index + "].role must be first_frame, last_frame, or reference_image");
      if (role === "first_frame") counts.first += 1;
      if (role === "last_frame") counts.last += 1;
    } else if (role !== expectedRole) {
      throw new Error("content[" + index + "].role must be " + expectedRole);
    }
    counts[media] += 1;
    const field = media + "_url";
    content.push({ type: item.type, [field]: { url: mediaURL(item[field], "content[" + index + "]." + field, media === "image") }, role: role });
  }
  if (!content.length) throw new Error("content is required");
  if (counts.image > MAX_IMAGES) throw new Error("content accepts at most " + MAX_IMAGES + " images");
  if (counts.video > MAX_VIDEOS) throw new Error("content accepts at most " + MAX_VIDEOS + " videos");
  if (counts.audio > MAX_AUDIOS) throw new Error("content accepts at most " + MAX_AUDIOS + " audios");
  if (counts.first > 1 || counts.last > 1) throw new Error("content accepts at most one first_frame and one last_frame");
  if (counts.audio && !counts.image && !counts.video) throw new Error("reference audio requires at least one image or video");
  return content;
}

function requestAction(content) {
  if (content.some((item) => item.role === "reference_image" || item.role === "reference_video" || item.role === "reference_audio"))
    return "reference_media_to_video";
  if (content.some((item) => item.role === "first_frame" || item.role === "last_frame")) return "start_end_frame_to_video";
  return "text_to_video";
}

function sizeOptions(value) {
  const text = trimmed(value).toLowerCase();
  if (!text) return {};
  if (ALL_RESOLUTIONS.includes(text)) return { resolution: text };
  const parts = text.replace("*", "x").split("x");
  const width = Number(parts[0]);
  const height = Number(parts[1]);
  if (parts.length !== 2 || !(width > 0) || !(height > 0)) throw new Error("size must be WIDTHxHEIGHT, 480p, or 720p");
  const shorter = Math.min(width, height);
  const target = width / height;
  let ratio = RATIOS[0];
  let distance = Infinity;
  for (const candidate of RATIOS) {
    const sides = candidate.split(":").map(Number);
    const current = Math.abs(Math.log(target) - Math.log(sides[0] / sides[1]));
    if (current < distance) {
      ratio = candidate;
      distance = current;
    }
  }
  const resolution = shorter >= 2160 ? "4k" : shorter >= 1080 ? "1080p" : shorter >= 720 ? "720p" : "480p";
  return { resolution: resolution, ratio: ratio };
}

function normalizedRequest(source, identity) {
  const input = plainObject(source);
  if (!input) throw new Error("request body must be an object");
  const metadata = input.metadata === undefined ? {} : plainObject(input.metadata);
  if (!metadata) throw new Error("metadata must be an object");
  const options = Object.assign({}, metadata, input.size === undefined ? {} : sizeOptions(input.size));
  for (const key of Object.keys(input)) {
    if (input[key] !== undefined && input[key] !== null && key !== "metadata") options[key] = input[key];
  }

  const model = trimmed(identity && identity.upstreamModel) || trimmed(options.model) || trimmed(identity && identity.model);
  if (!MODELS.includes(model)) throw new Error("model must be one of " + MODELS.join(", "));

  let rawContent = options.content;
  if (rawContent !== undefined && !Array.isArray(rawContent)) throw new Error("content must be an array");
  rawContent = Array.isArray(rawContent) ? rawContent.slice() : [];
  const prompt = options.prompt === undefined || options.prompt === null ? "" : options.prompt;
  if (typeof prompt !== "string") throw new Error("prompt must be a string");
  if (prompt.trim()) rawContent.push({ type: "text", text: prompt.trim() });

  const addImage = function (value, role) {
    if (value === undefined || value === null || value === "") return;
    rawContent.push({ type: "image_url", image_url: value, role: role });
  };
  addImage(options.input_reference, "first_frame");
  addImage(options.image, "first_frame");
  if (options.images !== undefined && !Array.isArray(options.images)) throw new Error("images must be an array");
  for (const image of options.images || []) addImage(image, "reference_image");

  const content = normalizeContent(rawContent);
  const body = {
    model: model,
    content: content,
    resolution: options.resolution === undefined ? DEFAULT_RESOLUTION : trimmed(options.resolution).toLowerCase(),
    ratio: options.ratio === undefined && options.aspect_ratio === undefined ? DEFAULT_RATIO : trimmed(options.ratio === undefined ? options.aspect_ratio : options.ratio),
    duration:
      options.duration === undefined && options.seconds === undefined
        ? DEFAULT_DURATION
        : integerField(options.duration === undefined ? options.seconds : options.duration, "duration", MIN_DURATION, MAX_DURATION),
  };
  const allowedResolutions = MODEL_RESOLUTIONS[model] || RESOLUTIONS;
  if (!allowedResolutions.includes(body.resolution)) throw new Error("resolution must be one of " + allowedResolutions.join(", "));
  if (!RATIOS.includes(body.ratio)) throw new Error("ratio must be one of " + RATIOS.join(", "));
  for (const key of ["generate_audio", "watermark"]) {
    if (options[key] !== undefined) body[key] = booleanField(options[key], key);
  }
  if (options.seed !== undefined) body.seed = integerField(options.seed, "seed", Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  if (options.guidance_scale !== undefined) body.guidance_scale = numberField(options.guidance_scale, "guidance_scale");
  if (options.bitrate_mode !== undefined) {
    body.bitrate_mode = trimmed(options.bitrate_mode).toLowerCase();
    if (!BITRATE_MODES.includes(body.bitrate_mode)) throw new Error("bitrate_mode must be standard or high");
  }
  // Seedance 2.5 rejects explicit ratios on first-frame / first-last-frame tasks
  // ("only ratio=adaptive is supported"), and the output ratio follows the input
  // frames anyway, so frame-based tasks always request adaptive upstream.
  const isFrameTask = content.some(function (item) {
    return item.role === "first_frame" || item.role === "last_frame";
  });
  if (isFrameTask) body.ratio = "adaptive";
  return { action: requestAction(content), body: body };
}

function resolutionPixels(resolution) {
  if (resolution === "480p") return [854, 480, 25];
  if (resolution === "720p") return [1280, 720, 24];
  if (resolution === "1080p") return [1920, 1080, 24];
  if (resolution === "4k") return [3840, 2160, 24];
  return [1280, 720, 24];
}

function estimateTokens(seconds, resolution) {
  const dimensions = resolutionPixels(resolution);
  return Math.round((seconds * dimensions[0] * dimensions[1] * dimensions[2]) / 1024);
}

function hasVideo(content) {
  return content.some((item) => item.type === "video_url");
}

function responsesInput(value) {
  const texts = [];
  const images = [];
  const visit = function (item) {
    if (typeof item === "string") {
      if (item.trim()) texts.push(item.trim());
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    const object = plainObject(item);
    if (!object) return;
    if (["input_text", "text"].includes(object.type) && typeof object.text === "string" && object.text.trim()) texts.push(object.text.trim());
    if (["input_image", "image_url"].includes(object.type)) {
      const image = plainObject(object.image_url) ? object.image_url.url : object.image_url || object.image_url;
      if (trimmed(image)) images.push(trimmed(image));
    }
    if (Array.isArray(object.content)) object.content.forEach(visit);
  };
  visit(value);
  return { prompt: texts.join("\n"), images: images };
}

function artifactData(task) {
  return plainObject(task && task.data) || {};
}

function videoText(ctx) {
  const artifact = ctx && ctx.artifacts && ctx.artifacts.video;
  const url = trimmed(artifact && artifact.url);
  if (!url) throw new Error("video artifact is unavailable");
  const escaped = url.replace(/&/g, "&amp;").replace(/\"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return '<video controls src="' + escaped + '"></video>';
}

function nativeStatus(task) {
  const data = artifactData(task);
  if (trimmed(data.status)) return Object.assign({}, data, { id: task.task_id });
  const statuses = { NOT_START: "pending", SUBMITTED: "pending", QUEUED: "queued", IN_PROGRESS: "running", SUCCESS: "succeeded", FAILURE: "failed" };
  const output = { id: task.task_id, status: statuses[task.status] || "pending" };
  if (task.fail_reason) output.error = { message: task.fail_reason };
  return output;
}

export const native = {
  createTask: function (ctx) {
    if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
    const source = plainObject(ctx.body.value);
    if (!source) throw new Error("request body must be an object");
    const model = trimmed(source.model);
    if (!model) throw new Error("model is required");
    const request = normalizedRequest(source, { model: model });
    return { kind: "submit", model: model, action: request.action, requestBody: request.body };
  },
  taskCreated: function (_ctx, task) {
    return Object.assign({}, artifactData(task), { id: task.task_id });
  },
  taskStatus: function (_ctx, task) {
    return nativeStatus(task);
  },
  error: function (_ctx, error) {
    return { error: { code: error.code, message: error.message } };
  },
};

export function buildSubmitRequest(ctx) {
  const request = normalizedRequest(ctx.requestBody || {}, ctx);
  return {
    url: apiRoot(ctx) + "/contents/generations/tasks",
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + ctx.apiKey },
    body: request.body,
    action: request.action,
    rewriteModel: request.body.model,
  };
}

export function parseSubmitResponse(_ctx, response) {
  const body = plainObject(response && response.body);
  if (!body || !trimmed(body.id)) throw new Error("Haomao did not return a task id");
  return { taskId: trimmed(body.id), taskData: body };
}

export function extractUsage(ctx) {
  const request = normalizedRequest(ctx.requestBody || {}, ctx);
  const video = hasVideo(request.body.content);
  if (ctx.usagePurpose === "billing_ratios") return video ? { video_input_ratio: 14 / 23 } : null;
  const seconds = request.body.duration + (video ? QUOTED_VIDEO_INPUT_SECONDS : 0);
  return { tokens: estimateTokens(seconds, request.body.resolution), resolution: request.body.resolution, video_input: video ? "video" : "none" };
}

export function buildQueryRequest(ctx) {
  return {
    url: apiRoot(ctx) + "/contents/generations/tasks/" + encodeURIComponent(ctx.taskId),
    method: "GET",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + ctx.apiKey },
  };
}

export function parseTaskResult(_ctx, body) {
  const data = plainObject(body);
  if (!data) return { status: "UNKNOWN", reason: "invalid task response" };
  if (data.status === "pending" || data.status === "queued") return { status: "QUEUED", progress: "10%" };
  if (data.status === "processing" || data.status === "running") return { status: "IN_PROGRESS", progress: "50%" };
  if (data.status === "succeeded") {
    const content = plainObject(data.content) || {};
    const result = { status: "SUCCESS", progress: "100%", url: trimmed(content.video_url) };
    const usage = plainObject(data.usage) || {};
    const completion = Number(usage.completion_tokens);
    const total = Number(usage.total_tokens);
    if (Number.isFinite(completion) && completion > 0 && completion <= MAX_REPORTED_TOKENS) result.completionTokens = completion;
    if (Number.isFinite(total) && total > 0 && total <= MAX_REPORTED_TOKENS) result.totalTokens = total;
    return result;
  }
  if (["failed", "cancelled", "expired"].includes(data.status)) {
    const error = plainObject(data.error);
    return { status: "FAILURE", progress: "100%", reason: trimmed(error && error.message) || data.status };
  }
  return { status: "UNKNOWN", reason: "unrecognized status: " + String(data.status || "") };
}

export function extractUsageOnComplete(_task, _result, body) {
  const data = plainObject(body);
  if (!data || data.status !== "succeeded") return {};
  const usage = plainObject(data.usage) || {};
  let tokens = Number(usage.completion_tokens);
  if (!Number.isFinite(tokens) || tokens <= 0) tokens = Number(usage.total_tokens);
  const facts = {};
  if (Number.isFinite(tokens) && tokens > 0 && tokens <= MAX_REPORTED_TOKENS) facts.tokens = tokens;
  const content = plainObject(data.content) || {};
  const resolution = trimmed(content.resolution || data.resolution).toLowerCase();
  if (ALL_RESOLUTIONS.includes(resolution)) facts.resolution = resolution;
  return facts;
}

export function listArtifacts(task) {
  if (task.status !== "SUCCESS") return [];
  const content = plainObject(artifactData(task).content) || {};
  const artifacts = [];
  if (trimmed(content.video_url)) artifacts.push({ key: "video", type: "video", mimeType: "video/mp4" });
  if (trimmed(content.last_frame_url)) artifacts.push({ key: "last_frame", type: "image" });
  return artifacts;
}

export function buildContentRequest(ctx) {
  const content = plainObject(artifactData(ctx).content) || {};
  const url = trimmed({ video: content.video_url, last_frame: content.last_frame_url }[ctx.artifactKey]);
  if (!url) throw new Error("artifact_not_found");
  return { url: url, method: ctx.clientRequest.method, credentialless: true };
}

function decodeVideoBody(ctx) {
  if (!ctx.body || (ctx.body.kind !== "json" && ctx.body.kind !== "multipart")) throw new Error("JSON or multipart body required");
  if (ctx.body.kind === "json") {
    const body = plainObject(ctx.body.value);
    if (!body) throw new Error("JSON object required");
    return body;
  }
  if ((ctx.body.files || []).length) throw new Error("Haomao references must be URLs; multipart file uploads are not supported");
  const body = {};
  const fields = ctx.body.fields || {};
  for (const name of Object.keys(fields)) {
    if (fields[name].length !== 1) throw new Error(name + " must be provided once");
    body[name] = fields[name][0];
  }
  for (const key of ["content", "metadata", "images"]) {
    if (body[key] === undefined) continue;
    try {
      body[key] = JSON.parse(body[key]);
    } catch (_error) {
      throw new Error(key + " must be valid JSON");
    }
  }
  for (const key of ["generate_audio", "watermark"]) {
    if (body[key] === undefined) continue;
    if (body[key] !== "true" && body[key] !== "false") throw new Error(key + " must be true or false");
    body[key] = body[key] === "true";
  }
  for (const key of ["duration", "seconds", "seed", "guidance_scale"]) {
    if (body[key] !== undefined) body[key] = Number(body[key]);
  }
  return body;
}

function renderVideo(task) {
  const statusMap = { NOT_START: "queued", SUBMITTED: "queued", QUEUED: "queued", IN_PROGRESS: "in_progress", SUCCESS: "completed", FAILURE: "failed" };
  const output = {
    id: task.task_id,
    object: "video",
    model: task.properties ? task.properties.origin_model_name || "" : "",
    status: statusMap[task.status] || "unknown",
    progress: Number(String(task.progress || "0").replace("%", "")),
    created_at: task.created_at,
    completed_at: task.updated_at,
  };
  if (task.status === "FAILURE") output.error = { code: "video_generation_failed", message: task.fail_reason || "video generation failed" };
  return output;
}

export const protocols = {
  openai_responses: {
    decodeRequest: function (ctx) {
      if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
      const req = plainObject(ctx.body.value);
      if (!req) throw new Error("request body must be an object");
      const model = trimmed(req.model);
      if (!model) throw new Error("model is required");
      if (req.input !== undefined && typeof req.input !== "string" && !Array.isArray(req.input)) throw new Error("input must be a string or array");
      const input = responsesInput(req.input);
      const source = Object.assign({}, req, { prompt: input.prompt || req.prompt || "" });
      if (input.images.length) source.images = (Array.isArray(req.images) ? req.images : []).concat(input.images);
      const request = normalizedRequest(source, { model: model, upstreamModel: ctx.upstreamModel });
      return { kind: "submit", model: model, action: request.action, requestBody: request.body };
    },
    renderEvents: function (ctx, task, previousState) {
      const status = String(task.status || "UNKNOWN").toUpperCase();
      const value = Number(String(task.progress || "").replace("%", ""));
      const progress = Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
      const state = { status: status, progress: progress };
      if (status === "SUCCESS") {
        const events = previousState && previousState.status === status ? [] : [{ type: "output", data: videoText(ctx) }];
        return { events: events, state: state, done: true };
      }
      if (status === "FAILURE") return { events: [{ type: "error", code: "task_failed", message: task.fail_reason || "task failed" }], state: state, done: true };
      if (previousState && previousState.status === status && previousState.progress === progress) return { events: [], state: state, done: false };
      const event = { type: "progress", message: status.toLowerCase() };
      if (progress !== null) event.progress = progress;
      return { events: [event], state: state, done: false };
    },
    renderFinal: function (ctx) {
      return {
        output: [{ type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: videoText(ctx), annotations: [], logprobs: [] }] }],
        metadata: { vendor: "haomao" },
      };
    },
  },
  openai_video: {
    decodeRequest: function (ctx) {
      const source = decodeVideoBody(ctx);
      const request = normalizedRequest(source, { model: ctx.model, upstreamModel: ctx.upstreamModel });
      return { kind: "submit", model: ctx.model, action: request.action, requestBody: request.body };
    },
    render: function (_ctx, task) {
      return renderVideo(task);
    },
  },
};
