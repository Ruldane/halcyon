/**
 * Deco ornament, used as structure: the fan that crowns the signage and the
 * masthead, the stepped head of a window, the chevron of a cornice.
 */

export function Fan({ className }: { className?: string }) {
  const rays = 9;
  return (
    <svg className={className} viewBox="0 0 64 34" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.1">
        <path d="M2 33 A30 30 0 0 1 62 33" />
        <path d="M12 33 A20 20 0 0 1 52 33" />
        <path d="M22 33 A10 10 0 0 1 42 33" />
        {Array.from({ length: rays }, (_, i) => {
          const a = Math.PI - (i * Math.PI) / (rays - 1);
          return <line key={i} x1={32 + Math.cos(a) * 10} y1={33 - Math.sin(a) * 10} x2={32 + Math.cos(a) * 30} y2={33 - Math.sin(a) * 30} />;
        })}
      </g>
      <path d="M26 33 A6 6 0 0 1 38 33 Z" fill="currentColor" />
    </svg>
  );
}

export function Chevron({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 8 L10 1 L20 8 L30 1 L40 8" fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Steps({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 12" aria-hidden="true" focusable="false">
      <path d="M0 12 V8 H10 V5 H20 V2 H40 V5 H50 V8 H60 V12" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
