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
	"path/filepath"
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
	terminalEnabled  = false
	terminalInitOnce sync.Once
	terminalCwd      = "" // 全局工作目录（由 cd 命令维护）
	terminalCwdMu    sync.RWMutex

	// --- Sandbox / 隔离配置 ---
	SANDBOX_ROOT     = "/home/shell"       // 沙箱根目录
	MAX_QUOTA_BYTES  = int64(20 * 1024 * 1024) // 20MB
	MAX_UPLOAD_BYTES = int64(10 * 1024 * 1024) // 单文件 10MB
	commandWhitelist = []string{
		"ls", "cat", "head", "tail", "more", "less", "echo", "printf",
		"pwd", "cd", "mkdir", "rmdir", "touch", "rm", "cp", "mv", "chmod", "chown",
		"find", "grep", "sed", "awk", "sort", "uniq", "wc", "cut", "tr",
		"du", "df", "file", "stat", "tree",
		"wget", "curl",
		"sh", "bash", "zsh", "dash", "python3", "python", "node",
		"date", "time", "whoami", "id", "uname", "env", "set", "export",
		"clear", "history",
	}
	dangerousCommands = []string{
		"sudo", "su", "mount", "umount", "chroot", "dd",
		"nc", "ncat", "netcat",
		"vi", "vim", "nano", "emacs", "ed", "pico",
		"ssh", "scp", "sftp",
		"kill", "killall", "pkill", "reboot", "poweroff", "shutdown",
		"mkfs", "fdisk", "parted",
	}
	// 允许编辑的扩展名（浏览器内编辑）
	editableExts = []string{
		".txt", ".md", ".sh", ".bash", ".zsh",
		".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
		".py", ".js", ".ts", ".go", ".rs", ".c", ".cpp", ".h",
		".html", ".css", ".xml", ".csv", ".log", ".env",
	}
)

func initTerminal() {
	// 默认关闭；通过环境变量显式开启
	terminalEnabled = strings.EqualFold(config.GetEnv("TERMINAL_ENABLED", "false"), "true")
	if !terminalEnabled {
		return
	}
	// 初始化沙箱根目录
	if err := os.MkdirAll(SANDBOX_ROOT, 0755); err != nil {
		log.Printf("[terminal] 创建沙箱目录失败: %v", err)
	}
	// 初始工作目录 = 沙箱根
	terminalCwdMu.Lock()
	terminalCwd = SANDBOX_ROOT
	terminalCwdMu.Unlock()
}

// EnsureTerminalInitialized 在 SetupRouter 中调用
func EnsureTerminalInitialized() {
	terminalInitOnce.Do(initTerminal)
}

