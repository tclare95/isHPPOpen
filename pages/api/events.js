import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import {
  fetchUpcomingEvents,
  upsertEvent,
  deleteEventById,
} from "../../libs/services/eventsService";

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();

  const sendUnauthorized = () =>
    res.status(403).json({
      message: "You must be sign in to view the protected content on this page.",
    });

  const parseRequestBody = () => {
    if (typeof req.body === "string") {
      return JSON.parse(req.body);
    }

    if (req.body && typeof req.body === "object") {
      const [firstBodyKey] = Object.keys(req.body);
      if (firstBodyKey) {
        return JSON.parse(firstBodyKey);
      }
      return req.body;
    }

    throw new Error("Invalid request body");
  };

  try {
    const { method, query } = req;
    const session = await getServerSession(req, res, authOptions);

    switch (method) {
      case "GET":
        try {
          const limit = query && query.limit ? parseInt(query.limit, 10) : 5;
          const data = await fetchUpcomingEvents(limit);
          console.log(`${timestamp} GETEVENTS CALLED`);
          res.status(200).json(data);
        } catch (getError) {
          console.error(`[${timestamp}] GET error in events:`, getError);
          res.status(500).json({ message: "Internal Server Error" });
        }
        break;

      case "POST":
        try {
          if (!session) {
            sendUnauthorized();
            break;
          }

          const parsedRequest = parseRequestBody();
          const result = await upsertEvent(parsedRequest);
          if (result.modifiedCount === 1 || result.upsertedCount === 1) {
            console.log(`${timestamp} Event modified by ${session.user.email} ${parsedRequest.new_event_id}`);
            res.status(200).json({ message: "Update successful", id: parsedRequest.new_event_id });
          } else {
            console.error(`${timestamp} Update unsuccessful for event${parsedRequest.new_event_id}`);
            res.status(500).json({ message: "Update failed", id: parsedRequest.new_event_id });
          }
        } catch (postError) {
          console.error(`[${timestamp}] POST error in events:`, postError);
          res.status(400).json({ message: postError.message || "Invalid request" });
        }
        break;

      case "DELETE":
        try {
          const { id } = query;
          if (!id) {
            res.status(400).json({ message: "Missing id parameter" });
            break;
          }
          if (!session) {
            sendUnauthorized();
            break;
          }

          try {
            const result = await deleteEventById(id);
            if (result.deletedCount === 1) {
              res.status(202).send({ success: true });
              console.log(`${timestamp} Event deleted by ${session.user.email} ${id}`);
            } else {
              console.error(`${timestamp} Event not found for deletion: ${id}`);
              res.status(404).json({ error: "Event Not Found" });
            }
          } catch (error) {
            console.error(`[${timestamp}] DELETE error in events:`, error);
            res.status(500).json({ message: "Internal Server Error" });
          }
        } catch (deleteError) {
          console.error(`[${timestamp}] DELETE error in events:`, deleteError);
          res.status(500).json({ message: "Internal Server Error" });
        }
        break;
      default:
        res.setHeader("Allow", ["GET", "POST", "DELETE"]);
        res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error(`[${timestamp}] Global error in events handler:`, error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
