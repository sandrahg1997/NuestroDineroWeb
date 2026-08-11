"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";

export type Insight = { icon: string; title: ReactNode; text: ReactNode; href?: string };

export default function InsightCarousel({ insights }: { insights: Insight[] }) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    const slide = track?.children[index] as HTMLElement | undefined;
    if (!track || !slide) return;
    track.scrollTo({ left: slide.offsetLeft, behavior: "smooth" });
  }, [index]);

  function handleScroll() {
    const track = trackRef.current;
    if (!track) return;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      const next = Math.min(insights.length - 1, Math.round(track.scrollLeft / track.clientWidth));
      setIndex((current) => (current === next ? current : next));
    }, 120);
  }

  if (!insights.length) return null;

  return (
    <article className="insight-card">
      <span className="eyebrow">Dato destacado</span>
      <div className="insight-scroll" ref={trackRef} onScroll={handleScroll}>
        {insights.map((insight, i) => {
          const content = (
            <>
              <div className="insight-icon">{insight.icon}</div>
              <h2>{insight.title}</h2>
              <p>{insight.text}</p>
            </>
          );
          return insight.href ? (
            <Link href={insight.href} className="insight-slide" key={i}>{content}</Link>
          ) : (
            <div className="insight-slide" key={i}>{content}</div>
          );
        })}
      </div>
      {insights.length > 1 && (
        <div className="insight-dots">
          {insights.map((insight, i) => (
            <button
              key={i}
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
