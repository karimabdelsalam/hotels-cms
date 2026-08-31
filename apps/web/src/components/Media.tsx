import { mediaUrl, mediaSrcSet } from "@fantazia/media";

export type MediaRef = {
  storageKey: string;
  alt: string;
  placeholder: string | null;
  focalX: number;
  focalY: number;
} | null;

/**
 * Renders a stored image, or the colour field when none is set.
 *
 * AVIF first with a WebP fallback, sized from the srcSet, positioned by the
 * focal point so a face is never cropped out, and painted over its inline
 * placeholder so the card never reflows while loading.
 */
export function Media({
  media,
  fallbackClass,
  sizes,
  priority,
}: {
  media: MediaRef;
  fallbackClass: string;
  sizes: string;
  priority?: boolean;
}) {
  if (!media) return <div className={`fill ${fallbackClass}`} aria-hidden="true" />;

  return (
    <picture className="fill">
      <source type="image/avif" srcSet={mediaSrcSet(media.storageKey, "avif")} sizes={sizes} />
      <img
        src={mediaUrl(media.storageKey, "card", "webp")}
        srcSet={mediaSrcSet(media.storageKey, "webp")}
        sizes={sizes}
        alt={media.alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        style={{
          objectPosition: `${media.focalX * 100}% ${media.focalY * 100}%`,
          backgroundImage: media.placeholder ? `url(${media.placeholder})` : undefined,
        }}
      />
    </picture>
  );
}
