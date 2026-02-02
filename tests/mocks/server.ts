/**
 * MSW server setup for Node.js testing environment.
 */

import { setupServer } from "msw/node";
import { handlers } from "./handlers.js";

// Create the MSW server with default handlers
export const server = setupServer(...handlers);
