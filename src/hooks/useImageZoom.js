import { useState, useCallback, useRef, useEffect } from 'react';

const MIN_SCALE = 0.1;
const MAX_SCALE = 20;
const ZOOM_SENSITIVITY = 0.001;

export function useImageZoom() {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });

  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { translateRef.current = translate; }, [translate]);

  const reset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const clampTranslate = useCallback((tx, ty, s) => {
    if (s <= 1) return { x: 0, y: 0 };
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return { x: tx, y: ty };

    const cRect = container.getBoundingClientRect();
    const imgW = img.naturalWidth ? Math.min(img.naturalWidth, cRect.width) : img.offsetWidth;
    const imgH = img.naturalHeight ? Math.min(img.naturalHeight, cRect.height) : img.offsetHeight;

    const scaledW = imgW * s;
    const scaledH = imgH * s;
    const maxTx = Math.max(0, (scaledW - cRect.width) / 2);
    const maxTy = Math.max(0, (scaledH - cRect.height) / 2);

    return {
      x: Math.max(-maxTx, Math.min(maxTx, tx)),
      y: Math.max(-maxTy, Math.min(maxTy, ty)),
    };
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;

    const oldScale = scaleRef.current;
    const delta = -e.deltaY * ZOOM_SENSITIVITY;
    const factor = Math.exp(delta);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * factor));

    const ratio = newScale / oldScale;
    const oldT = translateRef.current;
    const newTx = mouseX - (mouseX - oldT.x) * ratio;
    const newTy = mouseY - (mouseY - oldT.y) * ratio;

    const clamped = clampTranslate(newTx, newTy, newScale);
    setScale(newScale);
    setTranslate(clamped);
  }, [clampTranslate]);

  const handlePointerDown = useCallback((e) => {
    if (scaleRef.current <= 1) return;
    if (e.button !== 0) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translateRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const newTx = translateStart.current.x + dx;
    const newTy = translateStart.current.y + dy;
    const clamped = clampTranslate(newTx, newTy, scaleRef.current);
    setTranslate(clamped);
  }, [clampTranslate]);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleDoubleClick = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e) => handleWheel(e);
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [handleWheel]);

  const imageStyle = {
    transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
    transformOrigin: 'center center',
    transition: dragging.current ? 'none' : undefined,
    cursor: scale > 1 ? (dragging.current ? 'grabbing' : 'grab') : 'default',
    userSelect: 'none',
    willChange: 'transform',
  };

  const containerProps = {
    ref: containerRef,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerUp,
    onDoubleClick: handleDoubleClick,
  };

  const zoomPercent = Math.round(scale * 100);

  return {
    containerProps,
    imageStyle,
    imgRef,
    scale,
    zoomPercent,
    reset,
  };
}

export default useImageZoom;
