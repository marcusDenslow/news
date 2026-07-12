// Design 8 — Light ⇄ dark theme toggle.
// The incoming theme sweeps out from the toggle icon as an expanding circle and
// wipes over the old one — a single clean sweep, no cross-fade "flash". Built on
// the View Transitions API: the browser snapshots the old theme, `apply()` flips
// it, and we grow a clip-path circle on the new snapshot from the icon's exact
// center out to the farthest corner. Timing matches the design: 620ms on
// cubic-bezier(.32,.72,0,1). Where View Transitions aren't available (Firefox
// today) or the user prefers reduced motion, it falls back to an instant swap.

interface ViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
}

type StartViewTransition = (callback: () => void) => ViewTransition;

function startViewTransition(): StartViewTransition | undefined {
  return (document as unknown as { startViewTransition?: StartViewTransition })
    .startViewTransition;
}

export function runThemeTransition(
  origin: { x: number; y: number },
  apply: () => void
): void {
  const start = startViewTransition();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!start || reduce) {
    apply();
    return;
  }

  const { x, y } = origin;
  // Radius to the farthest viewport corner from the icon, so the sweep clears the
  // whole screen (+40 of slack past the edge).
  const end =
    Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 40;

  const transition = start.call(document, apply);
  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${end}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 620,
        easing: "cubic-bezier(.32,.72,0,1)",
        pseudoElement: "::view-transition-new(root)",
      }
    );
  });
}
