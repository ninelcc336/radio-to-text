console.warn(
  "[desktop] Legacy renderer is deprecated. Active desktop UI lives in app/desktop/web."
);

document.body?.setAttribute("data-legacy-renderer", "deprecated");
