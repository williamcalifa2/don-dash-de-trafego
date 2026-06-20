const PATHS = {
  grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  book: "M4 4.5C4 3.7 4.7 3 5.5 3H12v16H5.5C4.7 19 4 18.3 4 17.5v-13ZM20 4.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5c.8 0 1.5-.7 1.5-1.5v-13Z",
  wrench: "M14.5 3.5 11 7l1 1 3.5-3.5a4 4 0 0 1-.9 4.4L8 15.5 4 19.5l-1.5-1.5 4-4L13 7.4a4 4 0 0 1 4.4-.9L20.5 3 19 1.5l-3.5 3.5-1-1Z",
  flag: "M5 21V4h13l-3 4 3 4H5",
  chevron: "M9 6l6 6-6 6",
  trend: "M3 17l6-6 4 4 8-8M21 7v6h-6",
  export: "M12 3v12m0 0-4-4m4 4 4-4M5 17v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3",
  dot: "M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
};

export default function Icon({ name, size = 18, strokeWidth = 1.6, className }) {
  const d = PATHS[name];
  if (!d) return null;
  const filled = name === "grid" || name === "book" || name === "dot";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}
