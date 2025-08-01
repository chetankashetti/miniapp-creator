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

  // App settings
  appName: "Minidev",
  version: "1.0.0",
};
