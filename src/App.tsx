import { useEffect, useMemo, useRef, useState } from "react";

type Opt = { label: string; text: string; correct?: boolean };
type Q = { rawId: string; text: string; options: Opt[]; multi?: boolean };

type AnswersFile =
  | { version?: string; answers: Record<string, string[] | string> }
  | Record<string, string[] | string>;

// --------------------
// Versioning
// --------------------
const APP_VERSION = "2026-05-20";
const CACHE_VERSION = "v1";

// --------------------
// Parsing helpers (Import tab)
// --------------------
const RX_QID_DOTTED = /^\s*(\d+)\.(\d{2,})\s+(.*)$/;
const RX_QID_PLAIN = /^\s*(\d{1,3})\s+(.*)$/;
const RX_OPT = /^\s*([a-kA-K]|\d{1,2})[)\.]\s+(.*)$/;
const RX_INLINE_OPT = /^(.*)\s+([a-kA-K]|\d{1,2})[)\.]\s+(.*)$/;

// --------------------
// Vite / GitHub Pages base URL helpers
// --------------------
function baseUrl() {
  const b = import.meta.env.BASE_URL || "/";
  return b.endsWith("/") ? b : b + "/";
}
function toUrl(path: string) {
  const clean = String(path || "").replace(/^\//, "");
  return baseUrl() + clean;
}

function norm(s: string) {
  return (s || "")
    .replace(/\u00AD/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/(\w)-\s+(\w)/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function looksLikeQuestionStart(rest: string) {
  const r = (rest || "").trim();
  if (!r) return false;
  if (
    /^(Was|Wer|Wie|Welche|Woran|Wodurch|Wann|Darf|Ist|Sind|Kann|Nennen)\b/.test(
      r
    )
  )
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

function isAnswerCorrect(q: Q, selected: string[] | string | undefined) {
  if (!hasAnswerKey(q)) return null;

  const correctLabels = q.options
    .filter((o) => o.correct)
    .map((o) => String(o.label).trim().toLowerCase())
    .sort();

  const userLabels = (Array.isArray(selected)
    ? selected
    : [selected].filter(Boolean)
  )
    .map((x) => String(x).trim().toLowerCase())
    .sort();

  return (
    correctLabels.length === userLabels.length &&
    correctLabels.every((v, i) => v === userLabels[i])
  );
}

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
    cur.options = (cur.options || []).map((o) => ({
      ...o,
      text: norm(o.text),
    }));
    out.push(cur);
    cur = null;
    inOptions = false;
  };

  for (const lineRaw of lines) {
    const line = norm(lineRaw);

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
        cur.options.push({
          label: String(im[2]).toLowerCase(),
          text: norm(im[3]),
        });
        inOptions = true;
      }
      continue;
    }

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
        cur.options.push({
          label: String(im[2]).toLowerCase(),
          text: norm(im[3]),
        });
        inOptions = true;
      }
      continue;
    }

    if (!cur) continue;

    const mo = line.match(RX_OPT);
    if (mo) {
      inOptions = true;
      cur.options.push({
        label: String(mo[1]).toLowerCase(),
        text: norm(mo[2]),
      });
      continue;
    }

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

// --------------------
// Chapters (files must be in public/)
// --------------------
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

// --------------------
// Persistent cache (memory + localStorage + in-flight de-dupe)
// --------------------
const jsonCache = new Map<string, any>();
const jsonPromiseCache = new Map<string, Promise<any>>();

async function fetchJsonCached(path: string) {
  if (jsonCache.has(path)) return jsonCache.get(path);

  const storageKey = `cache::${CACHE_VERSION}::${path}`;
  try {
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      jsonCache.set(path, parsed);
      return parsed;
    }
  } catch {}

  if (jsonPromiseCache.has(path)) return jsonPromiseCache.get(path)!;

  const url = toUrl(path);

  const p = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`${url} -> ${res.status}`);
      return res.json();
    })
    .then((json) => {
      jsonCache.set(path, json);
      try {
        localStorage.setItem(storageKey, JSON.stringify(json));
      } catch {}
      return json;
    })
    .finally(() => {
      jsonPromiseCache.delete(path);
    });

  jsonPromiseCache.set(path, p);
  return p;
}

