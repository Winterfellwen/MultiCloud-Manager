package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/multicloud/opencode-go/internal/database"
	"github.com/multicloud/opencode-go/internal/event"
	"github.com/multicloud/opencode-go/internal/provider"
	"github.com/multicloud/opencode-go/internal/session"
	"github.com/multicloud/opencode-go/internal/tool"
)

type Handler struct {
	sessions  *session.Service
	messages  *session.MessageService
	llm       *session.LLMService
	providers *provider.Registry
	tools     *tool.Registry
	events    *event.Bus
	db        *database.Database
}

func NewHandler(db *database.Database, bus *event.Bus) *Handler {
	sessSvc := session.NewService(db.DB)
	msgSvc := session.NewMessageService(db.DB)
	provReg := provider.NewRegistry()
	toolReg := tool.NewRegistry(".")
	llmSvc := session.NewLLMService(sessSvc, msgSvc, provReg, toolReg, bus)

	return &Handler{
		sessions:  sessSvc,
		messages:  msgSvc,
		llm:       llmSvc,
		providers: provReg,
		tools:     toolReg,
		events:    bus,
		db:        db,
	}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	// Static files and SPA are handled by NotFound handler in server.go
	// API routes only:
	r.Get("/global/health", h.Health)
	r.Get("/global/config", h.GetConfig)
	r.Patch("/global/config", h.UpdateConfig)
	r.Get("/global/event", h.GlobalEvent)

	r.Route("/session", func(r chi.Router) {
		r.Get("/", h.ListSessions)
		r.Post("/", h.CreateSession)
		r.Get("/status", h.SessionStatus)
		r.Route("/{sessionID}", func(r chi.Router) {
			r.Get("/", h.GetSession)
			r.Delete("/", h.DeleteSession)
			r.Patch("/", h.UpdateSession)
			r.Post("/message", h.Prompt)
			r.Post("/prompt_async", h.PromptAsync)
			r.Get("/message", h.ListMessages)
			r.Post("/abort", h.AbortSession)
		})
	})

	r.Route("/provider", func(r chi.Router) {
		r.Get("/", h.ListProviders)
		r.Get("/{providerID}", h.GetProvider)
	})

	r.Route("/agent", func(r chi.Router) {
		r.Get("/", h.ListAgents)
	})

	r.Route("/config", func(r chi.Router) {
		r.Get("/", h.GetInstanceConfig)
		r.Patch("/", h.UpdateInstanceConfig)
	})

	r.Get("/event", h.Event)
	r.Get("/path", h.GetPath)
	r.Get("/project", h.ListProjects)
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, tag, message string) {
	respondJSON(w, status, map[string]interface{}{
		"_tag":   tag,
		"message": message,
	})
}

// Health
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, 200, map[string]bool{"healthy": true})
}

// ServeWebUI serves the OpenCode SolidJS frontend
func (h *Handler) ServeWebUI(w http.ResponseWriter, r *http.Request) {
	dir := "web/opencode"

	// If path is / or empty, serve index.html
	path := chi.URLParam(r, "*")
	if path == "" || path == "/" {
		path = "index.html"
	} else {
		// Remove leading slash
		path = path[1:]
	}

	filePath := dir + "/" + path
	info, err := os.Stat(filePath)
	if os.IsNotExist(err) || (info != nil && info.IsDir()) {
		// SPA fallback: serve index.html for non-file routes
		filePath = dir + "/index.html"
	}

	content, err := os.ReadFile(filePath)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	// Set content type based on extension
	switch {
	case strings.HasSuffix(path, ".html"):
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	case strings.HasSuffix(path, ".js"):
		w.Header().Set("Content-Type", "application/javascript")
	case strings.HasSuffix(path, ".css"):
		w.Header().Set("Content-Type", "text/css")
	case strings.HasSuffix(path, ".json"):
		w.Header().Set("Content-Type", "application/json")
	case strings.HasSuffix(path, ".png"):
		w.Header().Set("Content-Type", "image/png")
	case strings.HasSuffix(path, ".svg"):
		w.Header().Set("Content-Type", "image/svg+xml")
	case strings.HasSuffix(path, ".ico"):
		w.Header().Set("Content-Type", "image/x-icon")
	case strings.HasSuffix(path, ".woff2"):
		w.Header().Set("Content-Type", "font/woff2")
	case strings.HasSuffix(path, ".woff"):
		w.Header().Set("Content-Type", "font/woff")
	case strings.HasSuffix(path, ".ttf"):
		w.Header().Set("Content-Type", "font/ttf")
	default:
		w.Header().Set("Content-Type", "application/octet-stream")
	}

	w.Write(content)
}

