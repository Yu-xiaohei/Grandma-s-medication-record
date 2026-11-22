export function Spinner({ size = 15 }: { size?: number }) {
  return <span className="spin" style={{ width: size, height: size }} aria-hidden="true" />;
}