function clearOfflineCache() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith("cache::"))
    .forEach((k) => localStorage.removeItem(k));
  jsonCache.clear();
  jsonPromiseCache.clear();
}

// --------------------
// Answer key utils (lowercase normalization)
// --------------------
function normalizeAnswersFile(payload: AnswersFile): Record<string, string[]> {
  const anyPayload = payload as any;
  const raw: Record<string, string[] | string> = anyPayload.answers
    ? anyPayload.answers
    : (payload as any);

  const out: Record<string, string[]> = {};
  for (const [qid, labels] of Object.entries(raw || {})) {
    const arr = Array.isArray(labels) ? labels : labels != null ? [labels] : [];
    out[qid] = arr.map((x) => String(x).trim().toLowerCase());
  }
  return out;
}

function applyAnswerKey(bank: Q[], key: Record<string, string[]>) {
  return bank.map((q) => {
    const corr = key[q.rawId];
    if (!corr || !q.options?.length) return q;

    const corrSet = new Set(corr.map((x) => String(x).trim().toLowerCase()));

    const options = q.options.map((o) => ({
      ...o,
      correct: corrSet.has(String(o.label).trim().toLowerCase()),
    }));

    const multi = options.filter((o) => o.correct).length > 1;

    // NOTE: we only force multi to true; we do not force it to false.
    // This prevents a stored multi:false from blocking answers.json multi questions.
    return { ...q, options, multi: multi || q.multi === true };
  });
}

