package plugins

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func haomaoObject(t *testing.T, value any) map[string]any {
	t.Helper()
	encoded, err := common.Marshal(value)
	require.NoError(t, err)
	var object map[string]any
	require.NoError(t, common.Unmarshal(encoded, &object))
	return object
}

func haomaoCall(t *testing.T, plugin *jsplugin.LoadedPlugin, hook string, args ...any) map[string]any {
	t.Helper()
	value, err := plugin.Engine.Call(t.Context(), hook, args...)
	require.NoError(t, err)
	return haomaoObject(t, value)
}

func TestHaomaoSeedanceFullParametersAndProtocols(t *testing.T) {
	source, err := Source("haomao")
	require.NoError(t, err)
	registry := jsplugin.NewRegistry()
	plugin, err := registry.RegisterFactory(source, jsplugin.Options{Key: "haomao"})
	require.NoError(t, err)

	binding, found := registry.Generation().LookupEndpoint("POST", "/v1/videos", "seedance-2.0-mini")
	require.True(t, found)
	assert.Same(t, plugin, binding.Plugin)

	content := []any{
		map[string]any{"type": "text", "text": "cinematic cat"},
		map[string]any{"type": "image_url", "image_url": map[string]any{"url": "https://cdn.example/start.png"}, "role": "first_frame"},
		map[string]any{"type": "image_url", "image_url": map[string]any{"url": "https://cdn.example/end.png"}, "role": "last_frame"},
		map[string]any{"type": "image_url", "image_url": map[string]any{"url": "https://cdn.example/reference.png"}, "role": "reference_image"},
		map[string]any{"type": "video_url", "video_url": map[string]any{"url": "https://cdn.example/reference.mp4"}, "role": "reference_video"},
		map[string]any{"type": "audio_url", "audio_url": map[string]any{"url": "https://cdn.example/reference.mp3"}, "role": "reference_audio"},
	}
	body := map[string]any{
		"model": "seedance-2.0-mini", "content": content, "resolution": "480p", "ratio": "21:9", "duration": 15,
		"generate_audio": false, "seed": 0, "guidance_scale": 2.5, "watermark": false, "bitrate_mode": "high",
	}
	intentValue, err := plugin.Engine.CallPath(t.Context(), "native", []string{"createTask"}, map[string]any{
		"body": map[string]any{"kind": "json", "value": body},
	})
	require.NoError(t, err)
	intent := haomaoObject(t, intentValue)
	assert.Equal(t, "submit", intent["kind"])
	assert.Equal(t, "reference_media_to_video", intent["action"])

	requestBody := intent["requestBody"].(map[string]any)
	ctx := map[string]any{
		"baseUrl": "https://haomaotoken.com/api/v3", "apiKey": "secret", "model": "seedance-2.0-mini",
		"upstreamModel": "seedance-2.0-mini", "action": intent["action"], "requestBody": requestBody,
	}
	submit := haomaoCall(t, plugin, "buildSubmitRequest", ctx)
	assert.Equal(t, "https://haomaotoken.com/api/v3/contents/generations/tasks", submit["url"])
	assert.Equal(t, "reference_media_to_video", submit["action"])
	upstream := submit["body"].(map[string]any)
	for key, expected := range map[string]any{
		"model": "seedance-2.0-mini", "resolution": "480p", "ratio": "21:9", "duration": float64(15),
		"generate_audio": false, "seed": float64(0), "guidance_scale": 2.5, "watermark": false, "bitrate_mode": "high",
	} {
		assert.Equal(t, expected, upstream[key], key)
	}
	assert.Len(t, upstream["content"], len(content))

	ctx["upstream"] = map[string]any{"kind": "new_api"}
	ctx["baseUrl"] = "https://gateway.example"
	assert.Equal(t, "https://gateway.example/haomao/api/v3/contents/generations/tasks", haomaoCall(t, plugin, "buildSubmitRequest", ctx)["url"])
	query := haomaoCall(t, plugin, "buildQueryRequest", map[string]any{
		"baseUrl": "https://gateway.example", "apiKey": "gateway-key", "taskId": "task/a", "upstream": map[string]any{"kind": "new_api"},
	})
	assert.Equal(t, "https://gateway.example/haomao/api/v3/contents/generations/tasks/task%2Fa", query["url"])

	ctx["usagePurpose"] = "facts"
	facts := haomaoCall(t, plugin, "extractUsage", ctx)
	assert.Equal(t, map[string]any{"tokens": float64(300234), "resolution": "480p", "video_input": "video"}, facts)
	ctx["usagePurpose"] = "billing_ratios"
	assert.InDelta(t, 14.0/23.0, haomaoCall(t, plugin, "extractUsage", ctx)["video_input_ratio"], 1e-12)

	parsed := haomaoCall(t, plugin, "parseTaskResult", map[string]any{}, map[string]any{
		"id": "upstream-id", "status": "succeeded", "content": map[string]any{"video_url": "https://cdn.example/out.mp4", "last_frame_url": "https://cdn.example/last.png", "resolution": "720p"},
		"usage": map[string]any{"completion_tokens": 123456},
	})
	assert.Equal(t, "SUCCESS", parsed["status"])
	assert.Equal(t, float64(123456), parsed["completionTokens"])
	completion := haomaoCall(t, plugin, "extractUsageOnComplete", map[string]any{}, map[string]any{}, map[string]any{
		"status": "succeeded", "content": map[string]any{"resolution": "720p"}, "usage": map[string]any{"completion_tokens": 123456},
	})
	assert.Equal(t, map[string]any{"tokens": float64(123456), "resolution": "720p"}, completion)
	artifactsValue, err := plugin.Engine.Call(t.Context(), "listArtifacts", map[string]any{
		"status": "SUCCESS", "data": map[string]any{"content": map[string]any{"video_url": "https://cdn.example/out.mp4", "last_frame_url": "https://cdn.example/last.png"}},
	})
	require.NoError(t, err)
	encoded, err := common.Marshal(artifactsValue)
	require.NoError(t, err)
	var artifacts []map[string]any
	require.NoError(t, common.Unmarshal(encoded, &artifacts))
	require.Len(t, artifacts, 2)
	assert.Equal(t, "video", artifacts[0]["key"])
	assert.Equal(t, "last_frame", artifacts[1]["key"])
}

