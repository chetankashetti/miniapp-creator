// Configuration file for Minidev
export const config = {
  // Authentication settings
  authKey: process.env.NEXT_PUBLIC_AUTH_KEY || "minidev_authenticated",

  // Session timeout (in milliseconds) - 30 minutes
  sessionTimeout: parseInt(
    process.env.NEXT_PUBLIC_SESSION_TIMEOUT || "1800000"
  ), // 30 minutes default

  // Warning time before session expires (in milliseconds) - 5 minutes
  warningTime: parseInt(process.env.NEXT_PUBLIC_WARNING_TIME || "300000"), // 5 minutes default

  // Database configuration
  database: {
    url: process.env.DATABASE_URL || "postgresql://localhost:5432/minidev",
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || "10"),
  },

  // Privy configuration
  privy: {
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || "",
    appSecret: process.env.PRIVY_APP_SECRET || "",
  },

  // Preview host configuration
  preview: {
    apiBase: process.env.PREVIEW_API_BASE || "minidev.fun",
    authToken: process.env.PREVIEW_AUTH_TOKEN || "",
  },

  // App settings
  appName: "Minidev",
  version: "1.0.0",
};
