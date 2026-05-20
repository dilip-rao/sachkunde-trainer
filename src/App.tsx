import { useEffect, useMemo, useState } from "react";

type Opt = { label: string; text: string; correct?: boolean };
type Q = { rawId: string; text: string; options: Opt[]; multi?: boolean };

// ✅ Supports both: "2.100 ..." and "01 ..."
const RX_QID_DOTTED = /^\s*(\d+)\.(\d{2,})\s+(.*)$/; // 2.100, 1.02
const RX_QID_PLAIN = /^\s*(\d{1,3})\s+(.*)$/; // 01, 02, 103

const RX_OPT = /^\s*([a-kA-K]|\d{1,2})[)\.]\s+(.*)$/;
const RX_INLINE_OPT = /^(.*)\s+([a-kA-K]|\d{1,2})[)\.]\s+(.*)$/;

function norm(s: string) {
  return (s || "")
    .replace(/\u00AD/g, "") // soft hyphen
    .replace(/\u00A0/g, " ") // NBSP -> space
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/(\w)-\s+(\w)/g, "$1$2") // mit- nimmt -> mitnimmt
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * ✅ Heuristic: does the text after a plain number look like a real question title?
 * Prevents table rows like "4 mm M20" / "300 m" and wrapped lines like "12 gleich große Kugeln."
 * from being interpreted as new questions.
 */
function looksLikeQuestionStart(rest: string) {
  const r = (rest || "").trim();
  if (!r) return false;

  if (/^(Was|Wer|Wie|Welche|Woran|Wodurch|Wann|Darf|Ist|Sind|Kann|Nennen)\b/.test(r))
    return true;

  if (r.includes("?")) return true;
  if (/^[A-ZÄÖÜ]/.test(r)) return true;

  return false;
}

function hasAnswerKey(q: Q) {
  return q.options?.some((o) => typeof o.correct === "boolean");
}

function computeMulti(q: Q) {
  const cc = q.options.filter((o) => o.correct).length;
  return cc > 1;
}

function isAnswerCorrect(q: Q, selectedLabels: string[] | string | undefined) {
  if (!hasAnswerKey(q)) return null;

  const correctLabels = q.options
    .filter((o) => o.correct)
    .map((o) => o.label)
    .sort();

  const userLabels = (Array.isArray(selectedLabels) ? selectedLabels : [selectedLabels].filter(Boolean))
    .map(String)
    .sort();

  return (
    correctLabels.length === userLabels.length &&
    correctLabels.every((v, i) => v === userLabels[i])
  );
}

/**
 * ✅ Paste-text parser: supports BOTH formats:
 *  - DOTTED: 2.100 Question...
 *  - PLAIN: 01 Question...  (converted to `${importPrefix}.01`)
 */
function parseQuestionsFromText(pasted: string, importPrefix: string): Q[] {
  const lines = norm(pasted)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out: Q[] = [];
  let cur: Q | null = null;
  let inOptions = false;

  const push = () => {
    if (!cur) return;
    cur.text = norm(cur.text);
    cur.options = (cur.options || []).map((o) => ({ ...o, text: norm(o.text) }));
    out.push(cur);
    cur = null;
    inOptions = false;
  };

  for (const lineRaw of lines) {
    const line = norm(lineRaw);

    // 1) DOTTED IDs
    const md = line.match(RX_QID_DOTTED);
    if (md) {
      push();
      const chap = md[1];
      const num = md[2];
      const rest = md[3];

      cur = { rawId: `${chap}.${num}`, text: norm(rest), options: [] };
      inOptions = false;

      const im = cur.text.match(RX_INLINE_OPT);
      if (im) {
        cur.text = norm(im[1]);
        cur.options.push({ label: String(im[2]).toLowerCase(), text: norm(im[3]) });
        inOptions = true;
      }
      continue;
    }

    // 2) PLAIN IDs (guarded)
    const mp = line.match(RX_QID_PLAIN);
    if (mp) {
      const plainNum = mp[1];
      const rest = mp[2];

      if (!looksLikeQuestionStart(rest)) {
        if (!cur) continue;

        if (inOptions && cur.options.length > 0) {
          cur.options[cur.options.length - 1].text = norm(
            cur.options[cur.options.length - 1].text + " " + line
          );
        } else {
          cur.text = norm(cur.text + " " + line);
        }
        continue;
      }

      push();

      const width = Math.max(2, plainNum.length);
      const padded = plainNum.padStart(width, "0");

      cur = { rawId: `${importPrefix}.${padded}`, text: norm(rest), options: [] };
      inOptions = false;

      const im = cur.text.match(RX_INLINE_OPT);
      if (im) {
        cur.text = norm(im[1]);
        cur.options.push({ label: String(im[2]).toLowerCase(), text: norm(im[3]) });
        inOptions = true;
      }
      continue;
    }

    if (!cur) continue;

    // 3) options
    const mo = line.match(RX_OPT);
    if (mo) {
      inOptions = true;
      cur.options.push({ label: String(mo[1]).toLowerCase(), text: norm(mo[2]) });
      continue;
    }

    // 4) continuation
    if (inOptions && cur.options.length) {
      cur.options[cur.options.length - 1].text = norm(
        cur.options[cur.options.length - 1].text + " " + line
      );
    } else {
      cur.text = norm(cur.text + " " + line);
    }
  }

  push();

  return out.map((q) => {
    if (hasAnswerKey(q)) q.multi = computeMulti(q);
    return q;
  });
}

