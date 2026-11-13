import { useEffect, useRef, useState } from 'react';

interface ChapterImageProps {
  src: string;
  alt: string;
  className: string;
  'data-ria'?: boolean;
}

export function ChapterImage(props: ChapterImageProps) {
  // A different source or layout must never reuse the previous image's pixels.
  return <DecodedChapterImage key={`${props.className}:${props.src}`} {...props} />;
}

function DecodedChapterImage(props: ChapterImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    let active = true;
    image.decode().then(() => {
      if (active) setReady(true);
    }).catch(() => {
      // Failed images stay hidden; dialogue and navigation remain available.
    });
    return () => { active = false; };
  }, []);

  return <img {...props} ref={imageRef} aria-hidden={!ready}
    style={ready ? undefined : { visibility: 'hidden', animation: 'none' }} />;
}
