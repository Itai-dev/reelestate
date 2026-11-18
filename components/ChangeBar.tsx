"use client";

import { useEffect, useRef, useState } from "react";
import Thinking from "./Thinking";

type SR = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type Change = { id: string; text: string; reply: string; state: "working" | "done" | "error"; canUndo: boolean };

// One line to change anything in the finished reel, typed or spoken.
export default function ChangeBar(p: {
  busy: boolean;
  disabled?: boolean;
  log: Change[];
  onSend: (text: string) => void;
  onUndo: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const rec = useRef<SR | null>(null);
  const [canSpeak, setCanSpeak] = useState(false);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    setCanSpeak(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const listen = () => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const C = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!C) return;
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = new C();
    r.lang = "he-IL";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      setText(s);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  const send = () => {
    const v = text.trim();
    if (!v || p.busy) return;
    p.onSend(v);
    setText("");
  };

  return (
    <section className="changebar" aria-labelledby="cb-title">
      <h2 id="cb-title">מה לשנות?</h2>
      <form
        className="cb-form"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={listening ? "מקשיב…" : "למשל: שקיעה במטבח, והמחיר 4.8 מיליון"}
          aria-label="מה לשנות"
          disabled={p.disabled}
        />
        {canSpeak && (
          <button type="button" className={`cb-mic${listening ? " is-on" : ""}`} onClick={listen} aria-label={listening ? "עצירת ההקלטה" : "הקלטה"} disabled={p.disabled}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <rect x="9" y="3.5" width="6" height="11" rx="3" />
              <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
            </svg>
          </button>
        )}
        <button type="submit" className="cb-send" disabled={!text.trim() || p.busy || p.disabled} aria-label="שליחה">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </button>
      </form>
      {p.log.length > 0 && (
        <ol className="cb-log">
          {p.log.map((c) => (
            <li key={c.id} className={`is-${c.state}`}>
              <b>{c.text}</b>
              {c.state === "working" ? (
                <Thinking compact lines={[c.reply || "מבין מה לשנות", "מעדכן את הרילס"]} />
              ) : (
                <span>
                  {c.reply}
                  {c.canUndo && c.state === "done" && (
                    <button type="button" className="link" onClick={() => p.onUndo(c.id)}>
                      ביטול
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
