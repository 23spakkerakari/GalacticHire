export const getBackendUrl = (): string => {
  // Use environment variable if available (production), otherwise default to localhost (development)
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
};
