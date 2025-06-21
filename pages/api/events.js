import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import {
  fetchUpcomingEvents,
  upsertEvent,
  deleteEventById,
} from "../../libs/services/eventsService";

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  try {
    const { method, body, query } = req;
    const session = await getServerSession(req, res, authOptions);

    switch (method) {
      case "GET":
        try {
          const limit = query && query.limit ? parseInt(query.limit) : 5;
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
          const parsedRequest =
            typeof body === "string" ? JSON.parse(body) : JSON.parse(Object.keys(body)[0]);
          if (session) {
            try {
              const result = await upsertEvent(parsedRequest);
              if (result.modifiedCount === 1 || result.upsertedCount === 1) {
                console.log(`${timestamp} Event modified by ${session.user.email} ${parsedRequest.new_event_id}`);
                res.status(200).json({ message: "Update successful", id: parsedRequest.new_event_id });
              } else {
                console.error(`${timestamp} Update unsuccessful for event${parsedRequest.new_event_id}`);
                res.status(500).json({ message: "Update failed", id: parsedRequest.new_event_id });
              }
            } catch (error) {
              console.error(`[${timestamp}] POST error in events:`, error);
              res.status(400).json({ message: error.message });
            }
          } else {
            res.status(403).json({
              message: "You must be sign in to view the protected content on this page.",
            });
          }
        } catch (postError) {
          console.error(`[${timestamp}] POST error in events:`, postError);
          res.status(500).json({ message: "Internal Server Error" });
        }
        break;

      case "DELETE":
        try {
          const { id } = query;
          if (!id) {
            res.status(400).json({ message: "Missing id parameter" });
            break;
          }
          if (session) {
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
          } else {
            res.status(403).json({
              message: "You must be sign in to view the protected content on this page.",
            });
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
