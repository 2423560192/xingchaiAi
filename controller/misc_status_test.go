package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// /api/status is public, but the build version is privileged information:
// only administrators may fingerprint the running release.
func TestGetStatusHidesVersionFromAnonymousViewers(t *testing.T) {
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)

	GetStatus(context)

	var payload struct {
		Success bool           `json:"success"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
	require.True(t, payload.Success)

	_, hasVersion := payload.Data["version"]
	assert.False(t, hasVersion, "anonymous responses must not expose the version")
	assert.Empty(t, response.Header().Get("X-New-Api-Version"))
}

func TestGetStatusHidesVersionFromInvalidCredentials(t *testing.T) {
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/status", nil)
	context.Request.Header.Set("Authorization", "Bearer not-a-dashboard-token")

	GetStatus(context)

	var payload struct {
		Data map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))

	_, hasVersion := payload.Data["version"]
	assert.False(t, hasVersion, "invalid credentials must fall back to anonymous")
	assert.Empty(t, response.Header().Get("X-New-Api-Version"))
}
