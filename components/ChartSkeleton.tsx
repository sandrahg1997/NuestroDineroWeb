// Placeholder con la forma del gráfico mientras carga Recharts, para que la página no salte.
export default function ChartSkeleton({ variant = "area" }: { variant?: "area" | "donut" }) {
  return (
    <article className="card chart-card chart-skeleton" aria-busy="true" aria-label="Cargando gráfico">
      <span className="skeleton skeleton-line" style={{ width: 90 }} />
      <span className="skeleton skeleton-line" style={{ width: 180, height: 18, marginTop: 8 }} />
      {variant === "donut" ? (
        <div className="category-chart-layout" style={{ marginTop: 18 }}>
          <span className="skeleton skeleton-donut" />
          <div className="category-legend">
            {[70, 55, 80, 45].map((w) => (
              <span key={w} className="skeleton skeleton-line" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>
      ) : (
        <span className="skeleton skeleton-block" />
      )}
    </article>
  );
}
