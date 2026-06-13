package server

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/multicloud/opencode-go/internal/database"
	"github.com/multicloud/opencode-go/internal/event"
	"github.com/multicloud/opencode-go/internal/handler"
)

type Server struct {
	db   *database.Database
	bus  *event.Bus
	port string
}

func New(dbPath, port string) (*Server, error) {
	db, err := database.New(dbPath)
	if err != nil {
		return nil, err
	}

	bus := event.NewBus()
	bus.StartHeartbeat()

	return &Server{
		db:   db,
		bus:  bus,
		port: port,
	}, nil
}

func NewWithDB(db *database.Database, bus *event.Bus, port string) (*Server, error) {
	return &Server{
		db:   db,
		bus:  bus,
		port: port,
	}, nil
}

func (s *Server) Close() {
	if s.db != nil {
		s.db.Close()
	}
}

func (s *Server) ListenAndServe() error {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Compress(5))
	r.Use(corsMiddleware)

	h := handler.NewHandler(s.db, s.bus)
	h.RegisterRoutes(r)

	// Serve static files and SPA fallback
	staticDir := "web/opencode"
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		// Try to serve the file directly
		path := r.URL.Path
		if path == "/" {
			path = "/index.html"
		}
		// Try to open the file
		f, err := os.Open(staticDir + path)
		if err != nil {
			// SPA fallback: serve index.html
			http.ServeFile(w, r, staticDir+"/index.html")
			return
		}
		defer f.Close()
		// Check if it's a directory
		stat, err := f.Stat()
		if err != nil || stat.IsDir() {
			http.ServeFile(w, r, staticDir+"/index.html")
			return
		}
		// Serve the file
		http.ServeContent(w, r, stat.Name(), stat.ModTime(), f)
	})

	addr := ":" + s.port
	log.Printf("OpenCode Go server starting on %s", addr)

	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 0, // No timeout for SSE
		IdleTimeout:  120 * time.Second,
	}

	return srv.ListenAndServe()
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Opencode-Directory, X-Opencode-Workspace")

		if r.Method == "OPTIONS" {
			w.WriteHeader(200)
			return
		}

		next.ServeHTTP(w, r)
	})
}
