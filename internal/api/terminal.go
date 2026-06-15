package api

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"multicloud/internal/config"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// TerminalSession 代表一个交互式终端会话
type TerminalSession struct {
	ID        string
	CreatedAt time.Time
	LastUsed  time.Time
	Cmd       *exec.Cmd
	Stdin      io.WriteCloser
	Stdout     io.ReadCloser
	Stderr     io.ReadCloser
	Cancel     context.CancelFunc
	mu         sync.Mutex
	closed     bool
}

var (
	terminalSessions = make(map[string]*TerminalSession)
	terminalMu       sync.RWMutex
	terminalEnabled   = false
	terminalInitOnce sync.Once
)

func initTerminal() {
	// 默认关闭；通过环境变量显式开启
	terminalEnabled = strings.EqualFold(config.GetEnv("TERMINAL_ENABLED", "false"), "true")
}

// EnsureTerminalInitialized 在 SetupRouter 中调用
func EnsureTerminalInitialized() {
	terminalInitOnce.Do(initTerminal)
}

// TerminalInfo 返回 terminal 元信息
func TerminalHandlerInfo() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"enabled":  terminalEnabled,
			"platform": runtime.GOOS,
			"arch":     runtime.GOARCH,
			"shell":    defaultShell(),
		})
	}
}

func defaultShell() string {
	if runtime.GOOS == "windows" {
		return "cmd.exe"
	}
	if shell := os.Getenv("SHELL"); shell != "" {
		return shell
	}
	return "/bin/sh"
}

// TerminalCreate 创建一个新的 terminal session
func TerminalCreate() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !terminalEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "terminal is disabled"})
			return
		}

		session, err := newTerminalSession()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to create session: %v", err)})
			return
		}
		c.JSON(http.StatusOK, gin.H{"session_id": session.ID})
	}
}

func newTerminalSession() (*TerminalSession, error) {
	ctx, cancel := context.WithCancel(context.Background())
	shell := defaultShell()

	// 以交互模式启动 shell
	cmd := exec.CommandContext(ctx, shell, "-i")

	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}

	// 设置 HOME 等环境变量
	cmd.Env = os.Environ()
	// 强制输出不带颜色
	cmd.Env = append(cmd.Env, "TERM=xterm", "PS1=$ ")

	if err := cmd.Start(); err != nil {
		cancel()
		return nil, fmt.Errorf("start shell: %w", err)
	}

	session := &TerminalSession{
		ID:        uuid.New().String(),
		CreatedAt: time.Now(),
		LastUsed:  time.Now(),
		Cmd:       cmd,
		Stdin:     stdin,
		Stdout:    stdout,
		Stderr:    stderr,
		Cancel:     cancel,
	}

	terminalMu.Lock()
	terminalSessions[session.ID] = session
	terminalMu.Unlock()

	// 启动垃圾回收：如果一个 session 长时间未使用，关闭它
	go func() {
		<-ctx.Done()
		terminalMu.Lock()
		delete(terminalSessions, session.ID)
		terminalMu.Unlock()
	}()

	go sessionIdleWatcher(session.ID)

	return session, nil
}

func sessionIdleWatcher(sessionID string) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		terminalMu.RLock()
		s, ok := terminalSessions[sessionID]
		terminalMu.RUnlock()
		if !ok {
			return
		}
		if time.Since(s.LastUsed) > 10*time.Minute {
			s.Close()
			return
		}
	}
}

func (s *TerminalSession) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	s.closed = true
	if s.Cancel != nil {
		s.Cancel()
	}
	if s.Stdin != nil {
		s.Stdin.Close()
	}
}

// TerminalStream 启动 SSE stream 用于接收终端输出
func TerminalStream() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !terminalEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "terminal is disabled"})
			return
		}

		sessionID := c.Query("session_id")
		if sessionID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "session_id is required"})
			return
		}

		terminalMu.RLock()
		session, ok := terminalSessions[sessionID]
		terminalMu.RUnlock()
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
			return
		}

		// 设置 SSE headers
		c.Writer.Header().Set("Content-Type", "text/event-stream")
		c.Writer.Header().Set("Cache-Control", "no-cache")
		c.Writer.Header().Set("Connection", "keep-alive")
		c.Writer.Header().Set("X-Accel-Buffering", "no")

		// 发送欢迎消息
		nowStr := time.Now().Format(time.RFC3339)
		fmt.Fprintf(c.Writer, "event: info\ndata: %s\n\n", fmt.Sprintf("connected to %s at %s", defaultShell(), nowStr))
		c.Writer.Flush()

		flusher, _ := c.Writer.(http.Flusher)

		// 读取 stdout
		go func() {
			buf := make([]byte, 4096)
			for {
				n, err := session.Stdout.Read(buf)
				if n > 0 {
					fmt.Fprintf(c.Writer, "event: stdout\ndata: %s\n\n", string(buf[:n]))
					if flusher != nil {
						flusher.Flush()
					}
				}
				if err != nil {
					return
				}
			}
		}()

		// 读取 stderr
		go func() {
			buf := make([]byte, 4096)
			for {
				n, err := session.Stderr.Read(buf)
				if n > 0 {
					fmt.Fprintf(c.Writer, "event: stderr\ndata: %s\n\n", string(buf[:n]))
					if flusher != nil {
						flusher.Flush()
					}
				}
				if err != nil {
					return
				}
			}
		}()

		// 等待连接关闭
		<-c.Request.Context().Done()
	}
}

