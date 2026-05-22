import { useEffect, useState } from "react";

type Option = {
  label: string;
  text: string;
  correct?: boolean;
};

type Question = {
  rawId: string;
  text: string;
  options: Option[];
  multi?: boolean;
};

export default function App() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);

  // ✅ IMPORTANT: now an array
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    fetch("/questions.json")
      .then((res) => res.json())
      .then((data) => {
        setQuestions(data.bank || []);
      });
  }, []);

  const q = questions[current];

  // ✅ NEW: handle selection properly
  const handleSelect = (label: string) => {
    if (!q) return;

    if (q.multi) {
      // ✅ MULTI SELECT → toggle
      setSelected((prev) =>
        prev.includes(label)
          ? prev.filter((l) => l !== label)
          : [...prev, label]
      );
    } else {
      // ✅ SINGLE SELECT
      setSelected([label]);
    }
  };

  const nextQuestion = () => {
    setSelected([]);
    setCurrent((prev) => prev + 1);
  };

  if (!q) return <div>Loading questions...</div>;

  return (
    <div style={{ padding: 20 }}>
      <h3>
        {q.rawId}: {q.text}
      </h3>

      {q.options.map((opt) => (
        <div key={opt.label} style={{ margin: "5px 0" }}>
          <button
            onClick={() => handleSelect(opt.label)}
            style={{
              padding: 10,
              width: "100%",
              background: selected.includes(opt.label)
                ? "#4CAF50"
                : "#eee",
              color: selected.includes(opt.label) ? "white" : "black",
              border: "1px solid #ccc",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {opt.label}) {opt.text}
          </button>
        </div>
      ))}

      <div style={{ marginTop: 20 }}>
        <button onClick={nextQuestion}>Next</button>
      </div>
    </div>
  );
}
