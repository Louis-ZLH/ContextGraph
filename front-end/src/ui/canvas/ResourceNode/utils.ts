export function getFileExtLabel(fileName?: string): string {
  if (!fileName) return "";
  return fileName.split(".").pop()?.toUpperCase() ?? "";
}
