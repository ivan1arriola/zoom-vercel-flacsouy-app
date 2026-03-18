export const logger = {
  info(message: string, meta?: unknown): void {
    if (meta !== undefined) {
      console.log(new Date().toISOString(), message, meta);
      return;
    }
    console.log(new Date().toISOString(), message);
  },
  warn(message: string, meta?: unknown): void {
    if (meta !== undefined) {
      console.warn(new Date().toISOString(), message, meta);
      return;
    }
    console.warn(new Date().toISOString(), message);
  },
  error(message: string, meta?: unknown): void {
    if (meta !== undefined) {
      console.error(new Date().toISOString(), message, meta);
      return;
    }
    console.error(new Date().toISOString(), message);
  }
};
