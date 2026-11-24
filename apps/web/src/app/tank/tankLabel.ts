export function tankLabel(name?: string) {
  if (!name) return 'Unknown tank';
  const number = /^tank\s*0*(\d+)$/i.exec(name.trim())?.[1];
  return number ? number.padStart(2, '0') : name;
}
