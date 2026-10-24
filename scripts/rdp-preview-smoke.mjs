import { runRdpPreviewSmoke } from "../libs/rdp/previewSmoke.js";
import { RdpError } from "../libs/rdp/errors.js";

try {
  console.log(JSON.stringify(await runRdpPreviewSmoke()));
} catch (error) {
  console.error(JSON.stringify({ result: "failed", code: error instanceof RdpError ? error.code : "UNEXPECTED_ERROR" }));
  process.exitCode = 1;
}
