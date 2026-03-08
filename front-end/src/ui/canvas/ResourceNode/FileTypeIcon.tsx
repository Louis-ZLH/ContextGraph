import {
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
} from "lucide-react";
import type { FileCategory } from "../../../feature/canvas/canvasSlice";

export function FileTypeIcon({ fileType, size = 28 }: { fileType?: FileCategory; size?: number }) {
  switch (fileType) {
    case "image":
      return <FileImage size={size} className="source-meta-icon" />;
    case "pdf":
      return <FileText size={size} className="source-meta-icon" />;
    case "excel":
      return <FileSpreadsheet size={size} className="source-meta-icon" />;
    case "document":
      return <FileText size={size} className="source-meta-icon" />;
    default:
      return <File size={size} className="source-meta-icon" />;
  }
}
