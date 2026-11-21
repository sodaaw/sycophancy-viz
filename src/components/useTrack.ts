import { useEffect, useRef } from 'react';
import { useSession } from '../session';

const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

// 노출(IntersectionObserver 50%↑)과 hover(1초↑) 로그
export function useTrack<T extends HTMLElement>(id: string) {
  const { log, registerExit } = useSession();
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let inView = false;
    let hoverStart: number | null = null;

    const setView = (v: boolean) => {
      if (v === inView) return;
      inView = v;
      log(v ? 'comment_in_view' : 'comment_out_of_view', id);
    };

    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        const rootH = e.rootBounds?.height ?? window.innerHeight;
        // 요소가 화면보다 커도 화면의 절반 이상을 차지하면 보이는 것으로 본다
        const visible = e.isIntersecting && (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= rootH * 0.5);
        setView(visible);
      },
      { threshold: THRESHOLDS },
    );
    io.observe(el);

    const onEnter = () => {
      hoverStart = Date.now();
    };
    const endHover = () => {
      if (hoverStart === null) return;
      const ms = Date.now() - hoverStart;
      hoverStart = null;
      if (ms >= 1000) log('hover', id, ms);
    };
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', endHover);

    const flush = () => {
      endHover();
      setView(false);
    };
    const unregister = registerExit(flush);

    return () => {
      io.disconnect();
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', endHover);
      unregister();
      flush();
    };
  }, [id, log, registerExit]);

  return ref;
}
