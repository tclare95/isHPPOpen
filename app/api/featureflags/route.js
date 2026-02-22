import { sendRouteError } from "../../../libs/api/httpApp";

export const dynamic = "force-dynamic";

export async function GET() {
  return sendRouteError(404, "Not Found");
}