export default function App() {
  // AnswerKey: 20 visible at once
  const [keyPage, setKeyPage] = useState(0);
  const keyPageSize = 20;
  const [keySearch, setKeySearch] = useState("");

  const [tab, setTab] = useState<"quiz" | "import" | "key">("quiz");

  const [chapterId, setChapterId] = useState<string>("ALL");
  const [questions, setQuestions] = useState<Q[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  // answers.json
  const [answerKey, setAnswerKey] = useState<Record<string, string[]>>({});
  const [answersLoaded, setAnswersLoaded] = useState(false);

  // Import
  const [importPrefix, setImportPrefix] = useState<string>("K2A");
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState<Q[]>([]);
  const [chunkSize, setChunkSize] = useState(20);
  const [chunkIndex, setChunkIndex] = useState(0);

  // AnswerKey selected Q
  const [keyQid, setKeyQid] = useState<string>("");

  const [importedIds, setImportedIds] = useState<string[]>([]);
  const mountedRef = useRef(true);

  const BASE = baseUrl();

  useEffect(() => {
    setKeyPage(0);
    setKeySearch("");
  }, [chapterId, tab]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setImportedIds(listImportedChapters());
  }, []);

  // Load answers.json (optional)
  useEffect(() => {
    (async () => {
      try {
        const payload = (await fetchJsonCached("/answers.json")) as AnswersFile;
        setAnswerKey(normalizeAnswersFile(payload));
      } catch (e) {
        console.warn("answers.json not found (optional):", e);
        setAnswerKey({});
      } finally {
        setAnswersLoaded(true);
      }
    })();
  }, []);

  async function loadChapter(chId: string) {
    setIndex(0);

    const qKey = lsQuestionsKey(chId);
    const aKey = lsAnswersKey(chId);

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

    const savedQ = localStorage.getItem(qKey);
    if (savedQ) {
      try {
        const parsedQ = JSON.parse(savedQ);
        if (Array.isArray(parsedQ)) {
          setQuestions(applyAnswerKey(parsedQ, answerKey));
          return;
        }
      } catch {}
    }

    if (chId.startsWith("IMPORTED_")) {
      const raw = localStorage.getItem(qKey);
      if (raw) {
        try {
          const parsedQ = JSON.parse(raw);
          if (Array.isArray(parsedQ)) {
            setQuestions(applyAnswerKey(parsedQ, answerKey));
            return;
          }
        } catch {}
      }
      setQuestions([]);
      return;
    }

    const c = CHAPTERS.find((x) => x.id === chId) || CHAPTERS[0];

    let all: Q[] = [];
    for (const file of c.files) {
      try {
        const json = await fetchJsonCached(file);
        if (Array.isArray(json?.bank)) all = all.concat(json.bank);
      } catch (e) {
        console.warn("Missing:", file, e);
      }
    }

    setQuestions(applyAnswerKey(all, answerKey));

    localStorage.setItem(qKey, JSON.stringify(all));
    localStorage.setItem(aKey, JSON.stringify(savedA ? JSON.parse(savedA) : {}));
  }

  useEffect(() => {
    if (!answersLoaded) return;
    loadChapter(chapterId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, answersLoaded]);

  useEffect(() => {
    localStorage.setItem(lsAnswersKey(chapterId), JSON.stringify(answers));
  }, [answers, chapterId]);

  const q = questions[index];

  // ✅ Multi-select FIX:
  // q.multi === true OR answers.json says multi OR computed multi OR array already exists
  function selectAnswer(label: string) {
    if (!q) return;

    const normalizedLabel = String(label).trim().toLowerCase();
    const existing = answers[q.rawId];

    const keyMulti = (answerKey[q.rawId]?.length ?? 0) > 1;

    const multi =
      (q.multi === true) ||
      keyMulti ||
      computeMulti(q) ||
      Array.isArray(existing);

    setAnswers((prev) => {
      const curSel = prev[q.rawId];

      if (multi) {
        const arr = Array.isArray(curSel)
          ? curSel.map((x) => String(x).trim().toLowerCase())
          : [];
        const exists = arr.includes(normalizedLabel);
        const next = exists
          ? arr.filter((x) => x !== normalizedLabel)
          : arr.concat(normalizedLabel);
        return { ...prev, [q.rawId]: next };
      }

      return { ...prev, [q.rawId]: normalizedLabel };
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

  // --------------------
  // AnswerKey: 20 questions visible at once (list + editor)
  // --------------------
  const filteredKeyCandidates = useMemo(() => {
    const s = keySearch.trim().toLowerCase();
    if (!s) return questions;
    return questions.filter((qq) => {
      const id = (qq.rawId || "").toLowerCase();
      const text = (qq.text || "").toLowerCase();
      return id.includes(s) || text.includes(s);
    });
  }, [questions, keySearch]);

  const keyTotalPages = useMemo(() => {
    return filteredKeyCandidates.length
      ? Math.ceil(filteredKeyCandidates.length / keyPageSize)
      : 1;
  }, [filteredKeyCandidates.length, keyPageSize]);

  const keyPageClamped = Math.max(0, Math.min(keyPage, keyTotalPages - 1));

  const keyPageItems = useMemo(() => {
    const start = keyPageClamped * keyPageSize;
    return filteredKeyCandidates.slice(start, start + keyPageSize);
  }, [filteredKeyCandidates, keyPageClamped, keyPageSize]);

  const keyQ = useMemo(() => {
    const id = keyQid || filteredKeyCandidates[0]?.rawId || "";
    return filteredKeyCandidates.find((x) => x.rawId === id) || null;
  }, [keyQid, filteredKeyCandidates]);

  useEffect(() => {
    if (!keyQid && filteredKeyCandidates.length)
      setKeyQid(filteredKeyCandidates[0].rawId);
  }, [filteredKeyCandidates, keyQid]);

  function toggleCorrect(optLabel: string) {
    if (!keyQ || !keyQ.options?.length) return;

    const normalized = String(optLabel).trim().toLowerCase();

    setQuestions((prev) => {
      const nextQ = prev.map((qq) => {
        if (qq.rawId !== keyQ.rawId) return qq;

        const options = qq.options.map((o) => {
          const ol = String(o.label).trim().toLowerCase();
          return ol === normalized ? { ...o, correct: !o.correct } : o;
        });

        const multi = options.filter((o) => o.correct).length > 1;
        return { ...qq, options, multi: multi || qq.multi === true };
      });

      try {
        localStorage.setItem(lsQuestionsKey(chapterId), JSON.stringify(nextQ));
      } catch {}
      return nextQ;
    });
  }

  return (
    <div style={{ padding: 16, maxWidth: 980, margin: "0 auto", fontFamily: "Arial" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
        <img src={`${BASE}logo.png`} alt="Club logo" style={{ height: 72, width: "auto", display: "block" }} />
        <div>
          <h2 style={{ margin: 0 }}>Sachkunde Trainer</h2>
          <div style={{ fontSize: 12, color: "#666" }}>
            App: {APP_VERSION} • Cache: {CACHE_VERSION} • answers.json: {answersLoaded ? "ok" : "loading"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
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
          Loaded: <b>{questions.length}</b>
        </span>

        <button
          onClick={() => {
            clearOfflineCache();
            alert("Offline cache cleared. Reloading…");
            window.location.reload();
          }}
          title="Clears offline JSON cache and reloads"
        >
          Clear offline cache
        </button>

        {chapterId.startsWith("IMPORTED_") && (
          <button
            onClick={() => {
              if (confirm(`Delete ${chapterId}? This cannot be undone.`))
                deleteImportedChapter(chapterId);
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

              {q && (
                ((q.multi === true) || ((answerKey[q.rawId]?.length ?? 0) > 1) || computeMulti(q))
              ) && (
                <div style={{ color: "gray", marginBottom: 8 }}>
                  Multiple answers possible
                </div>
              )}

              <div>
                {q?.options?.map((opt) => {
                  const keyMulti = (answerKey[q.rawId]?.length ?? 0) > 1;
                  const multi =
                    (q.multi === true) ||
                    keyMulti ||
                    computeMulti(q) ||
                    Array.isArray(answers[q.rawId]);

                  const sel = answers[q.rawId];

                  const selected = multi
                    ? (Array.isArray(sel) ? sel : [])
                        .map((x) => String(x).trim().toLowerCase())
                        .includes(String(opt.label).trim().toLowerCase())
                    : String(sel || "").trim().toLowerCase() ===
                      String(opt.label).trim().toLowerCase();

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

            {parsed.length > 0 && (
              <button onClick={downloadChunk} style={{ background: "#0b5", color: "#fff" }}>
                Download this chunk JSON
              </button>
            )}
          </div>

          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Paste PDF text here…"
            style={{ width: "100%", minHeight: 240, padding: 12, borderRadius: 10, border: "1px solid #ccc", marginTop: 10 }}
          />
        </>
      )}

      {tab === "key" && (
        <>
          <p style={{ color: "#555" }}>
            AnswerKey: 20 questions visible at once. Click one to edit.
          </p>

          {filteredKeyCandidates.length === 0 ? (
            <div>No questions loaded yet.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                <input
                  value={keySearch}
                  onChange={(e) => {
                    setKeySearch(e.target.value);
                    setKeyPage(0);
                  }}
                  placeholder="Search by ID or text..."
                  style={{ padding: 6, minWidth: 260 }}
                />

                <button onClick={() => setKeyPage((p) => Math.max(0, p - 1))} disabled={keyPageClamped === 0}>
                  ◀ Prev 20
                </button>

                <div style={{ fontSize: 12, color: "#555" }}>
                  Page <b>{keyPageClamped + 1}</b> / <b>{keyTotalPages}</b> — showing{" "}
                  <b>{keyPageItems.length}</b> of <b>{filteredKeyCandidates.length}</b>
                </div>

                <button onClick={() => setKeyPage((p) => Math.min(keyTotalPages - 1, p + 1))} disabled={keyPageClamped >= keyTotalPages - 1}>
                  Next 20 ▶
                </button>

                <button onClick={() => downloadJson(`sachkunde_with_keys_${chapterId}.json`, { bank: questions })}>
                  Export bank (with keys)
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, maxHeight: 460, overflow: "auto" }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    Questions (showing 20)
                  </div>

                  {keyPageItems.map((qq) => {
                    const active = qq.rawId === (keyQ?.rawId || "");
                    return (
                      <button
                        key={qq.rawId}
                        onClick={() => setKeyQid(qq.rawId)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: 10,
                          marginBottom: 8,
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          background: active ? "#e3f2fd" : "#fff",
                        }}
                      >
                        <div style={{ fontWeight: 800 }}>{qq.rawId}</div>
                        <div style={{ fontSize: 12, color: "#666" }}>
                          {qq.text.slice(0, 100)}
                          {qq.text.length > 100 ? "…" : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                  {!keyQ ? (
                    <div>Select a question on the left.</div>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
