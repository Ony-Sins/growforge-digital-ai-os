"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * A lens field is absolutely positioned against the viewport, and so is its LensHeader. The header's height is not fixed: on a phone the
 * purpose line, the metrics row and the NORA scope row wrap, so a viewport-percentage `top` on the field cannot clear it. This publishes the
 * header's bottom edge (in the field's own containing-block coordinates) as `--lens-content-start` on the field; the lens CSS adds its own
 * breathing room. Reads offsetTop/offsetHeight, so an entrance transform never skews it.
 */
export function useLensContentStart(fieldRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const field = fieldRef.current;
    const header = field?.parentElement?.querySelector<HTMLElement>(":scope > [data-lens-header]");
    if (!field || !header) return;
    const publish = () => {
      if (header.offsetParent !== field.offsetParent) return;
      field.style.setProperty("--lens-content-start", `${header.offsetTop + header.offsetHeight}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    if (field.offsetParent) observer.observe(field.offsetParent); // the header's own `top` is a percentage of this box
    return () => {
      observer.disconnect();
      field.style.removeProperty("--lens-content-start");
    };
  }, [fieldRef]);
}
