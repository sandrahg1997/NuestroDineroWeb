export default function LogoMark() {
  return (
    <svg viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9c4dcc" />
          <stop offset="100%" stopColor="#ec4f9f" />
        </linearGradient>
        <linearGradient id="bagGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fced98" />
          <stop offset="100%" stopColor="#f6ba40" />
        </linearGradient>
      </defs>
      <rect width="192" height="192" rx="32" fill="url(#bgGrad)" />
      <path
        d="M58 76c0-14 6-24 18-28 3-9 14-16 25-16 11 0 22 7 25 16 12 4 18 14 18 28 0 16-3 28-4 32-2 13-12 27-31 28h-10c-19-1-29-15-31-28-1-4-4-16-4-32z"
        fill="url(#bagGrad)"
        stroke="#b47a12"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M72 76c0-8 6-14 14-14s14 6 14 14" stroke="#b47a12" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M72 92c0-6 4-10 10-10h16c6 0 10 4 10 10s-4 10-10 10h-16c-6 0-10-4-10-10z" fill="#ea9f2f" />
      <path d="M76 106c0-4 3-7 7-7h26c4 0 7 3 7 7v4c0 4-3 7-7 7h-26c-4 0-7-3-7-7v-4z" fill="#fff3c0" opacity="0.7" />
      <path d="M78 120c0-4 2-7 5-9 3-2 7-3 12-3h24c5 0 9 1 12 3 3 2 5 5 5 9 0 8-7 14-15 14h-18c-8 0-15-6-15-14z" fill="#d39724" />
    </svg>
  );
}
