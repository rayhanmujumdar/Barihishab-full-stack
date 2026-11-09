// Full navigation after auth changes so server components re-read cookies.
export function hardNavigate(path: string) {
  window.location.assign(path);
}
