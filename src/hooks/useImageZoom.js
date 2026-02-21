import { useCallback, useRef, useState, useEffect } from 'react';

const MIN_SCALE = 0.1;
const MAX_SCALE = 20;
const ZOOM_STEP = 1.05;

export function useImageZoom() {
  const [isZoomed, setIsZoomed] = useState(false);
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const indicatorRef = useRef(null);
  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });
  const baseSizeRef = useRef(null);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });
  const activeRef = useRef(false);

  const captureBaseSize = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    baseSizeRef.current = { w: img.offsetWidth, h: img.offsetHeight };
  }, []);

  const applyTransform = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const s = scaleRef.current;
    const t = translateRef.current;
    const base = baseSizeRef.current;

    if (base && s !== 1) {
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
      img.style.width = (base.w * s) + 'px';
      img.style.height = (base.h * s) + 'px';
    } else {
      img.style.maxWidth = '';
      img.style.maxHeight = '';
      img.style.width = '';
      img.style.height = '';
    }

    img.style.transform = `translate(${t.x}px, ${t.y}px)`;
    img.style.cursor = s > 1 ? (dragging.current ? 'grabbing' : 'grab') : '';

    const ind = indicatorRef.current;
    if (ind) {
      const pct = Math.round(s * 100);
      if (pct === 100) {
        ind.style.display = 'none';
      } else {
        ind.style.display = '';
        ind.textContent = pct + '%';
      }
    }
  }, []);

  const updateZoomedState = useCallback((newScale) => {
    const nowZoomed = newScale !== 1;
    if (nowZoomed !== activeRef.current) {
      activeRef.current = nowZoomed;
      setIsZoomed(nowZoomed);
    }
  }, []);

  const zoomBy = useCallback((factor) => {
    if (!baseSizeRef.current) captureBaseSize();
    const oldScale = scaleRef.current;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * factor));
    const ratio = newScale / oldScale;
    const oldT = translateRef.current;
    scaleRef.current = newScale;
    translateRef.current = { x: oldT.x * ratio, y: oldT.y * ratio };
    applyTransform();
    updateZoomedState(newScale);
  }, [applyTransform, updateZoomedState, captureBaseSize]);

  const reset = useCallback(() => {
    scaleRef.current = 1;
    translateRef.current = { x: 0, y: 0 };
    activeRef.current = false;
    baseSizeRef.current = null;
    applyTransform();
    setIsZoomed(false);
  }, [applyTransform]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!containerRef.current) return;
      if (!e.ctrlKey && !e.metaKey) return;

      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomBy(ZOOM_STEP);
      } else if (e.key === '-') {
        e.preventDefault();
        zoomBy(1 / ZOOM_STEP);
      } else if (e.key === '0') {
        e.preventDefault();
        reset();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [zoomBy, reset]);

  const clampTranslate = useCallback(() => {
    const s = scaleRef.current;
    if (s <= 1) { translateRef.current = { x: 0, y: 0 }; return; }
    const container = containerRef.current;
    const base = baseSizeRef.current;
    if (!container || !base) return;

    const cRect = container.getBoundingClientRect();
    const scaledW = base.w * s;
    const scaledH = base.h * s;
    const maxTx = Math.max(0, (scaledW - cRect.width) / 2);
    const maxTy = Math.max(0, (scaledH - cRect.height) / 2);
    const t = translateRef.current;
    translateRef.current = {
      x: Math.max(-maxTx, Math.min(maxTx, t.x)),
      y: Math.max(-maxTy, Math.min(maxTy, t.y)),
    };
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (scaleRef.current <= 1 || e.button !== 0) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translateRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!dragging.current) return;
    translateRef.current = {
      x: translateStart.current.x + e.clientX - dragStart.current.x,
      y: translateStart.current.y + e.clientY - dragStart.current.y,
    };
    applyTransform();
  }, [applyTransform]);

  const handlePointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    clampTranslate();
    applyTransform();
  }, [clampTranslate, applyTransform]);

  const handleDoubleClick = useCallback(() => {
    reset();
  }, [reset]);

  const containerProps = {
    ref: containerRef,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerUp,
    onDoubleClick: handleDoubleClick,
  };

  const imageStyle = {
    transformOrigin: 'center center',
    userSelect: 'none',
  };

  return {
    containerProps,
    imageStyle,
    imgRef,
    indicatorRef,
    scale: scaleRef.current,
    isZoomed,
    zoomPercent: Math.round(scaleRef.current * 100),
    reset,
  };
}

export default useImageZoom;
