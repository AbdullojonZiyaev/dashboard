import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { localAnswer } from "../lib/assistant.js";

const SUGGESTIONS = ["What needs attention now?", "Which flights are not ready?", "Which meals expire soon?", "Give me a summary", "What does dBm mean?"];

// mode: "unknown" until the first answer, then "claude" or "offline"
export default function ChatPanel({ open, onClose, getSnapshot }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! Ask me about meals, flights, alerts, temperatures, doors, batteries or signal. I read the live dashboard data." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("unknown");
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const key = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);

  const appendToLast = (text) =>
    setMessages((m) => {
      const copy = m.slice();
      copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + text };
      return copy;
    });

  async function ask(question) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    const history = [...messages, { role: "user", content: q }];
    setMessages([...history, { role: "assistant", content: "", pending: true }]);
    setBusy(true);
    const snapshot = getSnapshot();

    let answered = false;
    if (mode !== "offline") {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The first message is the local greeting; Claude does not need it
          body: JSON.stringify({ messages: history.slice(1).map(({ role, content }) => ({ role, content })), snapshot }),
        });
        if (res.ok && res.body) {
          setMode("claude");
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            appendToLast(decoder.decode(value, { stream: true }));
          }
          answered = true;
        } else if (res.status === 503 || res.status === 404) {
          setMode("offline"); // no API key configured, or no backend (static build)
        }
      } catch {
        // network error: fall through to the offline answer for this question
      }
    }
    if (!answered) appendToLast(localAnswer(q, snapshot));
    setMessages((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, pending: false } : x)));
    setBusy(false);
  }

  return (
    <aside className={`chat ${open ? "open" : ""}`} aria-label="Dashboard assistant" aria-hidden={!open} inert={!open}>
      <div className="chat-head">
        <div>
          <h2>Assistant</h2>
          <p className="muted small">
            {mode === "claude" ? "Answers by Claude from the live data" : mode === "offline" ? "Offline answers (no Claude API key set)" : "Reads the live dashboard data"}
          </p>
        </div>
        <button className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Close assistant">
          <X size={20} />
        </button>
      </div>
      <div className="chat-list" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`bubble bubble-${m.role}`}>
            {m.content || (m.pending ? <span className="typing">Thinking…</span> : "")}
          </div>
        ))}
      </div>
      <div className="chat-suggest">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => ask(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about the dashboard…" aria-label="Your question" />
        <button className="btn btn-primary" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
