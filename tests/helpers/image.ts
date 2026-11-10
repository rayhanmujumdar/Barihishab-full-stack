// jsdom never loads images, so Radix <AvatarImage> would always show the
// fallback. This stub "loads" every src instantly, except URLs containing
// "broken", which fire `error`.
import { vi } from "vitest";

export function stubImageLoading() {
  class FakeImage extends EventTarget {
    complete = false;
    naturalWidth = 0;
    crossOrigin: string | null = null;
    referrerPolicy = "";
    #src = "";
    get src() {
      return this.#src;
    }
    set src(value: string) {
      this.#src = value;
      queueMicrotask(() => {
        this.complete = true;
        if (value.includes("broken")) return void this.dispatchEvent(new Event("error"));
        this.naturalWidth = 512;
        this.dispatchEvent(new Event("load"));
      });
    }
  }
  vi.stubGlobal("Image", FakeImage);
}
