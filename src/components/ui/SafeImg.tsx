import { useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

/**
 * Изображение с запасным вариантом. Внешние файлы (например, Pexels) могут быть
 * недоступны или заблокированы политикой: тогда вместо битой картинки показывается
 * нейтральная плашка. Без этого сбой выглядит как поломка всей страницы.
 * Для внешних адресов referrerPolicy=no-referrer: сайт не передаёт свой адрес.
 */
export function SafeImg({
  src,
  alt,
  className,
  fallbackLabel = "Нет превью",
  ...rest
}: ImgHTMLAttributes<HTMLImageElement> & { fallbackLabel?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt || fallbackLabel}
        className={cn("grid place-items-center bg-surface-2 text-[11px] text-faint", className)}
      >
        {fallbackLabel}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt ?? ""}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