// TerminalWrite 向 stdin 写入数据
func TerminalWrite() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !terminalEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "terminal is disabled"})
			return
		}

		var body map[string]interface{}
		if err := json.NewDecoder(c.Request.Body).Decode(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}

		sessionID, _ := body["session_id"].(string)
		input, _ := body["input"].(string)
		if sessionID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "session_id is required"})
			return
		}

		terminalMu.RLock()
		session, ok := terminalSessions[sessionID]
		terminalMu.RUnlock()
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
			return
		}

		session.LastUsed = time.Now()

		if input == "" {
			c.JSON(http.StatusOK, gin.H{"ok": true})
			return
		}

		// 确保输入以换行符结束
		if !strings.HasSuffix(input, "\n") {
			input += "\n"
		}

		_, err := session.Stdin.Write([]byte(input))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// TerminalClose 关闭 session
func TerminalClose() gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionID := c.Param("id")
		if sessionID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "session_id is required"})
			return
		}

		terminalMu.Lock()
		session, ok := terminalSessions[sessionID]
		delete(terminalSessions, sessionID)
		terminalMu.Unlock()

		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
			return
		}

		session.Close()
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// TerminalExec 单次命令执行 - 不使用交互式 shell（一次性执行命令并返回输出)
func TerminalExec() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !terminalEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "terminal is disabled"})
			return
		}

		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		command, ok := body["command"].(string)
		if !ok || command == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "command is required"})
			return
		}

		timeout := 30 * time.Second
		if tFloat, ok := body["timeout"].(float64); ok && tFloat > 0 {
			timeout = time.Duration(tFloat) * time.Second
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()

		var cmd *exec.Cmd
		if runtime.GOOS == "windows" {
			cmd = exec.CommandContext(ctx, "cmd.exe", "/c", command)
		} else {
			cmd = exec.CommandContext(ctx, defaultShell(), "-c", command)
		}
		cmd.Env = append(os.Environ(), "TERM=xterm")

		var stdout, stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr

		startTime := time.Now()
		err := cmd.Run()
		elapsed := time.Since(startTime)

		exitCode := 0
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else {
				exitCode = -1
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"command":   command,
			"stdout":     stdout.String(),
			"stderr":     stderr.String(),
			"exit_code": exitCode,
			"duration_ms": int(elapsed.Milliseconds()),
		})
	}
}

// TerminalListSessions 列出当前的 terminal session
func TerminalListSessions() gin.HandlerFunc {
	return func(c *gin.Context) {
		terminalMu.RLock()
		defer terminalMu.RUnlock()

		sessions := make([]map[string]interface{}, 0, len(terminalSessions))
		for id, s := range terminalSessions {
			sessions = append(sessions, map[string]interface{}{
				"id":         id,
				"created_at": s.CreatedAt,
				"last_used":  s.LastUsed,
				"shell":      s.Cmd.Path,
			})
		}

		c.JSON(http.StatusOK, gin.H{"sessions": sessions})
	}
}

// TerminalHistory 记录命令执行历史（当前仅在内存中保存最近执行的命令）
type TerminalHistory struct {
	Commands []HistoryEntry `json:"commands"`
	mu       sync.RWMutex
}

// HistoryEntry 代表历史记录中的一条命令
type HistoryEntry struct {
	Command    string    `json:"command"`
	Time       time.Time `json:"time"`
	ExitCode   int       `json:"exit_code"`
}

var (
	terminalHistory = &TerminalHistory{Commands: make([]HistoryEntry, 0, 50)}
)

// TerminalAddHistory 在执行后添加历史记录（自动维护最近 50 条)
func TerminalAddHistory(command string, exitCode int) {
	terminalHistory.mu.Lock()
	defer terminalHistory.mu.Unlock()
	terminalHistory.Commands = append(terminalHistory.Commands, HistoryEntry{
		Command:  command,
		Time:     time.Now(),
		ExitCode: exitCode,
	})
	if len(terminalHistory.Commands) > 50 {
		terminalHistory.Commands = terminalHistory.Commands[len(terminalHistory.Commands)-50:]
	}
}

// TerminalGetHistory 返回命令执行历史
func TerminalGetHistory() gin.HandlerFunc {
	return func(c *gin.Context) {
		terminalHistory.mu.RLock()
		defer terminalHistory.mu.RUnlock()

		// 复制切片
		commands := make([]HistoryEntry, len(terminalHistory.Commands))
		copy(commands, terminalHistory.Commands)
		c.JSON(http.StatusOK, gin.H{"history": commands})
	}
}

// streamLines 读取字符串内容（辅助函数）
func streamLines(reader io.Reader, out io.Writer, eventName string, flusher http.Flusher) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		fmt.Fprintf(out, "event: %s\ndata: %s\n\n", eventName, line)
		if flusher != nil {
			flusher.Flush()
		}
	}
	if err := scanner.Err(); err != nil {
		log.Printf("terminal stream scanner error: %v", err)
	}
}
