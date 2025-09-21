import { serve } from "@hono/node-server";
import { behindProxy } from "x-forwarded-fetch";
import federation from "./federation.js";
import "./logging.js";

serve(
  {
    port: 8000,
    fetch: behindProxy((req) =>
      federation.fetch(req, { contextData: undefined }),
    ),
  },
  (info) =>
    console.log(`Server started at http://${info.address}:${info.port}`),
);
