import {
  installScriptHeaders,
  opendungeonInstallScript,
} from "@/lib/install-script";

export function GET() {
  return new Response(opendungeonInstallScript, {
    headers: installScriptHeaders,
  });
}