function downloadJson(filename: string, obj: any) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ✅ GitHub Pages / Vite base path safe fetch
async function fetchJson(path: string) {
  const base = import.meta.env.BASE_URL || "/"; // "/sachkunde-trainer/" on GH pages
  const clean = path.replace(/^\//, "");
  const url = `${base}${clean}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// ✅ Chapters
const CHAPTERS: { id: string; label: string; files: string[] }[] = [
  {
    id: "ALL",
    label: "All chapters",
    files: [
      "/Sachkunde_K1_1_Begriffe_des_Waffenrechts_1.json",
      "/Sachkunde_K1_2_RechteundPflichten_2.json",
      "/Sachkunde_K1_3_KennzeichnungvonSchusswaffenundMunition_3.json",
      "/Sachkunde_K1_4_AufbewahrungvonSchusswaffenundMunition_4.json",
      "/Sachkunde_K1_5_NotwehrundNotstand.json",
      "/Sachkunde_K2_Waffentechnik.json",
      "/Sachkunde_K3_HandhabungvonSchusswaffenundMunition.json",
      "/Sachkunde_K4_NotundSeenotsignalmittel.json",
    ],
  },
  { id: "K1", label: "Kapitel 1.1 – Begriffe", files: ["/Sachkunde_K1_1_Begriffe_des_Waffenrechts_1.json"] },
  { id: "K1.2", label: "Kapitel 1.2 – Rechte/Pflichten", files: ["/Sachkunde_K1_2_RechteundPflichten_2.json"] },
  { id: "K1.3", label: "Kapitel 1.3 – Kennzeichnung", files: ["/Sachkunde_K1_3_KennzeichnungvonSchusswaffenundMunition_3.json"] },
  { id: "K1.4", label: "Kapitel 1.4 – Aufbewahrung", files: ["/Sachkunde_K1_4_AufbewahrungvonSchusswaffenundMunition_4.json"] },
  { id: "K1.5", label: "Kapitel 1.5 – Notwehr/Notstand", files: ["/Sachkunde_K1_5_NotwehrundNotstand.json"] },
  { id: "K2", label: "Kapitel 2 – Waffentechnik", files: ["/Sachkunde_K2_Waffentechnik.json"] },
  { id: "K3", label: "Kapitel 3 – Handhabung von Schusswaffen und Munition", files: ["/Sachkunde_K3_HandhabungvonSchusswaffenundMunition.json"] },
  { id: "K4", label: "Kapitel 4 – Not- und Seenotsignalmittel", files: ["/Sachkunde_K4_NotundSeenotsignalmittel.json"] },
];

function lsQuestionsKey(chapterId: string) {
  return `questions::${chapterId}`;
}
function lsAnswersKey(chapterId: string) {
  return `answers::${chapterId}`;
}

function importedChapterId(prefix: string) {
  return `IMPORTED_${prefix}`;
}

function listImportedChapters(): string[] {
  return Object.keys(localStorage)
    .filter((k) => k.startsWith("questions::IMPORTED_"))
    .map((k) => k.replace("questions::", ""))
    .sort((a, b) => a.localeCompare(b));
}

export default function App() {
  const [tab, setTab] = useState<"quiz" | "import" | "key">("quiz");

  const [chapterId, setChapterId] = useState<string>("ALL");
  const [questions, setQuestions] = useState<Q[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const [importPrefix, setImportPrefix] = useState<string>("K2A");

  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState<Q[]>([]);
  const [chunkSize, setChunkSize] = useState(20);
  const [chunkIndex, setChunkIndex] = useState(0);

  const [keyQid, setKeyQid] = useState<string>("");

  const [importedIds, setImportedIds] = useState<string[]>([]);

  useEffect(() => {
    setImportedIds(listImportedChapters());
  }, []);

  async function loadChapter(chId: string) {
    const qKey = lsQuestionsKey(chId);
    const aKey = lsAnswersKey(chId);

    const savedQ = localStorage.getItem(qKey);
    const savedA = localStorage.getItem(aKey);

    if (savedA) {
      try {
        setAnswers(JSON.parse(savedA));
      } catch {
        setAnswers({});
      }
    } else {
      setAnswers({});
    }

    // Use cached questions first
    if (savedQ) {
      try {
        const parsedQ = JSON.parse(savedQ);
        if (Array.isArray(parsedQ)) {
          setQuestions(parsedQ);
          setIndex(0);
          setKeyQid("");
          return;
        }
      } catch {
        // ignore and fall through to fetching
      }
    }

    // Imported chapters live in localStorage only
    if (chId.startsWith("IMPORTED_")) {
      setQuestions([]);
      setIndex(0);
      setKeyQid("");
      return;
    }

    const c = CHAPTERS.find((x) => x.id === chId) || CHAPTERS[0];

    let all: Q[] = [];
    for (const file of c.files) {
      try {
        const json = await fetchJson(file);
        if (Array.isArray(json?.bank)) all = all.concat(json.bank);
      } catch (e) {
        console.warn("Missing:", file, e);
      }
    }

    setQuestions(all);
    setIndex(0);
    setKeyQid("");

    localStorage.setItem(qKey, JSON.stringify(all));
    localStorage.setItem(aKey, JSON.stringify(savedA ? JSON.parse(savedA) : {}));
  }

  useEffect(() => {
    loadChapter(chapterId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  useEffect(() => {
    localStorage.setItem(lsAnswersKey(chapterId), JSON.stringify(answers));
  }, [answers, chapterId]);

  useEffect(() => {
    if (questions.length) {
      localStorage.setItem(lsQuestionsKey(chapterId), JSON.stringify(questions));
    }
  }, [questions, chapterId]);

  const q = questions[index];

  function selectAnswer(label: string) {
    if (!q) return;
    const multi = q.multi ?? computeMulti(q);

    setAnswers((prev) => {
      const curSel = prev[q.rawId];
      if (multi) {
        const arr = Array.isArray(curSel) ? [...curSel] : [];
        const exists = arr.includes(label);
        const next = exists ? arr.filter((x) => x !== label) : arr.concat(label);
        return { ...prev, [q.rawId]: next };
      }
      return { ...prev, [q.rawId]: label };
    });
  }

  function next() {
    setIndex((i) => Math.min(i + 1, questions.length - 1));
  }
  function prev() {
    setIndex((i) => Math.max(i - 1, 0));
  }

  const score = useMemo(() => {
    const keyed = questions.filter(hasAnswerKey);
    if (!keyed.length) return { correct: 0, total: 0, pct: 0 };
    let correct = 0;
    for (const qq of keyed) {
      const res = isAnswerCorrect(qq, answers[qq.rawId]);
      if (res === true) correct++;
    }
    return {
      correct,
      total: keyed.length,
      pct: Math.round((correct / keyed.length) * 100),
    };
  }, [questions, answers]);

  const totalChunks = useMemo(
    () => (parsed.length ? Math.ceil(parsed.length / chunkSize) : 0),
    [parsed.length, chunkSize]
  );

  const currentChunk = useMemo(() => {
    const start = chunkIndex * chunkSize;
    return parsed.slice(start, start + chunkSize);
  }, [parsed, chunkIndex, chunkSize]);

  function handleParse() {
    const qs = parseQuestionsFromText(paste, importPrefix);
    setParsed(qs);
    setChunkIndex(0);
  }

  function saveParsedAsImportedChapter() {
    if (parsed.length === 0) return;

    const id = importedChapterId(importPrefix);
    localStorage.setItem(lsQuestionsKey(id), JSON.stringify(parsed));
    localStorage.setItem(lsAnswersKey(id), JSON.stringify({}));

    const newList = listImportedChapters();
    setImportedIds(newList);
    setChapterId(id);
    setTab("quiz");
    alert(`Saved ${parsed.length} questions as ${id} (permanent).`);
  }

  function deleteImportedChapter(id: string) {
    localStorage.removeItem(lsQuestionsKey(id));
    localStorage.removeItem(lsAnswersKey(id));
    const newList = listImportedChapters();
    setImportedIds(newList);
    if (chapterId === id) setChapterId("ALL");
  }

  function downloadChunk() {
    const idx = String(chunkIndex + 1).padStart(3, "0");
    downloadJson(`sachkunde_part_${idx}.json`, { bank: currentChunk });
  }

  const keyCandidates = useMemo(() => questions, [questions]);
  const keyQ = useMemo(() => {
    const id = keyQid || keyCandidates[0]?.rawId || "";
    return keyCandidates.find((x) => x.rawId === id) || null;
  }, [keyQid, keyCandidates]);

  useEffect(() => {
    if (!keyQid && keyCandidates.length) setKeyQid(keyCandidates[0].rawId);
  }, [keyCandidates, keyQid]);

  function toggleCorrect(optLabel: string) {
    if (!keyQ || !keyQ.options?.length) return;
    setQuestions((prev) =>
      prev.map((qq) => {
        if (qq.rawId !== keyQ.rawId) return qq;
        const options = qq.options.map((o) =>
          o.label === optLabel ? { ...o, correct: !o.correct } : o
        );
        const multi = options.filter((o) => o.correct).length > 1;
        return { ...qq, options, multi };
      })
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 860, margin: "0 auto", fontFamily: "Arial" }}>
      <h2>Sachkunde Trainer</h2>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <b>Mode:</b>
        <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} style={{ padding: 6, minWidth: 360 }}>
          <optgroup label="Built-in">
            {CHAPTERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </optgroup>

          {importedIds.length > 0 && (
            <optgroup label="Imported">
              {importedIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <span style={{ color: "#555" }}>
          Loaded: <b>{questions.length}</b> questions
        </span>

        <button
          onClick={() => {
            localStorage.removeItem(lsQuestionsKey(chapterId));
            localStorage.removeItem(lsAnswersKey(chapterId));
            loadChapter(chapterId);
          }}
        >
          Reset this mode
        </button>

        {chapterId.startsWith("IMPORTED_") && (
          <button
            onClick={() => {
              if (confirm(`Delete ${chapterId}? This cannot be undone.`)) deleteImportedChapter(chapterId);
            }}
            style={{ background: "#c62828", color: "white" }}
          >
            Delete imported
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <button onClick={() => setTab("quiz")}>Quiz</button>
        <button onClick={() => setTab("import")}>PDF Text → JSON</button>
        <button onClick={() => setTab("key")}>AnswerKey</button>
      </div>

      {tab === "quiz" && (
        <>
          {questions.length === 0 ? (
            <div>Loading questions…</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div>
                  <b>
                    Question {index + 1} / {questions.length}
                  </b>
                  <div style={{ color: "#666", fontSize: 12 }}>
                    Scored (keyed only): {score.correct}/{score.total} ({score.pct}%)
                  </div>
                </div>
              </div>

              <div style={{ margin: "12px 0 10px" }}>
                <b>{q?.rawId}</b> — {q?.text}
              </div>

              {(q?.multi ?? computeMulti(q || { rawId: "", text: "", options: [] })) && (
                <div style={{ color: "gray", marginBottom: 8 }}>Multiple answers possible</div>
              )}

              <div>
                {q?.options?.map((opt) => {
                  const multi = q.multi ?? computeMulti(q);
                  const selected = multi
                    ? (answers[q.rawId] as string[] | undefined)?.includes(opt.label)
                    : answers[q.rawId] === opt.label;

                  return (
                    <button
                      key={opt.label}
                      onClick={() => selectAnswer(opt.label)}
                      style={{
                        width: "100%",
                        padding: 12,
                        marginBottom: 10,
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        background: selected ? "#90caf9" : "#fff",
                        textAlign: "left",
                      }}
                    >
                      {opt.label}) {opt.text}
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: 12 }}>
                <button onClick={prev} disabled={index === 0}>
                  ← Prev
                </button>
                <button onClick={next} disabled={index === questions.length - 1} style={{ marginLeft: 10 }}>
                  Next →
                </button>
              </div>
            </>
          )}
        </>
      )}

      {tab === "import" && (
        <>
          <p style={{ color: "#555" }}>
            Paste PDF text → Parse → Preview → Download JSON.
            <br />
            For plain numbering <b>01,02,03…</b>, use an <b>alphanumeric prefix</b> like <b>K2A</b> so IDs become{" "}
            <b>K2A.01</b>, <b>K2A.02</b>, …
          </p>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              Import prefix:
              <input
                value={importPrefix}
                onChange={(e) =>
                  setImportPrefix(e.target.value.replace(/[^A-Za-z0-9_-]/g, "") || "K2A")
                }
                style={{ width: 110, padding: 6 }}
                placeholder="K2A"
              />
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              Chunk size:
              <input
                type="number"
                min={5}
                max={200}
                value={chunkSize}
                onChange={(e) =>
                  setChunkSize(Math.max(5, Math.min(200, Number(e.target.value) || 20)))
                }
                style={{ width: 90, padding: 6 }}
              />
            </label>

            <button onClick={handleParse}>Parse</button>

            <button disabled={parsed.length === 0} onClick={saveParsedAsImportedChapter}>
              Save parsed as chapter (permanent)
            </button>

            <div style={{ color: "#333" }}>
              Parsed: <b>{parsed.length}</b> • Chunks: <b>{totalChunks}</b>
            </div>
          </div>

          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Paste PDF text here…"
            style={{
              width: "100%",
              minHeight: 240,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #ccc",
              marginTop: 10,
            }}
          />

          {parsed.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
              <button onClick={() => setChunkIndex((i) => Math.max(0, i - 1))} disabled={chunkIndex === 0}>
                Prev chunk
              </button>
              <div>
                Chunk <b>{chunkIndex + 1}</b> / <b>{totalChunks}</b>
              </div>
              <button
                onClick={() => setChunkIndex((i) => Math.min(totalChunks - 1, i + 1))}
                disabled={chunkIndex >= totalChunks - 1}
              >
                Next chunk
              </button>

              <button onClick={downloadChunk} style={{ background: "#0b5", color: "#fff" }}>
                Download this chunk JSON
              </button>

              <button onClick={() => downloadJson("sachkunde_full.json", { bank: parsed })}>
                Download FULL JSON
              </button>
            </div>
          )}

          {parsed.length > 0 && (
            <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <b>Preview (current chunk)</b>
              <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
                {currentChunk.map((x) => (
                  <div key={x.rawId} style={{ padding: 10, border: "1px solid #f0f0f0", borderRadius: 10 }}>
                    <div style={{ fontWeight: 800 }}>
                      {x.rawId} — {x.text}
                    </div>

                    {x.options?.length ? (
                      <ul style={{ margin: "6px 0 0 18px" }}>
                        {x.options.map((o) => (
                          <li key={o.label}>
                            <b>{o.label})</b> {o.text}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ color: "#777", marginTop: 6 }}>(No options / free-text)</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "key" && (
        <>
          <p style={{ color: "#555" }}>AnswerKey per mode/chapter.</p>

          {keyCandidates.length === 0 ? (
            <div>No questions loaded yet.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={keyQ?.rawId || ""}
                  onChange={(e) => setKeyQid(e.target.value)}
                  style={{ minWidth: 560 }}
                >
                  {keyCandidates.map((qq) => (
                    <option key={qq.rawId} value={qq.rawId}>
                      {qq.rawId} — {qq.text.slice(0, 80)}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() =>
                    downloadJson(`sachkunde_with_keys_${chapterId}.json`, { bank: questions })
                  }
                >
                  Export bank (with keys)
                </button>
              </div>

              {keyQ && (
                <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 800 }}>
                    {keyQ.rawId} — {keyQ.text}
                  </div>

                  {keyQ.options?.length ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      {keyQ.options.map((o) => (
                        <label key={o.label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <input type="checkbox" checked={!!o.correct} onChange={() => toggleCorrect(o.label)} />
                          <div>
                            <b>{o.label})</b> {o.text}
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, color: "#777" }}>
                      Free-text question (no options). Nothing to set.
                    </div>
                  )}

                  {keyQ.options?.length ? (
                    <div style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
                      Multi detected: <b>{String(computeMulti(keyQ))}</b>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