// TerminalInfo 返回 terminal 元信息
func TerminalHandlerInfo() gin.HandlerFunc {
	return func(c *gin.Context) {
		cwd := safeCwd()
		size, _ := dirSize(SANDBOX_ROOT)
		c.JSON(http.StatusOK, gin.H{
			"enabled":      terminalEnabled,
			"platform":     runtime.GOOS,
			"arch":         runtime.GOARCH,
			"shell":        defaultShell(),
			"cwd":          cwd,
			"sandbox_root": SANDBOX_ROOT,
			"quota_bytes":  MAX_QUOTA_BYTES,
			"used_bytes":   size,
			"upload_max":   MAX_UPLOAD_BYTES,
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

	// 以交互模式启动 shell，并绑定到沙箱目录
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

	// 设置环境变量：HOME=/home/shell（默认从沙箱启动），并强制 TERM=xterm
	env := []string{}
	for _, e := range os.Environ() {
		if strings.HasPrefix(e, "HOME=") {
			continue
		}
		env = append(env, e)
	}
	cmd.Env = append(env,
		"HOME="+SANDBOX_ROOT,
		"TERM=xterm-256color",
		"PS1=\\[\\033[32m\\][\\u@\\h \\w]\\$\\[\\033[0m\\] ",
		"COLUMNS=120",
		"LINES=40",
	)
	cmd.Dir = SANDBOX_ROOT // 默认从沙箱启动

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
// - raw=true: 原样写入（按键模式：不含换行，用于 xterm 实时交互）
// - raw=false 或省略：自动补换行（命令行模式）
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
		raw, _ := body["raw"].(bool)
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

		if !raw && !strings.HasSuffix(input, "\n") && !strings.HasSuffix(input, "\r") && !strings.HasSuffix(input, "\u0003") && !strings.HasSuffix(input, "\u0004") {
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

// TerminalExec 单次命令执行 - 沙箱隔离版本
func TerminalExec() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !terminalEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "terminal is disabled", "stdout": "", "stderr": "", "exit_code": 1})
			return
		}

		var body map[string]interface{}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json", "exit_code": 1})
			return
		}

		command, ok := body["command"].(string)
		if !ok || command == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "command is required", "exit_code": 1})
			return
		}
		command = strings.TrimSpace(command)

		// ------ cloud-* 虚拟命令（不走 shell）------
		if strings.HasPrefix(command, "cloud-") || command == "cloud-help" {
			token := ""
			if h := c.GetHeader("Authorization"); h != "" {
				token = h
			}
			data, err := handleCloudCommand(command, token)
			if err != nil {
				c.JSON(http.StatusOK, gin.H{"command": command, "stdout": "", "stderr": err.Error(), "exit_code": 1, "cwd": safeCwd()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"command": command, "stdout": data, "stderr": "", "exit_code": 0, "cwd": safeCwd()})
			return
		}

		// ------ download 虚拟命令 ------
		if strings.HasPrefix(command, "download ") {
			c.JSON(http.StatusOK, gin.H{"command": command, "stdout": fmt.Sprintf("[提示] 在右侧文件列表点击 📥 下载 %s，或调用 GET /api/terminal/files/%s", strings.TrimSpace(strings.TrimPrefix(command, "download ")), strings.TrimSpace(strings.TrimPrefix(command, "download "))), "stderr": "", "exit_code": 0, "cwd": safeCwd()})
			return
		}

		// ------ 安全检查 1：危险命令黑名单 ------
		for _, bad := range dangerousCommands {
			if command == bad || strings.HasPrefix(command, bad+" ") {
				c.JSON(http.StatusOK, gin.H{"command": command, "stdout": "", "stderr": fmt.Sprintf("[拒绝] 命令 %q 在沙箱内不允许执行", bad), "exit_code": 126, "cwd": safeCwd()})
				return
			}
		}

		// ------ 安全检查 2：白名单首命令 ------
		firstTok := firstCommandToken(command)
		allowed := false
		for _, w := range commandWhitelist {
			if firstTok == w {
				allowed = true
				break
			}
		}
		// 允许直接执行 ./script.sh 或 /home/shell/... 这种路径脚本
		if !allowed {
			if strings.HasPrefix(firstTok, "./") || strings.HasPrefix(firstTok, "/home/shell") || strings.HasPrefix(firstTok, SANDBOX_ROOT) {
				allowed = true
			}
		}
		if !allowed {
			c.JSON(http.StatusOK, gin.H{"command": command, "stdout": "", "stderr": fmt.Sprintf("[拒绝] 命令 %q 不在白名单中。支持：%s。输入 cloud-help 查看云管理命令", firstTok, strings.Join(commandWhitelist, ", ")), "exit_code": 126, "cwd": safeCwd()})
			return
		}

		// ------ 安全检查 3：cd 目标必须在沙箱内 ------
		cdTarget := extractLastCdTarget(command)
		cdAbs := ""
		if cdTarget != "" {
			// 只做路径规范化（不要求目录存在），确保 cd 目标不会跳出沙箱
			cdAbs = normalizeCdTarget(cdTarget, safeCwd())
			if cdAbs == "" || !isInsideSandbox(cdAbs) {
				c.JSON(http.StatusOK, gin.H{"command": command, "stdout": "", "stderr": fmt.Sprintf("[拒绝] 目录 %q 不在沙箱范围内 (%s)", cdTarget, SANDBOX_ROOT), "exit_code": 1, "cwd": safeCwd()})
				return
			}
			// 对 cd-only 命令：要求目录已存在，并直接更新 cwd
			if firstTok == "cd" {
				if info, err := os.Stat(cdAbs); err != nil || !info.IsDir() {
					c.JSON(http.StatusOK, gin.H{"command": command, "stdout": "", "stderr": fmt.Sprintf("[拒绝] 目录 %q 不存在", cdTarget), "exit_code": 1, "cwd": safeCwd()})
					return
				}
				terminalCwdMu.Lock()
				terminalCwd = cdAbs
				terminalCwdMu.Unlock()
				c.JSON(http.StatusOK, gin.H{"command": command, "stdout": "", "stderr": "", "exit_code": 0, "cwd": cdAbs})
				return
			}
			// 含 cd 的复合命令（如 "mkdir x && cd x"）保持复合，cwd 在执行成功后按下面更新
		}

		// ------ 安全检查 4：扫描所有路径参数，拒绝指向沙箱外的绝对路径 / .. ------
		if !isCommandSafe(command) {
			c.JSON(http.StatusOK, gin.H{"command": command, "stdout": "", "stderr": fmt.Sprintf("[拒绝] 命令包含危险路径（超出 %s 范围）", SANDBOX_ROOT), "exit_code": 126, "cwd": safeCwd()})
			return
		}

		// ------ 空间配额检查（仅对写入类命令/下载）------
		if isWriteCommand(firstTok) {
			size, err := dirSize(SANDBOX_ROOT)
			if err == nil && size >= MAX_QUOTA_BYTES {
				c.JSON(http.StatusOK, gin.H{"command": command, "stdout": "", "stderr": fmt.Sprintf("[拒绝] 沙箱空间不足：当前 %d MB，上限 %d MB。请删除部分文件或执行 reset。", size/1024/1024, MAX_QUOTA_BYTES/1024/1024), "exit_code": 1, "cwd": safeCwd()})
				return
			}
		}

		// ------ 执行 shell 命令 ------
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, defaultShell(), "-c", command)
		cmd.Env = append(os.Environ(), "TERM=xterm")
		cmd.Dir = safeCwd()

		var stdout, stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr

		err := cmd.Run()
		exitCode := 0
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else {
				exitCode = -1
			}
		}

		// cd 复合命令成功后更新工作目录
		if exitCode == 0 && cdTarget != "" && cdAbs != "" {
			// 再做一次防御性检查：目录确实存在并在沙箱内
			if info, err := os.Stat(cdAbs); err == nil && info.IsDir() && isInsideSandbox(cdAbs) {
				terminalCwdMu.Lock()
				terminalCwd = cdAbs
				terminalCwdMu.Unlock()
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"command":   command,
			"stdout":    stdout.String(),
			"stderr":    stderr.String(),
			"exit_code": exitCode,
			"cwd":       safeCwd(),
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

// extractLastCdTarget 解析命令中所有 cd，返回**最后一个** cd 的目标路径
// 同时也用于安全检查：所有 cd 目标都必须在沙箱范围内
// 支持: "cd /path", "cd subdir", "cd ~", "mkdir x && cd x && pwd", "cd a && cd b"
// 返回空字符串表示命令中不含任何 cd
func extractLastCdTarget(command string) string {
	// 按 && / || / ; 切分子命令
	subs := splitShellCommands(command)
	lastCdTarget := ""
	for _, sub := range subs {
		sub = strings.TrimSpace(sub)
		if sub == "" {
			continue
		}
		// 切分 token，首 token 是 "cd"
		tokens := strings.Fields(sub)
		if len(tokens) > 0 && tokens[0] == "cd" {
			if len(tokens) == 1 {
				lastCdTarget = "~"
			} else {
				lastCdTarget = tokens[1]
			}
		}
	}
	return lastCdTarget
}

// hasAnyCd 命令中是否包含任意 cd 子命令
func hasAnyCd(command string) bool {
	subs := splitShellCommands(command)
	for _, sub := range subs {
		tokens := strings.Fields(strings.TrimSpace(sub))
		if len(tokens) > 0 && tokens[0] == "cd" {
			return true
		}
	}
	return false
}

// splitShellCommands 按 shell 分隔符切分子命令
func splitShellCommands(command string) []string {
	replacer := strings.NewReplacer("&&", "|SEP|", "||", "|SEP|", ";", "|SEP|")
	normalized := replacer.Replace(command)
	parts := strings.Split(normalized, "|SEP|")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

// splitShellCommand 简单分割 shell 命令，把 "cd /tmp && ls" 拆成 ["cd /tmp"] 用于第一命令识别
func splitShellCommand(cmd string) []string {
	return []string{cmd}
}

// normalizeCdTarget 把 cd 目标规范化为绝对路径（不要求目录存在），用于安全边界检查
// - "~"、"~/" ：拒绝（跳出沙箱范围）
// - 含 ".." ：拒绝（简化的安全策略）
// - 含 "$" 变量：拒绝（保守）
// - 绝对路径：直接使用（Clean 规范化）
// - 相对路径：基于 currentCwd 解析
// 返回空字符串表示不安全或不可解析
func normalizeCdTarget(target, currentCwd string) string {
	target = strings.TrimSpace(target)
	if target == "" {
		return currentCwd
	}
	if target == "~" || strings.HasPrefix(target, "~/") {
		return ""
	}
	if strings.Contains(target, "$") {
		return ""
	}
	if strings.Contains(target, "..") {
		return ""
	}
	var abs string
	if filepath.IsAbs(target) {
		abs = filepath.Clean(target)
	} else {
		base := currentCwd
		if base == "" {
			base = SANDBOX_ROOT
		}
		abs = filepath.Clean(filepath.Join(base, target))
	}
	return abs
}

// resolveCdTarget 把 cd 目标解析为绝对路径（并要求目录存在）
// - "~" 或 "~/"：展开为 $HOME
// - 相对路径：基于 currentCwd 解析
// - 绝对路径：直接使用
// 返回空字符串表示解析失败或目录不存在
func resolveCdTarget(target, currentCwd string) string {
	target = strings.TrimSpace(target)
	if target == "" {
		target = "~"
	}

	// 展开 ~ 和 ~/
	if target == "~" || strings.HasPrefix(target, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return ""
		}
		if target == "~" {
			target = home
		} else {
			target = filepath.Join(home, target[2:])
		}
	}

	// 展开 $HOME、$USER 等环境变量
	target = os.ExpandEnv(target)

	// 绝对路径直接使用
	if filepath.IsAbs(target) {
		// 确认目录存在
		if info, err := os.Stat(target); err == nil && info.IsDir() {
			return target
		}
		return ""
	}

	// 相对路径：基于 currentCwd
	base := currentCwd
	if base == "" {
		if wd, err := os.Getwd(); err == nil {
			base = wd
		}
	}
	abs := filepath.Join(base, target)
	if info, err := os.Stat(abs); err == nil && info.IsDir() {
		return abs
	}
	return ""
}

// ============================================================
// 辅助函数
// ============================================================

func safeCwd() string {
	terminalCwdMu.RLock()
	defer terminalCwdMu.RUnlock()
	if terminalCwd == "" {
		return SANDBOX_ROOT
	}
	return terminalCwd
}

// dirSize 递归统计目录大小
func dirSize(path string) (int64, error) {
	var size int64
	err := filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size, err
}

// firstCommandToken 取出命令行的第一个 token（命令本身）
func firstCommandToken(cmd string) string {
	cmd = strings.TrimSpace(cmd)
	if idx := strings.IndexAny(cmd, " \t"); idx > 0 {
		return cmd[:idx]
	}
	return cmd
}

// isInsideSandbox 判断路径是否落在沙箱范围内
func isInsideSandbox(path string) bool {
	if path == "" {
		return false
	}
	clean := filepath.Clean(path)
	root := filepath.Clean(SANDBOX_ROOT)
	return clean == root || strings.HasPrefix(clean, root+"/")
}

// isWriteCommand 判断首命令是否为写入类
func isWriteCommand(firstTok string) bool {
	writes := []string{"wget", "curl", "mkdir", "touch", "cp", "mv", "dd"}
	for _, w := range writes {
		if firstTok == w {
			return true
		}
	}
	return false
}

// isCommandSafe 扫描命令里的所有路径 token，确保不超出沙箱
func isCommandSafe(cmd string) bool {
	// 简单扫描：把命令按空白拆分，检查每个看起来像路径的 token
	fields := strings.Fields(cmd)
	for _, f := range fields {
		if strings.Contains(f, "..") {
			// 允许 "cd .." 但不允许带 ../ 的任意路径参数
			// 更谨慎：任何 .. 都拒绝
			if f == ".." || strings.Contains(f, "../") || strings.Contains(f, "..\\") {
				return false
			}
		}
		if strings.HasPrefix(f, "/") {
			// 绝对路径必须在沙箱内
			if !isInsideSandbox(f) {
				return false
			}
		}
		if strings.HasPrefix(f, "~/") || f == "~" {
			// ~ 默认视为沙箱外，拒绝
			return false
		}
	}
	return true
}

// ============================================================
// Files API
// ============================================================

// TerminalListFiles GET /api/terminal/files - 返回文件列表 + 大小
func TerminalListFiles() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !terminalEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "terminal is disabled"})
			return
		}
		entries, err := os.ReadDir(SANDBOX_ROOT)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		files := make([]map[string]interface{}, 0, len(entries))
		for _, e := range entries {
			info, err := e.Info()
			if err != nil {
				continue
			}
			files = append(files, map[string]interface{}{
				"name":    e.Name(),
				"is_dir":  info.IsDir(),
				"size":    info.Size(),
				"mtime":   info.ModTime().Format(time.RFC3339),
			})
		}
		total, _ := dirSize(SANDBOX_ROOT)
		c.JSON(http.StatusOK, gin.H{
			"files":      files,
			"used_bytes": total,
			"quota":      MAX_QUOTA_BYTES,
			"sandbox":    SANDBOX_ROOT,
		})
	}
}