// Config
func (h *Handler) GetConfig(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, 200, map[string]interface{}{
		"theme":      "dark",
		"version":    "1.0.0-go",
		"provider":   map[string]interface{}{},
	})
}

func (h *Handler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, 200, map[string]interface{}{"ok": true})
}

func (h *Handler) GetInstanceConfig(w http.ResponseWriter, r *http.Request) {
	h.GetConfig(w, r)
}

func (h *Handler) UpdateInstanceConfig(w http.ResponseWriter, r *http.Request) {
	h.UpdateConfig(w, r)
}

func (h *Handler) ListAgents(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, 200, []map[string]interface{}{
		{"id": "coder", "name": "Coder", "description": "General purpose coding assistant"},
	})
}

func (h *Handler) SessionStatus(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, 200, map[string]interface{}{})
}

func (h *Handler) GetPath(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, 200, map[string]interface{}{
		"state":   os.Getenv("HOME") + "/.local/share/opencode",
		"config":  os.Getenv("HOME") + "/.config/opencode",
		"home":    os.Getenv("HOME"),
	})
}

func (h *Handler) ListProjects(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, 200, []map[string]interface{}{})
}

// Sessions
func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) {
	directory := r.URL.Query().Get("directory")
	search := r.URL.Query().Get("search")
	limitStr := r.URL.Query().Get("limit")
	order := r.URL.Query().Get("order")

	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}

	sessions, err := h.sessions.List(&session.ListInput{
		Directory: directory,
		Search:    search,
		Limit:     limit,
		Order:     order,
	})
	if err != nil {
		respondError(w, 500, "UnknownError", err.Error())
		return
	}

	respondJSON(w, 200, sessions)
}

func (h *Handler) CreateSession(w http.ResponseWriter, r *http.Request) {
	var input session.CreateInput
	body, _ := io.ReadAll(r.Body)
	log.Printf("CreateSession body: %s", string(body))
	if err := json.Unmarshal(body, &input); err != nil {
		log.Printf("CreateSession decode error: %v", err)
		respondError(w, 400, "InvalidRequestError", "Invalid request body: "+err.Error())
		return
	}

	sess, err := h.sessions.Create(&input)
	if err != nil {
		respondError(w, 500, "UnknownError", err.Error())
		return
	}

	// Publish session.created event
	dataJSON, _ := json.Marshal(map[string]interface{}{
		"sessionID": sess.ID,
		"info":      sess,
	})
	h.events.Publish(event.Event{
		ID:   fmt.Sprintf("evt_%d", time.Now().UnixMilli()),
		Type: event.EventSessionUpdated,
		Location: &event.Location{
			Directory: sess.Directory,
		},
		Data: dataJSON,
	})

	respondJSON(w, 200, sess)
}

func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "sessionID")
	sess, err := h.sessions.Get(id)
	if err != nil {
		respondError(w, 404, "SessionNotFoundError", err.Error())
		return
	}

	respondJSON(w, 200, sess)
}

func (h *Handler) DeleteSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "sessionID")
	if err := h.sessions.Delete(id); err != nil {
		respondError(w, 404, "SessionNotFoundError", err.Error())
		return
	}
	respondJSON(w, 200, map[string]interface{}{"ok": true})
}

func (h *Handler) UpdateSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "sessionID")
	var input session.UpdateInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondError(w, 400, "InvalidRequestError", "Invalid request body")
		return
	}

	sess, err := h.sessions.Update(id, &input)
	if err != nil {
		respondError(w, 404, "SessionNotFoundError", err.Error())
		return
	}

	respondJSON(w, 200, sess)
}

// Messages
func (h *Handler) ListMessages(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}
	offset := 0
	if offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil {
			offset = o
		}
	}

	messages, err := h.messages.List(sessionID, limit, offset)
	if err != nil {
		respondError(w, 500, "UnknownError", err.Error())
		return
	}

	respondJSON(w, 200, messages)
}

