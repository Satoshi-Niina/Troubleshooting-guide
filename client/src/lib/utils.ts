export function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export function orderSelectedFields(fields: Record<string, any> | undefined | null): Record<string, any> {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    console.warn("Invalid fields argument:", fields);
    return {};
  }

  return Object.entries(fields).reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {} as Record<string, any>);
}