// TerminalDownloadFile GET /api/terminal/files/:name - 浏览器下载
func TerminalDownloadFile() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !terminalEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "terminal is disabled"})
			return
		}
		name := c.Param("name")
		if name == "" || strings.Contains(name, "..") || strings.Contains(name, "/") || strings.Contains(name, "\\") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
			return
		}
		fpath := filepath.Join(SANDBOX_ROOT, name)
		if !isInsideSandbox(fpath) {
			c.JSON(http.StatusForbidden, gin.H{"error": "path outside sandbox"})
			return
		}
		info, err := os.Stat(fpath)
		if err != nil || info.IsDir() {
			c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
			return
		}
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", name))
		c.File(fpath)
	}
}

// TerminalUploadFile POST /api/terminal/files - 上传文件
func TerminalUploadFile() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !terminalEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "terminal is disabled"})
			return
		}
		// 配额预检
		if size, _ := dirSize(SANDBOX_ROOT); size >= MAX_QUOTA_BYTES {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("沙箱已满 (%d/%d MB)", size/1024/1024, MAX_QUOTA_BYTES/1024/1024)})
			return
		}

		file, header, err := c.Request.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		defer file.Close()

		if header.Size > MAX_UPLOAD_BYTES {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("文件过大，单文件最大 %d MB", MAX_UPLOAD_BYTES/1024/1024)})
			return
		}

		name := filepath.Base(header.Filename)
		if name == "" || name == "." {
			name = "uploaded.file"
		}
		fpath := filepath.Join(SANDBOX_ROOT, name)
		if !isInsideSandbox(fpath) {
			c.JSON(http.StatusForbidden, gin.H{"error": "path outside sandbox"})
			return
		}

		out, err := os.Create(fpath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer out.Close()

		if _, err := io.Copy(out, file); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "name": name, "size": header.Size})
	}
}

