package infra

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ---------- Request / Response DTOs ----------

type GenerateTitleReq struct {
	Messages []ChatMessage `json:"messages"`
}

type GenerateTitleResp struct {
	Title string `json:"title"`
}

// ContentBlock 表示多模态消息中的一个内容块（文本或图片）。
type ContentBlock struct {
	Type     string    `json:"type"`                // "text" | "image_url"
	Text     string    `json:"text,omitempty"`      // type=text 时使用
	ImageURL *ImageURL `json:"image_url,omitempty"` // type=image_url 时使用
}

type ImageURL struct {
	URL string `json:"url"` // "data:image/jpeg;base64,..."
}

// ChatMessage 的 Content 字段支持两种类型：
//   - string：纯文本消息
//   - []ContentBlock：多模态消息（文本+图片混合）
type ChatMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

type StreamChatReq struct {
	Messages []ChatMessage `json:"messages"`
	Model    int           `json:"model"`
}

type GenerateSummaryReq struct {
	Messages        []ChatMessage `json:"messages"`
	PreviousSummary *string       `json:"previous_summary,omitempty"`
	SummaryType     string        `json:"summary_type"` // "message" | "node"
}

type GenerateSummaryResp struct {
	Summary string `json:"summary"`
}

type SSEEvent struct {
	Type             string `json:"type"`
	Content          string `json:"content,omitempty"`
	Message          string `json:"message,omitempty"`
	PromptTokens     int    `json:"prompt_tokens,omitempty"`
	CompletionTokens int    `json:"completion_tokens,omitempty"`
}

type AIStreamEvent struct {
    Type    string // "token" | "complete" | "error" | "tool_call"
    Content string // token 内容或完整回复
    PromptTokens     int
    CompletionTokens int
}

// ---------- AIClient ----------

type AIClient struct {
	baseURL      string
	httpClient   *http.Client // 普通请求（带超时）
	streamClient *http.Client // 流式请求（无超时，靠 ctx 控制取消）
}

func NewAIClient(baseURL string) *AIClient {
	return &AIClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		streamClient: &http.Client{},
	}
}

// GenerateTitle 调用 POST /api/generate-title，返回生成的标题。
// 使用 streamClient（无内置超时），由调用方通过 ctx 控制超时。
func (c *AIClient) GenerateTitle(ctx context.Context, messages []ChatMessage) (string, error) {
	body, err := json.Marshal(GenerateTitleReq{Messages: messages})
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/generate-title", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.streamClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("ai-service request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errResp struct {
			Detail string `json:"detail"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		return "", fmt.Errorf("ai-service error (%d): %s", resp.StatusCode, errResp.Detail)
	}

	var result GenerateTitleResp
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	return result.Title, nil
}

// GenerateSummary 调用 POST /api/generate-summary，返回生成的摘要文本。
// 使用 streamClient（无内置超时），由调用方通过 ctx 控制超时（建议 60s）。
// summaryType: "message" for message-level, "node" for node-level.
func (c *AIClient) GenerateSummary(ctx context.Context, messages []ChatMessage, previousSummary *string, summaryType string) (string, error) {
	body, err := json.Marshal(GenerateSummaryReq{
		Messages:        messages,
		PreviousSummary: previousSummary,
		SummaryType:     summaryType,
	})
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/generate-summary", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.streamClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("ai-service request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errResp struct {
			Detail string `json:"detail"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		return "", fmt.Errorf("ai-service error (%d): %s", resp.StatusCode, errResp.Detail)
	}

	var result GenerateSummaryResp
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	return result.Summary, nil
}

// StreamChat 调用 POST /api/chat/completions，返回 AIStreamEvent channel。
// 调用方通过 range channel 消费事件，channel 关闭表示流结束。
func (c *AIClient) StreamChat(ctx context.Context, messages []ChatMessage, model int) (<-chan AIStreamEvent, error) {
	body, err := json.Marshal(StreamChatReq{Messages: messages, Model: model})
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.streamClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ai-service request: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		defer resp.Body.Close()
		var errResp struct {
			Detail string `json:"detail"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		return nil, fmt.Errorf("ai-service error (%d): %s", resp.StatusCode, errResp.Detail)
	}

	ch := make(chan AIStreamEvent)
	go func() {
		defer close(ch)
		defer resp.Body.Close()

		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}

			var event SSEEvent
			if err := json.Unmarshal([]byte(line[6:]), &event); err != nil {
				continue
			}

			var out AIStreamEvent
			switch event.Type {
			case "token":
				out = AIStreamEvent{Type: "token", Content: event.Content}
			case "complete":
				out = AIStreamEvent{
					Type:             "complete",
					PromptTokens:     event.PromptTokens,
					CompletionTokens: event.CompletionTokens,
				}
			case "tool_call":
				out = AIStreamEvent{Type: "tool_call", Content: event.Content}
			case "error":
				out = AIStreamEvent{Type: "error", Content: event.Message}
			default:
				continue
			}

			select {
			case <-ctx.Done():
				return
			case ch <- out:
			}
		}
	}()

	return ch, nil
}
