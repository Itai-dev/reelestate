"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { setHandoff } from "@/lib/handoff";
import { IconPlus } from "./Icons";

const IDEAS = ["דירת 4 חדרים עם נוף לים", "פנטהאוז עם מרפסת גג", "וילה עם בריכה וגינה"];

// The landing's first action: describe the property or attach photos, renders or a plan.
export default function HeroPrompt() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const ok = Array.from(list).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    setFiles((prev) => [...prev, ...ok].slice(0, 10));
  };

  const go = () => {
    if (!text.trim() && !files.length) {
      area.current?.focus();
      return;
    }
    setHandoff({ files, text: text.trim() });
    router.push("/studio?new=1");
  };

  return (
    <div className="hp" id="start">
      <form
        className={`hp-box${drag ? " is-drag" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
      >
        <label htmlFor="hp-text" className="sr-only">
          מה הנכס?
        </label>
        <textarea
          id="hp-text"
          ref={area}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              go();
            }
          }}
          placeholder="תארו את הנכס, או צרפו תמונות, הדמיות או תוכנית"
        />
        {files.length > 0 && (
          <div className="hp-files">
            {files.map((f, i) => (
              <span key={i} className="hp-file">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(f)} alt="" />
                <button type="button" aria-label={`הסרת ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="hp-bar">
          <button type="button" className="hp-attach" onClick={() => input.current?.click()}>
            <IconPlus />
            צירוף תמונות
          </button>
          <input ref={input} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => add(e.target.files)} />
          <button type="submit" className="hp-send" aria-label="יוצרים סרטון">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        </div>
      </form>
      <div className="hp-ideas">
        {IDEAS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setText(t);
              area.current?.focus();
            }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