// TerminalDeleteFile DELETE /api/terminal/files/:name
func TerminalDeleteFile() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !terminalEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "terminal is disabled"})
			return
		}
		name := c.Param("name")
		if name == "" || strings.Contains(name, "..") || strings.Contains(name, "/") || strings.Contains(name, "\\") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
			return
		}
		fpath := filepath.Join(SANDBOX_ROOT, name)
		if !isInsideSandbox(fpath) {
			c.JSON(http.StatusForbidden, gin.H{"error": "path outside sandbox"})
			return
		}
		info, err := os.Stat(fpath)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
			return
		}
		if info.IsDir() {
			if err := os.RemoveAll(fpath); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		} else {
			if err := os.Remove(fpath); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "name": name})
	}
}

// TerminalReadFile GET /api/terminal/files/:name/content - 浏览器编辑的读取
func TerminalReadFile() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !terminalEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "terminal is disabled"})
			return
		}
		name := c.Param("name")
		if name == "" || strings.Contains(name, "..") || strings.Contains(name, "/") || strings.Contains(name, "\\") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
			return
		}
		fpath := filepath.Join(SANDBOX_ROOT, name)
		if !isInsideSandbox(fpath) {
			c.JSON(http.StatusForbidden, gin.H{"error": "path outside sandbox"})
			return
		}
		info, err := os.Stat(fpath)
		if err != nil || info.IsDir() {
			c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
			return
		}
		if info.Size() > 5*1024*1024 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file too large to edit (>5MB)"})
			return
		}
		ext := strings.ToLower(filepath.Ext(name))
		editable := false
		for _, e := range editableExts {
			if ext == e {
				editable = true
				break
			}
		}
		if !editable {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file type not editable in browser"})
			return
		}
		data, err := os.ReadFile(fpath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"name": name, "content": string(data), "size": len(data)})
	}
}

