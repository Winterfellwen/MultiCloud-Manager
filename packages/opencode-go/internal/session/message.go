package session

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type Message struct {
	ID          string      `json:"id"`
	SessionID   string      `json:"sessionID"`
	Type        string      `json:"type"`
	Seq         int         `json:"seq"`
	Time        MessageTime `json:"time"`
	Data        interface{} `json:"data,omitempty"`
	RawData     string      `json:"-"`
}

type MessageTime struct {
	Created   int64  `json:"created"`
	Completed *int64 `json:"completed,omitempty"`
}

type UserMessage struct {
	Text   string       `json:"text"`
	Files  []FileRef    `json:"files,omitempty"`
	Agents []AgentRef   `json:"agents,omitempty"`
}

type AssistantMessage struct {
	Agent     string        `json:"agent,omitempty"`
	Model     *ModelRef     `json:"model,omitempty"`
	Content   []ContentPart `json:"content,omitempty"`
	Finish    string        `json:"finish,omitempty"`
	Cost      float64       `json:"cost,omitempty"`
	Tokens    *Tokens       `json:"tokens,omitempty"`
	Error     *string       `json:"error,omitempty"`
}

type ContentPart struct {
	Type  string      `json:"type"`
	ID    string      `json:"id,omitempty"`
	Text  string      `json:"text,omitempty"`
	Name  string      `json:"name,omitempty"`
	State *ToolState  `json:"state,omitempty"`
}

type ToolState struct {
	Status    string        `json:"status"`
	Input     interface{}   `json:"input,omitempty"`
	Content   []TextContent `json:"content,omitempty"`
	Error     *ToolError    `json:"error,omitempty"`
}

type ToolError struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

type TextContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type FileRef struct {
	URI  string `json:"uri"`
	MIME string `json:"mime,omitempty"`
	Name string `json:"name,omitempty"`
}

type AgentRef struct {
	Name string `json:"name"`
}

type MessageService struct {
	db *sql.DB
}

func NewMessageService(db *sql.DB) *MessageService {
	return &MessageService{db: db}
}

func (ms *MessageService) Create(sessionID, msgType string, data interface{}) (*Message, error) {
	now := time.Now().UnixMilli()
	id := "msg_" + uuid.New().String()[:12]

	dataJSON, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}

	var maxSeq int
	ms.db.QueryRow("SELECT COALESCE(MAX(seq), 0) FROM session_message WHERE session_id = $1", sessionID).Scan(&maxSeq)
	seq := maxSeq + 1

	_, err = ms.db.Exec(
		`INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		id, sessionID, msgType, seq, now, now, dataJSON,
	)
	if err != nil {
		return nil, err
	}

	return &Message{
		ID:        id,
		SessionID: sessionID,
		Type:      msgType,
		Seq:       seq,
		Time:      MessageTime{Created: now},
		Data:      data,
		RawData:   string(dataJSON),
	}, nil
}

func (ms *MessageService) List(sessionID string, limit, offset int) ([]*Message, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := ms.db.Query(
		`SELECT id, session_id, type, seq, time_created, time_updated, data
		 FROM session_message WHERE session_id = $1
		 ORDER BY seq DESC LIMIT $2 OFFSET $3`,
		sessionID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []*Message
	for rows.Next() {
		msg := &Message{}
		var rawData string
		err := rows.Scan(&msg.ID, &msg.SessionID, &msg.Type, &msg.Seq, &msg.Time.Created, &msg.Time.Completed, &rawData)
		if err != nil {
			return nil, err
		}
		msg.RawData = rawData
		
		// Parse raw data based on message type
		switch msg.Type {
		case "user":
			var userMsg UserMessage
			if json.Unmarshal([]byte(rawData), &userMsg) == nil {
				msg.Data = userMsg
			}
		case "assistant":
			var asstMsg AssistantMessage
			if json.Unmarshal([]byte(rawData), &asstMsg) == nil {
				msg.Data = asstMsg
			}
		default:
			var raw map[string]interface{}
			if json.Unmarshal([]byte(rawData), &raw) == nil {
				msg.Data = raw
			}
		}
		
		messages = append(messages, msg)
	}

	return messages, nil
}

func (ms *MessageService) Get(id string) (*Message, error) {
	msg := &Message{}
	var rawData string
	err := ms.db.QueryRow(
		`SELECT id, session_id, type, seq, time_created, time_updated, data
		 FROM session_message WHERE id = $1`, id,
	).Scan(&msg.ID, &msg.SessionID, &msg.Type, &msg.Seq, &msg.Time.Created, &msg.Time.Completed, &rawData)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("message not found: %s", id)
	}
	if err != nil {
		return nil, err
	}
	msg.RawData = rawData
	return msg, nil
}

func (ms *MessageService) Update(id string, data interface{}) error {
	dataJSON, err := json.Marshal(data)
	if err != nil {
		return err
	}

	_, err = ms.db.Exec(
		`UPDATE session_message SET data = $1, time_updated = $2 WHERE id = $3`,
		dataJSON, time.Now().UnixMilli(), id,
	)
	return err
}

func (ms *MessageService) GetNextSeq(sessionID string) int {
	var maxSeq int
	ms.db.QueryRow("SELECT COALESCE(MAX(seq), 0) FROM session_message WHERE session_id = $1", sessionID).Scan(&maxSeq)
	return maxSeq + 1
}