func TestHaomaoSeedanceValidationAndOpenAIInputs(t *testing.T) {
	source, err := Source("haomao")
	require.NoError(t, err)
	registry := jsplugin.NewRegistry()
	plugin, err := registry.RegisterFactory(source, jsplugin.Options{Key: "haomao"})
	require.NoError(t, err)

	decode := func(body map[string]any) (map[string]any, error) {
		value, callErr := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
			"model": "seedance-2.0-mini", "upstreamModel": "seedance-2.0-mini", "body": map[string]any{"kind": "json", "value": body},
		})
		if callErr != nil {
			return nil, callErr
		}
		return haomaoObject(t, value), nil
	}

	intent, err := decode(map[string]any{
		"prompt": "a paper boat", "input_reference": "https://cdn.example/start.png", "seconds": 6, "size": "1280x720",
		"generate_audio": true, "seed": 42, "guidance_scale": 1.25, "watermark": true, "bitrate_mode": "standard",
	})
	require.NoError(t, err)
	assert.Equal(t, "start_end_frame_to_video", intent["action"])
	body := intent["requestBody"].(map[string]any)
	assert.Equal(t, "720p", body["resolution"])
	assert.Equal(t, "16:9", body["ratio"])
	assert.Equal(t, float64(6), body["duration"])
	assert.Len(t, body["content"], 2)

	invalid := []struct {
		name string
		body map[string]any
		part string
	}{
		{"short duration", map[string]any{"prompt": "cat", "duration": 3}, "duration"},
		{"bad resolution", map[string]any{"prompt": "cat", "resolution": "1080p"}, "resolution"},
		{"bad ratio", map[string]any{"prompt": "cat", "ratio": "2:1"}, "ratio"},
		{"bad boolean", map[string]any{"prompt": "cat", "watermark": "false"}, "watermark"},
		{"bad guidance", map[string]any{"prompt": "cat", "guidance_scale": 0}, "guidance_scale"},
		{"bad bitrate", map[string]any{"prompt": "cat", "bitrate_mode": "ultra"}, "bitrate_mode"},
		{"audio alone", map[string]any{"content": []any{map[string]any{"type": "audio_url", "audio_url": map[string]any{"url": "https://cdn.example/ref.mp3"}}}}, "requires"},
		{"too many images", map[string]any{"prompt": "cat", "images": []any{"https://cdn.example/1.png", "https://cdn.example/2.png", "https://cdn.example/3.png", "https://cdn.example/4.png", "https://cdn.example/5.png", "https://cdn.example/6.png", "https://cdn.example/7.png", "https://cdn.example/8.png", "https://cdn.example/9.png", "https://cdn.example/10.png"}}, "at most 9"},
	}
	for _, tc := range invalid {
		t.Run(tc.name, func(t *testing.T) {
			_, callErr := decode(tc.body)
			require.Error(t, callErr)
			assert.Contains(t, callErr.Error(), tc.part)
		})
	}

	responsesValue, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_responses", "decodeRequest"}, map[string]any{
		"model":         "seedance-2.0-mini",
		"upstreamModel": "seedance-2.0-mini",
		"body": map[string]any{"kind": "json", "value": map[string]any{
			"model": "client-alias",
			"input": []any{map[string]any{
				"role": "user",
				"content": []any{
					map[string]any{"type": "input_text", "text": "make it move"},
					map[string]any{"type": "input_image", "image_url": "https://cdn.example/ref.png"},
				},
			}},
			"duration": 5,
		}},
	})
	require.NoError(t, err)
	responses := haomaoObject(t, responsesValue)
	assert.Equal(t, "client-alias", responses["model"])
	assert.Equal(t, "reference_media_to_video", responses["action"])
}
