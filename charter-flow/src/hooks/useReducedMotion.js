import { useEffect, useState } from 'react';

/**
 * Хук уважает системную настройку prefers-reduced-motion.
 * Используется для отключения анимаций частиц для пользователей,
 * которые предпочитают сниженную анимацию (a11y).
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}