// Prompt
func (h *Handler) Prompt(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	body, err := io.ReadAll(r.Body)
	if err != nil {
		respondError(w, 400, "InvalidRequestError", "Failed to read body: "+err.Error())
		return
	}

	var input struct {
		Prompt struct {
			Text string `json:"text"`
		} `json:"prompt"`
	}
	if err := json.Unmarshal(body, &input); err != nil {
		respondError(w, 400, "InvalidRequestError", "Invalid JSON: "+err.Error()+", body: "+string(body))
		return
	}

	msg, err := h.llm.Prompt(r.Context(), sessionID, input.Prompt.Text)
	if err != nil {
		respondError(w, 500, "UnknownError", err.Error())
		return
	}

	// Publish message.created event
	sess, _ := h.sessions.Get(sessionID)
	dir := ""
	if sess != nil {
		dir = sess.Directory
	}
	dataJSON, _ := json.Marshal(map[string]interface{}{
		"sessionID": sessionID,
		"messageID": msg.ID,
		"info":      msg,
	})
	h.events.Publish(event.Event{
		ID:   fmt.Sprintf("evt_%d", time.Now().UnixMilli()),
		Type: event.EventMessageUpdated,
		Location: &event.Location{
			Directory: dir,
		},
		Data: dataJSON,
	})

	respondJSON(w, 200, map[string]interface{}{
		"id":        msg.ID,
		"sessionID": msg.SessionID,
		"type":      msg.Type,
		"seq":       msg.Seq,
	})
}

func (h *Handler) PromptAsync(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	var input struct {
		Prompt struct {
			Text string `json:"text"`
		} `json:"prompt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondError(w, 400, "InvalidRequestError", "Invalid request body")
		return
	}

	go func() {
		_, err := h.llm.Prompt(r.Context(), sessionID, input.Prompt.Text)
		if err != nil {
			log.Printf("async prompt error: %v", err)
		}
	}()

	w.WriteHeader(204)
}

func (h *Handler) AbortSession(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, 200, map[string]interface{}{"ok": true})
}

// Providers
func (h *Handler) ListProviders(w http.ResponseWriter, r *http.Request) {
	providers := h.providers.List()
	data := make([]map[string]interface{}, 0)
	for _, p := range providers {
		data = append(data, map[string]interface{}{
			"id":   p.ID(),
			"name": p.Name(),
			"enabled": map[string]interface{}{
				"via": "env",
			},
		})
	}
	respondJSON(w, 200, map[string]interface{}{
		"data": data,
	})
}

func (h *Handler) GetProvider(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "providerID")
	p, ok := h.providers.Get(id)
	if !ok {
		respondError(w, 404, "ProviderNotFoundError", "Provider not found: "+id)
		return
	}
	respondJSON(w, 200, map[string]interface{}{
		"id":   p.ID(),
		"name": p.Name(),
	})
}

// SSE Events - /global/event
func (h *Handler) GlobalEvent(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", 500)
		return
	}

	listener := h.events.Subscribe("", "")
	defer h.events.Unsubscribe(listener.ID)

	// Send connected event matching the original format: { payload: { id, type, properties } }
	connectedData, _ := json.Marshal(map[string]interface{}{
		"payload": map[string]interface{}{
			"id":         fmt.Sprintf("evt_%d", time.Now().UnixMilli()),
			"type":       "server.connected",
			"properties": map[string]interface{}{},
		},
	})
	fmt.Fprintf(w, "event: message\ndata: %s\n\n", connectedData)
	flusher.Flush()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case evt := <-listener.Ch:
			var properties map[string]interface{}
			if evt.Data != nil {
				json.Unmarshal(evt.Data, &properties)
			}
			if properties == nil {
				properties = map[string]interface{}{}
			}

			evtJSON, _ := json.Marshal(map[string]interface{}{
				"payload": map[string]interface{}{
					"id":         evt.ID,
					"type":       string(evt.Type),
					"properties": properties,
				},
			})
			fmt.Fprintf(w, "event: message\ndata: %s\n\n", evtJSON)
			flusher.Flush()
		}
	}
}

// SSE Events - /event (instance-level)
func (h *Handler) Event(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", 500)
		return
	}

	listener := h.events.Subscribe("", "")
	defer h.events.Unsubscribe(listener.ID)

	// Send connected event matching the original format: { id, type, properties }
	connectedData, _ := json.Marshal(map[string]interface{}{
		"id":         fmt.Sprintf("evt_%d", time.Now().UnixMilli()),
		"type":       "server.connected",
		"properties": map[string]interface{}{},
	})
	fmt.Fprintf(w, "event: message\ndata: %s\n\n", connectedData)
	flusher.Flush()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case evt := <-listener.Ch:
			var properties map[string]interface{}
			if evt.Data != nil {
				json.Unmarshal(evt.Data, &properties)
			}
			if properties == nil {
				properties = map[string]interface{}{}
			}

			evtJSON, _ := json.Marshal(map[string]interface{}{
				"id":         evt.ID,
				"type":       string(evt.Type),
				"properties": properties,
			})
			fmt.Fprintf(w, "event: message\ndata: %s\n\n", evtJSON)
			flusher.Flush()
		}
	}
}
