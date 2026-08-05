"use client";

import { useEffect, useState } from "react";

export type Insight = { icon: string; title: string; text: string };

export default function InsightCarousel({ insights }: { insights: Insight[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (insights.length < 2) return;
    const id = setInterval(() => setIndex((current) => (current + 1) % insights.length), 6000);
    return () => clearInterval(id);
  }, [insights.length]);

  if (!insights.length) return null;
  const current = insights[Math.min(index, insights.length - 1)];

  return (
    <article className="insight-card">
      <span className="eyebrow">Dato destacado</span>
      <div className="insight-icon">{current.icon}</div>
      <h2>{current.title}</h2>
      <p>{current.text}</p>
      {insights.length > 1 && (
        <div className="insight-dots">
          {insights.map((insight, i) => (
            <button
              key={insight.title}
              type="button"
              className={i === index ? "active" : ""}
              aria-label={`Ver dato ${i + 1} de ${insights.length}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </article>
  );
}
