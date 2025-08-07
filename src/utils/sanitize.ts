export const sanitize = (str: string) => str.replace(/[<>:"/\\|?*]+/g, "");
