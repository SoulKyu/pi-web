"use client";

import { useState, useCallback, useRef } from "react";

const isImage = (item: DataTransferItem) => item.type.startsWith("image/");

export function useDragDrop(
  onDrop: (files: File[], info: { directoriesSkipped: number }) => void,
  accept: (item: DataTransferItem) => boolean = isImage,
) {
  const [isDragOver, setIsDragOver] = useState(false);
  const counterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.items).some(accept)) return;
    e.preventDefault();
    counterRef.current += 1;
    setIsDragOver(true);
  }, [accept]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.items).some(accept)) return;
    e.preventDefault();
  }, [accept]);

  const handleDragLeave = useCallback(() => {
    counterRef.current -= 1;
    if (counterRef.current <= 0) {
      counterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    counterRef.current = 0;
    setIsDragOver(false);
    const all = Array.from(e.dataTransfer.files);
    const items = Array.from(e.dataTransfer.items);
    const files = all.filter((_, i) => !items[i]?.webkitGetAsEntry?.()?.isDirectory);
    onDrop(files, { directoriesSkipped: all.length - files.length });
  }, [onDrop]);

  return { isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop };
}