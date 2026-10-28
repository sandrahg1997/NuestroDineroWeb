// Las dos monedas del icono, como marca de agua de la tarjeta de saldo.
export default function HeroMark() {
  return (
    <svg className="hero-mark" viewBox="180 190 680 680" aria-hidden="true">
      <mask id="hero-mark-gap">
        <rect x="0" y="0" width="1024" height="1024" fill="#fff" />
        <circle cx="440" cy="590" r="262" fill="#000" />
      </mask>
      <g fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round">
        <circle cx="604" cy="438" r="214" mask="url(#hero-mark-gap)" />
        <circle cx="440" cy="590" r="236" />
        <path d="M566 506 A124 124 0 1 0 566 674 M324 560 H486 M324 620 H474" />
      </g>
    </svg>
  );
}
