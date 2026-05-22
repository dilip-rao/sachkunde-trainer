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
  const [selected, setSelected] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/questions.json")
      .then((res) => res.json())
      .then((data) => {
        setQuestions(data.bank || []);
      });
  }, []);

  const q = questions[current];

  const isMulti =
    q?.multi || q?.options.filter((o) => o.correct).length > 1;

  // ✅ FIXED: multi + single logic
  const handleSelect = (label: string) => {
    if (!q || checked) return;

    if (isMulti) {
      setSelected((prev) =>
        prev.includes(label)
          ? prev.filter((l) => l !== label)
          : [...prev, label]
      );
    } else {
      setSelected([label]);
    }
  };

  // ✅ check answers
  const checkAnswer = () => {
    setChecked(true);
  };

  const nextQuestion = () => {
    setSelected([]);
    setChecked(false);
    setCurrent((prev) => prev + 1);
  };

  if (!q) return <div>Loading questions...</div>;

  return (
    <div style={{ maxWidth: 700, margin: "auto", padding: 20 }}>
      <h3>
        {q.rawId}: {q.text}
      </h3>

      {/* ✅ OPTIONS */}
      {q.options.map((opt) => {
        const isSelected = selected.includes(opt.label);
        const isCorrect = opt.correct;

        let bg = "#eee";

        if (checked) {
          if (isCorrect) bg = "#4CAF50"; // correct → green
          else if (isSelected && !isCorrect) bg = "#f44336"; // wrong → red
        } else if (isSelected) {
          bg = "#2196F3"; // selected → blue
        }

        return (
          <div key={opt.label} style={{ margin: "6px 0" }}>
            <button
              onClick={() => handleSelect(opt.label)}
              style={{
                width: "100%",
                padding: 12,
                textAlign: "left",
                background: bg,
                color: checked && isCorrect ? "white" : "black",
                border: "1px solid #ccc",
                cursor: "pointer",
              }}
            >
              <strong>{opt.label})</strong> {opt.text}
            </button>
          </div>
        );
      })}

      {/* ✅ ACTION BUTTONS */}
      <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
        {!checked ? (
          <button onClick={checkAnswer}>Check Answer</button>
        ) : (
          <button onClick={nextQuestion}>Next</button>
        )}
      </div>
    </div>
  );
}
``
