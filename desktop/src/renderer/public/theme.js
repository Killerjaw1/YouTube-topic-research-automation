// Applies the saved light/dark choice before first paint (no flash).
try { var t = localStorage.getItem("nr-theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
