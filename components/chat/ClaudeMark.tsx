// Claude's mark, drawn: a burst of rounded rays of uneven length in Claude's clay, for the button that opens the chat with it. Decorative;
// the button carries the name.
const RAYS = [10, 8.2, 9.4, 7.6, 10, 8.4, 9.2, 7.8, 9.8, 8, 9.4, 7.6];

export function ClaudeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <g stroke="#d97757" strokeWidth="2.1" strokeLinecap="round">
        {RAYS.map((r, i) => {
          const a = (i / RAYS.length) * 2 * Math.PI - Math.PI / 2;
          const [x1, y1] = [12 + 2.2 * Math.cos(a), 12 + 2.2 * Math.sin(a)];
          const [x2, y2] = [12 + r * Math.cos(a), 12 + r * Math.sin(a)];
          return <line key={i} x1={x1.toFixed(2)} y1={y1.toFixed(2)} x2={x2.toFixed(2)} y2={y2.toFixed(2)} />;
        })}
      </g>
    </svg>
  );
}
