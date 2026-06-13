package session

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type Session struct {
	ID                string         `json:"id"`
	ParentID          *string        `json:"parentID,omitempty"`
	ProjectID         string         `json:"projectID"`
	WorkspaceID       *string        `json:"workspaceID,omitempty"`
	Directory         string         `json:"directory"`
	Path              *string        `json:"path,omitempty"`
	Slug              *string        `json:"slug,omitempty"`
	Title             string         `json:"title"`
	Version           *string        `json:"version,omitempty"`
	Agent             *string        `json:"agent,omitempty"`
	Model             *ModelRef      `json:"model,omitempty"`
	Cost              float64        `json:"cost"`
	Tokens            Tokens         `json:"tokens"`
	Time              SessionTime    `json:"time"`
	Subpath           *string        `json:"subpath,omitempty"`
}

type ModelRef struct {
	ID         string  `json:"id"`
	ProviderID string  `json:"providerID"`
	Variant    *string `json:"variant,omitempty"`
}

type Tokens struct {
	Input     int64      `json:"input"`
	Output    int64      `json:"output"`
	Reasoning int64      `json:"reasoning"`
	Cache     CacheTokens `json:"cache"`
}

type CacheTokens struct {
	Read  int64 `json:"read"`
	Write int64 `json:"write"`
}

type SessionTime struct {
	Created  int64   `json:"created"`
	Updated  int64   `json:"updated"`
	Archived *int64  `json:"archived,omitempty"`
}

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

