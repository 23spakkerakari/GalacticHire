const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

export const getBaseUrl = (): string => {
  // Browser requests can use relative paths and current origin.
  if (typeof window !== "undefined") return "";

  if (process.env.APP_URL) return stripTrailingSlash(process.env.APP_URL);
  if (process.env.VERCEL_URL) return `https://${stripTrailingSlash(process.env.VERCEL_URL)}`;

  return "http://localhost:3000";
};

export const getBackendUrl = (): string => {
  const configuredUrl =
    typeof window === "undefined"
      ? process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL
      : process.env.NEXT_PUBLIC_BACKEND_URL;

  return stripTrailingSlash(configuredUrl || "http://localhost:8000");
};

export const toAbsoluteAppUrl = (path: string): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getBaseUrl()}${normalizedPath}`;
};
