// Loaded BEFORE mq_js_bundle.js. Two small workarounds, no changes to the official bundle:
//
// 1. mq_js_bundle.js (macroquad 0.4.16) contains a `register_plugin = function (...) {...}`
//    assignment inside its quad_net plugin block without a declaration. The file is in strict
//    mode, so that throws "ReferenceError: register_plugin is not defined". The game does not use
//    quad_net (WebSockets/HTTP), but the exception is noise; declaring the global fixes it.
var register_plugin;

// 2. The game calls set_fullscreen(false) at startup (app.rs, restoring the saved setting).
//    miniquad's JS then calls document.exitFullscreen(), which rejects when no element is
//    fullscreen -> uncaught promise rejection in the console. Make it a no-op in that case.
if (window.Document && Document.prototype.exitFullscreen) {
  const exitFullscreen = Document.prototype.exitFullscreen;
  Document.prototype.exitFullscreen = function () {
    return document.fullscreenElement ? exitFullscreen.call(this) : Promise.resolve();
  };
}
