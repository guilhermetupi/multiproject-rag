import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProjects, fetchFAQs, streamChatMessage } from './api';
import type { Project, FAQ, ChatSource, StreamEvent } from './api';
import './App.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
}

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [faqOpen, setFaqOpen] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setFaqs([]);
      setMessages([]);
      setSessionId(undefined);
      return;
    }
    fetchFAQs(selectedId)
      .then(setFaqs)
      .catch(() => setFaqs([]));
    setMessages([]);
    setSessionId(undefined);
  }, [selectedId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleFaq = (id: string) => {
    setFaqOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !selectedId || loading) return;

    setInput('');
    setLoading(true);

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);

    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      await streamChatMessage(
        selectedId,
        text,
        (event: StreamEvent) => {
          if (event.type === 'token') {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  content: last.content + event.content,
                };
              }
              return next;
            });
          } else if (event.type === 'done') {
            setSessionId(event.session_id);
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  sources: event.sources,
                };
              }
              return next;
            });
          } else if (event.type === 'error') {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  content: last.content + `\n\n⚠️ ${event.message}`,
                };
              }
              return next;
            });
          }
        },
        sessionId,
      );
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          next[next.length - 1] = {
            ...last,
            content: last.content + `\n\n⚠️ Error: ${err instanceof Error ? err.message : 'Failed to send message'}`,
          };
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [input, selectedId, loading, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>Multiproject RAG</h1>
        <select
          className="project-select"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">-- Select a project --</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </header>

      {!selectedId ? (
        <div className="empty-state">
          <p>Select a project above to view its FAQ and chat with its documents.</p>
        </div>
      ) : (
        <div className="columns">
          <aside className="faq-column">
            <h2>FAQ</h2>
            {faqs.length === 0 ? (
              <p className="muted">No FAQs for this project.</p>
            ) : (
              <ul className="faq-list">
                {faqs.map((faq) => (
                  <li key={faq.id} className="faq-item">
                    <button
                      className="faq-question"
                      onClick={() => toggleFaq(faq.id)}
                    >
                      <span className="faq-chevron">
                        {faqOpen[faq.id] ? '▾' : '▸'}
                      </span>
                      {faq.question}
                    </button>
                    {faqOpen[faq.id] && (
                      <p className="faq-answer">{faq.answer}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <main className="chat-column">
            <h2>Chat</h2>
            <div className="chat-messages">
              {messages.length === 0 && (
                <p className="muted">Ask a question about this project's documents.</p>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  <div className="message-content">{msg.content || (msg.role === 'assistant' && loading ? '...' : '')}</div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="sources">
                      <span className="sources-label">Sources:</span>
                      {msg.sources.map((s, j) => (
                        <span key={j} className="source-badge" title={`Score: ${s.score}`}>
                          {s.title || s.document_id}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-input-area">
              <textarea
                className="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about the project..."
                rows={2}
                disabled={loading}
              />
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={loading || !input.trim()}
              >
                {loading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

export default App;
