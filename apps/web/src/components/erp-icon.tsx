import type { SVGProps } from "react";
import type { ErpIconName } from "@/lib/erp-navigation";

const paths: Record<ErpIconName, string[]> = {
  dashboard: ["M4 13h6V4H4v9Z", "M14 20h6v-9h-6v9Z", "M14 4h6v3h-6V4Z", "M4 17h6v3H4v-3Z"],
  catalog: ["M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z", "m4 7.5 8 4.5 8-4.5", "M12 12v9"],
  inventory: ["M3 9h18", "M5 9V5h14v4", "M5 9v11h14V9", "M9 13h6"],
  procurement: ["M6 7h15l-2 8H8L6 3H3", "M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z", "M18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"],
  transfer: ["M7 7h11l-3-3", "m18 7-3 3", "M17 17H6l3 3", "m6 17 3-3"],
  sales: ["M5 4h14v16H5z", "M8 8h8", "M8 12h5", "M8 16h3"],
  crm: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  finance: ["M3 6h18v12H3z", "M7 10h4", "M16 14h1", "M3 9h18"],
  reports: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
  executive: ["M4 18V8l4 3 4-6 4 6 4-3v10H4Z", "M4 18h16"],
  organization: ["M12 3v5", "M5 21v-5h14v5", "M5 16v-4h14v4", "M12 8v4", "M3 21h4", "M10 21h4", "M17 21h4"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z", "m9 12 2 2 4-4"],
  integration: ["M8 12h8", "M12 8v8", "M5 5h4v4H5z", "M15 15h4v4h-4z", "M15 5h4v4h-4z", "M5 15h4v4H5z"],
  system: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2 3.46-.08-.03a1.7 1.7 0 0 0-1.79.2 1.7 1.7 0 0 0-.93 1.46V22h-4v-.08a1.7 1.7 0 0 0-.92-1.46 1.7 1.7 0 0 0-1.8-.2l-.08.04-2-3.46.06-.06A1.7 1.7 0 0 0 6.6 15a1.7 1.7 0 0 0-1.26-1.26l-.08-.02v-4l.08-.02A1.7 1.7 0 0 0 6.6 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2-3.46.08.03a1.7 1.7 0 0 0 1.8-.2A1.7 1.7 0 0 0 11 1.08V1h4v.08a1.7 1.7 0 0 0 .92 1.46 1.7 1.7 0 0 0 1.8.2l.08-.04 2 3.46-.06.06A1.7 1.7 0 0 0 19.4 8a1.7 1.7 0 0 0 1.26 1.26l.08.02v4l-.08.02A1.7 1.7 0 0 0 19.4 15Z"],
  search: ["M21 21l-4.35-4.35", "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z"],
  task: ["M9 11l3 3L22 4", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M10 21h4"],
  plus: ["M12 5v14", "M5 12h14"],
  chevron: ["m9 18 6-6-6-6"],
};

interface ErpIconProps extends SVGProps<SVGSVGElement> {
  name: ErpIconName;
  size?: number;
}

export function ErpIcon({ name, size = 20, ...props }: ErpIconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {paths[name].map((path, index) => (
        <path
          d={path}
          key={`${name}-${index}`}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      ))}
    </svg>
  );
}