func (s *Service) Create(input *CreateInput) (*Session, error) {
	now := time.Now().UnixMilli()
	id := "ses_" + uuid.New().String()[:12]

	if input == nil {
		input = &CreateInput{}
	}

	directory := input.Directory
	if directory == "" {
		directory = "."
	}

	title := input.Title
	if title == "" {
		title = fmt.Sprintf("New session - %s", time.Now().Format(time.RFC3339))
	}

	var modelJSON interface{} = nil
	if input.Model != nil {
		var err error
		modelBytes, err := json.Marshal(input.Model)
		if err != nil {
			return nil, err
		}
		modelJSON = string(modelBytes)
	}

	_, err := s.db.Exec(
		`INSERT INTO session (id, project_id, workspace_id, directory, title, agent, model, time_created, time_updated)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		id, input.ProjectID, input.WorkspaceID, directory, title, input.Agent, modelJSON, now, now,
	)
	if err != nil {
		return nil, err
	}

	return s.Get(id)
}

func (s *Service) Get(id string) (*Session, error) {
	row := s.db.QueryRow(
		`SELECT id, parent_id, project_id, workspace_id, directory, path, slug, title, version, agent, model,
		        cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
		        time_created, time_updated, time_archived
		 FROM session WHERE id = $1`, id,
	)

	sess := &Session{}
	var modelJSON sql.NullString
	var parentID, workspaceID, path, slug, version, agent sql.NullString
	var timeArchived sql.NullInt64

	err := row.Scan(
		&sess.ID, &parentID, &sess.ProjectID, &workspaceID, &sess.Directory, &path, &slug,
		&sess.Title, &version, &agent, &modelJSON,
		&sess.Cost, &sess.Tokens.Input, &sess.Tokens.Output, &sess.Tokens.Reasoning,
		&sess.Tokens.Cache.Read, &sess.Tokens.Cache.Write,
		&sess.Time.Created, &sess.Time.Updated, &timeArchived,
	)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("session not found: %s", id)
	}
	if err != nil {
		return nil, err
	}

	if parentID.Valid {
		sess.ParentID = &parentID.String
	}
	if workspaceID.Valid {
		sess.WorkspaceID = &workspaceID.String
	}
	if path.Valid {
		sess.Path = &path.String
	}
	if slug.Valid {
		sess.Slug = &slug.String
	}
	if version.Valid {
		sess.Version = &version.String
	}
	if agent.Valid {
		sess.Agent = &agent.String
	}
	if timeArchived.Valid {
		sess.Time.Archived = &timeArchived.Int64
	}

	if modelJSON.Valid {
		var model ModelRef
		if err := json.Unmarshal([]byte(modelJSON.String), &model); err == nil {
			sess.Model = &model
		}
	}

	return sess, nil
}

func (s *Service) List(input *ListInput) ([]*Session, error) {
	if input == nil {
		input = &ListInput{}
	}

	query := `SELECT id, parent_id, project_id, workspace_id, directory, path, slug, title, version, agent, model,
	                 cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write,
	                 time_created, time_updated, time_archived
	          FROM session WHERE time_archived IS NULL`
	args := []interface{}{}
	argIndex := 1

	if input.Directory != "" {
		query += fmt.Sprintf(" AND directory = $%d", argIndex)
		args = append(args, input.Directory)
		argIndex++
	}
	if input.ProjectID != "" {
		query += fmt.Sprintf(" AND project_id = $%d", argIndex)
		args = append(args, input.ProjectID)
		argIndex++
	}
	if input.Search != "" {
		query += fmt.Sprintf(" AND title LIKE $%d", argIndex)
		args = append(args, "%"+input.Search+"%")
		argIndex++
	}

	order := "DESC"
	if input.Order == "asc" {
		order = "ASC"
	}
	query += " ORDER BY time_created " + order

	limit := 50
	if input.Limit > 0 && input.Limit <= 200 {
		limit = input.Limit
	}
	query += fmt.Sprintf(" LIMIT %d", limit)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []*Session
	for rows.Next() {
		sess := &Session{}
		var modelJSON sql.NullString
		var parentID, workspaceID, path, slug, version, agent sql.NullString
		var timeArchived sql.NullInt64

		err := rows.Scan(
			&sess.ID, &parentID, &sess.ProjectID, &workspaceID, &sess.Directory, &path, &slug,
			&sess.Title, &version, &agent, &modelJSON,
			&sess.Cost, &sess.Tokens.Input, &sess.Tokens.Output, &sess.Tokens.Reasoning,
			&sess.Tokens.Cache.Read, &sess.Tokens.Cache.Write,
			&sess.Time.Created, &sess.Time.Updated, &timeArchived,
		)
		if err != nil {
			return nil, err
		}

		if parentID.Valid {
			sess.ParentID = &parentID.String
		}
		if workspaceID.Valid {
			sess.WorkspaceID = &workspaceID.String
		}
		if path.Valid {
			sess.Path = &path.String
		}
		if slug.Valid {
			sess.Slug = &slug.String
		}
		if version.Valid {
			sess.Version = &version.String
		}
		if agent.Valid {
			sess.Agent = &agent.String
		}
		if timeArchived.Valid {
			sess.Time.Archived = &timeArchived.Int64
		}
		if modelJSON.Valid {
			var model ModelRef
			if err := json.Unmarshal([]byte(modelJSON.String), &model); err == nil {
				sess.Model = &model
			}
		}

		sessions = append(sessions, sess)
	}

	return sessions, nil
}

func (s *Service) Delete(id string) error {
	result, err := s.db.Exec("DELETE FROM session WHERE id = $1", id)
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fmt.Errorf("session not found: %s", id)
	}
	return nil
}

func (s *Service) Update(id string, input *UpdateInput) (*Session, error) {
	sess, err := s.Get(id)
	if err != nil {
		return nil, err
	}

	if input.Title != nil {
		sess.Title = *input.Title
	}
	if input.Archived != nil {
		if *input.Archived {
			now := time.Now().UnixMilli()
			sess.Time.Archived = &now
		} else {
			sess.Time.Archived = nil
		}
	}

	_, err = s.db.Exec(
		`UPDATE session SET title = $1, time_archived = $2, time_updated = $3 WHERE id = $4`,
		sess.Title, sess.Time.Archived, time.Now().UnixMilli(), id,
	)
	if err != nil {
		return nil, err
	}

	return s.Get(id)
}

type CreateInput struct {
	ID          string    `json:"id,omitempty"`
	ProjectID   string    `json:"projectID,omitempty"`
	WorkspaceID *string   `json:"workspaceID,omitempty"`
	Directory   string    `json:"directory,omitempty"`
	Title       string    `json:"title,omitempty"`
	Agent       *string   `json:"agent,omitempty"`
	Model       *ModelRef `json:"model,omitempty"`
}

type ListInput struct {
	Directory string `json:"directory,omitempty"`
	ProjectID string `json:"projectID,omitempty"`
	WorkspaceID string `json:"workspaceID,omitempty"`
	Search    string `json:"search,omitempty"`
	Limit     int    `json:"limit,omitempty"`
	Order     string `json:"order,omitempty"`
}

type UpdateInput struct {
	Title    *string `json:"title,omitempty"`
	Archived *bool   `json:"archived,omitempty"`
}