// TerminalWriteFile PUT /api/terminal/files/:name - 从浏览器保存覆盖
func TerminalWriteFile() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !terminalEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "terminal is disabled"})
			return
		}
		name := c.Param("name")
		if name == "" || strings.Contains(name, "..") || strings.Contains(name, "/") || strings.Contains(name, "\\") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid filename"})
			return
		}
		var body struct {
			Content string `json:"content"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		fpath := filepath.Join(SANDBOX_ROOT, name)
		if !isInsideSandbox(fpath) {
			c.JSON(http.StatusForbidden, gin.H{"error": "path outside sandbox"})
			return
		}

		// 配额检查
		writtenSize := int64(len(body.Content))
		existingSize := int64(0)
		if info, err := os.Stat(fpath); err == nil && !info.IsDir() {
			existingSize = info.Size()
		}
		currentDirSize, _ := dirSize(SANDBOX_ROOT)
		if currentDirSize-existingSize+writtenSize > MAX_QUOTA_BYTES {
			c.JSON(http.StatusBadRequest, gin.H{"error": "exceeds sandbox quota"})
			return
		}
		if err := os.WriteFile(fpath, []byte(body.Content), 0644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "name": name, "size": len(body.Content)})
	}
}

// TerminalReset POST /api/terminal/reset - 一键清空沙箱
func TerminalReset() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !terminalEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "terminal is disabled"})
			return
		}
		entries, err := os.ReadDir(SANDBOX_ROOT)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		deleted := 0
		for _, e := range entries {
			if err := os.RemoveAll(filepath.Join(SANDBOX_ROOT, e.Name())); err == nil {
				deleted++
			}
		}
		// 重置工作目录
		terminalCwdMu.Lock()
		terminalCwd = SANDBOX_ROOT
		terminalCwdMu.Unlock()
		c.JSON(http.StatusOK, gin.H{"ok": true, "deleted": deleted, "sandbox": SANDBOX_ROOT, "cwd": SANDBOX_ROOT})
	}
}

// ============================================================
// cloud-* 虚拟命令（直接调用内部函数/API 返回 JSON）
// ============================================================

func handleCloudCommand(command string, authHeader string) (string, error) {
	// 解析命令：cloud-xxx [args...]
	fields := strings.Fields(command)
	if len(fields) == 0 {
		return "", fmt.Errorf("empty command")
	}
	cmd := fields[0]
	args := fields[1:]

	// 构造 fake gin context 复用现有 handler 太复杂
	// 直接调用 backend helper 函数；不存在则通过 HTTP 调自身
	baseURL := "http://localhost:" + config.GetEnv("PORT", "8099")
	// 读取请求 token（不在这里处理，简化处理：直接返回帮助或 JSON 占位响应）

	switch cmd {
	case "cloud-help":
		help := "可用 cloud-* 命令:\n\n"
		help += "  cloud-info                             统计信息 (accounts, resources)\n"
		help += "  cloud-accounts                         云账户列表\n"
		help += "  cloud-accounts add <name> <type> <json>  新建账户\n"
		help += "  cloud-accounts del <id>                 删除账户\n"
		help += "  cloud-resources [type] [cloud]         资源列表\n"
		help += "  cloud-resource <id>                    资源详情\n"
		help += "  cloud-sync                             触发资源同步\n"
		help += "  cloud-sync-logs                        同步日志\n"
		help += "  cloud-cost                             成本总览\n"
		help += "  cloud-cost-breakdown                   成本分解\n"
		help += "  cloud-cost-trend                       成本趋势\n"
		help += "  cloud-terraform templates              Terraform 模板列表\n"
		help += "  cloud-help                             显示此帮助\n"
		help += "\n提示: 命令通过后端直接调用内部 API，不产生真实 shell 进程。\n"
		help += "参数举例: cloud-resources instance aws\n"
		return help, nil

	case "cloud-info":
		return proxyInternalAPI("GET", baseURL+"/api/stats", nil, authHeader)
	case "cloud-accounts":
		if len(args) == 0 {
			return proxyInternalAPI("GET", baseURL+"/api/accounts", nil, authHeader)
		}
		if args[0] == "del" && len(args) > 1 {
			return proxyInternalAPI("DELETE", baseURL+"/api/accounts/"+args[1], nil, authHeader)
		}
		return "[用法] cloud-accounts | cloud-accounts add <name> <type> '{\"k\":\"v\"}' | cloud-accounts del <id>", nil
	case "cloud-resources":
		url := baseURL + "/api/resources"
		if len(args) > 0 {
			url += "?type=" + args[0]
			if len(args) > 1 {
				url += "&cloud=" + args[1]
			}
		}
		return proxyInternalAPI("GET", url, nil, authHeader)
	case "cloud-resource":
		if len(args) < 1 {
			return "[用法] cloud-resource <id>", nil
		}
		return proxyInternalAPI("GET", baseURL+"/api/resources/"+args[0], nil, authHeader)
	case "cloud-sync":
		return proxyInternalAPI("POST", baseURL+"/api/resources/sync", nil, authHeader)
	case "cloud-sync-logs":
		return proxyInternalAPI("GET", baseURL+"/api/resources/sync-logs", nil, authHeader)
	case "cloud-cost":
		return proxyInternalAPI("GET", baseURL+"/api/cost/overview", nil, authHeader)
	case "cloud-cost-breakdown":
		return proxyInternalAPI("GET", baseURL+"/api/cost/breakdown", nil, authHeader)
	case "cloud-cost-trend":
		return proxyInternalAPI("GET", baseURL+"/api/cost/trend", nil, authHeader)
	case "cloud-terraform":
		if len(args) == 1 && args[0] == "templates" {
			return proxyInternalAPI("GET", baseURL+"/api/terraform/templates", nil, authHeader)
		}
		return "[用法] cloud-terraform templates", nil
	default:
		return "", fmt.Errorf("未知 cloud 命令: %s。输入 cloud-help 查看帮助", cmd)
	}
}

// proxyInternalAPI 通过 HTTP 回调调用本机 API（因为各 handler 与 db 对象挂在 SetupRouter 闭包里，
// 复用它们需要重构，这里用 HTTP 回调作为简单桥梁。admin 角色检查由调用方路由已完成。）
func proxyInternalAPI(method, url string, body interface{}, authHeader string) (string, error) {
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return "", err
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		return "", fmt.Errorf("构造请求失败: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求内部 API 失败（可能服务未就绪）: %v", err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(data))
	}
	// 美化 JSON 输出
	var pretty bytes.Buffer
	if err := json.Indent(&pretty, data, "", "  "); err != nil {
		return string(data), nil
	}
	return pretty.String(), nil
}
