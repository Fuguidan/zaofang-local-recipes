"use client";

import { useEffect, useRef, useState } from "react";
import { calculateImageTransform, clampImageOffset, MAX_IMAGE_ZOOM, MIN_IMAGE_ZOOM, normalizeRotation } from "../lib/image-editor";

const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 900;

export function ImageEditorDialog({
  source,
  sourceName,
  onCancel,
  onApply,
}: {
  source: Blob;
  sourceName: string;
  onCancel: () => void;
  onApply: (file: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setReady(true);
    };
    image.onerror = () => setReady(false);
    image.src = url;
    return () => {
      URL.revokeObjectURL(url);
      imageRef.current = null;
    };
  }, [source]);

  useEffect(() => {
    draw();
  }, [ready, zoom, rotation, offset.x, offset.y]);

  function constrainedOffset(next: { x: number; y: number }, nextZoom = zoom, nextRotation = rotation) {
    const image = imageRef.current;
    if (!image) return next;
    const result = clampImageOffset({
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      canvasWidth: OUTPUT_WIDTH,
      canvasHeight: OUTPUT_HEIGHT,
      rotation: nextRotation,
      zoom: nextZoom,
      offsetX: next.x,
      offsetY: next.y,
    });
    return result;
  }

  function draw() {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const transform = calculateImageTransform({
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      rotation,
      zoom,
      offsetX: offset.x,
      offsetY: offset.y,
    });
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ede6dc";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(transform.centerX, transform.centerY);
    context.rotate(transform.rotationRadians);
    context.scale(transform.scale, transform.scale);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    context.restore();
  }

  function rotate(delta: number) {
    const nextRotation = normalizeRotation(rotation + delta);
    setRotation(nextRotation);
    setOffset((current) => constrainedOffset(current, zoom, nextRotation));
  }

  function reset() {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / rect.width;
    const deltaX = (event.clientX - drag.x) * ratio;
    const deltaY = (event.clientY - drag.y) * ratio;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setOffset((current) => constrainedOffset({ x: current.x + deltaX, y: current.y + deltaY }));
  }

  function pointerEnd(event: React.PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  async function apply() {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("图片导出失败")), "image/jpeg", 0.9);
      });
      const filename = (sourceName || "recipe-image").replace(/\.[^.]+$/, "") + "-edited.jpg";
      onApply(new File([blob], filename, { type: "image/jpeg", lastModified: Date.now() }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="image-editor-backdrop" role="presentation">
      <section className="image-editor-dialog" role="dialog" aria-modal="true" aria-label="编辑菜品图片">
        <header>
          <div><span className="eyebrow">仅在本机处理</span><h2>裁剪与调整图片</h2></div>
          <button className="icon-button close-button" onClick={onCancel} aria-label="关闭图片编辑器">×</button>
        </header>
        <div className="image-editor-stage">
          {!ready && <p>正在载入图片…</p>}
          <canvas
            ref={canvasRef}
            width={OUTPUT_WIDTH}
            height={OUTPUT_HEIGHT}
            className={ready ? "" : "is-loading"}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerEnd}
            onPointerCancel={pointerEnd}
          />
          <small>拖动图片调整裁剪位置，浅色边框内为最终保存范围</small>
        </div>
        <div className="image-editor-controls">
          <label><span>缩放 {Math.round(zoom * 100)}%</span><input type="range" min={MIN_IMAGE_ZOOM} max={MAX_IMAGE_ZOOM} step="0.01" value={zoom} onChange={(event) => {
            const next = Number(event.target.value);
            setZoom(next);
            setOffset((current) => constrainedOffset(current, next, rotation));
          }} /></label>
          <div className="button-row">
            <button className="button-secondary" onClick={() => rotate(-90)}>向左旋转</button>
            <button className="button-secondary" onClick={() => rotate(90)}>向右旋转</button>
            <button className="button-ghost" onClick={reset}>重置</button>
          </div>
        </div>
        <footer>
          <button className="button-ghost" disabled={saving} onClick={onCancel}>取消</button>
          <button className="button-primary" disabled={!ready || saving} onClick={() => void apply()}>{saving ? "正在处理…" : "应用裁剪"}</button>
        </footer>
      </section>
    </div>
  );
}
